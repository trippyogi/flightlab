import { create } from 'zustand';
import type { GreenInputs } from '../sim/green';
import type { ImpactInputs } from '../sim/impact';

export type ModuleId = 'impact' | 'green' | 'gained';

export type GhostTrace = {
  id: string;
  points: readonly (readonly [number, number, number])[];
  label: string;
};

type LabState = {
  activeModule: ModuleId;
  impactInputs: ImpactInputs;
  greenInputs: GreenInputs;
  ghosts: GhostTrace[];
  setActiveModule: (activeModule: ModuleId) => void;
  setImpactInput: <K extends keyof ImpactInputs>(key: K, value: ImpactInputs[K]) => void;
  setGreenInput: <K extends keyof GreenInputs>(key: K, value: GreenInputs[K]) => void;
  captureGhost: (ghost: GhostTrace) => void;
};

export const useLabStore = create<LabState>((set) => ({
  activeModule: 'impact',
  impactInputs: {
    club: 'Driver',
    handedness: 'right',
    holePar: 'par4',
    targetDistanceYd: 440,
    clubSpeedMph: 113,
    attackAngleDeg: 2,
    clubPathDeg: -3.5,
    faceAngleDeg: 1.5,
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
  ghosts: [],
  setActiveModule: (activeModule) => set({ activeModule }),
  setImpactInput: (key, value) =>
    set((state) => ({ impactInputs: { ...state.impactInputs, [key]: value } })),
  setGreenInput: (key, value) =>
    set((state) => ({ greenInputs: { ...state.greenInputs, [key]: value } })),
  captureGhost: (ghost) =>
    set((state) => ({ ghosts: [ghost, ...state.ghosts].slice(0, 5) })),
}));
