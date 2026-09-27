# 프로젝트 상태

갱신: 2026-09-27 (Asia/Seoul)

## 현재 단계

- M0 완료.
- M1 비행 프로토타입 및 안정화 완료.
- **M2 기록·고스트 완료.**
- **M3 파이프라인 시험 진행 중 — 동의된 사용자 랩 확보, compact schema와 로컬 end-to-end 도구 구현 완료. 사용자 직접 확인 게이트 대기.**
- M4~M8 미시작.

M3는 아직 완료 처리하지 않는다. `docs/ROADMAP.md`의 **M3 내가 직접 확인하는 방법**을 모두 통과해야 한다.

## 공개 제품 방향

기본 Pages:

- keyboard
- Easy / assisted
- `training-five-v2`, `race-five-v2`
- chase / FPV
- 인공 수평선 / 높이 차 보조

`?tester=1`에서만:

- Acro
- Gamepad / RC joystick
- 축 보정/반전/끝점/deadzone
- Rates

M3 BC bot은 production Pages 메인 기능이 아니라 **로컬 개발 서버 전용**이다.

## 버전

- `PHYSICS_VERSION=3`
- aircraft profile version 2
- `ASSIST_VERSION=1`
- current recording schema **`0.2.0`**
- current recording container **`drone-lap-jsonl-gzip-v2`**
- legacy read/validate: `0.1.6 / drone-lap-jsonl-gzip-v1`
- input chunk: 256 ticks
- full state checkpoint: 24 ticks = 0.1 s = 10 Hz + event/final

## M2 완료

M2는 schema 0.1.6에서 다음을 완료했다.

- 240 Hz pilot/applied input + Easy assistTargets
- full state/controller state
- rAF input/camera pose
- events / metadata / SHA-256
- IndexedDB, export/delete/replay
- state/resim ghost
- Python validator
- deterministic fixtures
- 실제 사용자 export validator 통과

**M2 완료 판정: 2026-09-26.**

## M3 Phase 1 · 최소 학습 활용 동의 — 완료

기록 화면:

```text
□ 내 비행 기록을 AI 학습 시험에 활용하는 데 동의합니다.
```

정책:

- 기본 OFF
- 로컬 상태 보존
- 랩 **시작 순간** consent snapshot
- 진행 중/과거 랩 소급 변경 없음
- 다음 새 랩부터 변경 반영

ON metadata:

```text
consent.granted = true
consent.scope = ["local_bc_training"]
consent.policyVersion = "m3-local-training-v1"
```

Phase 1 배포 검증:

```text
run 36240141311
36 tests passed
build success
Pages deploy success
```

## M3 사용자 실제 동의 기록 — 확보 완료

업로드된 complete 랩 3개:

| recording | seconds | gzip 0.1.6 | training_use | consent |
|---|---:|---:|---|---|
| `0cd55e35-f939-4001-b16c-e812b9582dbf` | 24.804 | 3,483,451 B | flight_method | true |
| `ae644c1b-3b50-4557-923e-522e4a198593` | 24.521 | 3,439,299 B | flight_method | true |
| `da5dac7c-cc8e-45ab-8dd1-ad13dfd235e8` | 25.121 | 3,510,119 B | flight_method | true |

공통 조건:

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
```

partition:

```text
training-five-v2|assisted|device-keyboard|physics-3|profile-2|assist-1|camera-chase|horizon-off|height-assist-on|tester-off
```

세 파일 모두 당시 0.1.6 `tools/validate.py`를 통과했다.

## M3 실제 용량 분석

0.1.6 세 랩의 60초 환산 gzip 중앙값은 약 **8.42 MB**였다.

비압축 channel 비중:

```text
states             ~44.4%
controller_states  ~29.0%
inputs              ~19.2%
frames               ~7.2%
```

채널별 독립 gzip 추정에서도 `states + controller_states`가 약 **87%**였다.

따라서 매 tick full state + 중복 controller state가 주요 병목으로 확인됐다.

## schema 0.2.0 · compact recording — 구현

목표: 학습 정보와 re-simulation 검증을 유지하면서 60초 gzip 약 1 MB.

유지:

- 240 Hz `pilotInput`
- 240 Hz authoritative `appliedInput`
- 240 Hz Easy `assistTargets`
- initialState/profile/physicsVersion
- event/camera metadata
- consent/training_use/partition

변경:

- input rows → **256 tick `input_chunks`**
- every-tick full state → **10 Hz + event/final `state_checkpoints`**
- 중복 `controller_states` disk channel 제거
- per-frame `cameraPose` 반복 저장 제거
- decoder는 shared TypeScript `step()`으로 240 Hz full state 재구성
- checkpoint와 재구성 state 오차 검증

허용 오차는 M2 deterministic 기준을 그대로 유지한다.

```text
position <= 1e-9 m
velocity <= 1e-9 m/s
orientation <= 1e-10
angular velocity <= 1e-9 rad/s
```

기존 0.1.6 파일은 삭제하지 않고 decode/validate 호환한다.

converter:

```bash
python3 tools/compact_recording.py source.jsonl.gz destination.jsonl.gz
```

### 사용자 실제 3랩 compact 재포장 실측

동일한 실제 0.1.6 사용자 기록을 24-tick checkpoint v2 구조로 재포장한 결과:

| recording | old gzip | compact gzip | old 대비 | 60초 환산 |
|---|---:|---:|---:|---:|
| `0cd55...` | 3,483,451 B | **410,952 B** | 11.8% | **994,072 B** |
| `ae644...` | 3,439,299 B | **406,004 B** | 11.8% | **993,451 B** |
| `da5dac...` | 3,510,119 B | **412,825 B** | 11.8% | **986,014 B** |

즉 세 실제 랩 모두 60초 환산 약 **0.99 MB**로 설계 목표에 들어왔다.

이 값은 기존 실제 파일을 compact 구조로 재포장한 측정이다. M3 최종 완료 전에는 새 0.2.0 실제 30/60/90초 기록을 별도로 측정한다.

## validator / codec / regression

현재 구현:

- `recording-codec.ts`: 0.1.6/v1 + 0.2.0/v2 decode, v2 encode
- `tools/validate.py`: 0.1.6 + 0.2.0 검증
- `tools/compact_recording.py`: legacy → compact 변환
- v2 fixture gzip round-trip
- v2 Python validator regression
- checkpoint resimulation regression
- 30 fps frame-plan label regression

## M3 FPV re-render pipeline — 구현

표준 렌더:

```text
FPV
640 × 360
30 fps
vertical FOV 75°
FPV tilt 15°
HUD/OSD 없음
```

`tools/render_dataset.mjs`:

- recording은 `local_data/` 아래만 허용
- consent `local_bc_training` 확인
- `trainingUse=flight_method` 확인
- Playwright + local Vite render harness
- ffmpeg MP4 생성
- `frame_labels.csv`
- `render_manifest.json`
- frame plan hash / rendered frame hash

출력:

```text
local_data/m3/renders/<recording_id>/
  flight.mp4
  frame_labels.csv
  render_manifest.json
```

BC label은 `assist_targets` 4개뿐이다. `appliedInput`은 label로 노출하지 않는다.

## M3 BC / bot — 구현

Easy assist를 제어법 변경 없이 분리했다.

```text
human command
→ commandToAssistTargets()
→ applyAssistTargets()
→ appliedInput

BC FPV
→ predicted AssistTargets
→ applyAssistTargets()
→ appliedInput
→ shared physics
```

`tools/train_bc.py`:

- CPU PyTorch 작은 MLP
- 64×36 grayscale FPV
- output = assist targets 4개
- one complete recording 전체 validation holdout
- same partition / consent / flight_method 강제
- `appliedInput` label 금지

출력은 전부:

```text
local_data/m3/models/
```

브라우저 local inference:

```text
npm run dev
http://localhost:5173/bot.html
```

모델 JSON을 직접 선택한다. production main UI에는 bot을 노출하지 않는다.

## stick_pattern 격리

`training-export.ts`가 저장된 trainingUse label만 신뢰하지 않고 재분류한다.

M3에서는 stick model을 학습하지 않는다.

자동 검사 대상:

- RC/joystick + Acro direct → stick_pattern
- keyboard + Easy → flight_method
- 미동의/미완주 제외
- 잘못 라벨된 기록 차단
- flight_method → stick_pattern 누출 0건

## benchmark / browser re-simulation 도구

- `tools/benchmark_recordings.py`: size, 60초 환산, gzip+JSON decode time, Python peak memory
- `tools/browser_resim.mjs`: Chromium/Firefox/WebKit re-simulation + `navigator.storage.estimate()`
- 지원 browser가 설치되지 않았으면 unavailable/failed로 명시

모든 결과는 `local_data/m3/benchmarks/` 아래에만 둔다.

## Python / 외부 도구

validator/converter/benchmark는 Python 표준 라이브러리만 사용한다.

BC 학습에서만:

```text
torch (CPU)
```

가 필요하다. 용도는 64×36 FPV → assist_targets 작은 MLP 학습/저장이다. `numpy`는 M3 기본 경로에서 추가 설치하지 않는다.

MP4 생성/학습 영상 decode에는 `ffmpeg`가 필요하다. 도구는 둘 다 자동 설치하지 않는다.

## local_data 정책

다음은 반드시 `local_data/` 아래에만 둔다.

- recording
- compact recording
- MP4 / frame_labels / render manifest
- benchmark
- dataset
- BC model / metrics / checkpoint

Git에는 커밋하지 않는다.

## 남은 M3 완료 게이트

구현만으로 M3를 닫지 않는다. 사용자가 다음을 직접 확인해야 한다.

1. OFF 기록 학습 제외 / ON 새 랩만 동의됨
2. 사용자 3~5랩 MP4 + 대응표 생성
3. 출발/급회전/gate frame 정렬
4. 동일 recording 재렌더 재현성
5. 한 whole lap validation BC 학습
6. `assist_targets` label, `appliedInputLabel=false`
7. stick_pattern export / flight_method leakage 0
8. local bot 추론 비행
9. 새 0.2.0 실제 30/60/90초 benchmark + 60초 약 1 MB
10. browser re-simulation
11. 모든 산출물 local_data only

자세한 실행 순서는 `docs/M3_LOCAL_PIPELINE.md`를 따른다.

## 알려진 한계

- 현재 physics re-simulation은 physics v3만 지원한다.
- M3 compact 목표치는 실제 기존 랩 재포장에서는 달성했지만 새 30/60/90초 native v2 측정이 남았다.
- 실제 RC/Gamepad 하드웨어 호환성은 자동 테스트로 완전히 대체할 수 없다.
- M3 동의 UI는 로컬 학습 시험용 최소 구현이며 계정 기반 철회/동의 이력은 M4 범위다.
- 서버 upload/account/public leaderboard도 M4 범위다.
