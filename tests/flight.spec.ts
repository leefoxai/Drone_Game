import { test, expect } from '@playwright/test';

test('호버 유지, 키보드 상승, 일시정지, 튜닝과 카메라 전환',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');const telemetry=page.locator('#telemetry');
  await expect(page.locator('#status')).toHaveText('3D 장면 준비 완료');
  await expect(telemetry).toHaveAttribute('data-mode','assisted');
  await expect(telemetry).toHaveAttribute('data-track-id','training-five-v1');
  await expect(telemetry).toHaveAttribute('data-assist-version','1');
  await expect.poll(async()=>Number(await telemetry.getAttribute('data-recorded-samples'))).toBeGreaterThan(0);
  expect(Number(await telemetry.getAttribute('data-pilot-throttle'))).toBe(.5);
  expect(Number(await telemetry.getAttribute('data-applied-throttle'))).not.toBe(.5);
  expect(Number(await telemetry.getAttribute('data-camera-aspect'))).toBeGreaterThan(1);
  await expect.poll(async()=>Number(await telemetry.getAttribute('data-tick')),{timeout:15000}).toBeGreaterThan(720);
  expect(Math.abs(Number(await telemetry.getAttribute('data-altitude'))-3)).toBeLessThan(.1);
  await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
  await expect.poll(async()=>Number(await telemetry.getAttribute('data-altitude'))).toBeGreaterThan(3.3);
  await page.getByRole('button',{name:'일시정지'}).click();
  await expect(telemetry).toHaveAttribute('data-running','false');
  const tick=await telemetry.getAttribute('data-tick');await page.waitForTimeout(250);expect(await telemetry.getAttribute('data-tick')).toBe(tick);
  await page.getByRole('button',{name:'FPV로 전환'}).click();await expect(page.locator('#camera')).toHaveAttribute('data-mode','fpv');
  await page.getByText('카메라 · 기체 튜닝',{exact:true}).click();
  await page.locator('#mass').focus();await page.keyboard.press('ArrowRight');
  await expect(page.locator('#mass-out')).toHaveText('0.63 kg');
  await expect(telemetry).toHaveAttribute('data-mass','0.63');await expect(telemetry).toHaveAttribute('data-valid','false');
  await page.getByRole('button',{name:'다시 시작'}).click();
  await expect(telemetry).toHaveAttribute('data-altitude','3');await expect(telemetry).toHaveAttribute('data-valid','true');
  expect(errors).toEqual([]);
});

test('가상 게임패드 매핑·보정 저장, 재로딩 복원, 연결 해제 중단',async({page})=>{
  await page.addInitScript(()=>{
    const device={id:'Test USB Controller',index:0,connected:true,mapping:'',axes:[0,0,0,0],buttons:[],timestamp:0};
    Object.defineProperty(navigator,'getGamepads',{value:()=>device.connected?[device]:[]});
    // Only tests supply a simulated hardware device; production has no test controls.
    (window as unknown as {testPad:typeof device}).testPad=device;
  });
  await page.goto('/');await page.getByText('조종기 연결 · 축 보정',{exact:true}).click();
  await expect(page.locator('#device-message')).toContainText('4축 연결');
  await page.getByRole('button',{name:'1. 중립에서 보정 시작'}).click();
  for(const value of [-1,1]){
    await page.evaluate(v=>{(window as unknown as {testPad:{axes:number[]}}).testPad.axes=[v,v,v,v];},value);
    await expect(page.locator('#raw-axes')).toContainText('0: '+value.toFixed(2));
  }
  await page.getByRole('button',{name:'2. 끝점 보정 완료'}).click();
  await expect(page.locator('#input-feedback')).toContainText('보정 완료');
  await page.getByLabel('롤 반전',{exact:true}).uncheck();
  await page.getByRole('button',{name:'장치별 설정 저장'}).click();
  await expect(page.locator('#input-feedback')).toContainText('저장했습니다');
  await page.reload();await page.getByText('조종기 연결 · 축 보정',{exact:true}).click();
  await expect(page.getByLabel('롤 반전',{exact:true})).not.toBeChecked();
  await page.getByText('조종기 연결 · 축 보정',{exact:true}).click();
  await page.locator('#input-source').selectOption('gamepad');
  await page.evaluate(()=>{(window as unknown as {testPad:{axes:number[]}}).testPad.axes=[0,.2,0,0];});
  await page.getByRole('button',{name:'재개',exact:false}).click();
  await expect(page.locator('#telemetry')).toHaveAttribute('data-running','true');
  await page.evaluate(()=>{(window as unknown as {testPad:{connected:boolean}}).testPad.connected=false;});
  await expect(page.locator('#telemetry')).toHaveAttribute('data-running','false');
  await expect(page.locator('#flight-message')).toContainText('연결이 끊겼거나');
});

test('키보드 강하 충돌 시 초기 위치로 리셋',async({page})=>{
  await page.goto('/');await expect(page.locator('#status')).toHaveText('3D 장면 준비 완료');
  await page.keyboard.down('s');
  await expect.poll(async()=>Number(await page.locator('#telemetry').getAttribute('data-resets')),{timeout:10000}).toBeGreaterThan(0);
  await page.keyboard.up('s');await expect(page.locator('#flight-message')).toContainText('충돌');
  expect(Number(await page.locator('#telemetry').getAttribute('data-altitude'))).toBeGreaterThan(2.8);
});


test('Acro 기본 카메라와 대회용 트랙을 선택할 수 있다',async({page})=>{
  await page.goto('/');const telemetry=page.locator('#telemetry');
  await expect(page.locator('#status')).toHaveText('3D 장면 준비 완료');
  await page.locator('#flight-mode').selectOption('acro');
  await expect(telemetry).toHaveAttribute('data-mode','acro');
  await expect(telemetry).toHaveAttribute('data-assist-version','none');
  await expect(page.locator('#tilt-out')).toHaveText('27°');
  await expect(page.locator('#rc-rate-out')).toHaveText('1.00');
  await expect(page.locator('#super-rate-out')).toHaveText('0.70');
  await expect(page.locator('#expo-out')).toHaveText('0.00');
  await page.locator('#track-select').selectOption('race-five-v1');
  await expect(telemetry).toHaveAttribute('data-track-id','race-five-v1');
  await expect(telemetry).toHaveAttribute('data-gate-count','5');
  await expect(page.locator('#track-description')).toContainText('1.8 m');
  await expect(page.locator('#scene')).toHaveAttribute('data-rendered','true');
});
