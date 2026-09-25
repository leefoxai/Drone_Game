import { test, expect } from '@playwright/test';
import profile from '../packages/physics/profiles/racer5.json' with { type: 'json' };
import { DT, G, PHYSICS_VERSION, hoverThrottle, initialState, rate, rotate, step } from '../packages/physics/src/index';
import { FixedClock } from '../packages/physics/src/clock';
import { DRONE_COLLISION_RADIUS_M, GATE_FRAME_THICKNESS_M, GATES, RACE_TRACK, TRAINING_TRACK, collision, gatePassed, gateSolidBoxes } from '../packages/physics/src/track';
import { DRONE_VISUAL_RADIUS_M } from '../apps/client/src/world';
import { Race } from '../packages/physics/src/race';
import type { Vec3 } from '../packages/physics/src/index';
import { assistedInput } from '../packages/physics/src/assist';

test('M1 v2 프로파일: 약 10:1 명목 추력대중량비와 Betaflight 기본 rates', () => {
  expect(profile.version).toBe(2);
  const thrustToWeight=4*profile.maxMotorThrustN/(profile.massKg*G);
  expect(thrustToWeight).toBeGreaterThanOrEqual(9.5);
  expect(thrustToWeight).toBeLessThanOrEqual(10.5);
  expect(profile.rates).toEqual({rcRate:1,superRate:.7,expo:0});
  expect(rate(1,profile.rates)*180/Math.PI).toBeCloseTo(666.6666667,5);
});

test('충돌 의미 변경은 physics 3 / track v2이고 시각·충돌 치수가 같은 상수를 쓴다',()=>{
  expect(PHYSICS_VERSION).toBe(3);
  expect(TRAINING_TRACK.version).toBe(2);expect(RACE_TRACK.version).toBe(2);
  expect(TRAINING_TRACK.id).toBe('training-five-v2');expect(RACE_TRACK.id).toBe('race-five-v2');
  expect(DRONE_VISUAL_RADIUS_M).toBe(DRONE_COLLISION_RADIUS_M);
  expect(DRONE_COLLISION_RADIUS_M).toBe(.22);expect(GATE_FRAME_THICKNESS_M).toBe(.22);
  const solids=gateSolidBoxes(RACE_TRACK.gates[0]!);
  expect(solids.filter(v=>v.kind==='frame')).toHaveLength(4);
  expect(solids.filter(v=>v.kind==='leg')).toHaveLength(2);
  for(const box of solids.filter(v=>v.kind==='frame'))expect(box.size.some(v=>v===GATE_FRAME_THICKNESS_M)).toBe(true);
});

test('호버 스로틀과 10초 고도 유지', () => {
  const s = initialState(profile);
  const hover = hoverThrottle(profile);
  expect(Math.abs(hover/profile.targets.hoverThrottle - 1)).toBeLessThan(0.1);
  for (let i=0; i<2400; i++) step(s, {throttle:hoverThrottle(profile,s.charge), roll:0,pitch:0,yaw:0}, profile);
  expect(Math.abs(s.position[1]-3)).toBeLessThan(0.1);
  expect(Math.hypot(...s.omega)).toBeLessThan(0.001);
  expect(s.charge).toBeLessThan(1);
  expect(s.voltage).toBeLessThan(profile.batteryFullV);
});
test('최대 상승 초기 가속이 목표값 ±10%', () => {
  const s = initialState(profile); s.motors = [1,1,1,1];
  step(s, {throttle:1,roll:0,pitch:0,yaw:0}, profile);
  expect(Math.abs(s.acceleration[1]/profile.targets.maxRiseAccelerationMps2 - 1)).toBeLessThan(0.1);
});
test('모터 응답 지연과 자유 낙하', () => {
  const s = initialState(profile, false);
  step(s, {throttle:1,roll:0,pitch:0,yaw:0}, profile);
  expect(s.motors[0]).toBeGreaterThan(0); expect(s.motors[0]).toBeLessThan(0.3);
  const falling = initialState(profile, false);
  step(falling,{throttle:0,roll:0,pitch:0,yaw:0},profile);
  expect(falling.acceleration[1]).toBeCloseTo(-G,8);
});
test('풀스틱 360도 롤 시간이 프로파일 목표 ±10%, 세 축 각속도 추종', () => {
  for (const axis of ['roll','pitch','yaw'] as const) {
    const s=initialState(profile); let angle=0;
    const index = {roll:2,pitch:0,yaw:1}[axis];
    while(angle<2*Math.PI && s.tick<1000) {
      step(s,{throttle:0.6,roll:0,pitch:0,yaw:0,[axis]:1},profile);
      angle+=s.omega[index]!*DT;
    }
    if(axis==='roll') expect(Math.abs(s.tick*DT/profile.targets.roll360Seconds-1)).toBeLessThan(0.1);
    expect(Math.abs(s.omega[index]!/rate(1,profile.rates)-1)).toBeLessThan(0.1);
    expect(Math.hypot(...s.orientation)).toBeCloseTo(1,10);
  }
});
test('같은 입력 시퀀스는 모든 숨은 상태까지 동일', () => {
  function run() {
    const s=initialState(profile);
    for(let i=0;i<2000;i++) step(s,{throttle:0.45,roll:Math.sin(i/130)*0.3,pitch:Math.cos(i/160)*0.2,yaw:0.1},profile);
    return s;
  }
  expect(run()).toEqual(run());
});
test('30/60/120Hz 렌더 주기에서 고정 tick과 결과 동일', () => {
  const results = [30,60,120].map(hz=>{
    const s=initialState(profile), clock=new FixedClock();
    for(let i=0;i<hz*3;i++) clock.advance(1/hz,()=>step(s,{throttle:0.4,roll:0.1,pitch:0,yaw:0},profile));
    expect(s.tick).toBe(720); return s;
  });
  expect(results[0]).toEqual(results[1]); expect(results[1]).toEqual(results[2]);
});
test('좌표계와 rates 대칭', () => {
  expect(rate(0,profile.rates)).toBe(0);
  expect(rate(-0.7,profile.rates)).toBeCloseTo(-rate(0.7,profile.rates),12);
  expect(rotate([Math.SQRT1_2,0,0,Math.SQRT1_2],[0,0,-1])[1]).toBeCloseTo(1,10);
});
test('기존 훈련장 게이트 배치는 유지하고 대회 트랙은 1.8m 게이트와 높이 변화',()=>{
  expect(TRAINING_TRACK.gates).toEqual([
    { id: 1, center: [0, 3, -8], yaw: 0, width: 7, height: 5 },
    { id: 2, center: [14, 3, -20], yaw: -Math.PI/2, width: 7, height: 5 },
    { id: 3, center: [28, 3, -6], yaw: Math.PI, width: 7, height: 5 },
    { id: 4, center: [18, 3, 12], yaw: Math.PI/2, width: 7, height: 5 },
    { id: 5, center: [0, 3, 10], yaw: 0, width: 7, height: 5 },
  ]);
  expect(RACE_TRACK.id).not.toBe(TRAINING_TRACK.id);
  expect(RACE_TRACK.gates.every(g=>g.width>=1.5&&g.width<=2&&g.height>=1.5&&g.height<=2)).toBe(true);
  expect(new Set(RACE_TRACK.gates.map(g=>g.center[1])).size).toBeGreaterThan(2);
});
test('게이트 통과, 프레임과 지지대 충돌을 swept sphere로 판정', () => {
  const g=GATES[0]!;
  expect(gatePassed([0,3,-7],[0,3,-9],g)).toBe(true);
  expect(gatePassed([0,3,-9],[0,3,-7],g)).toBe(false);
  expect(gatePassed([5,3,-7],[5,3,-9],g)).toBe(false);
  expect(collision([0,3,-7],[0,3,-9],TRAINING_TRACK)).toBe(false);
  expect(collision([3.5,3,-6],[3.5,3,-10],TRAINING_TRACK)).toBe(true);
  expect(collision([0,1,0],[0,0,0],TRAINING_TRACK)).toBe(true);
  const rg=RACE_TRACK.gates[0]!;
  expect(gatePassed([0,3,-7],[0,3,-9],rg)).toBe(true);
  expect(collision([.9,3,-7],[.9,3,-9],RACE_TRACK)).toBe(true);
  expect(collision([.9,.7,-7],[.9,.7,-9],RACE_TRACK)).toBe(true);
});

test('게이트를 순서대로 통과해야 완주, 무효 랩은 해당 파티션 순위에서 제외',()=>{
  const race=new Race(TRAINING_TRACK,'training|acro');
  const cross=(index:number,tick:number)=>{
    const g=TRAINING_TRACK.gates[index]!,normal:Vec3=[Math.sin(g.yaw),0,Math.cos(g.yaw)];
    const from=g.center.map((v,i)=>v+normal[i]!) as Vec3,to=g.center.map((v,i)=>v-normal[i]!) as Vec3;
    return race.update(from,to,tick,true);
  };
  cross(2,1);expect(race.nextGate).toBe(0);
  for(let i=0;i<4;i++)expect(cross(i,(i+1)*240)).toBe(false);
  expect(cross(4,1200)).toBe(true);expect(race.laps).toBe(1);expect(race.bestSeconds).toBe(5);
  race.reset();race.invalidate();
  for(let i=0;i<5;i++)cross(i,(i+1)*120);
  expect(race.laps).toBe(1);expect(race.bestSeconds).toBe(5);
  race.setContext(TRAINING_TRACK,'training|assisted');
  expect(race.laps).toBe(0);expect(race.bestSeconds).toBeNull();
  race.setContext(TRAINING_TRACK,'training|acro');
  expect(race.laps).toBe(1);expect(race.bestSeconds).toBe(5);
});

test('쉬운 조종은 전진 후 손을 놓으면 감속하고 고도를 유지한다',()=>{
  const s=initialState(profile);
  for(let i=0;i<720;i++)step(s,assistedInput(s,{throttle:.5,roll:0,pitch:-1,yaw:0},profile),profile);
  expect(s.position[2]).toBeLessThan(0);expect(s.velocity[2]).toBeLessThan(-2);
  for(let i=0;i<960;i++)step(s,assistedInput(s,{throttle:.5,roll:0,pitch:0,yaw:0},profile),profile);
  expect(Math.hypot(...s.velocity)).toBeLessThan(.2);
  expect(Math.abs(s.position[1]-3)).toBeLessThan(.3);
  expect(rotate(s.orientation,[0,1,0])[1]).toBeGreaterThan(.995);
});
