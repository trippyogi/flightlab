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

export function simulateGreen(inputs: GreenInputs): GreenResult {
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
  const secondPuttPoints = leaveDistanceM < 0.12 ? [] : rollPutt({
    start: rolloutLast.position,
    target,
    initialVelocity: [
      (toCup[0] / leaveDistanceM) * Math.sqrt(Math.max(0.1, 2 * friction * (leaveDistanceM + 1.1 * ftToM))),
      (toCup[1] / leaveDistanceM) * Math.sqrt(Math.max(0.1, 2 * friction * (leaveDistanceM + 1.1 * ftToM))),
    ],
    gravity,
    friction,
    continueAfterCapture: false,
  }).points;
  return {
    points,
    rolloutPoints,
    secondPuttPoints,
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

export const greenInternalsForTest = { frictionFromStimp, captureRadius };
