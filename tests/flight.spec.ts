import { test, expect } from '@playwright/test';

test('공개 모드는 키보드 + 쉬운 조종만 노출하고 고급 입력 우회를 막는다',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('drone.input.v1',JSON.stringify({'Old Controller':{}})));
  await page.goto('/');const telemetry=page.locator('#telemetry');
  await expect(page.locator('#status')).toHaveText('3D 장면 준비 완료');
  await expect(telemetry).toHaveAttribute('data-tester-mode','false');
  await expect(telemetry).toHaveAttribute('data-mode','assisted');
  await expect(telemetry).toHaveAttribute('data-input-device-kind','keyboard');
  await expect(telemetry).toHaveAttribute('data-public-leaderboard-eligible','true');
  await expect(page.locator('#tester-badge')).toBeHidden();
  await expect(page.locator('[data-tester-control]')).toHaveCount(4);
  for(const node of await page.locator('[data-tester-control]').all())await expect(node).toBeHidden();
  await page.evaluate(()=>{
    const mode=document.querySelector('#flight-mode') as HTMLSelectElement;mode.value='acro';mode.dispatchEvent(new Event('change',{bubbles:true}));
    const source=document.querySelector('#input-source') as HTMLSelectElement;source.value='gamepad';source.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await expect(telemetry).toHaveAttribute('data-mode','assisted');
  await expect(telemetry).toHaveAttribute('data-input-device-kind','keyboard');
});

test('공개 모드 호버 유지, 키보드 상승, 일시정지와 카메라 전환',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');const telemetry=page.locator('#telemetry');
  await expect(page.locator('#status')).toHaveText('3D 장면 준비 완료');
  await expect(telemetry).toHaveAttribute('data-track-id','training-five-v2');
  await expect(telemetry).toHaveAttribute('data-assist-version','1');
  await expect(telemetry).toHaveAttribute('data-camera-mode','chase');
  await expect(telemetry).toHaveAttribute('data-height-assist','true');
  await expect.poll(async()=>Number(await telemetry.getAttribute('data-recorded-samples'))).toBeGreaterThan(0);
  expect(Number(await telemetry.getAttribute('data-pilot-throttle'))).toBe(.5);
  expect(Number(await telemetry.getAttribute('data-applied-throttle'))).not.toBe(.5);
  expect(Number(await telemetry.getAttribute('data-camera-aspect'))).toBeGreaterThan(1);
  expect(await telemetry.getAttribute('data-assist-target-vx')).not.toBeNull();
  expect(await telemetry.getAttribute('data-assist-target-vz')).not.toBeNull();
  expect(await telemetry.getAttribute('data-assist-target-vy')).not.toBeNull();
  expect(await telemetry.getAttribute('data-assist-target-yaw-rate')).not.toBeNull();
  await expect.poll(async()=>Number(await telemetry.getAttribute('data-tick')),{timeout:15000}).toBeGreaterThan(720);
  expect(Math.abs(Number(await telemetry.getAttribute('data-altitude'))-3)).toBeLessThan(.1);
  await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
  await expect.poll(async()=>Number(await telemetry.getAttribute('data-altitude'))).toBeGreaterThan(3.3);
  await page.getByRole('button',{name:'일시정지'}).click();
  await expect(telemetry).toHaveAttribute('data-running','false');
  const tick=await telemetry.getAttribute('data-tick');await page.waitForTimeout(250);expect(await telemetry.getAttribute('data-tick')).toBe(tick);
  await page.getByRole('button',{name:'FPV로 전환'}).click();
  await expect(page.locator('#camera')).toHaveAttribute('data-mode','fpv');
  await expect(telemetry).toHaveAttribute('data-camera-mode','fpv');
  await expect(telemetry).toHaveAttribute('data-artificial-horizon','true');
  await expect(page.locator('#fpv-osd')).toBeVisible();
  await page.getByText('카메라 · 기체 튜닝',{exact:true}).click();
  await page.locator('#mass').focus();await page.keyboard.press('ArrowRight');
  await expect(page.locator('#mass-out')).toHaveText('0.63 kg');
  await expect(telemetry).toHaveAttribute('data-mass','0.63');await expect(telemetry).toHaveAttribute('data-valid','false');
  await page.getByRole('button',{name:'다시 시작'}).click();
  await expect(telemetry).toHaveAttribute('data-altitude','3');await expect(telemetry).toHaveAttribute('data-valid','true');
  expect(errors).toEqual([]);
});

test('tester=1에서는 Acro·입력장치·보정·rates UI가 다시 열린다',async({page})=>{
  await page.goto('/?tester=1');const telemetry=page.locator('#telemetry');
  await expect(page.locator('#status')).toHaveText('3D 장면 준비 완료');
  await expect(telemetry).toHaveAttribute('data-tester-mode','true');
  await expect(telemetry).toHaveAttribute('data-public-leaderboard-eligible','false');
  await expect(page.locator('#tester-badge')).toBeVisible();
  for(const node of await page.locator('[data-tester-control]').all())await expect(node).toBeVisible();
  await page.locator('#flight-mode').selectOption('acro');
  await expect(telemetry).toHaveAttribute('data-mode','acro');
  await expect(telemetry).toHaveAttribute('data-assist-version','none');
  await expect(page.locator('#tilt-out')).toHaveText('27°');
  await expect(page.locator('#rc-rate-out')).toHaveText('1.00');
  await expect(page.locator('#super-rate-out')).toHaveText('0.70');
  await expect(page.locator('#expo-out')).toHaveText('0.00');
});

test('tester 가상 RC 조종기 매핑·보정 저장, 재로딩 복원, 연결 해제 중단',async({page})=>{
  await page.addInitScript(()=>{
    const device={id:'Test USB RC Controller',index:0,connected:true,mapping:'',axes:[0,0,0,0],buttons:[],timestamp:0};
    Object.defineProperty(navigator,'getGamepads',{value:()=>device.connected?[device]:[]});
    (window as unknown as {testPad:typeof device}).testPad=device;
  });
  await page.goto('/?tester=1');await page.getByText('조종기 연결 · 축 보정',{exact:true}).click();
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
  await expect(page.locator('#telemetry')).toHaveAttribute('data-input-device-kind','rc_joystick');
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

test('tester 대회용 Acro에서는 높이 보조가 꺼지고 FPV 수평선은 토글 가능하다',async({page})=>{
  await page.goto('/?tester=1');const telemetry=page.locator('#telemetry');
  await expect(page.locator('#status')).toHaveText('3D 장면 준비 완료');
  await page.locator('#flight-mode').selectOption('acro');
  await page.locator('#track-select').selectOption('race-five-v2');
  await expect(telemetry).toHaveAttribute('data-track-id','race-five-v2');
  await expect(telemetry).toHaveAttribute('data-gate-count','5');
  await expect(telemetry).toHaveAttribute('data-height-assist','false');
  await expect(page.locator('#height-assist')).toBeHidden();
  await expect(page.locator('#track-description')).toContainText('1.8 m');
  await page.getByRole('button',{name:'FPV로 전환'}).click();
  await expect(telemetry).toHaveAttribute('data-artificial-horizon','true');
  await expect(page.locator('#fpv-osd')).toBeVisible();
  await page.locator('#horizon-toggle').uncheck();
  await expect(telemetry).toHaveAttribute('data-artificial-horizon','false');
  await expect(page.locator('#fpv-osd')).toBeHidden();
  await expect(page.locator('#scene')).toHaveAttribute('data-rendered','true');
});

test('공개 대회용 쉬운 조종에서는 다음 게이트 높이 차가 표시된다',async({page})=>{
  await page.goto('/');await page.locator('#track-select').selectOption('race-five-v2');
  await expect(page.locator('#telemetry')).toHaveAttribute('data-height-assist','true');
  await expect(page.locator('#height-assist')).toBeVisible();
  await expect(page.locator('#height-assist')).toContainText('다음 게이트');
});
