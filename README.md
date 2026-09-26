# Drone Game · M1 Flight Prototype

브라우저에서 실행되는 FPV 드론 게임/데이터 수집 시뮬레이터입니다.
M1 비행 프로토타입은 완료되었고, 현재 공개 제품은 **키보드 + 쉬운 조종(Easy)** 만 노출합니다.
Acro, Gamepad/RC 조종기, 축 보정, Rates UI는 코드와 테스트를 그대로 유지하되 테스터 플래그 뒤에 둡니다.

## 현재 공개 방식

기본 주소:

```text
https://leefoxai.github.io/Drone_Game/
```

공개 화면에서는 다음만 사용할 수 있습니다.

- 키보드 입력
- Easy / 쉬운 조종
- 훈련장 `training-five-v2`
- 대회용 트랙 `race-five-v2`
- 3인칭 / FPV
- 인공 수평선과 연습용 높이 차 보조

FPV 테스터 주소:

```text
https://leefoxai.github.io/Drone_Game/?tester=1
```

`?tester=1`에서는 다음 기능이 추가로 열립니다.

- Acro
- 표준 Gamepad
- 비표준 USB RC 조이스틱
- 축 매핑/반전/끝점/데드존 보정
- Rates 설정

`?tester=1`은 인증이나 접근 통제가 아니라 제품 기능 플래그입니다. 주소를 아는 사용자는 활성화할 수 있습니다.
테스터 모드 랩은 원본/학습용으로 보존할 수 있지만 향후 공개 순위 대상에서는 제외합니다.

## 실행

Node.js 22.12 이상이 필요합니다.

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

기본 개발 주소는 `http://127.0.0.1:5173/`입니다.
로컬 테스터 모드는 `http://127.0.0.1:5173/?tester=1`로 확인합니다.

## 전체 테스트

최초 한 번 Chromium을 설치합니다.

```bash
npx playwright install chromium
```

그 다음 전체 검증은 한 명령으로 실행합니다.

```bash
npm test
```

`npm test`는 다음을 함께 검증합니다.

- 물리/rates/결정성
- 게이트/충돌/랩
- keyboard / gamepad / rc_joystick 입력 처리
- 공개 모드에서 Easy + keyboard 강제
- `?tester=1`에서 기존 Acro/조종기 기능 복원
- 텔레메트리 파티션
- `training_use` 분류와 학습 내보내기 차단 규칙
- Easy 속도 목표값 기록
- 실제 브라우저 E2E

빌드만 확인하려면:

```bash
npm run build
npm run preview -- --host 127.0.0.1
```

## 트랙

- `training-five-v2` — 7 m × 5 m 대형 게이트 5개
- `race-five-v2` — 1.8 m × 1.8 m 게이트 5개와 높이 변화

트랙 v2에서 게이트 프레임과 지지대는 보이는 형상과 충돌 형상을 같은 데이터에서 생성합니다.

- 게이트 프레임 두께: `0.22 m`
- 드론 충돌/시각 기준 반경: `0.22 m`
- 지면까지 이어지는 게이트 다리: 충돌 포함
- 게이트 아래 바닥 표시
- 드론/게이트의 실제 directional-light 그림자
- 0.5 m 콘, 2.0 m 깃발을 세계 크기 단서로 배치

충돌 의미 변경으로 `PHYSICS_VERSION=3`, 두 트랙은 version 2입니다.

## 카메라와 높이 판단

3인칭 카메라는 드론 높이 가까이 배치해 같은 고도의 게이트를 비교하기 쉽게 했습니다.
FPV 인공 수평선은 카메라 자세, FPV tilt, vertical FOV, aspect ratio를 이용해 실제 world horizon을 화면에 투영합니다.

다음 게이트 높이 차는 다음 조건에서 표시됩니다.

- 훈련장: Easy/Acro
- 대회용: Easy
- 대회용 + Acro: 미표시

현재 일반 공개 버전은 Easy만 노출하므로 두 트랙에서 높이 차 보조를 사용할 수 있습니다.

## 조종

### 공개: Easy + Keyboard

`assist.ts`가 사람 입력을 속도/수평 보조 명령으로 변환한 뒤 동일한 6-DoF 물리에 넣습니다.
Easy 기본 FPV tilt는 15°입니다.

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

### Tester: Acro + Gamepad/RC

Betaflight식 기본 rates:

- RC rate 1.0
- Super rate 0.7
- Expo 0
- full stick 약 667°/s
- Acro FPV tilt 27°

장치 기본 deadzone:

- `rc_joystick`: 1%
- `gamepad`: 5%

## M1 기체 프로파일 v2

`packages/physics/profiles/racer5.json`

- mass: 0.62 kg
- max motor thrust: 15.2 N / motor
- 명목 full-voltage/zero-sag T/W: `4 × 15.2 / (0.62 × 9.80665) ≈ 10.0`

이는 M1 시뮬레이터 설계값이며 실측 기체 성능값이 아닙니다.

## 텔레메트리와 학습 용도

원본 랩 데이터는 학습 용도와 관계없이 보존합니다.
`trainingUse`는 원본 삭제 기준이 아니라 용도 라벨입니다.

Easy에서는 매 physics tick에 다음을 기록합니다.

- `pilotInput`: 사람이 넣은 입력
- `appliedInput`: assist 후 실제 물리 입력
- `assistTargets.horizontalVelocityWorldMps`
- `assistTargets.verticalVelocityMps`
- `assistTargets.yawRateRadPerSec`

학습 용도는 `classifyTrainingUse()` 하나에서 자동 판정합니다.

```text
stick_pattern
= Acro
+ gamepad 또는 rc_joystick
+ assist 없음
+ 모든 tick에서 pilotInput == appliedInput

flight_method
= 그 밖의 모든 유효 랩
```

따라서 다음은 `flight_method`입니다.

- keyboard + Easy
- keyboard + Acro
- gamepad + Easy
- rc_joystick + Easy

`stick_pattern` 내보내기는 `flight_method` 랩을 강제로 제외합니다.

학습/세션 파티션 키에는 최소 다음이 포함됩니다.

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

카메라 재현을 위해 vertical FOV, aspect ratio, viewport 크기, devicePixelRatio도 기록합니다.
기록 스키마 기준은 `docs/data_spec.md`의 `0.1.5`입니다.

## GitHub Pages

GitHub Actions는 다음 순서로 배포합니다.

```text
npm ci
→ Playwright Chromium 설치
→ npm test
→ VITE_BASE=/Drone_Game/ npm run build
→ GitHub Pages deploy
```

테스트가 하나라도 실패하면 배포되지 않습니다.

## 구조

```text
apps/client/       Three.js 게임 클라이언트
apps/server/       M4 서버 자리
packages/physics/  고정 240 Hz 물리, assist, track, race, telemetry contract
packages/physics/profiles/  기체 프로파일
tests/             물리·입력·텔레메트리·브라우저 테스트
docs/              로드맵, 상태, 데이터 명세, 개발 프롬프트
```

현재 개발 상태는 `docs/STATUS.md`, 향후 단계는 `docs/ROADMAP.md`를 기준으로 합니다.
