export type Vec3 = readonly [number, number, number];
export type Vec2 = readonly [number, number];

export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale3 = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const mag3 = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
export const norm3 = (v: Vec3): Vec3 => {
  const m = mag3(v);
  return m === 0 ? [0, 0, 0] : [v[0] / m, v[1] / m, v[2] / m];
};

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
