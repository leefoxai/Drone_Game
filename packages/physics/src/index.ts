// Pure fixed-step SI physics: no renderer, DOM, clock or random source.
export const PHYSICS_VERSION = 2;
export const PHYSICS_HZ = 240;
export const DT = 1 / PHYSICS_HZ;
export const G = 9.80665;
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export interface Rates { rcRate: number; superRate: number; expo: number }
export const DEFAULT_ACRO_RATES: Rates = { rcRate: 1, superRate: 0.7, expo: 0 };
export interface Profile {
  id: string; version: number; label: string;
  massKg: number; wheelbaseM: number; inertiaKgM2: number[];
  maxMotorThrustN: number; motorTimeConstantS: number; reactionTorqueM: number;
  linearDrag: number; quadraticDrag: number; angularDrag: number;
  batteryFullV: number; batteryEmptyV: number; batterySagFraction: number;
  batteryCapacityAh: number; maxCurrentA: number;
  pid: { p: number; i: number; d: number; integralLimit: number }; rates: Rates;
  targets: { hoverThrottle: number; maxRiseAccelerationMps2: number; roll360Seconds: number };
}
export interface Input { throttle: number; roll: number; pitch: number; yaw: number }
export interface State {
  tick: number; position: Vec3; velocity: Vec3; orientation: Quat;
  omega: Vec3; integral: Vec3; previousOmega: Vec3; derivative: Vec3;
  motors: number[]; charge: number; voltage: number; thrustN: number;
  targetOmega: Vec3; acceleration: Vec3;
}
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const finite = (v: number): number => Number.isFinite(v) ? v : 0;

/** Betaflight-style mathematical rate curve; result is radians/s. */
export function rate(stick: number, r: Rates): number {
  const u = clamp(finite(stick), -1, 1), a = Math.abs(u);
  const rc = r.rcRate <= 2 ? r.rcRate : r.rcRate + 14.54 * (r.rcRate - 2);
  const shaped = u * ((1 - r.expo) + r.expo * a ** 3);
  return clamp(200 * rc * shaped / Math.max(0.01, 1 - a * r.superRate), -1998, 1998) * Math.PI / 180;
}
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q, [a, b, c] = v;
  const tx = 2 * (y * c - z * b), ty = 2 * (z * a - x * c), tz = 2 * (x * b - y * a);
  return [a + w * tx + y * tz - z * ty, b + w * ty + z * tx - x * tz, c + w * tz + x * ty - y * tx];
}
function voltage(p: Profile, charge: number, load: number): number {
  return (p.batteryEmptyV + (p.batteryFullV - p.batteryEmptyV) * charge) * (1 - p.batterySagFraction * load);
}
export function hoverThrottle(p: Profile, charge = 1): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const thrust = 4 * p.maxMotorThrustN * mid ** 2 * (voltage(p, charge, mid ** 2) / p.batteryFullV) ** 2;
    if (thrust < p.massKg * G) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
export function initialState(p: Profile, hovering = true): State {
  const motor = hovering ? hoverThrottle(p) : 0;
  return { tick: 0, position: [0, 3, 6], velocity: [0, 0, 0], orientation: [0, 0, 0, 1],
    omega: [0, 0, 0], integral: [0, 0, 0], previousOmega: [0, 0, 0], derivative: [0, 0, 0],
    motors: [motor, motor, motor, motor], charge: 1, voltage: voltage(p, 1, motor ** 2),
    thrustN: hovering ? p.massKg * G : 0, targetOmega: [0, 0, 0], acceleration: [0, 0, 0] };
}
export function cloneState(s: State): State { return structuredClone(s); }

/** Mutates state by exactly one tick. Motor order: front-left, front-right, rear-right, rear-left. */
export function step(s: State, input: Input, p: Profile): void {
  const throttle = clamp(finite(input.throttle), 0, 1);
  s.targetOmega = [rate(input.pitch, p.rates), rate(input.yaw, p.rates), rate(input.roll, p.rates)];
  const torques: Vec3 = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    const error = s.targetOmega[axis]! - s.omega[axis]!;
    // Bounded integral + bleed while saturated avoids unbounded wind-up.
    const saturated = s.motors.some(m => m > 0.995 || m < 0.005);
    if (!saturated) s.integral[axis] = clamp(s.integral[axis]! + error * DT, -p.pid.integralLimit, p.pid.integralLimit);
    else s.integral[axis]! *= 0.995;
    const derivative = (s.omega[axis]! - s.previousOmega[axis]!) / DT;
    s.derivative[axis]! += 0.25 * (derivative - s.derivative[axis]!);
    torques[axis] = p.inertiaKgM2[axis]! * (p.pid.p * error + p.pid.i * s.integral[axis]! - p.pid.d * s.derivative[axis]!);
    s.previousOmega[axis] = s.omega[axis]!;
  }
  const a = p.wheelbaseM / (2 * Math.sqrt(2));
  const xs = [-a, a, a, -a], zs = [-a, -a, a, a], spins = [1, -1, 1, -1];
  const load = s.motors.reduce((sum, m) => sum + m * m, 0) / 4;
  s.voltage = voltage(p, s.charge, load);
  const maxThrust = p.maxMotorThrustN * (s.voltage / p.batteryFullV) ** 2;
  const forces: number[] = [];
  const lag = 1 - Math.exp(-DT / p.motorTimeConstantS);
  for (let i = 0; i < 4; i++) {
    const desiredForce = throttle ** 2 * maxThrust
      - zs[i]! * torques[0] / (4 * a * a)
      + spins[i]! * torques[1] / (4 * p.reactionTorqueM)
      + xs[i]! * torques[2] / (4 * a * a);
    const command = Math.sqrt(clamp(desiredForce / maxThrust, 0, 1));
    s.motors[i]! += lag * (command - s.motors[i]!);
    forces[i] = s.motors[i]! ** 2 * maxThrust;
  }
  s.thrustN = forces.reduce((sum, f) => sum + f, 0);
  const torque: Vec3 = [0, 0, 0];
  for (let i = 0; i < 4; i++) {
    torque[0] -= zs[i]! * forces[i]!;
    torque[1] += spins[i]! * p.reactionTorqueM * forces[i]!;
    torque[2] += xs[i]! * forces[i]!;
  }
  const [wx, wy, wz] = s.omega, [ix, iy, iz] = p.inertiaKgM2 as Vec3;
  const gyroscopic: Vec3 = [(iz - iy) * wy * wz, (ix - iz) * wz * wx, (iy - ix) * wx * wy];
  for (let axis = 0; axis < 3; axis++) {
    s.omega[axis]! += DT * (torque[axis]! - gyroscopic[axis]! - p.angularDrag * s.omega[axis]!) / p.inertiaKgM2[axis]!;
  }
  const [x, y, z, w] = s.orientation, [u, v, r] = s.omega;
  const q: Quat = [x + DT * 0.5 * (w*u + y*r - z*v), y + DT * 0.5 * (w*v + z*u - x*r),
    z + DT * 0.5 * (w*r + x*v - y*u), w - DT * 0.5 * (x*u + y*v + z*r)];
  const length = Math.hypot(...q);
  s.orientation = q.map(n => n / length) as Quat;
  const force = rotate(s.orientation, [0, s.thrustN, 0]);
  const speed = Math.hypot(...s.velocity);
  for (let axis = 0; axis < 3; axis++) {
    s.acceleration[axis] = (force[axis]! - (p.linearDrag + p.quadraticDrag * speed) * s.velocity[axis]!) / p.massKg - (axis === 1 ? G : 0);
    s.velocity[axis]! += s.acceleration[axis]! * DT;
    s.position[axis]! += s.velocity[axis]! * DT;
  }
  const amps = 1 + p.maxCurrentA * s.motors.reduce((sum, m) => sum + m ** 3, 0) / 4;
  s.charge = Math.max(0, s.charge - amps * DT / (p.batteryCapacityAh * 3600));
  s.tick++;
}
