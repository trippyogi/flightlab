import { clamp, degToRad, mag3, type Vec2 } from './vector';

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

export type GreenResult = {
  points: RollPoint[];
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

export function simulateGreen(inputs: GreenInputs): GreenResult {
  const target: Vec2 = [0, 0];
  const start: Vec2 = [0, -inputs.distanceFt * ftToM];
  const paceDistanceM = (inputs.distanceFt + inputs.pacePastFt) * ftToM;
  const friction = frictionFromStimp(inputs.stimp);
  const initialSpeed = Math.sqrt(Math.max(0.1, 2 * friction * paceDistanceM));
  const aim = degToRad(inputs.aimDeg);
  const fall = degToRad(inputs.slopeDirectionDeg);
  const slopeAccel = (5 / 7) * g * (inputs.slopePercent / 100);
  const gravity: Vec2 = [Math.sin(fall) * slopeAccel, Math.cos(fall) * slopeAccel];
  let position: Vec2 = start;
  let velocity: Vec2 = [Math.sin(aim) * initialSpeed, Math.cos(aim) * initialSpeed];
  const points: RollPoint[] = [{ t: 0, position, velocity }];
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
    if (distanceToCup <= captureRadius(Math.hypot(velocity[0], velocity[1]))) {
      made = true;
      lipSpeedMs = Math.hypot(velocity[0], velocity[1]);
      points.push({ t: i * dt, position: target, velocity: [0, 0] });
      break;
    }
    points.push({ t: i * dt, position, velocity });
  }
  const last = points[points.length - 1];
  const lineBreak = last.position[0] / ftToM;
  const stopPastFt = mag3([last.position[0], 0, last.position[1]]) / ftToM - inputs.distanceFt;
  return {
    points,
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
