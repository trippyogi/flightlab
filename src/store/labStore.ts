import { create } from 'zustand';
import type { GreenInputs } from '../sim/green';
import type { ImpactInputs } from '../sim/impact';
import type { ShortGameInputs } from '../sim/shortGame';

export type ModuleId = 'impact' | 'green' | 'short' | 'gained';
export type ImpactView = 'player' | 'top' | 'side';

export type GhostTrace = {
  id: string;
  points: readonly (readonly [number, number, number])[];
  label: string;
};

type LabState = {
  activeModule: ModuleId;
  impactView: ImpactView;
  impactInputs: ImpactInputs;
  greenInputs: GreenInputs;
  shortInputs: ShortGameInputs;
  ghosts: GhostTrace[];
  setActiveModule: (activeModule: ModuleId) => void;
  setImpactView: (impactView: ImpactView) => void;
  setImpactInput: <K extends keyof ImpactInputs>(key: K, value: ImpactInputs[K]) => void;
  setGreenInput: <K extends keyof GreenInputs>(key: K, value: GreenInputs[K]) => void;
  setShortInput: <K extends keyof ShortGameInputs>(key: K, value: ShortGameInputs[K]) => void;
  captureGhost: (ghost: GhostTrace) => void;
};

export const useLabStore = create<LabState>((set) => ({
  activeModule: 'impact',
  impactView: 'player',
  impactInputs: {
    club: 'Driver',
    handedness: 'right',
    holePar: 'par4',
    targetDistanceYd: 440,
    clubSpeedMph: 113,
    attackAngleDeg: 2,
    clubPathDeg: -3.5,
    faceAngleDeg: -1.5,
    dynamicLoftDeg: 12,
    strikeX: 0,
    strikeY: 0,
  },
  greenInputs: {
    distanceFt: 12,
    slopePercent: 2,
    slopeDirectionDeg: 90,
    stimp: 10,
    aimDeg: 0,
    pacePastFt: 1.4,
  },
  shortInputs: {
    lie: 'fairway',
    grass: 'bent',
    category: 'pitch',
    shot: 'pitch',
    wedge: 'Sand',
    swing: '9:00',
    carryYd: 28,
    loftDeg: 56,
    bounceDeg: 12,
    faceOpenDeg: 0,
    shaftLeanDeg: 2,
    greenFirmness: 3,
    greenScenario: 'crowned',
  },
  ghosts: [],
  setActiveModule: (activeModule) => set({ activeModule }),
  setImpactView: (impactView) => set({ impactView }),
  setImpactInput: (key, value) =>
    set((state) => ({ impactInputs: { ...state.impactInputs, [key]: value } })),
  setGreenInput: (key, value) =>
    set((state) => ({ greenInputs: { ...state.greenInputs, [key]: value } })),
  setShortInput: (key, value) =>
    set((state) => ({ shortInputs: { ...state.shortInputs, [key]: value } })),
  captureGhost: (ghost) =>
    set((state) => ({ ghosts: [ghost, ...state.ghosts].slice(0, 5) })),
}));
