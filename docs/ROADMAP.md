# 개발 로드맵

목표 A: 게임 플레이 기록에서 조종 입력과 시각 라벨이 연결된 드론 영상 데이터셋을 만든다.
목표 B: 검증된 상위 기록으로 AI 드론 조종 모델을 학습하고 브라우저에서 실행한다.

기록의 원본은 입력·상태·이벤트 로그이며 영상은 로그를 재생해 생성한다.
한 번에 한 기능씩 구현하고, 각 단계의 실행 결과를 직접 확인한 후 다음 단계로 간다.

현재 상태:

- M0 완료
- M1 완료
- M2 완료
- **M3 진행 중 — 동의된 사용자 랩 3개 확보, compact schema 0.2.0 및 로컬 FPV→BC→bot 파이프라인 구현 완료, 사용자 직접 확인 대기**
- M4~M8 미시작
- 공개 제품은 keyboard + Easy. Acro/Gamepad/RC/Rates/보정은 `?tester=1` 전용

## M0 · 프로젝트 준비 — 완료

Git, npm workspace, TypeScript/Vite/Three.js, 기본 문서와 프로젝트 뼈대를 구성했다.

## M1 · 비행 프로토타입 — 완료

드론 1대, 훈련/대회 트랙, Easy/Acro, Gamepad/RC 입력, 튜닝 패널, 고정 240 Hz shared physics를 구현했다.

안정화에서 시각/충돌 정합화, gate support, chase/FPV, 공개 keyboard+Easy / tester 고급입력 분리, partition/training_use, CI/Pages를 완료했다.

## Acro 공개 · 조건부 마일스톤

M2 이후와 병행하며 완료 전까지 Acro와 외부 입력 장치는 `?tester=1` 전용이다.

공개 전 조건:

1. 실제 FPV 조종자 여러 명의 RC joystick 테스트
2. 대표 Gamepad/RC 축 매핑·끝점·반전·deadzone 확인
3. Acro rates / FPV tilt 공개 기본값 확정
4. 잘못된 축/중립/끝점 보정 거부 확인
5. `stick_pattern`과 keyboard/Easy 데이터 격리 확인
6. M4 서버에서 tester 기록 공개 순위 제외
7. 공개 전 전체 `npm test` + 실제 배포 확인

## M2 · 기록·고스트 — 완료

M2 schema **0.1.6**에서 다음을 구현했다.

- rAF input/camera 관측
- 240 Hz pilot/applied input, Easy assist target, full state/controller state
- events / metadata / SHA-256
- 한 랩 `.jsonl.gz`
- IndexedDB 영속 저장
- 목록/replay/export/delete
- personal-best state/resim ghost
- position error UI
- Python validator
- deterministic fixture regression

회귀 허용 오차:

```text
position <= 1e-9 m
velocity <= 1e-9 m/s
orientation <= 1e-10
angular velocity <= 1e-9 rad/s
```

사용자가 배포 사이트 완주, 새로고침 유지, ghost, state/resim, export, 실제 validator 통과를 직접 확인했다.

**M2 완료 판정: 2026-09-26.**

## M3 · 파이프라인 시험과 기록 형식 확정 — 진행 중

자신의 동의된 기록 몇 랩으로 FPV 영상 리렌더 → 입력/영상 정렬 → 작은 BC 학습 → bot 추론까지 한 번 끝까지 수행한다. 대량 수집 전에 반드시 거친다.

### Phase 1 · 최소 학습 활용 동의 — 완료

기록 화면에 기본 OFF 체크를 추가했다.

```text
□ 내 비행 기록을 AI 학습 시험에 활용하는 데 동의합니다.
```

- 랩 시작 순간 consent snapshot
- 진행 중/과거 랩 소급 변경 없음
- ON 이후 새 랩부터 적용
- scope `local_bc_training`
- M4 정식 동의 시스템의 기반

### Phase 2 · 사용자 동의 실제 기록 — 완료

사용자가 동일 partition의 complete `flight_method` 랩 3개를 제공했다.

```text
training-five-v2
keyboard
Easy / assisted
physics 3
profile 2
assist 1
chase
horizon off
height assist on
tester off
consent = true / local_bc_training
```

세 파일 모두 0.1.6 validator를 통과했다.

### Phase 3 · 실제 용량 분석과 schema 0.2.0 — 구현 완료

실제 0.1.6 사용자 3랩의 60초 환산 gzip 중앙값은 약 **8.42 MB**였다.

병목은 `states + controller_states`로 압축 기여도의 약 87%였다.

따라서 schema를 **0.2.0**으로 올렸다.

```text
recordingFormat = drone-lap-jsonl-gzip-v2
inputChunkSize = 256 ticks
stateCheckpointIntervalTicks = 24 ticks (10 Hz)
```

유지:

- 240 Hz pilotInput
- 240 Hz authoritative appliedInput
- 240 Hz Easy assistTargets
- initial state/profile/physics version
- event/camera/consent/partition/training_use

변경:

- input row → `input_chunks`
- full states → 10 Hz + event/final `state_checkpoints`
- 별도 `controller_states` disk channel 제거
- 반복 frame cameraPose 제거
- decode 시 shared physics로 240 Hz full state 재구성
- checkpoint와 re-simulation 결과 비교

기존 0.1.6 read/validate 호환과 converter를 유지한다.

사용자 실제 3랩을 동일 0.2.0 구조로 재포장한 60초 환산은 각각 약 **0.994 / 0.993 / 0.986 MB**로 목표 범위에 들어왔다.

최종 M3 완료 전에는 native 0.2.0 실제 30/60/90초 기록을 다시 측정한다.

### Phase 4 · FPV deterministic re-render — 구현 완료 / 직접 확인 대기

`tools/render_dataset.mjs`를 구현했다.

표준 조건:

```text
FPV
640×360
30 fps
vertical FOV 75°
FPV tilt 15°
HUD/OSD 제외
```

출력은 전부 `local_data/`:

```text
local_data/m3/renders/<recording_id>/
  flight.mp4
  frame_labels.csv
  render_manifest.json
```

`frame_labels.csv` label은 `assist_targets` 4개뿐이다. 동일 recording 재렌더 비교용 `planSha256` / `framesSha256`를 manifest에 저장한다.

### Phase 5 · flight_method BC — 구현 완료 / 실제 학습 확인 대기

학습 대상:

```text
complete
consent.granted == true
local_bc_training scope
training_use == flight_method
same partition
```

**`appliedInput`을 정답으로 사용하지 않는다.**

BC output:

```text
assist_target_vx
assist_target_vz
assist_target_vertical
assist_target_yaw_rate
```

`tools/train_bc.py`는 한 complete lap 전체를 validation holdout으로 두는 CPU PyTorch 작은 MLP를 학습한다.

모든 모델/metric은 `local_data/m3/models/` 아래에만 둔다.

### Phase 6 · bot 연결 — 구현 완료 / 로컬 확인 대기

Easy assist를 제어법 변화 없이 분리했다.

```text
human command → commandToAssistTargets() → applyAssistTargets() → appliedInput
BC FPV → predicted assist_targets → applyAssistTargets() → appliedInput → physics
```

로컬 dev bot:

```text
npm run dev
http://localhost:5173/bot.html
```

production 메인 UI에는 노출하지 않는다.

### Phase 7 · stick_pattern 격리 — 자동 검사 구현

M3에서는 stick model을 학습하지 않는다.

- RC/gamepad + Acro direct → stick_pattern
- keyboard + Easy → flight_method
- 미동의/미완주 제외
- 잘못 라벨된 training_use 차단
- flight_method → stick_pattern 누출 0건

### Phase 8 · benchmark / browser re-simulation — 도구 구현, 실제 확인 대기

도구:

- `tools/benchmark_recordings.py`
- `tools/browser_resim.mjs`
- `navigator.storage.estimate()`

실제 30/60/90초 native v2 용량/CPU/메모리/quota와 Chromium/Firefox/WebKit checkpoint re-simulation을 확인한다.

### M3 내가 직접 확인하는 방법

아래를 모두 직접 확인해야 M3 완료다.

1. 동의 OFF 기록이 학습 목록/export에서 제외된다.
2. 동의 ON 뒤 **새로 시작한 랩만** 동의 기록이 되며 과거/진행 중 랩에 소급되지 않는다.
3. 자신의 3~5개 `flight_method` 랩으로 MP4와 frame/input 대응표가 생성된다.
4. 출발·급회전·게이트 통과 frame에서 영상과 label 시간 정렬이 맞는다.
5. 동일 recording 재렌더의 frame count/time metadata가 동일하다.
6. 한 complete lap 전체를 validation으로 제외한 CPU BC 학습이 완료된다.
7. BC label/output이 `assist_targets`이며 `appliedInput`이 정답으로 사용되지 않았음을 확인한다.
8. tester `stick_pattern` export가 되고 `flight_method` 누출이 0건이다.
9. 학습하지 않은 랩 조건에서 local bot이 predicted assist_targets → 기존 Easy assist → physics 경로로 비행한다.
10. 실제 30/60/90초 용량/CPU/메모리/IndexedDB quota를 확인하고 60초 gzip이 약 1 MB 목표에 근접한다.
11. 브라우저 간 re-simulation 오차 결과를 확인한다.
12. recording, MP4, 대응표, benchmark, dataset, model, metric이 모두 `local_data/` 아래에 있고 Git 추적 대상이 아니다.

**하나라도 실패하면 M4로 넘어가지 않는다.**

로컬 실행 순서는 `docs/M3_LOCAL_PIPELINE.md`를 따른다.

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

장애물 코스, PVE, 비동기 팀 레이스를 추가하고 성공·실패·점수·팀 합산 규칙을 versioned ruleset으로 관리한다.

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

검증된 기록으로 Python/PyTorch BC를 확장하고 ONNX로 내보내 브라우저에서 실행한다. 이후 강화학습으로 보정한다.

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
