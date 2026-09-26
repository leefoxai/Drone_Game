import { G, clamp, rate, rotate } from './index';
import type { Input, Profile, Quat, State, Vec3 } from './index';

export const ASSIST_VERSION = 1;
export const ASSIST_SETTINGS = {
  horizontalSpeedMps: 4,
  verticalSpeedMps: 2,
  yawRateRadS: Math.PI / 3,
  maxHorizontalAcceleration: 2.5,
  velocityGain: 2.4,
  levelGain: 6,
  verticalGain: 4,
};

export interface AssistTargets {
  /** World X/Z velocity target used by the Easy assist controller. */
  horizontalVelocityWorldMps: [number, number];
  verticalVelocityMps: number;
  yawRateRadPerSec: number;
}

export interface AssistedCommandResult {
  appliedInput: Input;
  targets: AssistTargets;
}

function inverseRate(target:number,p:Profile):number {
  let low=-1,high=1;
  for(let i=0;i<24;i++){
    const mid=(low+high)/2;
    if(rate(mid,p.rates)<target)low=mid;else high=mid;
  }
  return (low+high)/2;
}

/**
 * Beginner velocity/level assistance plus the targets that produced the applied input.
 * throttle 0.5 = zero vertical speed. No position teleport or artificial velocity reset.
 * This function exposes telemetry only; it does not change the assist control law.
 */
export function assistedCommand(s:State,command:Input,p:Profile):AssistedCommandResult {
  const settings=ASSIST_SETTINGS;
  const forward=rotate(s.orientation,[0,0,-1]);
  const length=Math.hypot(forward[0],forward[2]);
  const fx=length>.001?forward[0]/length:0,fz=length>.001?forward[2]/length:-1;
  const vx=(-fx*command.pitch+fz*command.roll)*settings.horizontalSpeedMps;
  const vz=(-fz*command.pitch-fx*command.roll)*settings.horizontalSpeedMps;
  let ax=(vx-s.velocity[0])*settings.velocityGain,az=(vz-s.velocity[2])*settings.velocityGain;
  const acc=Math.hypot(ax,az);
  if(acc>settings.maxHorizontalAcceleration){ax*=settings.maxHorizontalAcceleration/acc;az*=settings.maxHorizontalAcceleration/acc;}
  const norm=Math.hypot(ax,G,az),desired:Vec3=[ax/norm,G/norm,az/norm];
  const up=rotate(s.orientation,[0,1,0]);
  const error:Vec3=[up[1]*desired[2]-up[2]*desired[1],up[2]*desired[0]-up[0]*desired[2],up[0]*desired[1]-up[1]*desired[0]];
  const [x,y,z,w]=s.orientation,inverse:Quat=[-x,-y,-z,w];
  const bodyError=rotate(inverse,error);
  const verticalCommand=Math.abs(command.throttle-.5)<.04?0:(command.throttle-.5)*2;
  const wantedVerticalSpeed=verticalCommand*settings.verticalSpeedMps;
  const wantedYawRate=command.yaw*settings.yawRateRadS;
  const thrust=p.massKg*Math.max(0,G+settings.verticalGain*(wantedVerticalSpeed-s.velocity[1]))/Math.max(.3,up[1]);
  const available=4*p.maxMotorThrustN*(s.voltage/p.batteryFullV)**2;
  const appliedInput:Input={
    throttle:Math.sqrt(clamp(thrust/available,0,1)),
    pitch:inverseRate(clamp(bodyError[0]*settings.levelGain,-1.6,1.6),p),
    roll:inverseRate(clamp(bodyError[2]*settings.levelGain,-1.6,1.6),p),
    yaw:inverseRate(wantedYawRate,p),
  };
  return {
    appliedInput,
    targets:{horizontalVelocityWorldMps:[vx,vz],verticalVelocityMps:wantedVerticalSpeed,yawRateRadPerSec:wantedYawRate},
  };
}

/** Backward-compatible helper used by existing physics callers/tests. */
export function assistedInput(s:State,command:Input,p:Profile):Input {
  return assistedCommand(s,command,p).appliedInput;
}
