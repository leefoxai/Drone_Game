import type { State } from '../../../packages/physics/src/index';
import type { FullLapRecording } from './recording';
import { resimulateRecording } from './recording';

export type GhostMode='state'|'resim';
export interface GhostSnapshot { state:State|null; positionErrorM:number; maxPositionErrorM:number }

export class GhostPlayback {
  private recording:FullLapRecording|null=null;
  private resimStates:FullLapRecording['states']=[];
  private maxPositionErrorM=0;
  mode:GhostMode='state';
  set(recording:FullLapRecording|null){
    this.recording=recording;
    if(!recording){this.resimStates=[];this.maxPositionErrorM=0;return;}
    const resim=resimulateRecording(recording);this.resimStates=resim.states;this.maxPositionErrorM=resim.maxPositionErrorM;
  }
  get active(){return this.recording!==null;}
  get recordingId(){return this.recording?.metadata.recordingId??null;}
  snapshot(elapsedSeconds:number):GhostSnapshot {
    if(!this.recording)return {state:null,positionErrorM:0,maxPositionErrorM:0};
    const index=Math.max(0,Math.min(this.recording.states.length-1,Math.floor(elapsedSeconds*this.recording.metadata.physicsHz)));
    const recorded=this.recording.states[index]?.state??null,resim=this.resimStates[index]?.state??null;
    if(!recorded)return {state:null,positionErrorM:0,maxPositionErrorM:this.maxPositionErrorM};
    const positionErrorM=resim?Math.hypot(recorded.position[0]-resim.position[0],recorded.position[1]-resim.position[1],recorded.position[2]-resim.position[2]):0;
    return {state:this.mode==='resim'?(resim??recorded):recorded,positionErrorM,maxPositionErrorM:this.maxPositionErrorM};
  }
}
