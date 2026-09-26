import type { FullLapRecording } from './recording';
import { sha256 } from './recording';

export type RecordingChannel='metadata'|'frames'|'inputs'|'states'|'controller_states'|'events'|'camera_changes';
export interface EncodedRecording { bytes:Uint8Array; uncompressedBytes:number; compressedBytes:number; payloadSha256:string }

function payloadLines(recording:FullLapRecording):string[]{
  const lines:string[]=[];
  for(const value of recording.frames)lines.push(JSON.stringify({channel:'frames',...value}));
  for(const value of recording.inputs)lines.push(JSON.stringify({channel:'inputs',...value}));
  for(const value of recording.states)lines.push(JSON.stringify({channel:'states',...value}));
  for(const value of recording.controllerStates)lines.push(JSON.stringify({channel:'controller_states',...value}));
  for(const value of recording.events)lines.push(JSON.stringify({channel:'events',...value}));
  for(const value of recording.cameraChanges)lines.push(JSON.stringify({channel:'camera_changes',...value}));
  return lines;
}
async function gzip(bytes:Uint8Array):Promise<Uint8Array>{
  const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes:Uint8Array):Promise<Uint8Array>{
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeRecording(recording:FullLapRecording):Promise<EncodedRecording>{
  const lines=payloadLines(recording);
  const payload=lines.length?lines.join('\n')+'\n':'';
  const payloadSha256=await sha256(payload);
  const metadata={...recording.metadata,payloadSha256};
  const text=JSON.stringify({channel:'metadata',...metadata})+'\n'+payload;
  const raw=new TextEncoder().encode(text), bytes=await gzip(raw);
  return {bytes,uncompressedBytes:raw.byteLength,compressedBytes:bytes.byteLength,payloadSha256};
}

export async function decodeRecording(bytes:Uint8Array|ArrayBuffer|Blob):Promise<FullLapRecording>{
  const packed=bytes instanceof Blob?new Uint8Array(await bytes.arrayBuffer()):bytes instanceof ArrayBuffer?new Uint8Array(bytes):bytes;
  const raw=await gunzip(packed),text=new TextDecoder().decode(raw),lines=text.split(/\n/).filter(Boolean);
  if(!lines.length)throw new Error('Empty recording');
  const first=JSON.parse(lines[0]!) as Record<string,unknown>;
  if(first.channel!=='metadata')throw new Error('First JSONL record must be metadata');
  const {channel:_,...metadata}=first;
  const recording:FullLapRecording={metadata:metadata as FullLapRecording['metadata'],frames:[],inputs:[],states:[],controllerStates:[],events:[],cameraChanges:[]};
  for(const line of lines.slice(1)){
    const value=JSON.parse(line) as Record<string,unknown>;const ch=value.channel;delete value.channel;
    if(ch==='frames')recording.frames.push(value as unknown as FullLapRecording['frames'][number]);
    else if(ch==='inputs')recording.inputs.push(value as unknown as FullLapRecording['inputs'][number]);
    else if(ch==='states')recording.states.push(value as unknown as FullLapRecording['states'][number]);
    else if(ch==='controller_states')recording.controllerStates.push(value as unknown as FullLapRecording['controllerStates'][number]);
    else if(ch==='events')recording.events.push(value as unknown as FullLapRecording['events'][number]);
    else if(ch==='camera_changes')recording.cameraChanges.push(value as unknown as FullLapRecording['cameraChanges'][number]);
    else throw new Error(`Unknown channel ${String(ch)}`);
  }
  const payload=lines.slice(1).join('\n')+(lines.length>1?'\n':'');
  const actual=await sha256(payload);
  if(recording.metadata.payloadSha256&&recording.metadata.payloadSha256!==actual)throw new Error('Payload SHA-256 mismatch');
  return recording;
}
