import { test, expect } from '@playwright/test';
import { trainingEligibility, selectTrainingRecordings } from '../apps/client/src/training-export';
import type { FullLapRecording } from '../apps/client/src/recording';

const input=(direct=false)=>({tick:0,pilotInput:{throttle:.5,roll:.2,pitch:0,yaw:0},appliedInput:direct?{throttle:.5,roll:.2,pitch:0,yaw:0}:{throttle:.42,roll:.1,pitch:.05,yaw:0},controlMode:direct?'acro':'assisted',assistVersion:direct?null:1,assistTargets:direct?null:{horizontalVelocityWorldMps:[1,0] as [number,number],verticalVelocityMps:0,yawRateRadPerSec:0}});
function record(options:{consent?:boolean;kind?:'keyboard'|'rc_joystick';mode?:'assisted'|'acro';label?:'flight_method'|'stick_pattern'}={}):FullLapRecording{
  const kind=options.kind??'keyboard',mode=options.mode??'assisted',direct=mode==='acro'&&kind==='rc_joystick';
  return {metadata:{outcome:{status:'complete'},consent:{granted:options.consent??true,scope:(options.consent??true)?['local_bc_training']:[]},trainingUse:options.label??(direct?'stick_pattern':'flight_method'),inputDeviceKind:kind,controlMode:mode,assistVersion:mode==='assisted'?1:null} as any,inputs:[input(direct)] as any,frames:[],states:[],controllerStates:[],events:[],cameraChanges:[]};
}

test('flight_method export는 동의된 complete 기록만 통과한다',()=>{
  expect(trainingEligibility(record(),'flight_method')).toEqual({eligible:true,reason:null});
  expect(trainingEligibility(record({consent:false}),'flight_method').eligible).toBe(false);
  const aborted=record();aborted.metadata.outcome.status='aborted';expect(trainingEligibility(aborted,'flight_method').eligible).toBe(false);
});

test('stick_pattern export는 RC Acro direct fixture만 통과하고 flight_method 누출을 막는다',()=>{
  const flight=record(),stick=record({kind:'rc_joystick',mode:'acro',label:'stick_pattern'}),mislabeled=record({kind:'rc_joystick',mode:'acro',label:'flight_method'});
  expect(selectTrainingRecordings([flight,stick,mislabeled],'stick_pattern')).toEqual([stick]);
  expect(selectTrainingRecordings([flight,stick,mislabeled],'flight_method')).toEqual([flight]);
  expect(trainingEligibility(mislabeled,'stick_pattern').reason).toBe('training_use_mislabeled');
});
