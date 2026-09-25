import type { Vec3 } from './index';
export interface Gate { id: number; center: Vec3; yaw: number; width: number; height: number }
export const TRACK_ID = 'training-five-v1';
export const GATES: Gate[] = [
  { id: 1, center: [0, 3, -8], yaw: 0, width: 7, height: 5 },
  { id: 2, center: [14, 3, -20], yaw: -Math.PI/2, width: 7, height: 5 },
  { id: 3, center: [28, 3, -6], yaw: Math.PI, width: 7, height: 5 },
  { id: 4, center: [18, 3, 12], yaw: Math.PI/2, width: 7, height: 5 },
  { id: 5, center: [0, 3, 10], yaw: 0, width: 7, height: 5 },
];
const RADIUS = 0.22;
function local(point: Vec3, gate: Gate): Vec3 { const x=point[0]-gate.center[0],z=point[2]-gate.center[2]; return [Math.cos(gate.yaw)*x-Math.sin(gate.yaw)*z,point[1]-gate.center[1],Math.sin(gate.yaw)*x+Math.cos(gate.yaw)*z]; }
function segmentBox(a:Vec3,b:Vec3,min:Vec3,max:Vec3):boolean { let lo=0,hi=1; for(let i=0;i<3;i++){const delta=b[i]!-a[i]!;if(Math.abs(delta)<1e-10){if(a[i]!<min[i]!||a[i]!>max[i]!)return false;}else{const t1=(min[i]!-a[i]!)/delta,t2=(max[i]!-a[i]!)/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return false;}}return true; }
export function gatePassed(from:Vec3,to:Vec3,gate:Gate):boolean { const a=local(from,gate),b=local(to,gate);if(!(a[2]>0&&b[2]<=0))return false;const t=a[2]/(a[2]-b[2]);return Math.abs(a[0]+t*(b[0]-a[0]))<gate.width/2-RADIUS&&Math.abs(a[1]+t*(b[1]-a[1]))<gate.height/2-RADIUS; }
export function collision(from:Vec3,to:Vec3):boolean { if(to[1]<RADIUS||to[1]>80||Math.abs(to[0])>100||Math.abs(to[2])>100)return true;return GATES.some(gate=>{const a=local(from,gate),b=local(to,gate),w=gate.width/2,h=gate.height/2;const posts:[Vec3,Vec3][]=[ [[-w-.15,-h-.15,-.15],[-w+.15,h+.15,.15]], [[w-.15,-h-.15,-.15],[w+.15,h+.15,.15]], [[-w-.15,h-.15,-.15],[w+.15,h+.15,.15]], [[-w-.15,-h-.15,-.15],[w+.15,-h+.15,.15]] ];return posts.some(([min,max])=>segmentBox(a,b,min.map(v=>v-RADIUS) as Vec3,max.map(v=>v+RADIUS) as Vec3));}); }
