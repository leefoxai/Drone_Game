import { test, expect } from '@playwright/test';
import { ASSIST_VERSION, assistedInput } from '../packages/physics/src/assist';
import profile from '../packages/physics/profiles/racer5.json' with { type: 'json' };
import { initialState } from '../packages/physics/src/index';
import { LapTelemetryBuffer, SessionLapArchive, cameraSnapshot, dataPartitionKey } from '../packages/physics/src/telemetry';
import type { ControlContext } from '../packages/physics/src/telemetry';

const base=(overrides:Partial<ControlContext>={}):ControlContext=>({
  trackId:'training-five-v2',controlMode:'assisted',aircraftProfileVersion:profile.version,assistVersion:ASSIST_VERSION,
  cameraMode:'chase',artificialHorizonEnabled:false,heightAssistEnabled:true,...overrides,
});

test('쉬운 조종은 사람 입력과 물리 적용 입력을 함께 기록하고 assist version을 남긴다',()=>{
  const context=base();
  const recorder=new LapTelemetryBuffer(context),state=initialState(profile);
  const pilot={throttle:.5,roll:.7,pitch:-.4,yaw:.2};
  const applied=assistedInput(state,pilot,profile);
  recorder.record(0,pilot,applied,cameraSnapshot(75,1920,1080,1,'chase',false,true));
  const lap=recorder.finalize(12.3,true);
  expect(lap.inputs[0]!.pilotInput).toEqual(pilot);
  expect(lap.inputs[0]!.appliedInput).toEqual(applied);
  expect(lap.inputs[0]!.appliedInput).not.toEqual(pilot);
  expect(lap.inputs[0]!.controlMode).toBe('assisted');
  expect(lap.inputs[0]!.assistVersion).toBe(ASSIST_VERSION);
});

test('Acro/Easy와 카메라/수평선/높이 보조 조건은 서로 다른 학습 파티션이다',()=>{
  const assisted=base({trackId:'race-five-v2',cameraMode:'fpv',artificialHorizonEnabled:true,heightAssistEnabled:true});
  const acro=base({trackId:'race-five-v2',controlMode:'acro',assistVersion:null,cameraMode:'fpv',artificialHorizonEnabled:true,heightAssistEnabled:false});
  expect(dataPartitionKey(assisted)).not.toBe(dataPartitionKey(acro));
  expect(dataPartitionKey(acro)).not.toBe(dataPartitionKey({...acro,cameraMode:'chase',artificialHorizonEnabled:false}));
  expect(dataPartitionKey(acro)).not.toBe(dataPartitionKey({...acro,artificialHorizonEnabled:false}));
  expect(dataPartitionKey(assisted)).not.toBe(dataPartitionKey({...assisted,heightAssistEnabled:false}));
  const archive=new SessionLapArchive();
  const a=new LapTelemetryBuffer(assisted);a.record(0,{throttle:.5,roll:0,pitch:0,yaw:0},{throttle:.3,roll:0,pitch:0,yaw:0},cameraSnapshot(75,1280,720,1,'fpv',true,true));archive.add(a.finalize(40,true));
  const b=new LapTelemetryBuffer(acro);b.record(0,{throttle:.3,roll:0,pitch:0,yaw:0},{throttle:.3,roll:0,pitch:0,yaw:0},cameraSnapshot(75,1280,720,1,'fpv',true,false));archive.add(b.finalize(42,true));
  expect(archive.count(assisted)).toBe(1);expect(archive.count(acro)).toBe(1);expect(archive.partitionCount()).toBe(2);
});

test('카메라 기록은 세로 FOV, 화면 비율과 시야 보조 상태를 함께 보존한다',()=>{
  const camera=cameraSnapshot(82,1920,1080,1.5,'fpv',true,false);
  expect(camera.verticalFovRad).toBeCloseTo(82*Math.PI/180,12);
  expect(camera.aspectRatio).toBeCloseTo(16/9,12);
  expect(camera.viewportWidth).toBe(1920);expect(camera.viewportHeight).toBe(1080);expect(camera.devicePixelRatio).toBe(1.5);
  expect(camera.cameraMode).toBe('fpv');expect(camera.artificialHorizonEnabled).toBe(true);expect(camera.heightAssistEnabled).toBe(false);
});
