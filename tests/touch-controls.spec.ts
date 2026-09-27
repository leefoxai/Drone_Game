import { test, expect } from '@playwright/test';
import { touchInputFromAxes } from '../apps/client/src/touch-controls';
import { dataPartitionKey } from '../packages/physics/src/telemetry';

test('듀얼 터치 스틱은 Easy pilot input 범위로 매핑된다',()=>{
  expect(touchInputFromAxes({leftX:0,leftY:0,rightX:0,rightY:0})).toEqual({throttle:.5,roll:0,pitch:0,yaw:0});
  const value=touchInputFromAxes({leftX:-1,leftY:1,rightX:-1,rightY:1});
  expect(value.throttle).toBe(1);
  expect(value.yaw).toBe(1);
  expect(value.roll).toBe(1);
  expect(value.pitch).toBe(-1);
  expect(touchInputFromAxes({leftX:.01,leftY:-1,rightX:.01,rightY:-1})).toEqual({throttle:0,roll:0,pitch:1,yaw:0});
});

test('touch는 keyboard/gamepad와 별도 학습 partition이다',()=>{
  const base={trackId:'training-five-v2',controlMode:'assisted' as const,aircraftProfileVersion:2,assistVersion:1,physicsVersion:3,testerMode:false,cameraMode:'chase' as const,artificialHorizonEnabled:false,heightAssistEnabled:true};
  const touch=dataPartitionKey({...base,inputDeviceKind:'touch'});
  const keyboard=dataPartitionKey({...base,inputDeviceKind:'keyboard'});
  expect(touch).toContain('device-touch');
  expect(touch).not.toBe(keyboard);
});

test('터치 가능한 모바일 브라우저는 공개 모드에서 듀얼 스틱을 자동 활성화한다',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},screen:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('#status')).toHaveText('3D 장면 준비 완료');
  await expect(page.locator('#touch-controls')).toBeVisible();
  await expect(page.locator('#mobile-badge')).toBeVisible();
  await expect(page.locator('#telemetry')).toHaveAttribute('data-input-device-kind','touch');
  await expect(page.locator('#telemetry')).toHaveAttribute('data-learning-partition',/device-touch/);
  await expect(page.locator('#touch-reset')).toBeVisible();
  await expect(page.locator('#touch-camera')).toBeVisible();
  await context.close();
});
