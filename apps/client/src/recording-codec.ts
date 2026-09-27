import { cloneState, step } from '../../../packages/physics/src/index';
import type { Input } from '../../../packages/physics/src/index';
import type { AssistTargets } from '../../../packages/physics/src/assist';
import type { ControlMode } from '../../../packages/physics/src/telemetry';
import type { FullLapRecording, FrameInputRecord, PhysicsInputRecord, StateRecord } from './recording';
import { INPUT_CHUNK_SIZE, LEGACY_RECORDING_FORMAT, LEGACY_SCHEMA_VERSION, RECORDING_FORMAT, SCHEMA_VERSION, STATE_CHECKPOINT_INTERVAL_TICKS, controllerStateRecord, sha256 } from './recording';

export type RecordingChannel='metadata'|'frames'|'inputs'|'states'|'controller_states'|'events'|'camera_changes'|'input_chunks'|'state_checkpoints';
export interface EncodedRecording { bytes:Uint8Array; uncompressedBytes:number; compressedBytes:number; payloadSha256:string }

type CompactInputRow=[number,number,number,number,number,number,number,number,number,number|null,number|null,number|null,number|null];
interface CompactInputChunk { startTick:number; rows:CompactInputRow[] }
interface CompactFrame {
  frameSequence:number;
  simulationTick:number;
  physicsAlpha:number;
  inputReadMonotonicMs:number;
  rafTimestampMs:number;
  inputDeviceKind:FrameInputRecord['inputDeviceKind'];
  keysDown:string[]|null;
  rawAxes:number[]|null;
  rawButtons:number[]|null;
  normalizedPilotInput:Input;
}

function compactFrame(value:FrameInputRecord):CompactFrame {
  return {
    frameSequence:value.frameSequence,simulationTick:value.simulationTick,physicsAlpha:value.physicsAlpha,
    inputReadMonotonicMs:value.inputReadMonotonicMs,rafTimestampMs:value.rafTimestampMs,inputDeviceKind:value.inputDeviceKind,
    keysDown:value.keysDown? [...value.keysDown]:null,rawAxes:value.rawAxes? [...value.rawAxes]:null,rawButtons:value.rawButtons? [...value.rawButtons]:null,
    normalizedPilotInput:{...value.normalizedPilotInput},
  };
}
function inputRow(value:PhysicsInputRecord):CompactInputRow {
  const p=value.pilotInput,a=value.appliedInput,t=value.assistTargets;
  return [value.tick,p.throttle,p.roll,p.pitch,p.yaw,a.throttle,a.roll,a.pitch,a.yaw,t?.horizontalVelocityWorldMps[0]??null,t?.horizontalVelocityWorldMps[1]??null,t?.verticalVelocityMps??null,t?.yawRateRadPerSec??null];
}
function inputRecord(row:CompactInputRow,mode:ControlMode,assistVersion:number|null):PhysicsInputRecord {
  const targetPresent=row[9]!==null||row[10]!==null||row[11]!==null||row[12]!==null;
  const assistTargets:AssistTargets|null=targetPresent?{horizontalVelocityWorldMps:[row[9]!,row[10]!],verticalVelocityMps:row[11]!,yawRateRadPerSec:row[12]!}:null;
  return {tick:row[0],pilotInput:{throttle:row[1],roll:row[2],pitch:row[3],yaw:row[4]},appliedInput:{throttle:row[5],roll:row[6],pitch:row[7],yaw:row[8]},controlMode:mode,assistVersion,assistTargets};
}
function checkpointTicks(recording:FullLapRecording):Set<number>{
  const first=recording.states[0]?.tick??recording.metadata.initialState.tick,final=recording.states.at(-1)?.tick??recording.metadata.outcome.finalTick;
  const ticks=new Set<number>([first,final,...recording.events.map(v=>v.tick)]);
  for(let tick=first;tick<=final;tick+=STATE_CHECKPOINT_INTERVAL_TICKS)ticks.add(tick);
  return ticks;
}
function payloadLinesV2(recording:FullLapRecording):string[]{
  const lines:string[]=[];
  for(const value of recording.frames)lines.push(JSON.stringify({channel:'frames',...compactFrame(value)}));
  for(let i=0;i<recording.inputs.length;i+=INPUT_CHUNK_SIZE){
    const values=recording.inputs.slice(i,i+INPUT_CHUNK_SIZE);const chunk:CompactInputChunk={startTick:values[0]!.tick,rows:values.map(inputRow)};
    lines.push(JSON.stringify({channel:'input_chunks',...chunk}));
  }
  const ticks=checkpointTicks(recording);
  for(const value of recording.states)if(ticks.has(value.tick))lines.push(JSON.stringify({channel:'state_checkpoints',tick:value.tick,state:value.state}));
  for(const value of recording.events)lines.push(JSON.stringify({channel:'events',...value}));
  for(const value of recording.cameraChanges)lines.push(JSON.stringify({channel:'camera_changes',...value}));
  return lines;
}
function arrayBuffer(bytes:Uint8Array):ArrayBuffer{return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;}
async function gzip(bytes:Uint8Array):Promise<Uint8Array>{
  const stream=new Blob([arrayBuffer(bytes)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes:Uint8Array):Promise<Uint8Array>{
  const stream=new Blob([arrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeRecording(recording:FullLapRecording):Promise<EncodedRecording>{
  const lines=payloadLinesV2(recording);
  const payload=lines.length?lines.join('\n')+'\n':'';
  const payloadSha256=await sha256(payload);
  const metadata={...recording.metadata,schemaVersion:SCHEMA_VERSION,recordingFormat:RECORDING_FORMAT,inputChunkSize:INPUT_CHUNK_SIZE,stateCheckpointIntervalTicks:STATE_CHECKPOINT_INTERVAL_TICKS,payloadSha256};
  const text=JSON.stringify({channel:'metadata',...metadata})+'\n'+payload;
  const raw=new TextEncoder().encode(text),bytes=await gzip(raw);
  return {bytes,uncompressedBytes:raw.byteLength,compressedBytes:bytes.byteLength,payloadSha256};
}

function decodeLegacy(metadata:FullLapRecording['metadata'],lines:string[]):FullLapRecording{
  const recording:FullLapRecording={metadata,frames:[],inputs:[],states:[],controllerStates:[],events:[],cameraChanges:[]};
  for(const line of lines){
    const value=JSON.parse(line) as Record<string,unknown>;const ch=value.channel;delete value.channel;
    if(ch==='frames')recording.frames.push(value as unknown as FullLapRecording['frames'][number]);
    else if(ch==='inputs')recording.inputs.push(value as unknown as FullLapRecording['inputs'][number]);
    else if(ch==='states')recording.states.push(value as unknown as FullLapRecording['states'][number]);
    else if(ch==='controller_states')recording.controllerStates.push(value as unknown as FullLapRecording['controllerStates'][number]);
    else if(ch==='events')recording.events.push(value as unknown as FullLapRecording['events'][number]);
    else if(ch==='camera_changes')recording.cameraChanges.push(value as unknown as FullLapRecording['cameraChanges'][number]);
    else throw new Error(`Unknown legacy channel ${String(ch)}`);
  }
  recording.recordedCheckpoints=recording.states.map(v=>({tick:v.tick,state:cloneState(v.state)}));
  return recording;
}
function reconstructStates(recording:FullLapRecording):void{
  const sim=cloneState(recording.metadata.initialState),states:StateRecord[]=[{tick:sim.tick,state:cloneState(sim)}];
  for(const value of recording.inputs){
    if(value.tick!==sim.tick)throw new Error(`Input tick ${value.tick} does not match simulation tick ${sim.tick}`);
    step(sim,value.appliedInput,recording.metadata.aircraftProfile.snapshot);states.push({tick:sim.tick,state:cloneState(sim)});
  }
  recording.states=states;recording.controllerStates=states.map(v=>controllerStateRecord(v.state));
}
function decodeV2(metadata:FullLapRecording['metadata'],lines:string[]):FullLapRecording{
  const recording:FullLapRecording={metadata,frames:[],inputs:[],states:[],controllerStates:[],events:[],cameraChanges:[],recordedCheckpoints:[]};
  for(const line of lines){
    const value=JSON.parse(line) as Record<string,unknown>;const ch=value.channel;delete value.channel;
    if(ch==='frames')recording.frames.push({...value,cameraPose:null} as unknown as FullLapRecording['frames'][number]);
    else if(ch==='input_chunks'){
      const chunk=value as unknown as CompactInputChunk;
      for(const row of chunk.rows)recording.inputs.push(inputRecord(row,metadata.controlMode,metadata.assistVersion));
    } else if(ch==='state_checkpoints')recording.recordedCheckpoints!.push(value as unknown as StateRecord);
    else if(ch==='events')recording.events.push(value as unknown as FullLapRecording['events'][number]);
    else if(ch==='camera_changes')recording.cameraChanges.push(value as unknown as FullLapRecording['cameraChanges'][number]);
    else throw new Error(`Unknown v2 channel ${String(ch)}`);
  }
  reconstructStates(recording);return recording;
}

export async function decodeRecording(bytes:Uint8Array|ArrayBuffer|Blob):Promise<FullLapRecording>{
  const packed=bytes instanceof Blob?new Uint8Array(await bytes.arrayBuffer()):bytes instanceof ArrayBuffer?new Uint8Array(bytes):bytes;
  const raw=await gunzip(packed),text=new TextDecoder().decode(raw),lines=text.split(/\n/).filter(Boolean);
  if(!lines.length)throw new Error('Empty recording');
  const first=JSON.parse(lines[0]!) as Record<string,unknown>;
  if(first.channel!=='metadata')throw new Error('First JSONL record must be metadata');
  const {channel:_,...metadataValue}=first;const metadata=metadataValue as unknown as FullLapRecording['metadata'];
  const payload=lines.slice(1).join('\n')+(lines.length>1?'\n':'');const actual=await sha256(payload);
  if(metadata.payloadSha256&&metadata.payloadSha256!==actual)throw new Error('Payload SHA-256 mismatch');
  if(metadata.schemaVersion===LEGACY_SCHEMA_VERSION&&metadata.recordingFormat===LEGACY_RECORDING_FORMAT)return decodeLegacy(metadata,lines.slice(1));
  if(metadata.schemaVersion===SCHEMA_VERSION&&metadata.recordingFormat===RECORDING_FORMAT)return decodeV2(metadata,lines.slice(1));
  throw new Error(`Unsupported recording schema/format ${metadata.schemaVersion} / ${metadata.recordingFormat}`);
}
