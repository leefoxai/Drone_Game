import type { Input } from './index';

export type ControlMode = 'assisted' | 'acro';

export interface CameraSnapshot {
  verticalFovRad: number;
  aspectRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}
export interface ControlContext {
  trackId: string;
  controlMode: ControlMode;
  aircraftProfileVersion: number;
  assistVersion: number | null;
}
export interface InputRecord {
  tick: number;
  pilotInput: Input;
  appliedInput: Input;
  controlMode: ControlMode;
  assistVersion: number | null;
}
export interface CameraChange extends CameraSnapshot { tick: number }
export interface LapRecord extends ControlContext {
  partitionKey: string;
  seconds: number;
  valid: boolean;
  inputs: InputRecord[];
  cameraChanges: CameraChange[];
}

export function dataPartitionKey(context:ControlContext):string {
  return [context.trackId,context.controlMode,`profile-${context.aircraftProfileVersion}`,`assist-${context.assistVersion ?? 'none'}`].join('|');
}
export function cameraSnapshot(verticalFovDeg:number,viewportWidth:number,viewportHeight:number,devicePixelRatio=1):CameraSnapshot {
  if(!Number.isFinite(verticalFovDeg)||verticalFovDeg<=0)throw new Error('Invalid vertical FOV');
  if(!Number.isFinite(viewportWidth)||!Number.isFinite(viewportHeight)||viewportWidth<=0||viewportHeight<=0)throw new Error('Invalid viewport');
  return {verticalFovRad:verticalFovDeg*Math.PI/180,aspectRatio:viewportWidth/viewportHeight,viewportWidth,viewportHeight,devicePixelRatio};
}
function sameCamera(a:CameraSnapshot|undefined,b:CameraSnapshot):boolean {
  return !!a && a.verticalFovRad===b.verticalFovRad && a.aspectRatio===b.aspectRatio
    && a.viewportWidth===b.viewportWidth && a.viewportHeight===b.viewportHeight && a.devicePixelRatio===b.devicePixelRatio;
}
export class LapTelemetryBuffer {
  private inputs:InputRecord[]=[];
  private cameras:CameraChange[]=[];
  constructor(private context:ControlContext){}
  setContext(context:ControlContext){this.context=context;this.reset();}
  reset(){this.inputs=[];this.cameras=[];}
  record(tick:number,pilotInput:Input,appliedInput:Input,camera:CameraSnapshot){
    this.inputs.push({tick,pilotInput:{...pilotInput},appliedInput:{...appliedInput},controlMode:this.context.controlMode,assistVersion:this.context.assistVersion});
    const previous=this.cameras.at(-1);
    if(!sameCamera(previous,camera))this.cameras.push({tick,...camera});
  }
  finalize(seconds:number,valid:boolean):LapRecord {
    const record:LapRecord={...this.context,partitionKey:dataPartitionKey(this.context),seconds,valid,inputs:this.inputs.map(v=>structuredClone(v)),cameraChanges:this.cameras.map(v=>({...v}))};
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
    const bucket=this.byPartition.get(record.partitionKey)??[];bucket.push(record);this.byPartition.set(record.partitionKey,bucket);
  }
  records(context:ControlContext):readonly LapRecord[]{return this.byPartition.get(dataPartitionKey(context))??[];}
  count(context:ControlContext):number{return this.records(context).length;}
  partitionCount():number{return this.byPartition.size;}
}
