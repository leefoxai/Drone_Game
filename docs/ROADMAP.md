# 개발 로드맵

목표 A: 게임 플레이 기록에서 조종 입력과 시각 라벨이 연결된 드론 영상 데이터셋을 만든다.
목표 B: 검증된 상위 기록으로 AI 드론 조종 모델을 학습하고 브라우저에서 실행한다.

기록의 원본은 입력·상태·이벤트 로그이며 영상은 로그를 재생해 생성한다.
한 번에 한 기능씩 구현하고, 각 단계의 실행 결과를 직접 확인한 후 다음 단계로 간다.

현재 상태:

- M0 완료
- M1 완료
- M2 완료
- **M3 진행 중 — 최소 학습 활용 동의 기능 구현·배포 완료, 사용자 동의 랩 3~5개 생성 대기**
- M4~M8 미시작
- 공개 제품은 keyboard + Easy. Acro/Gamepad/RC/Rates/보정은 `?tester=1` 전용

## M0 · 프로젝트 준비 — 완료

Git, npm workspace, TypeScript/Vite/Three.js, 기본 문서와 프로젝트 뼈대를 구성했다.

## M1 · 비행 프로토타입 — 완료

드론 1대, 대형 게이트 훈련장과 실제 크기·고도 변화가 있는 대회용 트랙, Easy/Acro, Gamepad/RC 입력, 튜닝 패널과 고정 240 Hz shared physics를 구현했다.

M1 안정화에서:

- 보이는 게이트/드론 크기와 충돌 의미 정합화
- 게이트 다리/그림자/크기 기준물
- 낮춘 chase camera / FPV 인공 수평선 / 높이 차 보조
- 공개 keyboard+Easy / tester Acro+외부입력 분리
- partition key와 `training_use` 계약 확정
- GitHub Actions test gate와 Pages 배포

를 완료했다.

## Acro 공개 · 조건부 마일스톤

M2 이후와 병행하며 완료 전까지 Acro와 외부 입력 장치는 `?tester=1` 전용이다.

공개 전 조건:

1. 실제 FPV 조종자 여러 명의 RC joystick 테스트
2. 대표 Gamepad/RC의 축 매핑·끝점·반전·deadzone 호환성 확인
3. Acro rates / FPV tilt 공개 기본값 확정
4. 잘못된 축/중립/끝점 보정 거부 확인
5. `stick_pattern`과 keyboard/Easy 데이터 격리 확인
6. M4 서버에서 tester 기록 공개 순위 제외
7. 공개 전 전체 `npm test` + 실제 배포 확인

## M2 · 기록·고스트 — 완료

M1 `telemetry.ts`와 `data_spec` 계약을 그대로 확장했다. 별도 학습 기록 형식은 만들지 않는다. schema는 **0.1.6**이다.

구현:

- 매 rAF frame: key state 또는 joystick raw+normalized input, input-read time, rAF timestamp, simulation tick/alpha
- 매 physics tick: pilot/applied input, Easy assist target, full state, controller hidden state
- gate/collision/complete/abort event
- data_spec 필수 metadata와 snapshot/payload SHA-256
- 한 랩 단위 `.jsonl.gz`
- IndexedDB 영속 저장
- 로컬 기록 목록 / replay / export / delete
- 현재 partition의 personal-best ghost
- recorded-state replay와 authoritative-input re-simulation
- 두 경로의 현재/최대 position error 표시
- `tools/validate.py`
- deterministic sample lap 3개 gzip round-trip + validator + re-simulation regression

자동 회귀 허용 오차:

```text
position <= 1e-9 m
velocity <= 1e-9 m/s
orientation <= 1e-10
angular velocity <= 1e-9 rad/s
```

**사용자가 직접 확인한 완료 게이트**

1. 배포 사이트에서 한 랩 완주 후 기록 목록 생성 확인
2. 새로고침 후 IndexedDB 기록 유지 확인
3. 같은 조건 최고랩 ghost와 실제 주행 확인
4. state / resim ghost 전환과 position error 표시 확인
5. `.jsonl.gz` export 확인
6. 실제 export가 `python3 tools/validate.py <file>` 통과

**M2 완료 판정: 2026-09-26.**

## M3 · 파이프라인 시험과 기록 형식 확정 — 진행 중

자신의 동의된 기록 몇 랩으로 FPV 영상 리렌더 → 입력/영상 정렬 → 작은 BC 학습 → 봇 추론까지 한 번 끝까지 수행한다. 대량 수집 전에 반드시 거친다.

### Phase 1 · 최소 학습 활용 동의 — 구현·배포 완료

정식 M4 동의 시스템 전에 M3 로컬 학습 시험을 위한 최소 체크를 기록 화면에 추가했다.

```text
□ 내 비행 기록을 AI 학습 시험에 활용하는 데 동의합니다.
```

규칙:

- 최초 기본값 OFF
- ON/OFF 상태는 로컬 설정으로 보존
- **랩이 실제 시작되는 순간**의 상태를 recording metadata `consent`에 snapshot
- 진행 중 변경은 현재 랩에 소급되지 않음
- 다음 새 랩부터 변경 상태 적용
- 과거 기록 소급 변경 없음
- OFF 기록도 로컬 원본은 보존 가능

동의 ON:

```text
scope = ["local_bc_training"]
policyVersion = "m3-local-training-v1"
```

기존 data_spec 0.1.6의 consent 필드를 사용하므로 Phase 1에서는 schema version을 올리지 않았다.

### Phase 2 · 사용자 실제 기록 — 현재 대기 지점

사용자가 다음 조건으로 complete lap 3~5개를 기록한다.

권장 조건:

```text
track: race-five-v2
input: keyboard
control: Easy / assisted
camera: FPV
same assist/camera settings
consent: ON before lap start
```

각 랩을 `.jsonl.gz`로 내보내고 다음 경로에만 둔다.

```text
local_data/m3/source/
```

Git에는 기록 원본을 커밋하지 않는다.

### Phase 3 · 실제 용량 측정과 형식 개선안 확정

사용자 실제 파일에서 먼저 다음 byte breakdown을 측정한다.

- metadata
- frames
- inputs
- states
- controller_states
- events
- camera_changes
- gzip total
- bytes/sec
- 60초 환산

M2 실제 export는 약 26.6초에 gzip 약 3.70 MB였으므로 단순 60초 환산은 약 8 MB대다.

M3 목표:

```text
60초 complete Easy lap gzip 약 1 MB
목표 범위 0.8~1.2 MB
```

단 다음은 유지한다.

- authoritative `appliedInput`
- Easy `assistTargets`
- 초기 상태와 동일 physics version으로 re-simulation 가능
- checkpoint 기반 state 검증
- 원본 metadata / partition / training_use / consent 의미

우선 검토할 개선:

1. 240 Hz `appliedInput` / `pilotInput` / Easy `assistTargets` 유지
2. 240 Hz full state → initial state + 주기적 full checkpoint + terminal/event checkpoint 검토
3. `states`와 `controller_states` 중복 제거 검토
4. input rows chunking으로 JSON key 반복 축소
5. frame camera pose 재구성 검증 후 반복 저장 제거 검토

breaking change라면 `schema_version`을 올리고 recorder/codec/validator/sample/ghost/regression을 함께 갱신한다. 기존 0.1.6 파일은 보존한다.

### Phase 4 · FPV deterministic re-render와 정렬 확인

자신의 3~5개 동의 랩으로 표준 FPV 영상을 생성한다.

초기 표준 렌더 조건:

```text
FPV
640×360
30 fps
fixed FOV
HUD/OSD 제외
```

생성물은 모두 `local_data/` 아래에만 둔다.

```text
local_data/m3/renders/<recording_id>/flight.mp4
local_data/m3/renders/<recording_id>/frame_labels.csv
local_data/m3/renders/<recording_id>/render_manifest.json
```

출발·급회전·게이트 통과 frame에서 영상 frame time ↔ physics tick ↔ event ↔ 학습 label 정렬을 직접 확인한다.

동일 recording을 두 번 렌더해 frame count와 time metadata가 재현되는지도 확인한다.

### Phase 5 · `flight_method` BC 학습

사용자의 키보드 + Easy 랩은 `flight_method`다.

학습 대상 조건:

```text
outcome == complete
consent.granted == true
consent.scope contains local_bc_training
training_use == flight_method
동일 partition 조건
```

**정답으로 `appliedInput`을 사용하지 않는다.**

BC 출력은 data_spec의 Easy `assistTargets` 4개다.

```text
horizontalVelocityWorldMps.x
horizontalVelocityWorldMps.z
verticalVelocityMps
yawRateRadPerSec
```

한 complete lap 전체를 validation으로 분리한다. 같은 랩의 frame을 train/validation 양쪽에 나누지 않는다.

작은 CPU BC 모델로 end-to-end pipeline을 검증한다.

### Phase 6 · bot 연결

기존 Easy assist를 다음 두 단계로 분리하되 제어법 자체는 바꾸지 않는다.

```text
human command → assist_targets → existing assist controller → appliedInput
BC FPV       → predicted assist_targets → existing assist controller → appliedInput
```

봇은 예측 `assist_targets`를 기존 보조 장치에 넣어 비행한다.

모델과 추론 결과물은 `local_data/`에만 두며, bot 추론 확인은 **로컬 개발 서버**에서만 한다. production Pages에는 M3 bot을 공개하지 않는다.

### Phase 7 · `stick_pattern` 격리 시험

M3에서는 stick model을 학습하지 않는다.

기존 tester fixture로:

- RC/gamepad + Acro direct input이 `stick_pattern` export 가능
- keyboard + Easy 및 joystick + Easy가 `stick_pattern`에 0건
- 잘못 라벨된 `flight_method`도 exporter가 차단

을 확인한다.

### Phase 8 · benchmark와 browser re-simulation

최종 형식 기준 실제 30/60/90초에 대해:

- raw/gzip bytes
- encode/decode CPU time
- re-simulation time
- 가능한 범위의 peak memory
- IndexedDB quota (`navigator.storage.estimate()`)

를 측정한다.

같은 recording을 Chromium / Firefox / WebKit에서 재시뮬레이션해 checkpoint 오차도 측정한다.

### M3 내가 직접 확인하는 방법

아래를 모두 직접 확인해야 M3 완료다.

1. 동의 OFF 기록이 학습 목록/export에서 제외된다.
2. 동의 ON 뒤 **새로 시작한 랩만** 동의 기록이 되며, 과거/진행 중 랩에 소급되지 않는다.
3. 자신의 3~5개 `flight_method` 랩으로 MP4와 frame/input 대응표가 생성된다.
4. 출발·급회전·게이트 통과 frame에서 영상과 label 시간 정렬이 맞는다.
5. 동일 recording을 다시 렌더했을 때 frame count/time metadata가 동일하다.
6. 한 complete lap 전체를 validation으로 제외한 CPU BC 학습이 완료된다.
7. BC label/output이 `assist_targets`이며 `appliedInput`이 정답으로 사용되지 않았음을 확인한다.
8. tester `stick_pattern` export가 되고 `flight_method` 누출이 0건이다.
9. 학습하지 않은 랩 조건에서 로컬 개발 서버 bot이 predicted assist_targets → 기존 Easy assist → physics 경로로 비행한다.
10. 실제 30/60/90초 용량/CPU/메모리/IndexedDB quota를 확인하고 60초 gzip이 약 1 MB 목표에 근접한다.
11. 브라우저 간 re-simulation 오차 결과를 확인한다.
12. recording, MP4, 대응표, benchmark, dataset, 모델, metric이 모두 `local_data/` 아래에 있고 Git 추적 대상이 아니다.

위 항목 중 하나라도 실패하면 M4로 넘어가지 않는다.

## M4 · 공개

배포, 계정, 정식 데이터 활용 동의, 약관·개인정보 처리방침 초안, 기록 업로드, 서버 re-simulation 검증, 트랙별 leaderboard를 구현한다. 초기 저장은 SQLite + 파일.

M3 최소 동의 UI를 바탕으로 계정 기반 동의 version/time/철회 이력을 정식화한다.

확인 항목:

1. 가입/로그인/로그아웃/주행/업로드
2. 미동의 기록의 학습 export 제외
3. 동의 version/time과 철회 반영
4. 정상 기록 검증 후 leaderboard 등록, 변조 기록 거부
5. `tester_mode=true` 기록 공개 leaderboard 제외
6. 다른 track/ruleset/physics version 기록 격리
7. 다른 계정 기록 수정/삭제 방지
8. 전문가 약관 검토, 보안 점검, backup/restore 확인

## M5 · 모드 확장

장애물 코스, PVE, 비동기 팀 레이스를 추가하고 모든 성공·실패·점수·팀 합산 규칙을 versioned ruleset으로 관리한다.

확인 항목:

1. 장애물 통과/충돌 penalty
2. PVE 성공/실패와 ghost/recording 재생
3. 비동기 팀 기록 합산
4. 중복 upload/미완주/팀 변경/조건 불일치 격리

## M6 · 데이터셋

Playwright headless browser로 MP4 + depth/segmentation/gate-corner label을 대량 리렌더한다. retry/resume, version 고정, curation, dataset card를 준비한다.

확인 항목:

1. 작은 batch MP4 + depth/segmentation/corner overlay
2. 화면 밖/가림 상태와 depth meter 단위 확인
3. 중단 후 재시작 시 중복 없이 실패 작업만 retry
4. 미동의/손상/검증 실패 recording 제외
5. player/session/lap 단위 train/validation/test leakage 방지

## M7 · AI 봇

검증된 기록으로 Python/PyTorch BC를 CPU에서 시작하고 ONNX로 내보내 브라우저에서 실행한다. 이후 강화학습으로 보정한다.

확인 항목:

1. 동일 조건 기록 + 동의 기준 학습 목록 생성
2. 분리 평가 세션의 완주율/충돌/랩타임/input error
3. Python ↔ ONNX 출력 오차
4. browser inference latency와 frame 지연
5. 강화학습 전후 동일 평가조건 비교

## M8 · 실시간 멀티플레이

동시 접속자가 충분해진 뒤 PVP/팀전을 추가한다. 서버 권위, 시간 동기화, prediction/correction, disconnect/reconnect 정책을 설계한다.

확인 항목:

1. 두 기기 출발/위치/gate/final ranking 일치
2. latency/packet loss 주입
3. disconnect/reconnect/team member leave/simultaneous finish
4. 목표 concurrency load test와 운영 비용 확인
