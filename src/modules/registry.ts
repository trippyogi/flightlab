import type { ModuleId } from '../store/labStore';

export type ModuleManifest = {
  id: ModuleId;
  title: string;
  status: 'live' | 'stub';
  handles: string[];
  readouts: string[];
  receipts: string[];
  sources: string[];
  changelog: string[];
};

export const modules: ModuleManifest[] = [
  {
    id: 'impact',
    title: 'Impact',
    status: 'live',
    handles: ['Club speed', 'Attack angle', 'Club path', 'Face angle', 'Dynamic loft', 'Strike'],
    readouts: ['Ball speed', 'Launch', 'Spin', 'Apex', 'Carry', 'Offline'],
    receipts: ['Face/path launch blend', 'D-plane spin axis', 'RK4 drag/Magnus trajectory'],
    sources: ['TrackMan ball-flight conventions', 'Bearman & Harvey golf-ball aerodynamics'],
    changelog: ['v0: live deterministic D-plane and trajectory instrument'],
  },
  {
    id: 'green',
    title: 'Green',
    status: 'live',
    handles: ['Slope', 'Stimp', 'Aim', 'Pace'],
    readouts: ['Lip speed', 'Break', 'Capture width', 'Result'],
    receipts: ['Stimpmeter friction', 'Rolling sphere on incline', 'Holmes/Penner capture taper'],
    sources: ['USGA Stimpmeter model', 'Holmes 1991', 'Penner 2002'],
    changelog: ['v0: one-green rolling sim with live capture ring'],
  },
  {
    id: 'short',
    title: 'Short',
    status: 'live',
    handles: ['Shot category', 'Pitch lie visual', 'Grass/grain', 'Shot shape', 'Clock swing', 'Loft', 'Bounce', 'Face open', 'Shaft lean', 'Landing spot', 'Green shape', 'Firmness'],
    readouts: ['Launch', 'Spin', 'Effective loft', 'Effective bounce', 'Apex', 'Carry', 'Rollout', 'First bounce', 'Check', 'Carry-roll'],
    receipts: ['Lie/contact model', 'Grass spin friction', 'Effective bounce/loft model', 'Pelz-style clock matrix', 'Surface contour rollout model'],
    sources: ['Dave Pelz short-game principles', 'Wedge bounce/fitting conventions', 'TrackMan wedge launch/spin concepts'],
    changelog: ['v0.3: rescaled the Short scene, shaped the green, and added non-flat surface scenarios that change bounce and rollout'],
  },
  {
    id: 'gained',
    title: 'Gained',
    status: 'stub',
    handles: [],
    readouts: [],
    receipts: ['SG = E(before) - E(after) - 1'],
    sources: ['Broadie, Every Shot Counts'],
    changelog: ['v0: registered as a future room'],
  },
];
