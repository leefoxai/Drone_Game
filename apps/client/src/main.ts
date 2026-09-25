import './style.css';
import profileData from '../../../packages/physics/profiles/racer5.json' with { type: 'json' };
import { PHYSICS_VERSION, DT, clamp, cloneState, hoverThrottle, initialState, rate, step } from '../../../packages/physics/src/index';
import type { Input } from '../../../packages/physics/src/index';
import { FixedClock } from '../../../packages/physics/src/clock';
import { TRACKS, TRAINING_TRACK, collision, isTrainingTrack } from '../../../packages/physics/src/track';
import type { Track } from '../../../packages/physics/src/track';
import { Race } from '../../../packages/physics/src/race';
import { ASSIST_VERSION, assistedInput } from '../../../packages/physics/src/assist';
import { LapTelemetryBuffer, SessionLapArchive, cameraSnapshot, dataPartitionKey } from '../../../packages/physics/src/telemetry';
import type { CameraMode, ControlContext, ControlMode } from '../../../packages/physics/src/telemetry';
import { createWorld } from './world';
import type { HorizonLine } from './world';
import { Diagnostics } from './diagnostics';
import { ControllerPanel } from './controller-panel';

const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=el<HTMLCanvasElement>('scene');
const profile=structuredClone(profileData);
let track:Track=TRAINING_TRACK;
let flightMode:ControlMode='assisted';
let cameraMode:CameraMode='chase';
let artificialHorizonEnabled=true;
let userHeightAssistEnabled=true;
const tiltByMode:Record<ControlMode,number>={assisted:15,acro:27};
let tilt=tiltByMode[flightMode], fov=75;
const heightAssistEnabled=()=>userHeightAssistEnabled&&(isTrainingTrack(track)||flightMode==='assisted');
const horizonEnabled=()=>artificialHorizonEnabled&&cameraMode==='fpv';
const context=():ControlContext=>({
  trackId:track.id,
  controlMode:flightMode,
  aircraftProfileVersion:profile.version,
  assistVersion:flightMode==='assisted'?ASSIST_VERSION:null,
  cameraMode,
  artificialHorizonEnabled:horizonEnabled(),
  heightAssistEnabled:heightAssistEnabled(),
});
let state=initialState(profile), previous=cloneState(state);
const clock=new FixedClock(), race=new Race(track,dataPartitionKey(context()));
const archive=new SessionLapArchive();
const recorder=new LapTelemetryBuffer(context());
const keys=new Set<string>();
let paused=false, source='keyboard', readyFrames=0;
let throttle=hoverThrottle(profile), hoverReference=true;
let pilotInput:Input={throttle:.5,roll:0,pitch:0,yaw:0};
let input:Input={throttle,roll:0,pitch:0,yaw:0};
let world:ReturnType<typeof createWorld>;
let lastTime=0, lastUI=0, lastGraphTick=-1, resetPending='', resets=0, frameId=0;
const diagnostics=new Diagnostics(el('rate-graph'),el('thrust-graph'),el('minimap'));

function message(text:string){el('flight-message').textContent=text;}
function syncCameraTilt(){
  tilt=tiltByMode[flightMode];
  const field=el<HTMLInputElement>('tilt');field.value=String(tilt);el('tilt-out').textContent=tilt+'°';
}
function syncTrackUI(){
  el('track-label').textContent=`${track.label.toUpperCase()} · ${track.gates.length} GATES`;
  el('track-description').textContent=track.description;
  canvas.setAttribute('aria-label',`드론과 ${track.gates.length}개 게이트가 있는 ${track.label}`);
  const heightToggle=el<HTMLInputElement>('height-assist-toggle');
  heightToggle.setAttribute('aria-description',isTrainingTrack(track)||flightMode==='assisted'?'현재 사용 가능':'대회용 Acro에서는 표시되지 않음');
}
function syncProfileUI(){
  const values:[string,number,string][]=[
    ['rc-rate',profile.rates.rcRate,profile.rates.rcRate.toFixed(2)],['super-rate',profile.rates.superRate,profile.rates.superRate.toFixed(2)],['expo',profile.rates.expo,profile.rates.expo.toFixed(2)],
    ['mass',profile.massKg,profile.massKg.toFixed(2)+' kg'],['thrust',profile.maxMotorThrustN,profile.maxMotorThrustN.toFixed(1)+' N'],['motor-lag',profile.motorTimeConstantS*1000,Math.round(profile.motorTimeConstantS*1000)+' ms'],
  ];
  for(const [id,value,label] of values){el<HTMLInputElement>(id).value=String(value);el(id+'-out').textContent=label;}
  el('max-rate').textContent='최대 '+Math.round(rate(1,profile.rates)*180/Math.PI)+' °/s · 세 축 공통';
}
function pause(reason:string){
  paused=true;keys.clear();clock.reset();
  if(race.startTick!==null)race.invalidate();
  el('pause').innerHTML='재개 <kbd>P</kbd>';message(reason);
}
const controller=new ControllerPanel(pause);
function reset(reason='시작 위치로 초기화 · 랩을 새로 시작합니다.') {
  state=initialState(profile);previous=cloneState(state);clock.reset();race.reset();recorder.reset();diagnostics.reset();
  throttle=hoverThrottle(profile);hoverReference=true;pilotInput={throttle:.5,roll:0,pitch:0,yaw:0};input={throttle,roll:0,pitch:0,yaw:0};
  lastGraphTick=-1;keys.clear();world?.resetCamera();
  resets++;message(reason);
  if(source==='gamepad') pause(reason+' · 스틱 확인 후 재개하세요.');
}
function applyContext(reason:string){
  race.setContext(track,dataPartitionKey(context()));recorder.setContext(context());reset(reason);
}
function togglePause(){
  if(!paused){pause('일시정지 · 진행 중이던 랩은 무효입니다. R로 새 랩을 시작하세요.');return;}
  if(source==='gamepad'&&!controller.poll()){message('조종기 연결 또는 축 매핑을 먼저 확인하세요.');return;}
  if(el<HTMLDetailsElement>('input-settings').open){message('조종기 설정을 접은 뒤 재개하세요.');return;}
  paused=false;clock.reset();lastTime=performance.now();el('pause').innerHTML='일시정지 <kbd>P</kbd>';
  message(race.valid?'비행 재개 · 노란 게이트를 순서대로 통과하세요.':'연습 재개 · 현재 랩 무효, R로 새 랩 시작');
}
function switchCamera(){
  cameraMode=cameraMode==='chase'?'fpv':'chase';
  el('camera').innerHTML=(cameraMode==='fpv'?'3인칭으로 전환':'FPV로 전환')+' <kbd>C</kbd>';
  el('camera').dataset.mode=cameraMode;world?.resetCamera();
  applyContext('카메라 모드 변경 · 시야 조건이 달라 새 학습 파티션에서 시작합니다.');
}
function updateHorizon(line:HorizonLine|null){
  const osd=el<HTMLDivElement>('fpv-osd');osd.hidden=!horizonEnabled();
  if(osd.hidden||!line)return;
  const midpoint=(line.leftY+line.rightY)/2;
  const angle=Math.atan2((line.rightY-line.leftY)*Math.max(1,innerHeight),Math.max(1,innerWidth));
  const horizon=el<HTMLDivElement>('artificial-horizon');
  horizon.style.top=`${midpoint*100}%`;horizon.style.transform=`rotate(${angle}rad)`;
}
function updateHeightAssist(){
  const node=el<HTMLDivElement>('height-assist');
  node.hidden=!heightAssistEnabled();if(node.hidden)return;
  const gate=track.gates[race.nextGate];if(!gate){node.hidden=true;return;}
  const delta=gate.center[1]-state.position[1],magnitude=Math.abs(delta)<.05?0:Math.abs(delta);
  const arrow=delta>.05?'▲':delta<-.05?'▼':'•';node.textContent=`다음 게이트 ${arrow} ${magnitude.toFixed(1)} m`;
}
function snapshot(){return cameraSnapshot(fov,Math.max(1,canvas.clientWidth),Math.max(1,canvas.clientHeight),devicePixelRatio,cameraMode,horizonEnabled(),heightAssistEnabled());}
function renderScene(alpha:number,elapsed:number){updateHorizon(world.render(previous,state,alpha,cameraMode,tilt,fov,race.nextGate,elapsed));}

el('reset').onclick=()=>reset();
el('pause').onclick=togglePause;
el('camera').onclick=switchCamera;
el<HTMLInputElement>('horizon-toggle').onchange=event=>{artificialHorizonEnabled=(event.target as HTMLInputElement).checked;applyContext('인공 수평선 설정 변경 · 새 학습 파티션에서 시작합니다.');};
el<HTMLInputElement>('height-assist-toggle').onchange=event=>{userHeightAssistEnabled=(event.target as HTMLInputElement).checked;applyContext('높이 보조 설정 변경 · 새 학습 파티션에서 시작합니다.');};
el<HTMLSelectElement>('flight-mode').onchange=event=>{
  flightMode=(event.target as HTMLSelectElement).value as ControlMode;syncCameraTilt();syncTrackUI();
  el('mode-badge').textContent=flightMode==='assisted'?'쉬운 조종':'ACRO';
  el('control-help').innerHTML=flightMode==='assisted'
    ?'↑↓ 앞뒤 이동 · ←→ 좌우 이동 · A/D 방향 전환<br>W/S 상승/하강 · 손을 놓으면 수평·감속·고도 보조<br>조종기는 스로틀 중앙이 고도 유지입니다.'
    :'↑↓ 피치 · ←→ 롤 · A/D 요<br>W/S 스로틀 증감 · H 호버 스로틀<br>Acro: 스틱을 놓아도 기울어진 자세를 유지합니다.';
  applyContext('조종 모드 변경 · 쉬운 조종과 Acro 순위/학습 데이터는 별도입니다.');
};
el<HTMLSelectElement>('track-select').onchange=event=>{
  track=TRACKS.find(value=>value.id===(event.target as HTMLSelectElement).value)??TRAINING_TRACK;
  world?.setTrack(track);syncTrackUI();applyContext('트랙 변경 · 선택한 트랙에서 새 랩을 시작합니다.');
};
el('hover').onclick=()=>{if(source==='keyboard'){hoverReference=true;throttle=hoverThrottle(profile,state.charge);message('호버 스로틀 설정 · 수평일 때만 고도를 유지합니다.');}};
el<HTMLSelectElement>('input-source').onchange=event=>{
  source=(event.target as HTMLSelectElement).value;reset('입력 방식 변경 · 새 주행 준비');
  if(source==='gamepad')pause('조종기 매핑과 스로틀을 확인한 뒤 재개하세요.');
  el<HTMLButtonElement>('hover').disabled=source!=='keyboard';
};
el('panel-toggle').onclick=()=>{
  const panel=el('controls');panel.hidden=!panel.hidden;el('panel-toggle').textContent=panel.hidden?'설정 열기':'설정 접기';el('panel-toggle').setAttribute('aria-expanded',String(!panel.hidden));
};
if(innerWidth<=720)el('panel-toggle').click();
const tune=(id:string,callback:(value:number)=>void,format:(value:number)=>string,physics=false)=>{
  const field=el<HTMLInputElement>(id);field.oninput=()=>{const value=Number(field.value);if(!Number.isFinite(value))return;callback(value);el(id+'-out').textContent=format(value);if(physics){race.invalidate();message('튜닝 즉시 적용 · 현재 랩 무효, R로 새 랩을 시작하세요.');}};
};
const fixed=(v:number)=>v.toFixed(2);
for(const [id,key] of [['rc-rate','rcRate'],['super-rate','superRate'],['expo','expo']] as const)tune(id,value=>{profile.rates[key]=value;el('max-rate').textContent='최대 '+Math.round(rate(1,profile.rates)*180/Math.PI)+' °/s · 세 축 공통';},fixed,true);
tune('tilt',value=>{tilt=value;tiltByMode[flightMode]=value;},value=>value+'°');
tune('fov',value=>fov=value,value=>value+'°');
tune('mass',value=>profile.massKg=value,value=>value.toFixed(2)+' kg',true);
tune('thrust',value=>profile.maxMotorThrustN=value,value=>value.toFixed(1)+' N',true);
tune('motor-lag',value=>profile.motorTimeConstantS=value/1000,value=>value+' ms',true);

function onKeyDown(event:KeyboardEvent){
  if((event.target as HTMLElement).closest('input,select,textarea,summary'))return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyS','KeyA','KeyD','KeyR','KeyP','KeyC','KeyH'].includes(event.code))event.preventDefault();
  if(!event.repeat){if(event.code==='KeyR')reset();if(event.code==='KeyP')togglePause();if(event.code==='KeyC')switchCamera();if(event.code==='KeyH')el('hover').click();}keys.add(event.code);
}
function onKeyUp(event:KeyboardEvent){keys.delete(event.code);}
function visibility(){if(document.hidden)pause('탭이 숨겨져 비행을 멈췄습니다. 재개하거나 R로 새로 시작하세요.');}
function blur(){keys.clear();if(!paused)pause('창 포커스를 잃어 비행을 멈췄습니다. 재개를 눌러 주세요.');}
window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();pause('그래픽 연결이 끊겼습니다. 새로고침해 주세요.');canvas.dataset.rendered='false';el('status').textContent='그래픽 연결 끊김 · 새로고침 필요';});
const axis=(positive:string,negative:string)=>(keys.has(positive)?1:0)-(keys.has(negative)?1:0);
const time=(seconds:number)=>{const ms=Math.floor(seconds*1000);return String(Math.floor(ms/60000)).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');};
function updateUI(){
  el('altitude').innerHTML=state.position[1].toFixed(2)+' <em>m</em>';el('speed').innerHTML=Math.hypot(...state.velocity).toFixed(1)+' <em>m/s</em>';el('throttle-value').innerHTML=Math.round(input.throttle*100)+' <em>%</em>';el('battery').innerHTML=state.voltage.toFixed(1)+' <em>V</em>';
  el('lap-time').textContent=time(race.elapsed(state.tick));el('gate-progress').textContent='다음 게이트 '+(race.nextGate+1)+' / '+race.gateCount+(race.valid?'':' · 랩 무효');el('best-lap').textContent=race.bestSeconds===null?'이 조건 완료 랩 없음':'이 조건 최고 '+time(race.bestSeconds)+' · '+race.laps+'랩';
  const camera=recorder.latestCamera??snapshot();const telemetry=el('telemetry');
  Object.assign(telemetry.dataset,{
    tick:String(state.tick),altitude:String(state.position[1]),running:String(!paused),resets:String(resets),valid:String(race.valid),physicsVersion:String(PHYSICS_VERSION),profileVersion:String(profile.version),mass:String(profile.massKg),nextGate:String(race.nextGate+1),gateCount:String(race.gateCount),mode:flightMode,assistVersion:flightMode==='assisted'?String(ASSIST_VERSION):'none',trackId:track.id,speed:String(Math.hypot(...state.velocity)),cameraMode,artificialHorizon:String(horizonEnabled()),heightAssist:String(heightAssistEnabled()),
    pilotThrottle:String(pilotInput.throttle),pilotRoll:String(pilotInput.roll),pilotPitch:String(pilotInput.pitch),pilotYaw:String(pilotInput.yaw),appliedThrottle:String(input.throttle),appliedRoll:String(input.roll),appliedPitch:String(input.pitch),appliedYaw:String(input.yaw),recordedSamples:String(recorder.sampleCount),learningPartition:dataPartitionKey(context()),archivedLaps:String(archive.count(context())),cameraVerticalFovRad:String(camera.verticalFovRad),cameraAspect:String(camera.aspectRatio),cameraWidth:String(camera.viewportWidth),cameraHeight:String(camera.viewportHeight)
  });
  updateHeightAssist();const graphAxis=Number(el<HTMLSelectElement>('graph-axis').value);el('live-rate').textContent=(state.omega[graphAxis]!*180/Math.PI).toFixed(0)+' °/s';el('live-thrust').textContent=state.thrustN.toFixed(1)+' N';diagnostics.draw(graphAxis,state,race.nextGate,track);controller.updateDisplay();
}
function frame(now:number){
  frameId=requestAnimationFrame(frame);const elapsed=lastTime?Math.max(0,(now-lastTime)/1000):0;lastTime=now;const padInput=controller.poll();
  if(readyFrames<3){readyFrames++;renderScene(1,0);if(readyFrames===3)el('status').textContent='3D 장면 준비 완료';updateUI();return;}
  if(!paused&&elapsed>0.25)pause('긴 프레임 지연으로 중단 · tick을 건너뛰지 않았습니다. 재개하거나 R을 누르세요.');if(!paused&&source==='gamepad'&&!padInput)pause('조종기 연결 또는 매핑 오류 · 비행을 멈췄습니다.');
  if(!paused){clock.advance(elapsed,()=>{
    if(resetPending)return;previous=cloneState(state);
    if(source==='keyboard'){
      if(keys.has('KeyW')||keys.has('KeyS'))hoverReference=false;if(hoverReference)throttle=hoverThrottle(profile,state.charge);else throttle=clamp(throttle+axis('KeyW','KeyS')*DT*.3,0,1);
      if(flightMode==='assisted')pilotInput={throttle:.5+axis('KeyW','KeyS')*.5,roll:axis('ArrowLeft','ArrowRight'),pitch:axis('ArrowDown','ArrowUp'),yaw:axis('KeyA','KeyD')};
      else pilotInput={throttle,roll:axis('ArrowLeft','ArrowRight')*.35,pitch:axis('ArrowDown','ArrowUp')*.25,yaw:axis('KeyA','KeyD')*.35};
    }else pilotInput=padInput!;
    input=flightMode==='assisted'?assistedInput(state,pilotInput,profile):{...pilotInput};recorder.record(state.tick,pilotInput,input,snapshot());step(state,input,profile);
    if(collision(previous.position,state.position,track)){resetPending='충돌 또는 트랙 이탈 · 시작 위치로 초기화했습니다.';return;}
    const active=flightMode==='assisted'?Math.abs(pilotInput.throttle-.5)>.02||Math.abs(pilotInput.roll)+Math.abs(pilotInput.pitch)+Math.abs(pilotInput.yaw)>.01:Math.abs(pilotInput.throttle-hoverThrottle(profile,state.charge))>.02||Math.abs(pilotInput.roll)+Math.abs(pilotInput.pitch)+Math.abs(pilotInput.yaw)>.01;
    if(race.update(previous.position,state.position,state.tick,active)){const valid=race.valid,record=recorder.finalize(race.lastSeconds!,valid);archive.add(record);message(valid?'랩 완료! '+time(race.lastSeconds!)+' · 같은 시야/보조 조건 순위에 기록':'연습 랩 완료 · 설정 변경/중단으로 기록 무효');}
    if(state.charge<=0){resetPending='배터리 소진 · 새 배터리로 다시 시작합니다.';return;}if(state.tick%8===0&&state.tick!==lastGraphTick){diagnostics.sample(state,input,4*profile.maxMotorThrustN);lastGraphTick=state.tick;}
  });if(resetPending){const reason=resetPending;resetPending='';reset(reason);}}
  renderScene(paused?1:clock.alpha,Math.min(elapsed,.05));if(now-lastUI>70){updateUI();lastUI=now;}
}
try{
  world=createWorld(canvas,track);syncTrackUI();syncProfileUI();syncCameraTilt();el('version').textContent='PHYSICS '+PHYSICS_VERSION+' / PROFILE '+profile.version;renderScene(1,0);updateUI();frameId=requestAnimationFrame(frame);
}catch(error){el('status').textContent='3D 장면 초기화 실패 · 그래픽 가속 설정을 확인해 주세요.';console.error(error);}
import.meta.hot?.dispose(()=>{cancelAnimationFrame(frameId);world?.dispose();window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);});
