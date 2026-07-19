import { add3, clamp, cross3, degToRad, dot3, mag3, norm3, radToDeg, scale3, type Vec3 } from './vector';

export type ClubName = 'Driver' | '6-iron' | 'Wedge';
export type Handedness = 'right' | 'left';
export type HolePar = 'par3' | 'par4' | 'par5';

export type ImpactInputs = {
  club: ClubName;
  handedness: Handedness;
  holePar: HolePar;
  targetDistanceYd: number;
  clubSpeedMph: number;
  attackAngleDeg: number;
  clubPathDeg: number;
  faceAngleDeg: number;
  dynamicLoftDeg: number;
  strikeX: number;
  strikeY: number;
};

export type TrajectoryPoint = {
  t: number;
  position: Vec3;
  velocity: Vec3;
};

export type ImpactResult = {
  inputs: ImpactInputs;
  ballSpeedMph: number;
  smash: number;
  launchAngleDeg: number;
  launchDirectionDeg: number;
  spinRpm: number;
  spinAxisDeg: number;
  apexYd: number;
  carryYd: number;
  totalYd: number;
  offlineYd: number;
  faceToPathDeg: number;
  startLineDeg: number;
  curveBiasDeg: number;
  points: TrajectoryPoint[];
  receipts: Record<string, string>;
};

const g = 9.80665;
const mphToMs = 0.44704;
const mToYd = 1.09361;
const airDensity = 1.225;
const ballMass = 0.04593;
const ballRadius = 0.021335;
const ballArea = Math.PI * ballRadius * ballRadius;
const cd = 0.22;
const spinDecaySeconds = 24;

const clubParams: Record<ClubName, { launchBlend: number; maxSmash: number; spinK: number; defaultLoft: number }> = {
  Driver: { launchBlend: 0.85, maxSmash: 1.5, spinK: 127.5, defaultLoft: 12 },
  '6-iron': { launchBlend: 0.75, maxSmash: 1.39, spinK: 132, defaultLoft: 28 },
  Wedge: { launchBlend: 0.72, maxSmash: 1.18, spinK: 135, defaultLoft: 48 },
};

export const clubDefaults: Record<ClubName, Partial<ImpactInputs>> = {
  Driver: { clubSpeedMph: 113, attackAngleDeg: 2, dynamicLoftDeg: 12 },
  '6-iron': { clubSpeedMph: 92, attackAngleDeg: -3.5, dynamicLoftDeg: 28 },
  Wedge: { clubSpeedMph: 76, attackAngleDeg: -6, dynamicLoftDeg: 48 },
};

const vectorFromAzimuthElevation = (azimuthDeg: number, elevationDeg: number): Vec3 => {
  const az = degToRad(azimuthDeg);
  const el = degToRad(elevationDeg);
  return norm3([Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]);
};

const derivative = (position: Vec3, velocity: Vec3, spinVector: Vec3, spinRpm: number): { dp: Vec3; dv: Vec3 } => {
  const speed = mag3(velocity);
  if (position[1] <= 0 && velocity[1] < 0) return { dp: velocity, dv: [0, 0, 0] };

  const dragMag = (0.5 * airDensity * cd * ballArea * speed * speed) / ballMass;
  const spinRatio = clamp((2 * Math.PI * (spinRpm / 60) * ballRadius) / Math.max(speed, 0.1), 0, 0.45);
  const cl = clamp(0.1 + 0.74 * spinRatio, 0.02, 0.32);
  const liftMag = (0.5 * airDensity * cl * ballArea * speed * speed) / ballMass;
  const vhat = norm3(velocity);
  const drag = scale3(vhat, -dragMag);
  const liftDir = norm3(cross3(spinVector, vhat));
  const lift = scale3(liftDir, liftMag);
  return { dp: velocity, dv: add3([0, -g, 0], add3(drag, lift)) };
};

const rk4 = (position: Vec3, velocity: Vec3, spinVector: Vec3, spinRpm: number, dt: number) => {
  const a = derivative(position, velocity, spinVector, spinRpm);
  const b = derivative(add3(position, scale3(a.dp, dt / 2)), add3(velocity, scale3(a.dv, dt / 2)), spinVector, spinRpm);
  const c = derivative(add3(position, scale3(b.dp, dt / 2)), add3(velocity, scale3(b.dv, dt / 2)), spinVector, spinRpm);
  const d = derivative(add3(position, scale3(c.dp, dt)), add3(velocity, scale3(c.dv, dt)), spinVector, spinRpm);
  const dp = scale3(add3(add3(a.dp, scale3(b.dp, 2)), add3(scale3(c.dp, 2), d.dp)), dt / 6);
  const dv = scale3(add3(add3(a.dv, scale3(b.dv, 2)), add3(scale3(c.dv, 2), d.dv)), dt / 6);
  return { position: add3(position, dp), velocity: add3(velocity, dv) };
};

export function simulateImpact(rawInputs: ImpactInputs): ImpactResult {
  const params = clubParams[rawInputs.club];
  const inputs = { ...rawInputs, dynamicLoftDeg: rawInputs.dynamicLoftDeg || params.defaultLoft };
  const path = vectorFromAzimuthElevation(inputs.clubPathDeg, inputs.attackAngleDeg);
  const faceNormal = vectorFromAzimuthElevation(inputs.faceAngleDeg, inputs.dynamicLoftDeg);
  const faceToPathDeg = inputs.faceAngleDeg - inputs.clubPathDeg;
  const launchDir = params.launchBlend * inputs.faceAngleDeg + (1 - params.launchBlend) * inputs.clubPathDeg + inputs.strikeX * -0.7;
  const launchAngle = inputs.dynamicLoftDeg * 0.62 + inputs.attackAngleDeg * 0.18 + 1.8 + inputs.strikeY * 1.2;
  const spinLoft = Math.max(1, inputs.dynamicLoftDeg - inputs.attackAngleDeg);
  const smash = clamp(params.maxSmash - spinLoft * 0.0045 - Math.abs(inputs.strikeX) * 0.012 - Math.abs(inputs.strikeY) * 0.01, 1.05, params.maxSmash);
  const ballSpeedMph = inputs.clubSpeedMph * smash;
  const gearSpin = 1 - inputs.strikeY * 0.055;
  const spinRpm = Math.max(900, params.spinK * inputs.clubSpeedMph * Math.sin(degToRad(spinLoft)) * gearSpin);
  const dPlaneNormal = norm3(cross3(path, faceNormal));
  const rawAxis = radToDeg(Math.atan2(dPlaneNormal[0], Math.max(0.0001, Math.abs(dPlaneNormal[1]))));
  const spinAxisDeg = clamp(rawAxis * 0.02 + faceToPathDeg * 3.2 - inputs.strikeX * 7.5, -45, 45);
  const launch = vectorFromAzimuthElevation(launchDir, launchAngle);
  let position: Vec3 = [0, 0.02, 0];
  let velocity = scale3(launch, ballSpeedMph * mphToMs);
  const spinVector = vectorFromAzimuthElevation(-90 - spinAxisDeg, 0);
  const points: TrajectoryPoint[] = [{ t: 0, position, velocity }];
  let carry: Vec3 = position;
  const dt = 1 / 240;
  for (let i = 1; i < 240 * 12; i += 1) {
    const t = i * dt;
    const decayedSpin = spinRpm * Math.exp(-t / spinDecaySeconds);
    const next = rk4(position, velocity, spinVector, decayedSpin, dt);
    position = next.position;
    velocity = next.velocity;
    points.push({ t, position, velocity });
    if (position[1] <= 0 && t > 0.1) {
      carry = position;
      break;
    }
  }
  const apexM = Math.max(...points.map((point) => point.position[1]));
  const carryYd = Math.max(0, carry[2] * mToYd);
  const offlineYd = carry[0] * mToYd;
  const rollYd = clamp((ballSpeedMph - 110) * 0.22 + (10 - launchAngle) * 0.9, 2, 36);
  return {
    inputs,
    ballSpeedMph,
    smash,
    launchAngleDeg: launchAngle,
    launchDirectionDeg: launchDir,
    spinRpm,
    spinAxisDeg,
    apexYd: apexM * mToYd,
    carryYd,
    totalYd: carryYd + rollYd,
    offlineYd,
    faceToPathDeg,
    startLineDeg: launchDir,
    curveBiasDeg: faceToPathDeg,
    points,
    receipts: {
      launch: `launchDir = ${params.launchBlend.toFixed(2)} * face + ${(1 - params.launchBlend).toFixed(2)} * path`,
      spin: `spin = k * clubSpeed * sin(spin loft); spin loft = dynamic loft - attack angle; k=${params.spinK}`,
      trajectory: 'RK4 at 1/240 s with gravity, Cd=0.22 drag, spin-ratio lift, 24 s spin decay',
      dPlane: `spin axis from D-plane normal plus linear gear-effect strike terms; face-to-path=${faceToPathDeg.toFixed(1)} deg`,
    },
  };
}

export function namedFlight(input: ImpactInputs): string {
  const side = input.handedness === 'left' ? -1 : 1;
  const face = input.faceAngleDeg * side;
  const faceToPath = (input.faceAngleDeg - input.clubPathDeg) * side;
  const start = face < -1 ? 'pull' : face > 1 ? 'push' : 'straight';
  const curve = faceToPath < -1 ? 'draw' : faceToPath > 1 ? 'fade' : 'straight';
  return start === 'straight' && curve === 'straight' ? 'straight' : `${start}-${curve}`;
}

export const dotForTest = dot3;
