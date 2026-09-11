/** Axis-aligned box standing on the ground: occupies [minX,maxX]×[0,h]×[minZ,maxZ]. */
export interface Box {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  h: number;
}

/** True if the 3D segment A→B intersects the box volume. */
export function segmentHitsBox(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  box: Box,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  // x slab
  if (Math.abs(dx) < 1e-9) {
    if (ax < box.minX || ax > box.maxX) return false;
  } else {
    let ta = (box.minX - ax) / dx;
    let tb = (box.maxX - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  // y slab
  if (Math.abs(dy) < 1e-9) {
    if (ay < 0 || ay > box.h) return false;
  } else {
    let ta = (0 - ay) / dy;
    let tb = (box.h - ay) / dy;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  // z slab
  if (Math.abs(dz) < 1e-9) {
    if (az < box.minZ || az > box.maxZ) return false;
  } else {
    let ta = (box.minZ - az) / dz;
    let tb = (box.maxZ - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

/** Distance along 2D ray (ox,oz)+t·(dx,dz) to the box footprint, or Infinity. Direction must be unit-length. */
export function rayBoxDist2D(ox: number, oz: number, dx: number, dz: number, box: Box): number {
  let t0 = 0;
  let t1 = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (ox < box.minX || ox > box.maxX) return Infinity;
  } else {
    let ta = (box.minX - ox) / dx;
    let tb = (box.maxX - ox) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < box.minZ || oz > box.maxZ) return Infinity;
  } else {
    let ta = (box.minZ - oz) / dz;
    let tb = (box.maxZ - oz) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return Infinity;
  }
  return t0;
}

/** Push a circle (px,pz,r) out of a box. Returns [x, z] after resolution. */
export function resolveCircleBox(px: number, pz: number, r: number, box: Box): [number, number] {
  const cx = Math.max(box.minX, Math.min(px, box.maxX));
  const cz = Math.max(box.minZ, Math.min(pz, box.maxZ));
  let dx = px - cx;
  let dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return [px, pz];
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    return [px + dx * k, pz + dz * k];
  }
  // centre is inside the box: exit through the nearest face
  const left = px - box.minX;
  const right = box.maxX - px;
  const near = pz - box.minZ;
  const far = box.maxZ - pz;
  const m = Math.min(left, right, near, far);
  if (m === left) return [box.minX - r, pz];
  if (m === right) return [box.maxX + r, pz];
  if (m === near) return [px, box.minZ - r];
  return [px, box.maxZ + r];
}

export function boxesOverlap(a: Box, b: Box, margin = 0): boolean {
  return a.minX - margin < b.maxX && a.maxX + margin > b.minX && a.minZ - margin < b.maxZ && a.maxZ + margin > b.minZ;
}

/** Distance from a point to a box footprint (0 when inside). */
export function pointBoxDist(px: number, pz: number, box: Box): number {
  const dx = Math.max(box.minX - px, 0, px - box.maxX);
  const dz = Math.max(box.minZ - pz, 0, pz - box.maxZ);
  return Math.hypot(dx, dz);
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
