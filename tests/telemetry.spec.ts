import { test, expect } from '@playwright/test';
import { ASSIST_VERSION, assistedCommand, assistedInput } from '../packages/physics/src/assist';
import profile from '../packages/physics/profiles/racer5.json' with { type: 'json' };
import { PHYSICS_VERSION, initialState } from '../packages/physics/src/index';
import { LapTelemetryBuffer, SessionLapArchive, cameraSnapshot, classifyTrainingUse, dataPartitionKey, publicLeaderboardEligible, selectTrainingRecords } from '../packages/physics/src/telemetry';
import type { ControlContext, InputRecord, LapRecord } from '../packages/physics/src/telemetry';

const base=(overrides:Partial<ControlContext>={}):ControlContext=>({
  trackId:'training-five-v2',controlMode:'assisted',aircraftProfileVersion:profile.version,assistVersion:ASSIST_VERSION,
  physicsVersion:PHYSICS_VERSION,inputDeviceKind:'keyboard',testerMode:false,
  cameraMode:'chase',artificialHorizonEnabled:false,heightAssistEnabled:true,...overrides,
});
const camera=()=>cameraSnapshot(75,1280,720,1,'chase',false,true);
const directInput={throttle:.3,roll:.2,pitch:-.1,yaw:.05};

function directSample(mode:'assisted'|'acro'='acro'):InputRecord{
  return {tick:0,pilotInput:{...directInput},appliedInput:{...directInput},controlMode:mode,assistVersion:mode==='acro'?null:ASSIST_VERSION,assistTargets:null};
}
function fakeLap(context:ControlContext,trainingUse:'stick_pattern'|'flight_method',inputs:InputRecord[]):LapRecord{
  return {...context,partitionKey:dataPartitionKey(context),trainingUse,publicLeaderboardEligible:!context.testerMode,seconds:20,valid:true,inputs,cameraChanges:[]};
}

test('쉬운 조종은 사람 입력·물리 입력과 속도 목표를 함께 기록한다',()=>{
  const context=base();
  const recorder=new LapTelemetryBuffer(context),state=initialState(profile);
  const pilot={throttle:.75,roll:.7,pitch:-.4,yaw:.2};
  const result=assistedCommand(state,pilot,profile);
  expect(result.appliedInput).toEqual(assistedInput(state,pilot,profile));
  recorder.record(0,pilot,result.appliedInput,camera(),result.targets);
  const lap=recorder.finalize(12.3,true);
  expect(lap.inputs[0]!.pilotInput).toEqual(pilot);
  expect(lap.inputs[0]!.appliedInput).toEqual(result.appliedInput);
  expect(lap.inputs[0]!.appliedInput).not.toEqual(pilot);
  expect(lap.inputs[0]!.assistTargets).toEqual(result.targets);
  expect(lap.inputs[0]!.assistTargets!.horizontalVelocityWorldMps).toHaveLength(2);
  expect(lap.inputs[0]!.assistTargets!.verticalVelocityMps).toBeGreaterThan(0);
  expect(lap.inputs[0]!.assistTargets!.yawRateRadPerSec).toBeGreaterThan(0);
  expect(lap.trainingUse).toBe('flight_method');
});

test('training_use는 RC/gamepad Acro 직접 입력만 stick_pattern으로 분류한다',()=>{
  const keyboardAcro=base({controlMode:'acro',assistVersion:null,inputDeviceKind:'keyboard'});
  const gamepadEasy=base({controlMode:'assisted',assistVersion:ASSIST_VERSION,inputDeviceKind:'gamepad'});
  const rcEasy=base({controlMode:'assisted',assistVersion:ASSIST_VERSION,inputDeviceKind:'rc_joystick'});
  const gamepadAcro=base({controlMode:'acro',assistVersion:null,inputDeviceKind:'gamepad'});
  const rcAcro=base({controlMode:'acro',assistVersion:null,inputDeviceKind:'rc_joystick'});
  expect(classifyTrainingUse(keyboardAcro,[directSample()])).toBe('flight_method');
  expect(classifyTrainingUse(gamepadEasy,[directSample('assisted')])).toBe('flight_method');
  expect(classifyTrainingUse(rcEasy,[directSample('assisted')])).toBe('flight_method');
  expect(classifyTrainingUse(gamepadAcro,[directSample()])).toBe('stick_pattern');
  expect(classifyTrainingUse(rcAcro,[directSample()])).toBe('stick_pattern');
  const modified={...directSample(),appliedInput:{...directInput,roll:.19}};
  expect(classifyTrainingUse(gamepadAcro,[modified])).toBe('flight_method');
});

test('입력 장치 종류와 physics version은 학습 파티션을 분리한다',()=>{
  const context=base({trackId:'race-five-v2'});
  expect(dataPartitionKey(context)).not.toBe(dataPartitionKey({...context,inputDeviceKind:'rc_joystick'}));
  expect(dataPartitionKey(context)).not.toBe(dataPartitionKey({...context,physicsVersion:context.physicsVersion+1}));
  expect(dataPartitionKey(context)).not.toBe(dataPartitionKey({...context,testerMode:true}));
});

test('Acro/Easy와 카메라/수평선/높이 보조 조건은 서로 다른 학습 파티션이다',()=>{
  const assisted=base({trackId:'race-five-v2',cameraMode:'fpv',artificialHorizonEnabled:true,heightAssistEnabled:true});
  const acro=base({trackId:'race-five-v2',controlMode:'acro',assistVersion:null,cameraMode:'fpv',artificialHorizonEnabled:true,heightAssistEnabled:false,inputDeviceKind:'rc_joystick',testerMode:true});
  expect(dataPartitionKey(assisted)).not.toBe(dataPartitionKey(acro));
  expect(dataPartitionKey(acro)).not.toBe(dataPartitionKey({...acro,cameraMode:'chase',artificialHorizonEnabled:false}));
  expect(dataPartitionKey(acro)).not.toBe(dataPartitionKey({...acro,artificialHorizonEnabled:false}));
  expect(dataPartitionKey(assisted)).not.toBe(dataPartitionKey({...assisted,heightAssistEnabled:false}));
  const archive=new SessionLapArchive();
  const a=new LapTelemetryBuffer(assisted);a.record(0,{throttle:.5,roll:0,pitch:0,yaw:0},{throttle:.3,roll:0,pitch:0,yaw:0},camera());archive.add(a.finalize(40,true));
  const b=new LapTelemetryBuffer(acro);b.record(0,directInput,directInput,cameraSnapshot(75,1280,720,1,'fpv',true,false));archive.add(b.finalize(42,true));
  expect(archive.count(assisted)).toBe(1);expect(archive.count(acro)).toBe(1);expect(archive.partitionCount()).toBe(2);
});

test('stick_pattern 내보내기는 flight_method 랩을 강제로 제외하고 원본 배열은 보존한다',()=>{
  const keyboardEasy=fakeLap(base(),'flight_method',[directSample('assisted')]);
  const rcEasy=fakeLap(base({inputDeviceKind:'rc_joystick'}),'flight_method',[directSample('assisted')]);
  const rcAcroContext=base({controlMode:'acro',assistVersion:null,inputDeviceKind:'rc_joystick',testerMode:true});
  const rcAcro=fakeLap(rcAcroContext,'stick_pattern',[directSample()]);
  const source=[keyboardEasy,rcEasy,rcAcro];
  const exported=selectTrainingRecords(source,'stick_pattern');
  expect(exported).toEqual([rcAcro]);
  expect(exported.every(r=>r.trainingUse==='stick_pattern')).toBe(true);
  expect(source).toHaveLength(3);
});

test('잘못 라벨된 flight_method 랩은 stick_pattern 내보내기에 들어갈 수 없다',()=>{
  const context=base({controlMode:'acro',assistVersion:null,inputDeviceKind:'keyboard'});
  const mislabeled=fakeLap(context,'stick_pattern',[directSample()]);
  expect(selectTrainingRecords([mislabeled],'stick_pattern')).toEqual([]);
});

test('테스터 랩은 공개 순위 대상이 아니지만 학습 용도와 원본 보존은 별개다',()=>{
  expect(publicLeaderboardEligible(base())).toBe(true);
  expect(publicLeaderboardEligible(base({testerMode:true}))).toBe(false);
});

test('카메라 기록은 세로 FOV, 화면 비율과 시야 보조 상태를 함께 보존한다',()=>{
  const value=cameraSnapshot(82,1920,1080,1.5,'fpv',true,false);
  expect(value.verticalFovRad).toBeCloseTo(82*Math.PI/180,12);
  expect(value.aspectRatio).toBeCloseTo(16/9,12);
  expect(value.viewportWidth).toBe(1920);expect(value.viewportHeight).toBe(1080);expect(value.devicePixelRatio).toBe(1.5);
  expect(value.cameraMode).toBe('fpv');expect(value.artificialHorizonEnabled).toBe(true);expect(value.heightAssistEnabled).toBe(false);
});
