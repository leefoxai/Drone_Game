import { test, expect } from '@playwright/test';

test('IndexedDB 기록은 새로고침 후 남고 현재 조건 최고랩 고스트로 재생된다',async({page})=>{
  await page.goto('/');await expect(page.locator('#status')).toHaveText('3D 장면 준비 완료');
  await page.evaluate(async()=>{
    const [{M2LapRecorder},{saveRecording,clearRecordingsForTests},{initialState,step},{assistedCommand},{cameraSnapshot},{TRAINING_TRACK},profileModule]=await Promise.all([
      import('/src/recording.ts'),import('/src/recording-store.ts'),import('/@fs'+location.pathname.replace(/\/Drone_Game\/$/,'')+'/packages/physics/src/index.ts').catch(()=>import('../../../packages/physics/src/index.ts')),
      import('../../../packages/physics/src/assist.ts'),import('../../../packages/physics/src/telemetry.ts'),import('../../../packages/physics/src/track.ts'),import('../../../packages/physics/profiles/racer5.json',{with:{type:'json'}})
    ] as const);
    await clearRecordingsForTests();
    const profile=structuredClone((profileModule as {default:any}).default),state=initialState(profile),camera=cameraSnapshot(75,1280,720,1,'chase',false,true),recorder=new M2LapRecorder();
    const context={trackId:TRAINING_TRACK.id,controlMode:'assisted' as const,aircraftProfileVersion:profile.version,assistVersion:1,physicsVersion:3,inputDeviceKind:'keyboard' as const,testerMode:false,cameraMode:'chase' as const,artificialHorizonEnabled:false,heightAssistEnabled:true};
    recorder.begin({context,track:TRAINING_TRACK,profile,initialState:structuredClone(state),camera,inputDevice:{mapping:null,browserMapping:null,axesCount:null,buttonsCount:null},display:{refreshRateHzEstimate:60,renderFpsEstimate:60,viewportWidth:1280,viewportHeight:720,devicePixelRatio:1},runtime:{userAgent:'e2e',language:'ko-KR'},clientBuild:'e2e',sessionId:'e2e-session'});
    for(let i=0;i<240;i++){
      const pilot={throttle:.5,roll:0,pitch:-.25,yaw:0},cmd=assistedCommand(state,pilot,profile),tick=state.tick;
      if(i%4===0)recorder.frame({simulationTick:tick,physicsAlpha:0,inputReadMonotonicMs:i*1000/240,rafTimestampMs:i*1000/240,inputDeviceKind:'keyboard',keysDown:['ArrowUp'],rawAxes:null,rawButtons:null,normalizedPilotInput:pilot});
      step(state,cmd.appliedInput,profile);recorder.tick(tick,pilot,cmd.appliedInput,cmd.targets,camera,state);
    }
    const result=await recorder.finish('complete',1,TRAINING_TRACK.gates.length,null);if(!result)throw new Error('fixture failed');await saveRecording(result);
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
