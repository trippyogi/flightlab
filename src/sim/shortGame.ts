import { clamp, degToRad, type Vec3 } from './vector';

export type LieType = 'fairway' | 'tight' | 'rough' | 'bunker';
export type GrassType = 'bent' | 'bermuda' | 'fescue' | 'sand';
export type ShotType = 'chip' | 'pitch' | 'flop' | 'blast' | 'bump';
export type WedgeType = 'Gap' | 'Sand' | 'Lob';

export type ShortGameInputs = {
  lie: LieType;
  grass: GrassType;
  shot: ShotType;
  wedge: WedgeType;
  carryYd: number;
  loftDeg: number;
  bounceDeg: number;
  greenFirmness: number;
};

export type ShortGameResult = {
  launchDeg: number;
  spinRpm: number;
  carryYd: number;
  apexFt: number;
  descentDeg: number;
  rolloutYd: number;
  totalYd: number;
  check: 'grabs' | 'releases' | 'runs';
  contactQuality: number;
  points: Vec3[];
  rollPoints: Vec3[];
  receipts: Record<string, string>;
};

const wedgeDefaults: Record<WedgeType, { loftDeg: number; bounceDeg: number }> = {
  Gap: { loftDeg: 50, bounceDeg: 8 },
  Sand: { loftDeg: 56, bounceDeg: 12 },
  Lob: { loftDeg: 60, bounceDeg: 8 },
};

export const shortGameWedgeDefaults = wedgeDefaults;

const lieFactors: Record<LieType, { launch: number; spin: number; contact: number; rollout: number }> = {
  fairway: { launch: 0, spin: 1, contact: 1, rollout: 1 },
  tight: { launch: -2, spin: 1.08, contact: 0.94, rollout: 0.95 },
  rough: { launch: 3, spin: 0.58, contact: 0.86, rollout: 1.28 },
  bunker: { launch: 7, spin: 0.42, contact: 0.78, rollout: 1.08 },
};

const grassFactors: Record<GrassType, { spin: number; rollout: number }> = {
  bent: { spin: 1.08, rollout: 0.92 },
  bermuda: { spin: 0.82, rollout: 1.16 },
  fescue: { spin: 0.62, rollout: 1.34 },
  sand: { spin: 0.5, rollout: 1.12 },
};

const shotFactors: Record<ShotType, { launch: number; spin: number; rollout: number; speed: number }> = {
  chip: { launch: 22, spin: 0.78, rollout: 1.45, speed: 0.82 },
  pitch: { launch: 32, spin: 1, rollout: 1, speed: 1 },
  flop: { launch: 48, spin: 1.18, rollout: 0.44, speed: 0.92 },
  blast: { launch: 40, spin: 0.62, rollout: 0.84, speed: 1.12 },
  bump: { launch: 14, spin: 0.52, rollout: 2.25, speed: 0.74 },
};

export function simulateShortGame(inputs: ShortGameInputs): ShortGameResult {
  const lie = lieFactors[inputs.lie];
  const grass = grassFactors[inputs.grass];
  const shot = shotFactors[inputs.shot];
  const usefulBounce = inputs.lie === 'bunker' || inputs.lie === 'rough' ? inputs.bounceDeg * 0.55 : -Math.max(0, inputs.bounceDeg - 10) * 0.3;
  const launchDeg = clamp(shot.launch + (inputs.loftDeg - 56) * 0.38 + lie.launch + usefulBounce, 8, 64);
  const contactQuality = clamp(lie.contact + (inputs.lie === 'tight' ? -Math.max(0, inputs.bounceDeg - 8) * 0.018 : 0) + (inputs.lie === 'bunker' ? Math.max(0, inputs.bounceDeg - 8) * 0.014 : 0), 0.62, 1.08);
  const carryYd = inputs.carryYd * contactQuality * shot.speed;
  const spinRpm = Math.round(clamp((inputs.loftDeg * 82 + inputs.carryYd * 34) * lie.spin * grass.spin * shot.spin, 1200, 9800));
  const spinStop = clamp((spinRpm - 2800) / 6200, 0, 1);
  const descentDeg = clamp(launchDeg + 16 + spinStop * 12, 18, 72);
  const firmness = 0.72 + inputs.greenFirmness * 0.16;
  const rolloutYd = clamp(carryYd * 0.18 * shot.rollout * lie.rollout * grass.rollout * firmness * (1.22 - spinStop * 0.72), 0.5, 44);
  const totalYd = carryYd + rolloutYd;
  const apexFt = Math.max(2, carryYd * Math.tan(degToRad(launchDeg)) * 0.42);
  const check = rolloutYd < carryYd * 0.12 ? 'grabs' : rolloutYd > carryYd * 0.38 ? 'runs' : 'releases';
  const points = Array.from({ length: 34 }, (_, index) => {
    const t = index / 33;
    const z = carryYd * t;
    const y = (apexFt / 3) * 4 * t * (1 - t);
    return [0, y, z] as Vec3;
  });
  const rollPoints: Vec3[] = [[0, 0.05, carryYd], [0, 0.05, totalYd]];
  return {
    launchDeg,
    spinRpm,
    carryYd,
    apexFt,
    descentDeg,
    rolloutYd,
    totalYd,
    check,
    contactQuality,
    points,
    rollPoints,
    receipts: {
      launch: 'Launch blends shot type, loft, lie penalty, and effective bounce.',
      spin: 'Spin is loft plus speed, reduced by grass between face and ball; rough/sand lower friction.',
      rollout: 'Rollout scales with shot type, lie, grass, firmness, and spin-stop factor.',
    },
  };
}
