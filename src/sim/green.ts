import { clamp, degToRad, type Vec2 } from './vector';

export type GreenInputs = {
  distanceFt: number;
  slopePercent: number;
  slopeDirectionDeg: number;
  stimp: number;
  aimDeg: number;
  pacePastFt: number;
};

export type RollPoint = {
  t: number;
  position: Vec2;
  velocity: Vec2;
};

export type GreenLeave = {
  position: Vec2;
  distanceFt: number;
  slopeRead: 'uphill' | 'downhill' | 'sidehill';
  heightRead: 'above hole' | 'below hole' | 'level';
  sideRead: 'high side' | 'low side' | 'center';
};

export type GreenResult = {
  points: RollPoint[];
  rolloutPoints: RollPoint[];
  secondPuttPoints: RollPoint[];
  secondPuttPacePastFt: number;
  secondPuttReadFt: number;
  leave: GreenLeave;
  lipSpeedMs: number;
  captureRadiusM: number;
  missDistanceM: number;
  breakFt: number;
  made: boolean;
  stopPastFt: number;
  receipts: Record<string, string>;
};

const g = 9.80665;
const ftToM = 0.3048;
const ballRadiusM = 0.021335;
const cupRadiusM = 0.054;
const secondPuttPacePastFt = 1.5;
// Real greens add imperfections and skid/roll transition that the constant-deceleration
// model does not capture. Calibrate the return-line read without changing the primary
// putt receipt model, while capping it below rolling resistance so a solved putt cannot
// reverse direction and draw a physically impossible loop on steep slopes.
const secondPuttReadGravityMultiplier = 1.6;

function frictionFromStimp(stimp: number) {
  const releaseMs = 1.83;
  return (releaseMs * releaseMs) / (2 * stimp * ftToM);
}

function captureRadius(lipSpeedMs: number) {
  const limit = 1.45;
  const taper = clamp(1 - (lipSpeedMs / limit) ** 2, 0, 1);
  return cupRadiusM * (0.28 + 0.72 * taper) + ballRadiusM * 0.15;
}

function rollPutt({
  start,
  target,
  initialVelocity,
  gravity,
  friction,
  continueAfterCapture,
}: {
  start: Vec2;
  target: Vec2;
  initialVelocity: Vec2;
  gravity: Vec2;
  friction: number;
  continueAfterCapture: boolean;
}) {
  let position: Vec2 = start;
  let velocity: Vec2 = initialVelocity;
  const points: RollPoint[] = [{ t: 0, position, velocity }];
  const rolloutPoints: RollPoint[] = [];
  let closest = Number.POSITIVE_INFINITY;
  let lipSpeedMs = 0;
  let made = false;
  const dt = 1 / 180;
  for (let i = 1; i < 180 * 18; i += 1) {
    const speed = Math.hypot(velocity[0], velocity[1]);
    if (speed < 0.025) break;
    const drag: Vec2 = [-(velocity[0] / speed) * friction, -(velocity[1] / speed) * friction];
    const ax = gravity[0] + drag[0];
    const ay = gravity[1] + drag[1];
    velocity = [velocity[0] + ax * dt, velocity[1] + ay * dt];
    position = [position[0] + velocity[0] * dt, position[1] + velocity[1] * dt];
    const distanceToCup = Math.hypot(position[0] - target[0], position[1] - target[1]);
    if (distanceToCup < closest) {
      closest = distanceToCup;
      lipSpeedMs = Math.hypot(velocity[0], velocity[1]);
    }
    if (!made && distanceToCup <= captureRadius(Math.hypot(velocity[0], velocity[1]))) {
      made = true;
      lipSpeedMs = Math.hypot(velocity[0], velocity[1]);
      points.push({ t: i * dt, position: target, velocity: [0, 0] });
      if (!continueAfterCapture) break;
      rolloutPoints.push({ t: i * dt, position: target, velocity }, { t: i * dt, position, velocity });
      continue;
    }
    if (made && continueAfterCapture) {
      rolloutPoints.push({ t: i * dt, position, velocity });
    } else {
      points.push({ t: i * dt, position, velocity });
    }
  }
  return { points, rolloutPoints, closest, lipSpeedMs, made };
}

function makeLineSecondPutt({
  start,
  target,
  gravity,
  friction,
}: {
  start: Vec2;
  target: Vec2;
  gravity: Vec2;
  friction: number;
}) {
  const toCup: Vec2 = [target[0] - start[0], target[1] - start[1]];
  const distance = Math.hypot(toCup[0], toCup[1]);
  if (distance < 0.12) return [] as RollPoint[];

  const directAngle = Math.atan2(toCup[1], toCup[0]);
  const gravityMagnitude = Math.hypot(gravity[0], gravity[1]);
  const stableGravityScale = gravityMagnitude > 0
    ? Math.min(secondPuttReadGravityMultiplier, (friction * 0.92) / gravityMagnitude)
    : secondPuttReadGravityMultiplier;
  const readGravity: Vec2 = [gravity[0] * stableGravityScale, gravity[1] * stableGravityScale];
  let bestPoints: RollPoint[] = [];
  let bestScore = Number.POSITIVE_INFINITY;
  let bestAngle = directAngle;
  let bestSpeedMultiplier = 1;

  const evaluate = (center: number, angleSpan: number, angleSteps: number, speedCenter: number, speedSpan: number, speedSteps: number) => {
    for (let index = 0; index <= angleSteps; index += 1) {
      const t = index / angleSteps - 0.5;
      const angle = center + t * angleSpan;
      const unit: Vec2 = [Math.cos(angle), Math.sin(angle)];
      const gravityAlongStart = readGravity[0] * unit[0] + readGravity[1] * unit[1];
      const baseSpeed = Math.sqrt(Math.max(
        0.1,
        2 * friction * (distance + secondPuttPacePastFt * ftToM) - 2 * gravityAlongStart * distance,
      ));
      for (let speedIndex = 0; speedIndex <= speedSteps; speedIndex += 1) {
        const speedT = speedIndex / speedSteps - 0.5;
        const speedMultiplier = speedCenter + speedT * speedSpan;
        const speed = baseSpeed * speedMultiplier;
        const candidate = rollPutt({
          start,
          target,
          initialVelocity: [unit[0] * speed, unit[1] * speed],
          gravity: readGravity,
          friction,
          continueAfterCapture: true,
        });
        const rolloutEnd = candidate.rolloutPoints.at(-1)?.position;
        const pastDistance = rolloutEnd ? Math.hypot(rolloutEnd[0] - target[0], rolloutEnd[1] - target[1]) : Number.POSITIVE_INFINITY;
        const paceMiss = Math.abs(pastDistance - secondPuttPacePastFt * ftToM);
        // A make line must pass through the center of the cup. Only use pace to rank
        // otherwise credible center-cup paths; edge capture must not win because it
        // happens to finish nearer the requested rollout distance.
        const centerPenalty = candidate.closest * 24;
        const score = candidate.made ? centerPenalty + paceMiss * 0.45 : 100 + centerPenalty;
        if (score < bestScore) {
          bestPoints = candidate.points;
          bestScore = score;
          bestAngle = angle;
          bestSpeedMultiplier = speedMultiplier;
        }
      }
    }
  };

  evaluate(directAngle, degToRad(220), 72, 1, 0.8, 12);
  evaluate(bestAngle, degToRad(22), 48, bestSpeedMultiplier, 0.24, 12);
  const last = bestPoints.at(-1);
  if (last && Math.hypot(last.position[0] - target[0], last.position[1] - target[1]) > 0.001) {
    return [...bestPoints, { t: last.t + 0.001, position: target, velocity: [0, 0] as Vec2 }];
  }
  return bestPoints;
}

function initialAimRead(points: RollPoint[]) {
  if (points.length < 2) return 0;
  const start = points[0].position;
  const end = points.at(-1)!.position;
  const toCup: Vec2 = [end[0] - start[0], end[1] - start[1]];
  const velocity = points[0].velocity;
  const speed = Math.hypot(velocity[0], velocity[1]);
  if (speed < 0.001) return 0;
  const launchUnit: Vec2 = [velocity[0] / speed, velocity[1] / speed];
  // Perpendicular distance between the cup and the initial start line: the
  // practical amount a player must aim outside the hole before gravity turns it.
  return Math.abs(toCup[0] * launchUnit[1] - toCup[1] * launchUnit[0]);
}

export function simulateGreen(inputs: GreenInputs, includeSecondPutt = true): GreenResult {
  const target: Vec2 = [0, 0];
  const start: Vec2 = [0, -inputs.distanceFt * ftToM];
  const friction = frictionFromStimp(inputs.stimp);
  const firstPaceDistanceM = (inputs.distanceFt + inputs.pacePastFt) * ftToM;
  const firstInitialSpeed = Math.sqrt(Math.max(0.1, 2 * friction * firstPaceDistanceM));
  const aim = degToRad(inputs.aimDeg);
  const fall = degToRad(inputs.slopeDirectionDeg);
  const slopeAccel = (5 / 7) * g * (inputs.slopePercent / 100);
  const gravity: Vec2 = [Math.sin(fall) * slopeAccel, Math.cos(fall) * slopeAccel];
  const firstPutt = rollPutt({
    start,
    target,
    initialVelocity: [-Math.sin(aim) * firstInitialSpeed, Math.cos(aim) * firstInitialSpeed],
    gravity,
    friction,
    continueAfterCapture: true,
  });
  const { points, rolloutPoints, closest, lipSpeedMs, made } = firstPutt;
  const last = points[points.length - 1];
  const rolloutLast = rolloutPoints[rolloutPoints.length - 1] ?? last;
  const lineBreak = last.position[0] / ftToM;
  const stopPastFt = rolloutLast.position[1] / ftToM;
  const fallUnit: Vec2 = [Math.sin(fall), Math.cos(fall)];
  const toCup: Vec2 = [-rolloutLast.position[0], -rolloutLast.position[1]];
  const leaveDistanceM = Math.hypot(toCup[0], toCup[1]);
  const fallComponent = toCup[0] * fallUnit[0] + toCup[1] * fallUnit[1];
  const slopeRead = Math.abs(fallComponent) < 0.05 ? 'sidehill' : fallComponent > 0 ? 'downhill' : 'uphill';
  const sideRead = Math.abs(rolloutLast.position[0]) < 0.05 ? 'center' : rolloutLast.position[0] > 0 ? 'high side' : 'low side';
  const heightRead = slopeRead === 'downhill' ? 'above hole' : slopeRead === 'uphill' ? 'below hole' : 'level';
  const secondPuttPoints = includeSecondPutt ? makeLineSecondPutt({
    start: rolloutLast.position,
    target,
    gravity,
    friction,
  }) : [];
  const secondPuttReadFt = initialAimRead(secondPuttPoints) / ftToM;
  return {
    points,
    rolloutPoints,
    secondPuttPoints,
    secondPuttPacePastFt,
    secondPuttReadFt,
    leave: {
      position: rolloutLast.position,
      distanceFt: leaveDistanceM / ftToM,
      slopeRead,
      heightRead,
      sideRead,
    },
    lipSpeedMs,
    captureRadiusM: captureRadius(lipSpeedMs),
    missDistanceM: closest,
    breakFt: lineBreak,
    made,
    stopPastFt,
    receipts: {
      friction: `a = v^2 / (2 * stimp * 0.3048); stimp=${inputs.stimp}`,
      slope: 'rolling acceleration = (5/7) * g * sin(theta) along fall line',
      capture: 'capture radius tapers with lip speed, near zero at about 1.45 m/s',
    },
  };
}

export const greenInternalsForTest = { frictionFromStimp, captureRadius, initialAimRead, secondPuttPacePastFt, secondPuttReadGravityMultiplier };
