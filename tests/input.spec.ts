import { test, expect } from '@playwright/test';
import { DEFAULT_DEADZONE, defaultMapping, deviceKind, normalizeAxis, validMapping, readGamepad } from '../apps/client/src/input';

test('장치 중립·끝점·반전·데드존 보정',()=>{
  const c={axis:0,invert:false,min:-.8,center:.1,max:.9,deadzone:.1};
  expect(normalizeAxis(.1,c)).toBe(0);expect(normalizeAxis(.12,c)).toBe(0);
  expect(normalizeAxis(-.8,c)).toBe(-1);expect(normalizeAxis(.9,c)).toBe(1);
  expect(normalizeAxis(.9,{...c,invert:true})).toBe(-1);
  expect(normalizeAxis(-.8,c,true)).toBe(0);expect(normalizeAxis(.9,c,true)).toBe(1);
  const map=defaultMapping();expect(validMapping(map)).toBe(true);
  expect(readGamepad({axes:[0,0]} as unknown as Gamepad,map)).toBeNull();
  map.roll.max=map.roll.min;expect(validMapping(map)).toBe(false);
});

test('RC 조이스틱 기본 데드존 1%, 표준 게임패드 5%',()=>{
  expect(DEFAULT_DEADZONE).toEqual({rc_joystick:.01,gamepad:.05});
  expect(deviceKind({mapping:''} as Gamepad)).toBe('rc_joystick');
  expect(deviceKind({mapping:'standard'} as Gamepad)).toBe('gamepad');
  for(const channel of ['throttle','roll','pitch','yaw'] as const){
    expect(defaultMapping('rc_joystick')[channel].deadzone).toBe(.01);
    expect(defaultMapping('gamepad')[channel].deadzone).toBe(.05);
  }
});
