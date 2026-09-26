import { test, expect } from '@playwright/test';
import profileJson from '../packages/physics/profiles/racer5.json' with { type: 'json' };
import { initialState } from '../packages/physics/src/index';
import type { Profile } from '../packages/physics/src/index';
import { TRAINING_TRACK } from '../packages/physics/src/track';
import { ASSIST_VERSION } from '../packages/physics/src/assist';
import { cameraSnapshot } from '../packages/physics/src/telemetry';
import type { ControlContext } from '../packages/physics/src/telemetry';
import { setCurrentCameraPose } from '../apps/client/src/camera-telemetry';
import { M2LapRecorder } from '../apps/client/src/recording';
import type { RecordingMetadata } from '../apps/client/src/recording';

const profile=structuredClone(profileJson) as Profile;
const camera=cameraSnapshot(75,1280,720,1,'chase',false,true);
const renderPose={positionWorldM:[0,3.38,9.2] as [number,number,number],orientationWorld:[0,0,0,1] as [number,number,number,number],verticalFovRad:75*Math.PI/180,aspectRatio:16/9,nearM:.025,farM:220};
const context:ControlContext={trackId:TRAINING_TRACK.id,controlMode:'assisted',aircraftProfileVersion:profile.version,assistVersion:ASSIST_VERSION,physicsVersion:3,inputDeviceKind:'keyboard',testerMode:false,cameraMode:'chase',artificialHorizonEnabled:false,heightAssistEnabled:true};
const source=()=>({context,track:TRAINING_TRACK,profile,initialState:initialState(profile),camera,inputDevice:{mapping:null,browserMapping:null,axesCount:null,buttonsCount:null},display:{refreshRateHzEstimate:60,renderFpsEstimate:60,viewportWidth:1280,viewportHeight:720,devicePixelRatio:1},runtime:{userAgent:'fixture',language:'ko-KR'},clientBuild:'fixture',sessionId:'consent-test'});

const off:RecordingMetadata['consent']={granted:false,scope:[],policyVersion:null,grantedAtUtc:null};
const on:RecordingMetadata['consent']={granted:true,scope:['local_bc_training'],policyVersion:'m3-local-training-v1',grantedAtUtc:'2026-09-26T11:00:00.000Z'};

test('학습 활용 동의는 최초 기본 OFF이고 사용자가 켠 상태를 로컬에 보존한다',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>localStorage.removeItem('drone.training-consent.v1'));
  await page.reload();
  await expect(page.locator('#training-consent')).not.toBeChecked();
  await expect(page.locator('#training-consent-status')).toContainText('미동의');

  await page.locator('#training-consent').check();
  await expect(page.locator('#training-consent-status')).toContainText('동의됨');
  await page.reload();
  await expect(page.locator('#training-consent')).toBeChecked();

  await page.locator('#training-consent').uncheck();
  await page.reload();
  await expect(page.locator('#training-consent')).not.toBeChecked();
});

test('동의 변경은 진행 중 랩에 소급되지 않고 다음 랩부터 스냅샷된다',async()=>{
  setCurrentCameraPose(renderPose);
  let current=off;
  const recorder=new M2LapRecorder(()=>structuredClone(current));

  recorder.begin(source());
  current=on;
  const first=await recorder.finish('aborted',null,0,'fixture');
  expect(first?.metadata.consent).toEqual(off);

  recorder.begin(source());
  current=off;
  const second=await recorder.finish('aborted',null,0,'fixture');
  expect(second?.metadata.consent).toEqual(on);

  recorder.begin(source());
  const third=await recorder.finish('aborted',null,0,'fixture');
  expect(third?.metadata.consent).toEqual(off);
});
