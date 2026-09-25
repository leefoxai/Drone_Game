import type { Vec3 } from './index';

/** Shared physical/visual dimensions. One source of truth prevents invisible collision margins. */
export const GATE_FRAME_THICKNESS_M = 0.22;
export const DRONE_COLLISION_RADIUS_M = 0.22;

export interface Gate { id: number; center: Vec3; yaw: number; width: number; height: number }
export interface Track {
  id: string;
  version: number;
  label: string;
  description: string;
  gates: Gate[];
}
export interface GateSolidBox {
  kind: 'frame' | 'leg';
  center: Vec3;
  size: Vec3;
}

export const TRAINING_TRACK: Track = {
  id: 'training-five-v2',
  version: 2,
  label: '훈련장',
  description: '7 m × 5 m 게이트 5개와 지면까지 이어지는 지지대가 있는 입문용 연습 루프',
  gates: [
    { id: 1, center: [0, 3, -8], yaw: 0, width: 7, height: 5 },
    { id: 2, center: [14, 3, -20], yaw: -Math.PI/2, width: 7, height: 5 },
    { id: 3, center: [28, 3, -6], yaw: Math.PI, width: 7, height: 5 },
    { id: 4, center: [18, 3, 12], yaw: Math.PI/2, width: 7, height: 5 },
    { id: 5, center: [0, 3, 10], yaw: 0, width: 7, height: 5 },
  ],
};

export const RACE_TRACK: Track = {
  id: 'race-five-v2',
  version: 2,
  label: '대회용 트랙',
  description: '1.8 m 정사각 게이트, 지지대와 상승·하강 구간이 있는 FPV 레이스 연습 루프',
  gates: [
    { id: 1, center: [0, 3, -8], yaw: 0, width: 1.8, height: 1.8 },
    { id: 2, center: [0, 5, -20], yaw: 0, width: 1.8, height: 1.8 },
    { id: 3, center: [14, 4.5, -20], yaw: -Math.PI/2, width: 1.8, height: 1.8 },
    { id: 4, center: [14, 2.5, -4], yaw: Math.PI, width: 1.8, height: 1.8 },
    { id: 5, center: [0, 3, -4], yaw: Math.PI/2, width: 1.8, height: 1.8 },
  ],
};

export const TRACKS: readonly Track[] = [TRAINING_TRACK, RACE_TRACK];
export const TRACK_ID = TRAINING_TRACK.id;
export const GATES = TRAINING_TRACK.gates;
export function getTrack(id: string): Track { return TRACKS.find(track => track.id === id) ?? TRAINING_TRACK; }
export function isTrainingTrack(track: Track): boolean { return track.id === TRAINING_TRACK.id; }

/**
 * Local-space solid boxes used by BOTH the renderer and collision system.
 * Gate width/height describe the centre-line rectangle of the frame. Legs continue
 * the two side posts from the bottom frame outer edge down to y=0 world ground.
 */
export function gateSolidBoxes(gate: Gate): GateSolidBox[] {
  const t = GATE_FRAME_THICKNESS_M, w = gate.width, h = gate.height;
  const boxes: GateSolidBox[] = [
    { kind: 'frame', center: [-w/2, 0, 0], size: [t, h+t, t] },
    { kind: 'frame', center: [ w/2, 0, 0], size: [t, h+t, t] },
    { kind: 'frame', center: [0,  h/2, 0], size: [w+t, t, t] },
    { kind: 'frame', center: [0, -h/2, 0], size: [w+t, t, t] },
  ];
  const groundLocalY = -gate.center[1];
  const legTopY = -h/2 - t/2;
  const legHeight = legTopY - groundLocalY;
  if (legHeight > 1e-6) {
    const legCenterY = groundLocalY + legHeight/2;
    boxes.push(
      { kind: 'leg', center: [-w/2, legCenterY, 0], size: [t, legHeight, t] },
      { kind: 'leg', center: [ w/2, legCenterY, 0], size: [t, legHeight, t] },
    );
  }
  return boxes;
}

function local(point: Vec3, gate: Gate): Vec3 {
  const x = point[0] - gate.center[0], z = point[2] - gate.center[2];
  return [Math.cos(gate.yaw)*x - Math.sin(gate.yaw)*z, point[1]-gate.center[1], Math.sin(gate.yaw)*x + Math.cos(gate.yaw)*z];
}
/** Swept sphere vs expanded boxes; catches crossing between physics ticks. */
function segmentBox(a: Vec3, b: Vec3, min: Vec3, max: Vec3): boolean {
  let lo = 0, hi = 1;
  for (let i = 0; i < 3; i++) {
    const delta = b[i]! - a[i]!;
    if (Math.abs(delta) < 1e-10) { if (a[i]! < min[i]! || a[i]! > max[i]!) return false; }
    else {
      const t1 = (min[i]! - a[i]!) / delta, t2 = (max[i]! - a[i]!) / delta;
      lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return false;
    }
  }
  return true;
}
export function gatePassed(from: Vec3, to: Vec3, gate: Gate): boolean {
  const a = local(from, gate), b = local(to, gate);
  if (!(a[2] > 0 && b[2] <= 0)) return false;
  const t = a[2] / (a[2] - b[2]);
  const safeHalfWidth = gate.width/2 - GATE_FRAME_THICKNESS_M/2 - DRONE_COLLISION_RADIUS_M;
  const safeHalfHeight = gate.height/2 - GATE_FRAME_THICKNESS_M/2 - DRONE_COLLISION_RADIUS_M;
  return Math.abs(a[0] + t*(b[0]-a[0])) < safeHalfWidth
    && Math.abs(a[1] + t*(b[1]-a[1])) < safeHalfHeight;
}
export function collision(from: Vec3, to: Vec3, track: Track = TRAINING_TRACK): boolean {
  const r = DRONE_COLLISION_RADIUS_M;
  if (to[1] < r || to[1] > 80 || Math.abs(to[0]) > 100 || Math.abs(to[2]) > 100) return true;
  return track.gates.some(gate => {
    const a = local(from, gate), b = local(to, gate);
    return gateSolidBoxes(gate).some(box => {
      const min = box.center.map((value,index)=>value-box.size[index]!/2-r) as Vec3;
      const max = box.center.map((value,index)=>value+box.size[index]!/2+r) as Vec3;
      return segmentBox(a,b,min,max);
    });
  });
}
