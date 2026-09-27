import { createWorld } from './world';
import { decodeRecording } from './recording-codec';
import { buildM3FramePlan } from './m3-render';
import type { FullLapRecording } from './recording';

interface M3RenderApi {
  load(base64:string):Promise<{recordingId:string;frameCount:number;seconds:number;schemaVersion:string}>;
  frame(index:number):Promise<ReturnType<typeof buildM3FramePlan>[number]>;
  plan():ReturnType<typeof buildM3FramePlan>;
}

declare global { interface Window { m3Render?:M3RenderApi } }

const canvas=document.getElementById('scene') as HTMLCanvasElement;
let recording:FullLapRecording|null=null;
let framePlan:ReturnType<typeof buildM3FramePlan>=[];
let world:ReturnType<typeof createWorld>|null=null;

function fromBase64(value:string):Uint8Array{
  const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
}

async function load(base64:string){
  if(!import.meta.env.DEV)throw new Error('M3 render harness is development-only');
  recording=await decodeRecording(fromBase64(base64));
  if(recording.metadata.outcome.status!=='complete')throw new Error('complete lap required');
  framePlan=buildM3FramePlan(recording,30);
  world?.dispose();world=createWorld(canvas,recording.metadata.track.snapshot);
  return {recordingId:recording.metadata.recordingId,frameCount:framePlan.length,seconds:recording.metadata.outcome.seconds!,schemaVersion:recording.metadata.schemaVersion};
}

async function frame(index:number){
  if(!recording||!world)throw new Error('recording not loaded');
  const label=framePlan[index];if(!label)throw new Error(`frame ${index} out of range`);
  const current=recording.states[label.stateIndex]!,previous=recording.states[Math.max(0,label.stateIndex-1)]!;
  world.render(previous.state,current.state,0,'fpv',15,75,label.nextGateIndex,1/30);
  await new Promise(requestAnimationFrame);
  return label;
}

window.m3Render={load,frame,plan:()=>structuredClone(framePlan)};
