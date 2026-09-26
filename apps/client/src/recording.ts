import profileData from '../../../packages/physics/profiles/racer5.json' with { type: 'json' };
import { G, PHYSICS_HZ, cloneState, step } from '../../../packages/physics/src/index';
import type { Input, Profile, State } from '../../../packages/physics/src/index';
import type { Track } from '../../../packages/physics/src/track';
import { ASSIST_SETTINGS } from '../../../packages/physics/src/assist';
import type { AssistTargets } from '../../../packages/physics/src/assist';
import { classifyTrainingUse, dataPartitionKey, publicLeaderboardEligible } from '../../../packages/physics/src/telemetry';
import type { CameraSnapshot, ControlContext, InputRecord, TrainingUse } from '../../../packages/physics/src/telemetry';
import type { Mapping } from './input';
import { getCurrentCameraPose } from './camera-telemetry';
import type { RenderCameraPose } from './camera-telemetry';

export const SCHEMA_VERSION = '0.1.6';
export const RECORDING_FORMAT = 'drone-lap-jsonl-gzip-v1';
export const RULESET_VERSION = 1;
export const RESIM_TOLERANCE = {
  positionM: 1e-9,
  velocityMps: 1e-9,
  orientation: 1e-10,
  angularVelocityRadS: 1e-9,
} as const;

export type LapOutcome = 'complete' | 'invalid' | 'aborted';
export type EventType = 'lap_start' | 'gate_pass' | 'collision' | 'lap_complete' | 'lap_abort';

export interface FrameInputRecord {
  frameSequence: number;
  simulationTick: number;
  physicsAlpha: number;
  inputReadMonotonicMs: number;
  rafTimestampMs: number;
  inputDeviceKind: ControlContext['inputDeviceKind'];
  keysDown: string[] | null;
  rawAxes: number[] | null;
  rawButtons: number[] | null;
  normalizedPilotInput: Input;
  /** Exact camera transform/projection used by the most recent rendered frame. */
  cameraPose: RenderCameraPose | null;
}

export interface PhysicsInputRecord extends InputRecord {}
export interface StateRecord { tick: number; state: State }
export interface ControllerStateRecord {
  tick: number;
  integral: State['integral'];
  previousOmega: State['previousOmega'];
  derivative: State['derivative'];
  motors: number[];
  charge: number;
  voltage: number;
  thrustN: number;
  targetOmega: State['targetOmega'];
  acceleration: State['acceleration'];
}
export interface LapEvent { tick: number; sequence: number; type: EventType; payload: Record<string, unknown> }

export interface RecordingMetadata extends ControlContext {
  schemaVersion: string;
  recordingFormat: string;
  recordingId: string;
  sessionId: string;
  createdAtUtc: string;
  partitionKey: string;
  trainingUse: TrainingUse;
  publicLeaderboardEligible: boolean;
  physicsHz: number;
  track: { id: string; version: number; snapshot: Track; sha256: string };
  ruleset: { id: string; version: number; snapshot: Record<string, unknown>; sha256: string };
  aircraftProfile: { id: string; version: number; snapshot: Profile; sha256: string };
  rates: { model: 'betaflight'; rcRate: number; superRate: number; expo: number; maxRateRadS: number };
  inputDevice: { mapping: Mapping | null; browserMapping: string | null; axesCount: number | null; buttonsCount: number | null };
  display: { refreshRateHzEstimate: number | null; renderFpsEstimate: number | null; viewportWidth: number; viewportHeight: number; devicePixelRatio: number };
  controlProfile: { mode: ControlContext['controlMode']; assistVersion: number | null; assistSettings: typeof ASSIST_SETTINGS | null };
  seed: number;
  prng: string;
  initialState: State;
  environment: { gravityWorldMps2: [number, number, number]; windWorldMps: [number, number, number] };
  camera: CameraSnapshot & {
    nearM: number;
    farM: number;
    relativePositionM: [number, number, number] | null;
    relativeOrientation: [number, number, number, number] | null;
    renderPoseAtStart: RenderCameraPose | null;
  };
  practiceAssist: { heightAssistEnabled: boolean };
  clientBuild: string;
  runtime: { userAgent: string; language: string };
  consent: { granted: boolean; scope: string[]; policyVersion: string | null; grantedAtUtc: string | null };
  outcome: { status: LapOutcome; finalTick: number; seconds: number | null; completedGates: number; reason: string | null };
  payloadSha256?: string;
}

export interface FullLapRecording {
  metadata: RecordingMetadata;
  frames: FrameInputRecord[];
  inputs: PhysicsInputRecord[];
  states: StateRecord[];
  controllerStates: ControllerStateRecord[];
  events: LapEvent[];
  cameraChanges: Array<CameraSnapshot & { tick: number }>;
}

export interface RecorderMetadataSource {
  context: ControlContext;
  track: Track;
  profile: Profile;
  initialState: State;
  camera: CameraSnapshot;
  inputDevice: RecordingMetadata['inputDevice'];
  display: RecordingMetadata['display'];
  runtime: RecordingMetadata['runtime'];
  clientBuild: string;
  sessionId: string;
}

const encoder = new TextEncoder();
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export async function sha256(value: unknown): Promise<string> {
  const bytes=encoder.encode(typeof value==='string'?value:stable(value));
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}

const copyState=(state:State):State=>cloneState(state);
function controllerState(state:State):ControllerStateRecord {
  return {tick:state.tick,integral:[...state.integral],previousOmega:[...state.previousOmega],derivative:[...state.derivative],motors:[...state.motors],charge:state.charge,voltage:state.voltage,thrustN:state.thrustN,targetOmega:[...state.targetOmega],acceleration:[...state.acceleration]};
}
function cameraExtrinsics(camera:CameraSnapshot):Pick<RecordingMetadata['camera'],'relativePositionM'|'relativeOrientation'> {
  if(camera.cameraMode==='fpv')return {relativePositionM:[0,.035,-.17],relativeOrientation:null};
  // Chase uses a world-up/look-at model rather than one fixed body-relative quaternion.
  return {relativePositionM:[0,.38,3.2],relativeOrientation:null};
}

export class M2LapRecorder {
  private source:RecorderMetadataSource|null=null;
  private frames:FrameInputRecord[]=[];
  private inputs:PhysicsInputRecord[]=[];
  private states:StateRecord[]=[];
  private controllers:ControllerStateRecord[]=[];
  private events:LapEvent[]=[];
  private cameras:Array<CameraSnapshot & {tick:number}>=[];
  private eventSequence=0;
  private frameSequence=0;
  private initialRenderPose:RenderCameraPose|null=null;

  get active(){return this.source!==null;}
  begin(source:RecorderMetadataSource){
    if(this.active)return;
    this.source=structuredClone(source);
    this.initialRenderPose=getCurrentCameraPose();
    this.states=[{tick:source.initialState.tick,state:copyState(source.initialState)}];
    this.controllers=[controllerState(source.initialState)];
    this.cameras=[{tick:source.initialState.tick,...structuredClone(source.camera)}];
    this.events=[];this.inputs=[];this.frames=[];this.eventSequence=0;this.frameSequence=0;
    this.event(source.initialState.tick,'lap_start',{position:[...source.initialState.position]});
  }
  frame(record:Omit<FrameInputRecord,'frameSequence'|'cameraPose'>){
    if(this.active)this.frames.push({frameSequence:this.frameSequence++,...structuredClone(record),cameraPose:getCurrentCameraPose()});
  }
  tick(tick:number,pilotInput:Input,appliedInput:Input,assistTargets:AssistTargets|null,camera:CameraSnapshot,afterState:State){
    if(!this.active)return;
    this.inputs.push({tick,pilotInput:{...pilotInput},appliedInput:{...appliedInput},controlMode:this.source!.context.controlMode,assistVersion:this.source!.context.assistVersion,assistTargets:assistTargets?structuredClone(assistTargets):null});
    this.states.push({tick:afterState.tick,state:copyState(afterState)});
    this.controllers.push(controllerState(afterState));
    const last=this.cameras.at(-1)!;
    if(JSON.stringify({...last,tick:undefined})!==JSON.stringify(camera))this.cameras.push({tick:afterState.tick,...structuredClone(camera)});
  }
  event(tick:number,type:EventType,payload:Record<string,unknown>={}){if(this.active)this.events.push({tick,sequence:this.eventSequence++,type,payload:structuredClone(payload)});}
  async finish(status:LapOutcome,seconds:number|null,completedGates:number,reason:string|null):Promise<FullLapRecording|null>{
    if(!this.source)return null;
    const source=this.source,renderPoseAtStart=this.initialRenderPose;
    const frames=this.frames.map(v=>structuredClone(v)),inputs=this.inputs.map(v=>structuredClone(v)),states=this.states.map(v=>structuredClone(v));
    const controllerStates=this.controllers.map(v=>structuredClone(v)),events=this.events.map(v=>structuredClone(v)),cameraChanges=this.cameras.map(v=>structuredClone(v));
    const finalTick=states.at(-1)!.tick;
    const terminalType:EventType=status==='complete'?'lap_complete':'lap_abort';
    events.push({tick:finalTick,sequence:this.eventSequence++,type:terminalType,payload:{status,reason}});
    this.source=null;this.initialRenderPose=null;this.frames=[];this.inputs=[];this.states=[];this.controllers=[];this.events=[];this.cameras=[];this.eventSequence=0;this.frameSequence=0;

    const partitionKey=dataPartitionKey(source.context),trainingUse=classifyTrainingUse(source.context,inputs);
    const trackSnapshot=structuredClone(source.track),profileSnapshot=structuredClone(source.profile);
    const rulesetSnapshot={trackId:source.track.id,orderedGates:source.track.gates.map(g=>g.id),collisionInvalidates:true,completeRequiresAllGates:true};
    const cameraDetails=cameraExtrinsics(source.camera);
    const metadata:RecordingMetadata={
      ...source.context,
      schemaVersion:SCHEMA_VERSION,recordingFormat:RECORDING_FORMAT,
      recordingId:crypto.randomUUID(),sessionId:source.sessionId,createdAtUtc:new Date().toISOString(),partitionKey,trainingUse,
      publicLeaderboardEligible:publicLeaderboardEligible(source.context)&&status==='complete',physicsHz:PHYSICS_HZ,
      track:{id:source.track.id,version:source.track.version,snapshot:trackSnapshot,sha256:await sha256(trackSnapshot)},
      ruleset:{id:'ordered-gates-v1',version:RULESET_VERSION,snapshot:rulesetSnapshot,sha256:await sha256(rulesetSnapshot)},
      aircraftProfile:{id:source.profile.id,version:source.profile.version,snapshot:profileSnapshot,sha256:await sha256(profileSnapshot)},
      rates:{model:'betaflight',rcRate:source.profile.rates.rcRate,superRate:source.profile.rates.superRate,expo:source.profile.rates.expo,maxRateRadS:Math.PI/180*200*source.profile.rates.rcRate/Math.max(.01,1-source.profile.rates.superRate)},
      inputDevice:structuredClone(source.inputDevice),display:structuredClone(source.display),
      controlProfile:{mode:source.context.controlMode,assistVersion:source.context.assistVersion,assistSettings:source.context.controlMode==='assisted'?structuredClone(ASSIST_SETTINGS):null},
      seed:0,prng:'none',initialState:copyState(source.initialState),environment:{gravityWorldMps2:[0,-G,0],windWorldMps:[0,0,0]},
      camera:{...structuredClone(source.camera),nearM:renderPoseAtStart?.nearM??.025,farM:renderPoseAtStart?.farM??220,...cameraDetails,renderPoseAtStart},practiceAssist:{heightAssistEnabled:source.context.heightAssistEnabled},
      clientBuild:source.clientBuild,runtime:structuredClone(source.runtime),consent:{granted:false,scope:[],policyVersion:null,grantedAtUtc:null},
      outcome:{status,finalTick,seconds,completedGates,reason},
    };
    return {metadata,frames,inputs,states,controllerStates,events,cameraChanges};
  }
  cancel(){this.source=null;this.initialRenderPose=null;this.frames=[];this.inputs=[];this.states=[];this.controllers=[];this.events=[];this.cameras=[];}
}

export interface ResimulationResult { states:StateRecord[]; maxPositionErrorM:number; maxVelocityErrorMps:number; maxOrientationError:number; maxAngularVelocityErrorRadS:number }
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]!));
export function resimulateRecording(recording:FullLapRecording,profile:Profile=profileData):ResimulationResult {
  if(recording.metadata.physicsVersion!==3)throw new Error(`Unsupported physics version ${recording.metadata.physicsVersion}`);
  const sim=copyState(recording.metadata.initialState),states:StateRecord[]=[{tick:sim.tick,state:copyState(sim)}];
  let maxPositionErrorM=0,maxVelocityErrorMps=0,maxOrientationError=0,maxAngularVelocityErrorRadS=0;
  for(let i=0;i<recording.inputs.length;i++){
    step(sim,recording.inputs[i]!.appliedInput,profile);
    states.push({tick:sim.tick,state:copyState(sim)});
    const expected=recording.states[i+1]?.state;if(!expected)continue;
    maxPositionErrorM=Math.max(maxPositionErrorM,distance(sim.position,expected.position));
    maxVelocityErrorMps=Math.max(maxVelocityErrorMps,distance(sim.velocity,expected.velocity));
    maxOrientationError=Math.max(maxOrientationError,distance(sim.orientation,expected.orientation));
    maxAngularVelocityErrorRadS=Math.max(maxAngularVelocityErrorRadS,distance(sim.omega,expected.omega));
  }
  return {states,maxPositionErrorM,maxVelocityErrorMps,maxOrientationError,maxAngularVelocityErrorRadS};
}

export function recordingWithinTolerance(result:ResimulationResult):boolean {
  return result.maxPositionErrorM<=RESIM_TOLERANCE.positionM&&result.maxVelocityErrorMps<=RESIM_TOLERANCE.velocityMps&&result.maxOrientationError<=RESIM_TOLERANCE.orientation&&result.maxAngularVelocityErrorRadS<=RESIM_TOLERANCE.angularVelocityRadS;
}
