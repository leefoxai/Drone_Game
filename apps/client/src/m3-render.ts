import type { FullLapRecording } from './recording';

export interface M3FrameLabel {
  frameIndex:number;
  frameTimeS:number;
  simulationTick:number;
  stateIndex:number;
  nextGateIndex:number;
  assistTargetVx:number|null;
  assistTargetVz:number|null;
  assistTargetVertical:number|null;
  assistTargetYawRate:number|null;
}

/**
 * Deterministic 30 fps dataset timeline. At 240 Hz, each 30 fps frame is exactly 8 physics ticks apart.
 * Labels come only from assistTargets; appliedInput is deliberately not exposed as a BC label.
 */
export function buildM3FramePlan(recording:FullLapRecording,fps=30):M3FrameLabel[]{
  if(!Number.isInteger(recording.metadata.physicsHz/fps))throw new Error(`fps ${fps} must divide physicsHz ${recording.metadata.physicsHz}`);
  const seconds=recording.metadata.outcome.seconds;
  if(seconds===null||seconds<=0)throw new Error('complete lap seconds required');
  const ticksPerFrame=recording.metadata.physicsHz/fps,frameCount=Math.ceil(seconds*fps),firstTick=recording.metadata.initialState.tick;
  const gateEvents=recording.events.filter(v=>v.type==='gate_pass').sort((a,b)=>a.tick-b.tick||a.sequence-b.sequence);
  const result:M3FrameLabel[]=[];
  for(let frameIndex=0;frameIndex<frameCount;frameIndex++){
    const stateIndex=Math.min(recording.states.length-1,frameIndex*ticksPerFrame);
    const inputIndex=Math.min(recording.inputs.length-1,stateIndex);
    const input=recording.inputs[inputIndex],targets=input?.assistTargets??null,simulationTick=firstTick+stateIndex;
    const nextGateIndex=gateEvents.filter(v=>v.tick<=simulationTick).length;
    result.push({
      frameIndex,frameTimeS:frameIndex/fps,simulationTick,stateIndex,nextGateIndex,
      assistTargetVx:targets?.horizontalVelocityWorldMps[0]??null,
      assistTargetVz:targets?.horizontalVelocityWorldMps[1]??null,
      assistTargetVertical:targets?.verticalVelocityMps??null,
      assistTargetYawRate:targets?.yawRateRadPerSec??null,
    });
  }
  return result;
}
