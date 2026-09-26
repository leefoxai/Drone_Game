# 프로젝트 상태

갱신: 2026-09-26 (Asia/Seoul)

## 현재 단계

- M0 완료.
- M1 비행 프로토타입 및 안정화 완료.
- **M2 기록·고스트 완료.**
- M3 파이프라인 시험은 아직 시작하지 않았다.

M2는 자동 테스트, GitHub Pages 배포, 사용자 직접 확인, 실제 내보낸 랩 파일의 `tools/validate.py` 검증까지 완료했다.

## 현재 공개 제품 방향

기본 배포 URL:

- keyboard
- Easy / assisted
- `training-five-v2`, `race-five-v2`
- 3인칭 / FPV
- 인공 수평선 / 높이 차 보조

`?tester=1`에서만 활성:

- Acro
- Gamepad
- RC joystick
- 축 보정/반전/끝점/deadzone
- Rates 설정

코드는 삭제하지 않았다. `?tester=1`은 인증이 아니라 테스터용 기능 플래그다.

## 버전

- `PHYSICS_VERSION=3`
- aircraft profile version 2
- `training-five-v2`
- `race-five-v2`
- `ASSIST_VERSION=1`
- **recording schema `0.1.6`**
- recording container `drone-lap-jsonl-gzip-v1`

## M2 기록

기존 M1 `telemetry.ts`와 `data_spec`의 필드·partition·training_use를 확장했다. 별도 학습 기록 형식을 만들지 않았다.

### 매 render frame

- `frameSequence`
- 현재 simulation tick / physics alpha
- input read monotonic timestamp
- rAF timestamp
- `inputDeviceKind`
- keyboard: `keysDown` + normalized pilot input
- gamepad/RC: raw axes/buttons + normalized pilot input
- 실제 렌더 카메라 pose/projection

### 매 physics tick

- 사람 입력 `pilotInput`
- 실제 적용 입력 `appliedInput`
- Easy `assistTargets`
- full physics state
- PID integral/filter/motors/battery 등을 포함한 controller hidden state

N input ↔ N+1 state를 강제한다.

### 이벤트

- lap start
- gate pass
- collision
- lap complete
- lap abort

### metadata

`data_spec.md 0.1.6`의 필수 항목을 recording metadata에 포함한다.

- recording/session ID, UTC
- track/ruleset/profile snapshot + SHA-256
- rates / device mapping / display
- physics/control profile
- tester/public leaderboard/training use
- initial state / environment
- camera/practice assist
- client build/runtime
- consent snapshot
- outcome
- partition key
- payload SHA-256

M2 consent 기본값은 미동의다. 로컬 원본 저장과 학습 데이터셋 사용 동의는 별개다.

## 파일 및 로컬 저장

한 랩 = 한 파일:

```text
lap_<recording_id>.jsonl.gz
```

첫 line metadata + 기존 논리 채널(`frames`, `inputs`, `states`, `controller_states`, `events`, `camera_changes`)을 `channel` tag로 multiplex한다.

로컬 저장:

```text
IndexedDB: drone-recordings
Object store: laps
```

`localStorage`는 랩 원본 저장에 사용하지 않는다. 기존 controller calibration 저장에는 계속 사용한다.

로컬 기록 화면 기능:

- 목록
- ghost 재생
- gzip JSONL 내보내기
- 삭제

저장소의 사용자 원본 기록 보관 경로 `local_data/`는 `.gitignore`에 포함한다. 공개 Git 저장소에 실제 랩 파일을 커밋하지 않는다.

## 고스트

현재 partition과 정확히 같은 **유효 complete 최고랩**을 자동 선택할 수 있다.

두 방식:

1. recorded state replay
2. authoritative applied input re-simulation

반투명 ghost drone으로 표시하고, recorded-state ↔ re-simulation의 현재/최대 position error를 화면에 표시한다.

현재 re-simulation 지원 physics version은 3이다. 지원하지 않는 physics version은 최신 physics로 조용히 대체하지 않는다.

## 재시뮬레이션 허용 오차

현재 deterministic fixture 3개 기준:

```text
position <= 1e-9 m
velocity <= 1e-9 m/s
orientation <= 1e-10
angular velocity <= 1e-9 rad/s
```

Fixture:

1. keyboard + Easy + training → `flight_method`
2. keyboard + Easy + race → `flight_method`
3. rc_joystick + Acro + tester → `stick_pattern`

세 fixture 모두 gzip JSONL round-trip → `tools/validate.py` → authoritative input re-simulation을 통과한다.

## training_use / partition

M1 규칙을 그대로 사용한다.

`stick_pattern`:

- gamepad 또는 rc_joystick
- Acro
- assist 없음
- 모든 tick에서 pilotInput === appliedInput

그 밖의 유효 랩은 `flight_method`다.

partition 최소 구성:

- track
- control mode
- input device kind
- physics version
- profile version
- assist version
- camera mode
- artificial horizon
- height assist
- tester mode

원본은 training_use와 관계없이 보존한다. tester 기록은 향후 공개 leaderboard 대상에서 제외한다.

## validator

```bash
python3 tools/validate.py lap_<recording_id>.jsonl.gz
```

검사 범위:

- gzip / UTF-8 / JSONL
- 필수 metadata
- snapshot/payload SHA-256
- finite values
- tick/sequence 연속성
- N input / N+1 state
- Easy assist target
- frame raw/normalized input
- render camera pose/projection
- event terminal 상태
- partition key
- training_use 재판정
- tester/public ranking 규칙

Python에 physics를 복제하지 않는다. physics correctness는 shared TypeScript `step()` 재시뮬레이션 테스트가 담당한다.

## 자동 검증

최신 M2 검증 기준에서 다음 **34 tests**가 통과했다.

- 기존 M1 physics/rates/determinism/track/collision tests
- public Easy + keyboard E2E
- tester Acro/Gamepad/RC calibration E2E
- training_use / partition / Easy assist targets
- M2 gzip JSONL codec
- sample recording 3개 Python validator
- sample recording 3개 input re-simulation
- IndexedDB persistence after reload
- same-partition best ghost load
- state/resim ghost mode UI
- exported frame camera pose 검증

최신 기능 검증 commit: `86726dc1cf3207f1800bc31059d53b85e60f4bc1`
GitHub Actions run: `36219879301`

## 실제 사용자 export 검증

2026-09-26 배포 사이트에서 사용자가 직접 완주 후 내보낸 다음 기록을 검사했다.

```text
recording_id: cb5233fa-e018-45ba-840a-bc838d51b3f5
training_use: flight_method
inputs: 6388
states: 6389
frames: 1596
events: 7
compressed_bytes: 3701889
uncompressed_bytes: 13430610
```

`tools/validate.py` 결과:

```text
OK local_data/lap_cb5233fa-e018-45ba-840a-bc838d51b3f5.jsonl.gz
```

따라서 실제 배포 환경에서 생성된 기록도 schema 0.1.6 validator를 통과한다.

## 기록 용량

계획 기준:

| 랩 | 비압축 | gzip |
|---:|---:|---:|
| 30초 | 7–10 MB | 1.5–3.5 MB |
| 60초 | 14–20 MB | 3–7 MB |
| 90초 | 21–30 MB | 4.5–10 MB |

이번 실제 export는 약 13.43 MB 비압축, 약 3.70 MB gzip이었다. 30/60/90초 구간별 장시간 benchmark와 IndexedDB quota 평가는 M3에서 수행한다.

## M2 완료 조건

자동 조건:

- [x] IndexedDB 기록
- [x] gzip JSON Lines export 구조
- [x] data_spec 0.1.6
- [x] Python validator
- [x] 3개 재시뮬레이션 regression
- [x] recorded-state ghost
- [x] input-resimulation ghost
- [x] position error UI
- [x] local list/replay/delete/export UI
- [x] 기존 public/tester 기능 회귀 통과
- [x] CI test gate 통과

사용자 직접 확인:

- [x] 배포 사이트에서 한 랩 완주 후 기록이 목록에 남음
- [x] 새로고침 후 기록 유지
- [x] 현재 조건 최고랩 ghost와 실제 경주 가능
- [x] state/resim 전환과 position error 표시 확인
- [x] `.jsonl.gz` 내보내기
- [x] 내보낸 실제 파일이 `tools/validate.py` 통과

**M2 완료 판정: 2026-09-26.**
다음 개발 단계는 M3 · 파이프라인 시험과 기록 형식 확정이다.

## 알려진 한계

- 브라우저별 IndexedDB quota는 다르다. 장시간/다량 기록 한도는 M3에서 측정한다.
- 현재 input re-simulation은 physics v3만 지원한다.
- M2 파일은 검증과 개발 편의를 위해 JSONL을 사용한다. 대량 데이터 압축/이진화 여부는 M3 측정 후 결정한다.
- 실제 RC/Gamepad 하드웨어 호환성은 자동 테스트로 완전히 대체할 수 없다.
- `?tester=1`은 인증이 아니다.
- 서버 업로드, 계정, 공개 leaderboard, 동의 UI는 M4 범위다.
