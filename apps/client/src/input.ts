import { clamp } from '../../../packages/physics/src/index';
import type { Input } from '../../../packages/physics/src/index';
export type Channel = keyof Input;
export type InputDeviceKind = 'controller' | 'gamepad';
export const CHANNELS: Channel[] = ['throttle','roll','pitch','yaw'];
export const DEFAULT_DEADZONE:Record<InputDeviceKind,number>={controller:.01,gamepad:.05};
export interface AxisConfig { axis: number; invert: boolean; min: number; center: number; max: number; deadzone: number }
export type Mapping = Record<Channel, AxisConfig>;
export const STORAGE_KEY = 'drone.input.v1';
export function deviceKind(pad:Pick<Gamepad,'mapping'>):InputDeviceKind{return pad.mapping==='standard'?'gamepad':'controller';}
export function defaultMapping(kind:InputDeviceKind='gamepad'): Mapping {
  const deadzone=DEFAULT_DEADZONE[kind];
  // Standard gamepad mode 2. Non-standard USB devices are treated as RC-style controllers.
  return {
    throttle:{axis:1,invert:true,min:-1,center:0,max:1,deadzone},
    roll:{axis:2,invert:true,min:-1,center:0,max:1,deadzone},
    pitch:{axis:3,invert:false,min:-1,center:0,max:1,deadzone},
    yaw:{axis:0,invert:true,min:-1,center:0,max:1,deadzone},
  };
}
export function validMapping(value: unknown): value is Mapping {
  if (!value || typeof value !== 'object') return false;
  return CHANNELS.every(channel=>{
    const c=(value as Mapping)[channel];
    return c && Number.isInteger(c.axis) && c.axis>=0 && c.axis<32 && typeof c.invert==='boolean'
      && [c.min,c.center,c.max,c.deadzone].every(Number.isFinite)
      && c.min>=-1 && c.max<=1 && c.min<c.center && c.center<c.max
      && c.deadzone>=0 && c.deadzone<0.5;
  });
}
function centerDeadzone(value:number,deadzone:number):number {
  const centered=(value-.5)*2;
  const shaped=Math.sign(centered)*Math.max(0,(Math.abs(centered)-deadzone)/(1-deadzone));
  return .5+shaped/2;
}
export function normalizeAxis(raw: number, config: AxisConfig, throttle=false): number {
  if (!Number.isFinite(raw)) return throttle ? .5 : 0;
  if(throttle) {
    let value=clamp((raw-config.min)/(config.max-config.min),0,1);
    if(config.invert)value=1-value;
    return centerDeadzone(value,config.deadzone);
  }
  const offset=raw-config.center;
  let value=clamp(offset/(offset>=0?config.max-config.center:config.center-config.min),-1,1);
  value=Math.sign(value)*Math.max(0,(Math.abs(value)-config.deadzone)/(1-config.deadzone));
  return config.invert?-value:value;
}
export function readGamepad(pad: Gamepad, map: Mapping): Input | null {
  const input: Input={throttle:0,roll:0,pitch:0,yaw:0};
  for(const channel of CHANNELS) {
    const raw=pad.axes[map[channel].axis];
    if(raw===undefined || !Number.isFinite(raw)) return null;
    input[channel]=normalizeAxis(raw,map[channel],channel==='throttle');
  }
  return input;
}
