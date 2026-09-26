import { test, expect } from '@playwright/test';

test('IndexedDB 기록은 새로고침 후 남고 현재 조건 최고랩 고스트로 재생된다',async({page})=>{
  await page.goto('/');await expect(page.locator('#status')).toHaveText('3D 장면 준비 완료');
  await page.evaluate(async()=>{
    const {saveRecording,clearRecordingsForTests}=await import('/src/recording-store.ts');
    await clearRecordingsForTests();
    const state={tick:0,position:[0,3,6],velocity:[0,0,0],orientation:[0,0,0,1],omega:[0,0,0],integral:[0,0,0],previousOmega:[0,0,0],derivative:[0,0,0],motors:[.2,.2,.2,.2],charge:1,voltage:25.2,thrustN:6,targetOmega:[0,0,0],acceleration:[0,0,0]};
    const metadata={
      schemaVersion:'0.1.6',recordingFormat:'drone-lap-jsonl-gzip-v1',recordingId:'e2e-recording',sessionId:'e2e-session',createdAtUtc:new Date().toISOString(),
      trackId:'training-five-v2',controlMode:'assisted',aircraftProfileVersion:2,assistVersion:1,physicsVersion:3,inputDeviceKind:'keyboard',testerMode:false,cameraMode:'chase',artificialHorizonEnabled:false,heightAssistEnabled:true,
      partitionKey:'training-five-v2|assisted|device-keyboard|physics-3|profile-2|assist-1|camera-chase|horizon-off|height-assist-on|tester-off',trainingUse:'flight_method',publicLeaderboardEligible:true,physicsHz:240,
      track:{id:'training-five-v2',version:2,snapshot:{id:'training-five-v2',version:2,label:'fixture',description:'fixture',gates:[]},sha256:'fixture'},ruleset:{id:'fixture',version:1,snapshot:{},sha256:'fixture'},aircraftProfile:{id:'racer5',version:2,snapshot:{},sha256:'fixture'},rates:{model:'betaflight',rcRate:1,superRate:.7,expo:0,maxRateRadS:11.63},inputDevice:{mapping:null,browserMapping:null,axesCount:null,buttonsCount:null},display:{refreshRateHzEstimate:60,renderFpsEstimate:60,viewportWidth:1280,viewportHeight:720,devicePixelRatio:1},controlProfile:{mode:'assisted',assistVersion:1,assistSettings:null},seed:0,prng:'none',initialState:state,environment:{gravityWorldMps2:[0,-9.80665,0],windWorldMps:[0,0,0]},camera:{verticalFovRad:75*Math.PI/180,aspectRatio:16/9,viewportWidth:1280,viewportHeight:720,devicePixelRatio:1,cameraMode:'chase',artificialHorizonEnabled:false,heightAssistEnabled:true,nearM:.025,farM:220,relativePositionM:[0,.38,3.2],relativeOrientation:null},practiceAssist:{heightAssistEnabled:true},clientBuild:'e2e',runtime:{userAgent:'e2e',language:'ko-KR'},consent:{granted:false,scope:[],policyVersion:null,grantedAtUtc:null},outcome:{status:'complete',finalTick:0,seconds:1,completedGates:5,reason:null}
    };
    await saveRecording({metadata:metadata as any,frames:[],inputs:[],states:[{tick:0,state:state as any}],controllerStates:[],events:[],cameraChanges:[]});
  });
  await page.reload();await expect(page.locator('#status')).toHaveText('3D 장면 준비 완료');
  await expect(page.locator('.recording-row')).toHaveCount(1);
  await page.getByRole('button',{name:'현재 조건 최고랩'}).click();
  await expect(page.locator('#telemetry')).toHaveAttribute('data-ghost-active','true');
  await expect(page.locator('#ghost-status')).toBeVisible();
  await expect(page.locator('#scene')).toHaveAttribute('data-ghost-visible','true');
  await page.locator('#ghost-mode').selectOption('resim');await expect(page.locator('#ghost-mode-label')).toHaveText('RESIM');
  await page.getByRole('button',{name:'고스트 끄기'}).click();await expect(page.locator('#ghost-status')).toBeHidden();
});
