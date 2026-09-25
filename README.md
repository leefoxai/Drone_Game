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

`npm test`는 다음을 순서대로 수행합니다.

1. TypeScript 타입 검사
2. Vite production build
3. 물리/rates/결정성 테스트
4. 게이트/충돌/랩 테스트
5. 입력 장치/deadzone 테스트
6. Easy pilot/applied 입력 기록 및 데이터 파티션 테스트
7. 카메라 vertical FOV/aspect ratio 기록 테스트
8. Playwright 실제 브라우저 호버/조작/트랙 전환 테스트

빌드만 확인하려면:

```bash
npm run build
npm run preview -- --host 127.0.0.1
```

## 트랙

- `training-five-v1` — 기존 훈련장. 7 m × 5 m 대형 게이트 5개.
- `race-five-v1` — 대회용 연습 트랙. 1.8 m × 1.8 m 게이트 5개와 높이 변화.

게임 화면의 **트랙** 선택 상자에서 전환합니다.

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

Easy/Acro는 랩 순위와 학습용 랩 버퍼를 분리합니다. 파티션 키는 최소 다음을 포함합니다.

```text
trackId + controlMode + aircraftProfileVersion + assistVersion
```

카메라 재현을 위해 vertical FOV만 저장하지 않고 다음을 같이 기록합니다.

```text
verticalFovRad
aspectRatio
viewportWidth
viewportHeight
devicePixelRatio
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
