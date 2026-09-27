import { test, expect } from '@playwright/test';
import { buildM3FramePlan } from '../apps/client/src/m3-render';
import type { FullLapRecording } from '../apps/client/src/recording';

function recording():FullLapRecording{
  const state=(tick:number)=>({tick,position:[0,3,0],velocity:[0,0,0],orientation:[0,0,0,1],omega:[0,0,0],integral:[0,0,0],previousOmega:[0,0,0],derivative:[0,0,0],motors:[0,0,0,0],charge:1,voltage:25.2,thrustN:0,targetOmega:[0,0,0],acceleration:[0,0,0]});
  const inputs=Array.from({length:240},(_,tick)=>({tick,pilotInput:{throttle:.5,roll:0,pitch:0,yaw:0},appliedInput:{throttle:.4,roll:.1,pitch:.2,yaw:.3},controlMode:'assisted' as const,assistVersion:1,assistTargets:{horizontalVelocityWorldMps:[tick/240,-tick/240] as [number,number],verticalVelocityMps:.25,yawRateRadPerSec:.5}}));
  return {metadata:{physicsHz:240,initialState:state(0),outcome:{status:'complete',seconds:1,finalTick:240,completedGates:5,reason:null}} as any,frames:[],inputs,states:Array.from({length:241},(_,tick)=>({tick,state:state(tick) as any})),controllerStates:[],events:[{tick:0,sequence:0,type:'lap_start',payload:{}},{tick:80,sequence:1,type:'gate_pass',payload:{}},{tick:160,sequence:2,type:'gate_pass',payload:{}},{tick:240,sequence:3,type:'lap_complete',payload:{}}],cameraChanges:[]};
}

test('30fps frame plan은 8 physics tick 간격이며 BC label은 assistTargets에서만 온다',()=>{
  const record=recording(),plan=buildM3FramePlan(record,30);
  expect(plan).toHaveLength(30);expect(plan[0]!.simulationTick).toBe(0);expect(plan[1]!.simulationTick).toBe(8);expect(plan[29]!.simulationTick).toBe(232);
  expect(plan[1]!.assistTargetVx).toBeCloseTo(8/240,12);expect(plan[1]!.assistTargetVz).toBeCloseTo(-8/240,12);expect(plan[1]!.assistTargetVertical).toBe(.25);expect(plan[1]!.assistTargetYawRate).toBe(.5);
  expect(plan[1] as any).not.toHaveProperty('appliedInput');expect(plan[1] as any).not.toHaveProperty('appliedThrottle');
  expect(plan.find(v=>v.simulationTick===80)!.nextGateIndex).toBe(1);
});
