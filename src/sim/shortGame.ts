import { clamp, degToRad, type Vec3 } from './vector';

export type LieType = 'fairway' | 'tight' | 'sitting-up' | 'in-between' | 'sitting-down' | 'flier' | 'rough' | 'wet-rough' | 'hardpan' | 'bunker' | 'plugged-bunker';
export type GrassType = 'bent' | 'bermuda' | 'fescue' | 'sand' | 'into-grain' | 'down-grain';
export type ShotType = 'chip' | 'pitch' | 'flop' | 'blast' | 'bump';
export type ShotCategory = 'chip' | 'pitch' | 'distance-wedge' | 'sand';
export type WedgeType = 'Gap' | 'Sand' | 'Lob';
export type SwingClock = '7:30' | '9:00' | '10:30';
export type GreenScenario = 'level' | 'upslope' | 'downslope' | 'crowned' | 'backstop';

export type ShortGameInputs = {
  lie: LieType;
  grass: GrassType;
  category: ShotCategory;
  shot: ShotType;
  wedge: WedgeType;
  swing: SwingClock;
  carryYd: number;
  loftDeg: number;
  bounceDeg: number;
  faceOpenDeg: number;
  shaftLeanDeg: number;
  greenFirmness: number;
  greenScenario: GreenScenario;
};

export type ShortGameResult = {
  launchDeg: number;
  spinRpm: number;
  carryYd: number;
  apexFt: number;
  descentDeg: number;
  rolloutYd: number;
  totalYd: number;
  carryRollRatio: string;
  effectiveLoftDeg: number;
  effectiveBounceDeg: number;
  check: 'grabs' | 'releases' | 'runs';
  soleInteraction: 'digs' | 'glides' | 'skips' | 'explodes';
  contactQuality: number;
  landingWindowYd: number;
  firstBounceYd: number;
  secondBounceYd: number;
  surfaceReaction: string;
  recommendation: string;
  risks: string[];
  points: Vec3[];
  rollPoints: Vec3[];
  missWindows: { label: string; carryYd: number; totalYd: number; note: string }[];
  receipts: Record<string, string>;
};

const wedgeDefaults: Record<WedgeType, { loftDeg: number; bounceDeg: number }> = {
  Gap: { loftDeg: 50, bounceDeg: 8 },
  Sand: { loftDeg: 56, bounceDeg: 12 },
  Lob: { loftDeg: 60, bounceDeg: 8 },
};

export const shortGameWedgeDefaults = wedgeDefaults;

const lieFactors: Record<LieType, { launch: number; spin: number; contact: number; rollout: number; risk: number }> = {
  fairway: { launch: 0, spin: 1, contact: 1, rollout: 1, risk: 0.08 },
  tight: { launch: -2, spin: 1.08, contact: 0.94, rollout: 0.95, risk: 0.18 },
  'sitting-up': { launch: 5, spin: 0.72, contact: 0.94, rollout: 1.18, risk: 0.2 },
  'in-between': { launch: 2, spin: 0.66, contact: 0.88, rollout: 1.26, risk: 0.26 },
  'sitting-down': { launch: 0, spin: 0.52, contact: 0.78, rollout: 1.42, risk: 0.36 },
  flier: { launch: 6, spin: 0.36, contact: 0.9, rollout: 1.72, risk: 0.42 },
  rough: { launch: 3, spin: 0.58, contact: 0.86, rollout: 1.28, risk: 0.26 },
  'wet-rough': { launch: 4, spin: 0.42, contact: 0.8, rollout: 1.48, risk: 0.34 },
  hardpan: { launch: -3, spin: 0.94, contact: 0.9, rollout: 1.18, risk: 0.28 },
  bunker: { launch: 7, spin: 0.42, contact: 0.78, rollout: 1.08, risk: 0.24 },
  'plugged-bunker': { launch: 4, spin: 0.3, contact: 0.66, rollout: 1.38, risk: 0.42 },
};

const grassFactors: Record<GrassType, { spin: number; rollout: number }> = {
  bent: { spin: 1.08, rollout: 0.92 },
  bermuda: { spin: 0.82, rollout: 1.16 },
  fescue: { spin: 0.62, rollout: 1.34 },
  sand: { spin: 0.5, rollout: 1.12 },
  'into-grain': { spin: 0.88, rollout: 0.76 },
  'down-grain': { spin: 0.72, rollout: 1.36 },
};

const shotFactors: Record<ShotType, { launch: number; spin: number; rollout: number; speed: number }> = {
  chip: { launch: 22, spin: 0.78, rollout: 1.45, speed: 0.82 },
  pitch: { launch: 32, spin: 1, rollout: 1, speed: 1 },
  flop: { launch: 48, spin: 1.18, rollout: 0.44, speed: 0.92 },
  blast: { launch: 40, spin: 0.62, rollout: 0.84, speed: 1.12 },
  bump: { launch: 14, spin: 0.52, rollout: 2.25, speed: 0.74 },
};

const swingFactors: Record<SwingClock, { carry: number; spin: number; launch: number }> = {
  '7:30': { carry: 0.62, spin: 0.82, launch: -3 },
  '9:00': { carry: 1, spin: 1, launch: 0 },
  '10:30': { carry: 1.42, spin: 1.13, launch: 2 },
};

const greenScenarioFactors: Record<GreenScenario, { rollout: number; bounce: number; breakYd: number; reaction: string }> = {
  level: { rollout: 1, bounce: 1, breakYd: 0, reaction: 'neutral first bounce' },
  upslope: { rollout: 0.68, bounce: 0.72, breakYd: 0, reaction: 'kills speed into the slope' },
  downslope: { rollout: 1.42, bounce: 1.26, breakYd: 0, reaction: 'skids forward after landing' },
  crowned: { rollout: 1.12, bounce: 1.08, breakYd: 1.8, reaction: 'kicks off the crown' },
  backstop: { rollout: 0.78, bounce: 0.86, breakYd: -0.9, reaction: 'rides into the backstop' },
};

function ratioLabel(carryYd: number, rolloutYd: number) {
  const carry = Math.max(1, carryYd);
  const roll = Math.max(0.2, rolloutYd);
  if (roll >= carry) return `1:${Math.round(roll / carry)}`;
  return `${Math.round(carry / roll)}:1`;
}

function soleInteraction(inputs: ShortGameInputs, effectiveBounceDeg: number, lieRisk: number): ShortGameResult['soleInteraction'] {
  if (inputs.lie === 'bunker' || inputs.lie === 'plugged-bunker') {
    return effectiveBounceDeg >= 10 && inputs.lie === 'bunker' ? 'explodes' : 'digs';
  }
  if ((inputs.lie === 'tight' || inputs.lie === 'hardpan') && effectiveBounceDeg > 11) return 'skips';
  if (effectiveBounceDeg < 5 && lieRisk > 0.2) return 'digs';
  return 'glides';
}

function recommendation(inputs: ShortGameInputs, rolloutYd: number, contactQuality: number, sole: ShortGameResult['soleInteraction']) {
  if (sole === 'skips') return 'Less bounce or less face-open is safer from this firm lie.';
  if (sole === 'digs') return 'Add bounce or shallow the delivery before trusting this shot.';
  if (inputs.lie === 'flier') return 'Treat this like a launch-with-release lie; plan for low spin and a bigger first bounce.';
  if (inputs.lie === 'sitting-down') return 'Use more loft or a steeper entry; buried grass lowers contact quality and spin.';
  if (inputs.lie === 'rough' || inputs.lie === 'wet-rough' || inputs.lie === 'sitting-up' || inputs.lie === 'in-between') return 'Land it earlier; grass lowers spin and adds release.';
  if (inputs.category === 'distance-wedge') return 'Use the clock number first, then tune landing window and release.';
  if (inputs.shot === 'bump' && rolloutYd > inputs.carryYd * 1.2) return 'Good bump-and-run shape if the landing window is open.';
  if (contactQuality > 0.98 && rolloutYd < inputs.carryYd * 0.22) return 'This is a good check-shot candidate.';
  return 'Match landing spot to carry-roll ratio, then adjust loft/bounce for the lie.';
}

export function simulateShortGame(inputs: ShortGameInputs): ShortGameResult {
  const lie = lieFactors[inputs.lie];
  const grass = grassFactors[inputs.grass];
  const shot = shotFactors[inputs.shot];
  const swing = swingFactors[inputs.swing];
  const surface = greenScenarioFactors[inputs.greenScenario];
  const effectiveLoftDeg = clamp(inputs.loftDeg + inputs.faceOpenDeg * 0.62 - inputs.shaftLeanDeg * 0.72, 38, 74);
  const effectiveBounceDeg = clamp(inputs.bounceDeg + inputs.faceOpenDeg * 0.45 - inputs.shaftLeanDeg * 0.28, 1, 24);
  const usefulBounce = inputs.lie === 'bunker' || inputs.lie === 'rough' || inputs.lie === 'wet-rough' || inputs.lie === 'plugged-bunker' || inputs.lie === 'sitting-up' || inputs.lie === 'in-between' || inputs.lie === 'sitting-down' || inputs.lie === 'flier'
    ? effectiveBounceDeg * 0.42
    : -Math.max(0, effectiveBounceDeg - 10) * 0.38;
  const launchDeg = clamp(shot.launch + (effectiveLoftDeg - 56) * 0.38 + lie.launch + usefulBounce + swing.launch, 8, 68);
  const contactQuality = clamp(
    lie.contact
      + ((inputs.lie === 'tight' || inputs.lie === 'hardpan') ? -Math.max(0, effectiveBounceDeg - 8) * 0.02 : 0)
      + ((inputs.lie === 'bunker' || inputs.lie === 'plugged-bunker') ? Math.max(0, effectiveBounceDeg - 8) * 0.012 : 0)
      - Math.max(0, inputs.shaftLeanDeg - 6) * 0.012,
    0.56,
    1.08,
  );
  const carryYd = inputs.carryYd * contactQuality * shot.speed * swing.carry;
  const spinRpm = Math.round(clamp((effectiveLoftDeg * 82 + inputs.carryYd * 34) * lie.spin * grass.spin * shot.spin * swing.spin, 900, 10500));
  const spinStop = clamp((spinRpm - 2800) / 6200, 0, 1);
  const descentDeg = clamp(launchDeg + 16 + spinStop * 12, 18, 72);
  const firmness = 0.72 + inputs.greenFirmness * 0.16;
  const rolloutYd = clamp(carryYd * 0.18 * shot.rollout * lie.rollout * grass.rollout * firmness * surface.rollout * (1.22 - spinStop * 0.72), 0.5, 44);
  const totalYd = carryYd + rolloutYd;
  const firstBounceYd = clamp(rolloutYd * 0.28 * surface.bounce * (1.16 - spinStop * 0.42), 0.2, Math.max(0.3, rolloutYd * 0.62));
  const secondBounceYd = clamp(rolloutYd * 0.18 * surface.bounce * (1.08 - spinStop * 0.36), 0.1, Math.max(0.2, rolloutYd * 0.44));
  const apexFt = Math.max(2, carryYd * Math.tan(degToRad(launchDeg)) * 0.42);
  const check = rolloutYd < carryYd * 0.12 ? 'grabs' : rolloutYd > carryYd * 0.38 ? 'runs' : 'releases';
  const sole = soleInteraction(inputs, effectiveBounceDeg, lie.risk);
  const landingWindowYd = Math.max(2.5, inputs.carryYd * (0.08 + lie.risk * 0.36) + Math.max(0, 1 - contactQuality) * 8);
  const missWindows = [
    { label: 'thin', carryYd: carryYd * 1.16, totalYd: totalYd * 1.28, note: 'lower launch, less spin, more release' },
    { label: 'fat', carryYd: carryYd * 0.72, totalYd: totalYd * 0.78, note: 'speed lost before the ball' },
    { label: 'clean', carryYd, totalYd, note: `${check} with current landing window` },
  ];
  const risks = [
    sole === 'skips' ? 'blade/skip risk' : '',
    sole === 'digs' ? 'dig risk' : '',
    inputs.lie.includes('rough') || inputs.lie === 'sitting-up' || inputs.lie === 'in-between' ? 'grass-between-face risk' : '',
    inputs.lie === 'sitting-down' ? 'buried contact risk' : '',
    inputs.lie === 'flier' ? 'flier/release risk' : '',
    inputs.lie.includes('bunker') && effectiveBounceDeg < 8 ? 'buried leading edge risk' : '',
  ].filter(Boolean);
  const points = Array.from({ length: 34 }, (_, index) => {
    const t = index / 33;
    const z = carryYd * t;
    const y = (apexFt / 3) * 4 * t * (1 - t);
    return [0, y, z] as Vec3;
  });
  const rollPoints: Vec3[] = [
    [0, 0.05, carryYd],
    [surface.breakYd * 0.28, 0.05, carryYd + firstBounceYd],
    [surface.breakYd * 0.72, 0.05, Math.min(totalYd, carryYd + firstBounceYd + secondBounceYd)],
    [surface.breakYd, 0.05, totalYd],
  ];
  return {
    launchDeg,
    spinRpm,
    carryYd,
    apexFt,
    descentDeg,
    rolloutYd,
    totalYd,
    carryRollRatio: ratioLabel(carryYd, rolloutYd),
    effectiveLoftDeg,
    effectiveBounceDeg,
    check,
    soleInteraction: sole,
    contactQuality,
    landingWindowYd,
    firstBounceYd,
    secondBounceYd,
    surfaceReaction: surface.reaction,
    recommendation: recommendation(inputs, rolloutYd, contactQuality, sole),
    risks,
    points,
    rollPoints,
    missWindows,
    receipts: {
      launch: 'Launch blends shot type, effective loft, lie penalty, swing clock, and effective bounce.',
      spin: 'Spin is effective loft plus speed, reduced by grass or sand between face and ball; rough/wet/sand lower friction.',
      rollout: 'Rollout scales with shot type, lie, grass/grain, firmness, descent angle, spin-stop factor, and landing-surface contour.',
      bounce: 'Effective bounce rises when the face opens and falls with forward shaft lean.',
    },
  };
}
