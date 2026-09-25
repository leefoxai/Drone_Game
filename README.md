# Drone Game · M1 Flight Prototype

브라우저에서 실행되는 FPV 드론 게임/데이터 수집 시뮬레이터입니다.
M1은 비행 물리, Easy/Acro 조종, 두 트랙, 자동 테스트와 GitHub Pages 배포 게이트까지 포함합니다.
M2부터 입력/상태 파일 기록과 고스트를 구현합니다.

## 실행

Node.js 22.12 이상이 필요합니다.

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

기본 개발 주소는 `http://127.0.0.1:5173/`입니다.

## 전체 테스트

최초 한 번 Chromium을 설치합니다.

```bash
npx playwright install chromium
```

그 다음 M1 전체 검증은 한 명령으로 실행합니다.

```bash
npm test
```

`npm test`는 TypeScript 타입 검사, production build, 물리/rates/결정성, 게이트/충돌/랩, 입력 장치, 텔레메트리 파티션, 실제 브라우저 E2E까지 실행합니다.

빌드만 확인하려면:

```bash
npm run build
npm run preview -- --host 127.0.0.1
```

## 트랙

- `training-five-v2` — 7 m × 5 m 대형 게이트 5개. 기존 배치는 유지하고 지면 지지대와 높이 단서를 추가했습니다.
- `race-five-v2` — 1.8 m × 1.8 m 게이트 5개와 높이 변화가 있는 대회용 연습 트랙입니다.

트랙 v2에서 게이트 프레임과 지지대는 보이는 형상과 충돌 형상을 같은 데이터에서 생성합니다.

- 게이트 프레임 두께: `0.22 m`
- 드론 충돌/시각 기준 반경: `0.22 m`
- 지면까지 이어지는 게이트 다리: 충돌 포함
- 게이트 아래 바닥 표시
- 드론/게이트의 실제 directional-light 그림자
- 높이 0.5 m 콘과 2.0 m 깃발을 스케일 기준물로 배치

충돌 의미가 변경되어 `PHYSICS_VERSION=3`, 두 트랙은 version 2입니다.

## 카메라와 높이 판단

3인칭 추적 카메라는 드론보다 약간 높은 위치로 낮춰 같은 높이의 게이트를 비교하기 쉽게 했습니다.

FPV에서는 **인공 수평선**을 켜거나 끌 수 있습니다. 화면 중앙에 고정된 장식선이 아니라 현재 카메라 자세, FPV tilt, vertical FOV, aspect ratio를 사용해 world horizontal plane을 화면에 투영합니다.

**다음 게이트 높이 차**는 다음 조건에서만 표시됩니다.

- 훈련장: Easy/Acro 모두 사용 가능
- 대회용 트랙: Easy에서만 사용 가능
- 대회용 트랙 + Acro: 표시하지 않음

표시는 `▲ 1.2 m`, `▼ 0.8 m`처럼 다음 게이트 중심과 현재 드론의 높이 차를 나타냅니다.

## 조종 모드

### Easy / 쉬운 조종

`assist.ts`가 사람 입력을 속도/수평 보조 명령으로 변환한 뒤 동일한 6-DoF 물리에 넣습니다.
Easy 기본 FPV tilt는 15°입니다.

### Acro

Betaflight식 기본 rates:

- RC rate 1.0
- Super rate 0.7
- Expo 0
- full stick 약 667°/s
- 기본 FPV tilt 27°

Easy 보조 자체는 `ASSIST_VERSION=1`을 유지합니다.

## 키보드

| 키 | Easy | Acro |
|---|---|---|
| ↑ / ↓ | 앞 / 뒤 이동 | pitch |
| ← / → | 좌 / 우 이동 | roll |
| A / D | 방향 전환 | yaw |
| W / S | 상승 / 하강 | throttle 증감 |
| H | 호버 기준 | 호버 throttle |
| C | FPV / 3인칭 | 동일 |
| P | 일시정지 | 동일 |
| R | 리셋 | 동일 |

키보드는 개발/테스트용입니다.

## USB 조종기 / 게임패드

브라우저 Gamepad API를 사용합니다.

- 비표준 USB 조종기 기본 deadzone: **1%**
- 표준 Gamepad 기본 deadzone: **5%**

설정 패널에서 축 번호, 반전, 끝점, deadzone을 장치별로 저장할 수 있습니다.

## M1 기체 프로파일 v2

`packages/physics/profiles/racer5.json`

- mass: 0.62 kg
- max motor thrust: 15.2 N / motor
- 명목 full-voltage/zero-sag T/W: `4 × 15.2 / (0.62 × 9.80665) ≈ 10.0`

이는 **M1 시뮬레이터 설계값**이며 실측 기체 성능값이 아닙니다. 실제 step에서는 battery sag가 적용되어 순간 가용 추력은 더 낮습니다.

## M1 텔레메트리 계약

Easy에서는 매 physics tick에 두 입력을 구분합니다.

- `pilotInput`: 사람이 넣은 입력
- `appliedInput`: `assist.ts` 처리 후 실제 물리에 들어간 입력
- `controlMode`
- `assistVersion`

Easy/Acro, 시야와 연습 보조 조건은 같은 학습 데이터로 섞지 않습니다. 파티션 키는 최소 다음을 포함합니다.

```text
trackId
+ controlMode
+ aircraftProfileVersion
+ assistVersion
+ cameraMode
+ artificialHorizonEnabled
+ heightAssistEnabled
```

카메라 재현을 위해 다음을 함께 기록합니다.

```text
cameraMode
verticalFovRad
aspectRatio
viewportWidth
viewportHeight
devicePixelRatio
artificialHorizonEnabled
heightAssistEnabled
```

M1에서는 세션 메모리 수준으로 이 계약을 검증합니다. 파일 저장과 고스트는 M2 범위입니다.

## GitHub Pages

저장소의 GitHub Actions는 다음 순서로 배포합니다.

```text
npm ci
→ Playwright Chromium 설치
→ npm test
→ VITE_BASE=/Drone_Game/ npm run build
→ GitHub Pages deploy
```

따라서 테스트가 하나라도 실패하면 배포되지 않습니다.

배포 주소:

`https://leefoxai.github.io/Drone_Game/`

## 구조

```text
apps/client/       Three.js 게임 클라이언트
apps/server/       M4 서버 자리
packages/physics/  고정 240 Hz 물리, assist, track, race, M1 telemetry contract
packages/physics/profiles/  기체 프로파일
tests/             물리·입력·텔레메트리·브라우저 테스트
docs/              로드맵, 상태, 데이터 명세, 개발 프롬프트
```

세부 기록 계약은 `docs/data_spec.md`, 현재 진행 상태는 `docs/STATUS.md`를 기준으로 합니다.
