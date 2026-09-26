import { test, expect } from '@playwright/test';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import profileJson from '../packages/physics/profiles/racer5.json' with { type: 'json' };
import { cloneState, initialState, step } from '../packages/physics/src/index';
import type { Input, Profile } from '../packages/physics/src/index';
import { ASSIST_VERSION, assistedCommand } from '../packages/physics/src/assist';
import { TRAINING_TRACK, RACE_TRACK } from '../packages/physics/src/track';
import { cameraSnapshot } from '../packages/physics/src/telemetry';
import type { ControlContext, InputDeviceKind } from '../packages/physics/src/telemetry';
import { defaultMapping } from '../apps/client/src/input';
import { setCurrentCameraPose } from '../apps/client/src/camera-telemetry';
import { M2LapRecorder, recordingWithinTolerance, resimulateRecording } from '../apps/client/src/recording';
import type { FullLapRecording } from '../apps/client/src/recording';
import { decodeRecording, encodeRecording } from '../apps/client/src/recording-codec';

const profile=structuredClone(profileJson) as Profile;
const camera=cameraSnapshot(75,1280,720,1,'chase',false,true);
const renderPose={positionWorldM:[0,3.38,9.2] as [number,number,number],orientationWorld:[0,0,0,1] as [number,number,number,number],verticalFovRad:75*Math.PI/180,aspectRatio:16/9,nearM:.025,farM:220};

async function fixture(name:string,kind:InputDeviceKind,mode:'assisted'|'acro',track=TRAINING_TRACK):Promise<FullLapRecording>{
  const context:ControlContext={trackId:track.id,controlMode:mode,aircraftProfileVersion:profile.version,assistVersion:mode==='assisted'?ASSIST_VERSION:null,physicsVersion:3,inputDeviceKind:kind,testerMode:kind!=='keyboard',cameraMode:'chase',artificialHorizonEnabled:false,heightAssistEnabled:true};
  const recorder=new M2LapRecorder();const state=initialState(profile),initial=cloneState(state);setCurrentCameraPose(renderPose);
  recorder.begin({context,track,profile,initialState:initial,camera,inputDevice:{mapping:kind==='keyboard'?null:defaultMapping(kind==='rc_joystick'?'rc_joystick':'gamepad'),browserMapping:kind==='gamepad'?'standard':'',axesCount:kind==='keyboard'?null:4,buttonsCount:kind==='keyboard'?null:8},display:{refreshRateHzEstimate:60,renderFpsEstimate:60,viewportWidth:1280,viewportHeight:720,devicePixelRatio:1},runtime:{userAgent:'fixture',language:'ko-KR'},clientBuild:'fixture',sessionId:`session-${name}`});
  for(let i=0;i<480;i++){
    const pilot:Input=mode==='assisted'?{throttle:.5,roll:i<120?.3:0,pitch:i<240?-.45:0,yaw:i>300?.2:0}:{throttle:.42,roll:i<200?.22:0,pitch:-.12,yaw:.08};
    const command=mode==='assisted'?assistedCommand(state,pilot,profile):{appliedInput:{...pilot},targets:null};
    if(i%4===0)recorder.frame({simulationTick:state.tick,physicsAlpha:0,inputReadMonotonicMs:i/240*1000,rafTimestampMs:i/240*1000,inputDeviceKind:kind,keysDown:kind==='keyboard'?(i<120?['ArrowLeft']:[]):null,rawAxes:kind==='keyboard'?null:[pilot.yaw,pilot.throttle,pilot.roll,pilot.pitch],rawButtons:kind==='keyboard'?null:[0,0,0,0],normalizedPilotInput:{...pilot}});
    const tick=state.tick;step(state,command.appliedInput,profile);recorder.tick(tick,pilot,command.appliedInput,command.targets,camera,state);
  }
  recorder.event(state.tick,'gate_pass',{gateId:1,gateIndex:0,position:[...state.position]});
  const result=await recorder.finish('complete',2,track.gates.length,null);if(!result)throw new Error('fixture finalize failed');return result;
}

test('샘플 랩 3개는 gzip JSONL round-trip과 입력 재시뮬레이션 허용 오차를 통과한다',async()=>{
  const fixtures=[await fixture('keyboard-easy','keyboard','assisted',TRAINING_TRACK),await fixture('race-easy','keyboard','assisted',RACE_TRACK),await fixture('rc-acro','rc_joystick','acro',TRAINING_TRACK)];
  expect(fixtures.map(v=>v.metadata.trainingUse)).toEqual(['flight_method','flight_method','stick_pattern']);
  mkdirSync('test-results/m2',{recursive:true});
  const paths:string[]=[];
  for(let i=0;i<fixtures.length;i++){
    const encoded=await encodeRecording(fixtures[i]!);expect(encoded.compressedBytes).toBeLessThan(encoded.uncompressedBytes);
    const decoded=await decodeRecording(encoded.bytes);expect(decoded.metadata.recordingId).toBe(fixtures[i]!.metadata.recordingId);expect(decoded.states.length).toBe(decoded.inputs.length+1);
    const resim=resimulateRecording(decoded,profile);expect(recordingWithinTolerance(resim)).toBe(true);expect(resim.maxPositionErrorM).toBeLessThanOrEqual(1e-9);
    const path=`test-results/m2/fixture-${i+1}.jsonl.gz`;writeFileSync(path,encoded.bytes);paths.push(path);
  }
  const validation=spawnSync('python3',['tools/validate.py',...paths],{encoding:'utf8'});
  expect(validation.status,validation.stderr+'\n'+validation.stdout).toBe(0);expect(validation.stdout.match(/OK /g)?.length).toBe(3);
  rmSync('test-results/m2',{recursive:true,force:true});
});

test('M2 기록은 사람 입력, applied input, Easy assist targets, 상태 N+1과 렌더 카메라 pose를 보존한다',async()=>{
  const record=await fixture('contract','keyboard','assisted');
  expect(record.inputs).toHaveLength(480);expect(record.states).toHaveLength(481);expect(record.controllerStates).toHaveLength(481);expect(record.frames).toHaveLength(120);
  expect(record.inputs.every(v=>v.assistTargets!==null)).toBe(true);expect(record.frames[0]!.keysDown).not.toBeNull();
  expect(record.frames.every(v=>v.cameraPose!==null)).toBe(true);expect(record.metadata.camera.renderPoseAtStart).toEqual(renderPose);
  expect(record.metadata.schemaVersion).toBe('0.1.6');expect(record.metadata.physicsVersion).toBe(3);expect(record.metadata.partitionKey).toContain('device-keyboard');expect(record.metadata.trainingUse).toBe('flight_method');
});
