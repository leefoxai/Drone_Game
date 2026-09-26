import type { Input } from './index';
import type { AssistTargets } from './assist';

export type ControlMode = 'assisted' | 'acro';
export type CameraMode = 'chase' | 'fpv';
export type InputDeviceKind = 'keyboard' | 'gamepad' | 'rc_joystick';
export type TrainingUse = 'stick_pattern' | 'flight_method';

export interface CameraSnapshot {
  verticalFovRad: number;
  aspectRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  cameraMode: CameraMode;
  artificialHorizonEnabled: boolean;
  heightAssistEnabled: boolean;
}

export interface ControlContext {
  trackId: string;
  controlMode: ControlMode;
  aircraftProfileVersion: number;
  assistVersion: number | null;
  physicsVersion: number;
  inputDeviceKind: InputDeviceKind;
  testerMode: boolean;
  cameraMode: CameraMode;
  artificialHorizonEnabled: boolean;
  heightAssistEnabled: boolean;
}

export interface InputRecord {
  tick: number;
  pilotInput: Input;
  appliedInput: Input;
  controlMode: ControlMode;
  assistVersion: number | null;
  assistTargets: AssistTargets | null;
}

export interface CameraChange extends CameraSnapshot { tick: number }

export interface LapRecord extends ControlContext {
  partitionKey: string;
  trainingUse: TrainingUse;
  publicLeaderboardEligible: boolean;
  seconds: number;
  valid: boolean;
  inputs: InputRecord[];
  cameraChanges: CameraChange[];
}

export function dataPartitionKey(context:ControlContext):string {
  return [
    context.trackId,
    context.controlMode,
    `device-${context.inputDeviceKind}`,
    `physics-${context.physicsVersion}`,
    `profile-${context.aircraftProfileVersion}`,
    `assist-${context.assistVersion ?? 'none'}`,
    `camera-${context.cameraMode}`,
    `horizon-${context.artificialHorizonEnabled?'on':'off'}`,
    `height-assist-${context.heightAssistEnabled?'on':'off'}`,
    `tester-${context.testerMode?'on':'off'}`,
  ].join('|');
}

function sameInput(a:Input,b:Input):boolean {
  return a.throttle===b.throttle && a.roll===b.roll && a.pitch===b.pitch && a.yaw===b.yaw;
}

/** Single source of truth for training-use classification. */
export function classifyTrainingUse(context:ControlContext,inputs:readonly InputRecord[]):TrainingUse {
  const directStickDevice=context.inputDeviceKind==='gamepad'||context.inputDeviceKind==='rc_joystick';
  const directAcro=context.controlMode==='acro'&&context.assistVersion===null&&directStickDevice;
  const everySampleDirect=inputs.length>0&&inputs.every(sample=>sameInput(sample.pilotInput,sample.appliedInput));
  return directAcro&&everySampleDirect?'stick_pattern':'flight_method';
}

export function publicLeaderboardEligible(context:Pick<ControlContext,'testerMode'>):boolean {
  return !context.testerMode;
}

/**
 * Returns a training-view selection without mutating or deleting original lap records.
 * stick_pattern selection is intentionally strict so flight_method records cannot leak in.
 */
export function selectTrainingRecords(records:readonly LapRecord[],use:TrainingUse):LapRecord[] {
  return records.filter(record=>record.valid&&record.trainingUse===use&&classifyTrainingUse(record,record.inputs)===use);
}

export function cameraSnapshot(
  verticalFovDeg:number,
  viewportWidth:number,
  viewportHeight:number,
  devicePixelRatio=1,
  cameraMode:CameraMode='chase',
  artificialHorizonEnabled=false,
  heightAssistEnabled=false,
):CameraSnapshot {
  if(!Number.isFinite(verticalFovDeg)||verticalFovDeg<=0)throw new Error('Invalid vertical FOV');
  if(!Number.isFinite(viewportWidth)||!Number.isFinite(viewportHeight)||viewportWidth<=0||viewportHeight<=0)throw new Error('Invalid viewport');
  return {verticalFovRad:verticalFovDeg*Math.PI/180,aspectRatio:viewportWidth/viewportHeight,viewportWidth,viewportHeight,devicePixelRatio,cameraMode,artificialHorizonEnabled,heightAssistEnabled};
}

function sameCamera(a:CameraSnapshot|undefined,b:CameraSnapshot):boolean {
  return !!a && a.verticalFovRad===b.verticalFovRad && a.aspectRatio===b.aspectRatio
    && a.viewportWidth===b.viewportWidth && a.viewportHeight===b.viewportHeight && a.devicePixelRatio===b.devicePixelRatio
    && a.cameraMode===b.cameraMode && a.artificialHorizonEnabled===b.artificialHorizonEnabled && a.heightAssistEnabled===b.heightAssistEnabled;
}

export class LapTelemetryBuffer {
  private inputs:InputRecord[]=[];
  private cameras:CameraChange[]=[];
  constructor(private context:ControlContext){}
  setContext(context:ControlContext){this.context=context;this.reset();}
  reset(){this.inputs=[];this.cameras=[];}
  record(tick:number,pilotInput:Input,appliedInput:Input,camera:CameraSnapshot,assistTargets:AssistTargets|null=null){
    this.inputs.push({
      tick,
      pilotInput:{...pilotInput},
      appliedInput:{...appliedInput},
      controlMode:this.context.controlMode,
      assistVersion:this.context.assistVersion,
      assistTargets:assistTargets?structuredClone(assistTargets):null,
    });
    const previous=this.cameras.at(-1);
    if(!sameCamera(previous,camera))this.cameras.push({tick,...camera});
  }
  finalize(seconds:number,valid:boolean):LapRecord {
    const trainingUse=classifyTrainingUse(this.context,this.inputs);
    const record:LapRecord={
      ...this.context,
      partitionKey:dataPartitionKey(this.context),
      trainingUse,
      publicLeaderboardEligible:publicLeaderboardEligible(this.context),
      seconds,
      valid,
      inputs:this.inputs.map(v=>structuredClone(v)),
      cameraChanges:this.cameras.map(v=>({...v})),
    };
    this.reset();
    return record;
  }
  get sampleCount(){return this.inputs.length;}
  get latest(){return this.inputs.at(-1)??null;}
  get latestCamera(){return this.cameras.at(-1)??null;}
}

export class SessionLapArchive {
  private byPartition=new Map<string,LapRecord[]>();
  add(record:LapRecord){
    if(!record.valid)return;
    const bucket=this.byPartition.get(record.partitionKey)??[];
    bucket.push(record);
    this.byPartition.set(record.partitionKey,bucket);
  }
  records(context:ControlContext):readonly LapRecord[]{return this.byPartition.get(dataPartitionKey(context))??[];}
  count(context:ControlContext):number{return this.records(context).length;}
  partitionCount():number{return this.byPartition.size;}
}
