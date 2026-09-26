# Drone Game · M2 Recording & Ghost

브라우저에서 실행되는 FPV 드론 게임/데이터 수집 시뮬레이터입니다. M1 비행 프로토타입은 완료되었고 M2에서 **랩 원본 기록, IndexedDB 영속 저장, gzip JSON Lines 내보내기, 최고랩 고스트와 입력 재시뮬레이션 검증**을 구현했습니다.

현재 공개 제품은 **키보드 + 쉬운 조종(Easy)** 만 노출합니다. Acro, Gamepad/RC 조종기, 축 보정, Rates UI는 코드와 테스트를 유지한 채 `?tester=1`에서만 활성화됩니다.

## 실행

Node.js 22.12 이상:

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

- 공개 모드: `http://127.0.0.1:5173/`
- FPV tester: `http://127.0.0.1:5173/?tester=1`
- 배포: `https://leefoxai.github.io/Drone_Game/`

`?tester=1`은 인증이 아니라 기능 플래그입니다. tester 랩은 원본/학습 용도로 보존할 수 있지만 향후 공개 순위 대상에서는 제외합니다.

## M2 기록

조작이 시작되면 랩 recorder가 시작됩니다. complete뿐 아니라 collision/중단 기록도 원본 보존을 위해 IndexedDB에 저장할 수 있습니다.

### 매 rAF frame

- keyboard: 눌린 key code 배열 + normalized pilot input
- gamepad/RC: raw axes/buttons + normalized pilot input
- 입력을 읽은 monotonic timestamp
- `requestAnimationFrame` timestamp
- 현재 simulation tick과 physics interpolation alpha

### 매 physics tick

- `pilotInput`: assist 전 사람 명령
- `appliedInput`: 실제 `step()`에 전달된 입력
- Easy `assistTargets`
- rigid-body state
- PID 적분기/필터/모터/배터리 등 재시뮬레이션에 필요한 controller hidden state

### 이벤트

- lap start
- gate pass
- collision
- lap complete
- lap abort

기준 스키마는 `docs/data_spec.md` **0.1.6**입니다. 기존 M1 `telemetry.ts`의 partition/training-use 규칙을 그대로 사용하며 별도의 학습 분류 체계를 만들지 않습니다.

## 로컬 저장

랩 파일은 `localStorage`가 아니라 IndexedDB에 저장합니다.

```text
DB: drone-recordings
Store: laps
```

실제 원본은 한 랩당 gzip JSON Lines 하나입니다.

```text
lap_<recording_id>.jsonl.gz
```

첫 line은 metadata이고 이후 `frames`, `inputs`, `states`, `controller_states`, `events`, `camera_changes` 논리 채널이 `channel` 태그로 들어갑니다. `channel`은 기존 data_spec 채널을 한 gzip 파일에 multiplexing하기 위한 컨테이너 태그입니다.

화면의 **내 기록 · 고스트**에서 다음을 할 수 있습니다.

- 기록 목록 확인
- 기록을 고스트로 재생
- `.jsonl.gz` 원본 내보내기
- 로컬 기록 삭제

## 고스트

**현재 조건 최고랩**은 현재 `partitionKey`와 완전히 같은 유효 complete 랩 중 최저 시간을 선택합니다. 따라서 physics version, input device, Easy/Acro, 카메라/보조, tester 조건이 다른 기록을 섞지 않습니다.

두 재생 방식을 지원합니다.

1. **기록된 상태 재생**: 저장된 state를 반투명 드론으로 재생
2. **입력 재시뮬레이션**: 저장된 `initialState + appliedInput[]`을 shared physics로 다시 계산

Easy 기록을 재시뮬레이션할 때 assist를 다시 적용하지 않습니다. 화면에는 기록 state와 재시뮬레이션 state 사이의 현재/최대 position error를 표시합니다.

현재 `physicsVersion=3` 재시뮬레이션을 지원합니다. 지원하지 않는 구버전 기록을 최신 물리로 조용히 계산하지 않습니다.

## 기록 검증

내보낸 파일은 Python 표준 라이브러리만 사용하는 validator로 검사합니다.

```bash
python3 tools/validate.py lap_<recording_id>.jsonl.gz
```

검사 항목에는 gzip/JSONL, 필수 metadata, SHA-256, N input ↔ N+1 state, tick 연속성, Easy assist target, raw frame input, events, partition key, training_use, tester/public 순위 정책이 포함됩니다.

`npm test`에서는 deterministic sample lap 3개를 실제 `.jsonl.gz`로 만들고 validator를 실행한 뒤 authoritative input으로 재시뮬레이션합니다.

현재 회귀 허용 오차:

```text
position <= 1e-9 m
velocity <= 1e-9 m/s
orientation <= 1e-10
angular velocity <= 1e-9 rad/s
```

## 예상 기록 크기

JSONL은 가독성과 검증 편의성을 우선한 M2 형식입니다.

| 랩 | 비압축 예상 | gzip 예상 |
|---:|---:|---:|
| 30초 | 7–10 MB | 1.5–3.5 MB |
| 60초 | 14–20 MB | 3–7 MB |
| 90초 | 21–30 MB | 4.5–10 MB |

실제 장시간 랩의 브라우저별 용량/CPU/IndexedDB quota 측정은 M3에서 다시 수행합니다.

## 학습 용도

원본은 `trainingUse`와 관계없이 보존합니다.

```text
stick_pattern
= Acro
+ gamepad 또는 rc_joystick
+ assist 없음
+ 모든 tick에서 pilotInput == appliedInput

flight_method
= 그 밖의 모든 유효 랩
```

따라서 keyboard + Easy, keyboard + Acro, gamepad/RC + Easy는 `flight_method`입니다. `stick_pattern` 내보내기는 동일 분류 함수를 다시 적용해 `flight_method` 유입을 차단합니다.

학습/비교 파티션:

```text
trackId
+ controlMode
+ inputDeviceKind
+ physicsVersion
+ aircraftProfileVersion
+ assistVersion
+ cameraMode
+ artificialHorizonEnabled
+ heightAssistEnabled
+ testerMode
```

M2 consent metadata의 기본값은 미동의입니다. 로컬 원본 저장과 향후 학습 데이터셋 사용 동의는 별개입니다.

## 조종

### 공개: Easy + Keyboard

| 키 | 기능 |
|---|---|
| ↑ / ↓ | 앞 / 뒤 이동 |
| ← / → | 좌 / 우 이동 |
| A / D | 방향 전환 |
| W / S | 상승 / 하강 |
| H | 호버 기준 |
| C | FPV / 3인칭 |
| P | 일시정지 |
| R | 리셋 |

### Tester

`?tester=1`에서 Acro, 표준 Gamepad, RC joystick, calibration, rates를 사용할 수 있습니다.

- Betaflight: RC rate 1.0 / Super rate 0.7 / Expo 0 / full stick 약 667°/s
- RC joystick 기본 deadzone 1%
- 표준 gamepad 기본 deadzone 5%

## 물리/트랙 버전

- `PHYSICS_VERSION=3`
- racer5 profile version 2
- `training-five-v2`
- `race-five-v2`
- `ASSIST_VERSION=1`
- recording schema `0.1.6`

## 테스트와 배포

```bash
npx playwright install chromium
npm test
```

`npm test`는 M1 물리/입력/공개·tester E2E와 함께 M2 recording codec, Python validator, 3개 재시뮬레이션 fixture, IndexedDB persistence, ghost UI를 검사합니다.

GitHub Actions 순서:

```text
npm ci
→ Playwright Chromium 설치
→ npm test
→ production build
→ GitHub Pages deploy
```

테스트 실패 시 배포하지 않습니다.

## 구조

```text
apps/client/src/recording.ts          M2 랩 기록 계약/재시뮬레이션
apps/client/src/recording-codec.ts    JSONL + gzip + payload SHA-256
apps/client/src/recording-store.ts    IndexedDB
apps/client/src/recording-manager.ts  목록/재생/내보내기/삭제 UI
apps/client/src/ghost.ts              state/resim ghost
packages/physics/src/telemetry.ts     M1/M2 partition + training_use 기준
tools/validate.py                     export validator
tests/recording.spec.ts               3개 deterministic recording regression
tests/storage-ghost.spec.ts           IndexedDB + ghost E2E
docs/data_spec.md                     기록 계약의 기준
```
