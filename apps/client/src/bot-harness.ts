import profileData from '../../../packages/physics/profiles/racer5.json' with { type: 'json' };
import { cloneState, initialState, step } from '../../../packages/physics/src/index';
import { applyAssistTargets } from '../../../packages/physics/src/assist';
import type { AssistTargets } from '../../../packages/physics/src/assist';
import { TRACKS, TRAINING_TRACK, collision } from '../../../packages/physics/src/track';
import { Race } from '../../../packages/physics/src/race';
import { FixedClock } from '../../../packages/physics/src/clock';
import { createWorld } from './world';
import { loadBcModel } from './bc-model';
import type { BcModel } from './bc-model';

if(!import.meta.env.DEV)throw new Error('M3 bot harness is development-only');

const canvas=document.getElementById('scene') as HTMLCanvasElement;
const modelInput=document.getElementById('model') as HTMLInputElement;
const start=document.getElementById('start') as HTMLButtonElement;
const status=document.getElementById('status') as HTMLPreElement;
const profile=structuredClone(profileData);
let model:BcModel|null=null,track=TRAINING_TRACK,state=initialState(profile),previous=cloneState(state),race=new Race(track,'m3-bot'),world=createWorld(canvas,track),clock=new FixedClock();
let frameId=0,lastTime=performance.now(),lastInferMs=-Infinity,targets:AssistTargets={horizontalVelocityWorldMps:[0,0],verticalVelocityMps:0,yawRateRadPerSec:0},running=false;

function chooseTrack(){
  const id=typeof model?.file.training?.trackId==='string'?model.file.training.trackId:null;
  track=TRACKS.find(v=>v.id===id)??TRAINING_TRACK;
}
function reset(){
  chooseTrack();state=initialState(profile);previous=cloneState(state);race=new Race(track,'m3-bot');clock=new FixedClock();targets={horizontalVelocityWorldMps:[0,0],verticalVelocityMps:0,yawRateRadPerSec:0};world.setTrack(track);world.resetCamera();running=true;lastTime=performance.now();lastInferMs=-Infinity;
}
function fmt(v:number){return Number.isFinite(v)?v.toFixed(2):'NaN';}
function renderStatus(){
  status.textContent=`track: ${track.id}\ngate: ${Math.min(race.nextGate+1,race.gateCount)} / ${race.gateCount}\nlap: ${race.elapsed(state.tick).toFixed(3)} s\ntarget vx/vz: ${fmt(targets.horizontalVelocityWorldMps[0])}, ${fmt(targets.horizontalVelocityWorldMps[1])}\ntarget vy: ${fmt(targets.verticalVelocityMps)}\ntarget yaw: ${fmt(targets.yawRateRadPerSec)} rad/s`;
}

modelInput.onchange=async()=>{
  const file=modelInput.files?.[0];if(!file)return;
  try{model=await loadBcModel(file);start.disabled=false;status.textContent=`모델 로드 완료: ${file.name}\n시작을 누르세요.`;}catch(error){model=null;start.disabled=true;status.textContent=error instanceof Error?error.message:String(error);}
};
start.onclick=reset;

function frame(now:number){
  frameId=requestAnimationFrame(frame);const elapsed=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;
  if(running&&model){
    if(now-lastInferMs>=1000/30){targets=model.predictCanvas(canvas);lastInferMs=now;}
    clock.advance(elapsed,()=>{
      previous=cloneState(state);const input=applyAssistTargets(state,targets,profile);step(state,input,profile);
      if(collision(previous.position,state.position,track)){status.textContent='충돌 · 시작/리셋으로 다시 실행';running=false;return;}
      const completed=race.update(previous.position,state.position,state.tick,true);if(completed){status.textContent=`완주 ${race.lastSeconds?.toFixed(3)} s`;running=false;}
    });
  }
  world.render(previous,state,running?clock.alpha:1,'fpv',15,75,race.nextGate,elapsed);if(running)renderStatus();
}
world.render(previous,state,1,'fpv',15,75,race.nextGate,0);frameId=requestAnimationFrame(frame);
import.meta.hot?.dispose(()=>{cancelAnimationFrame(frameId);world.dispose();});
