# M3 로컬 파이프라인 실행 가이드

M3의 실제 recording, 렌더 영상, dataset, benchmark, model은 모두 `local_data/` 아래에 둔다. `local_data/`는 Git 추적 대상이 아니다.

## 1. 준비

저장소 루트에서 실행한다.

```text
Drone_Game/
  local_data/
    m3/
      source/
```

필요 프로그램:

- Node/npm: 프로젝트 기존 의존성
- Python 3: validator/converter/benchmark
- ffmpeg: MP4 생성·BC 학습 영상 디코딩
- PyTorch CPU (`torch`): BC 학습 단계에서만 필요

Python validator/converter/benchmark는 표준 라이브러리만 사용한다.

## 2. source 검증

```bash
python3 tools/validate.py local_data/m3/source/lap_....jsonl.gz
```

Windows에서 `python3` 명령이 없으면 `python`으로 실행한다.

학습 후보는 다음을 만족해야 한다.

```text
outcome = complete
consent.granted = true
consent.scope contains local_bc_training
training_use = flight_method
same partitionKey
```

## 3. 기존 0.1.6 파일을 0.2.0으로 변환

기존 source를 덮어쓰지 않는다.

```bash
python3 tools/compact_recording.py \
  local_data/m3/source/lap_x.jsonl.gz \
  local_data/m3/compact/lap_x.jsonl.gz
```

변환 후:

```bash
python3 tools/validate.py local_data/m3/compact/lap_x.jsonl.gz
```

새 배포 사이트에서 생성되는 기록은 schema 0.2.0이므로 별도 변환이 필요 없다.

## 4. FPV deterministic re-render

먼저 ffmpeg 확인:

```bash
ffmpeg -version
```

없으면 렌더 단계로 진행하지 말고 ffmpeg를 설치한 뒤 다시 실행한다.

각 랩:

```bash
node tools/render_dataset.mjs local_data/m3/compact/lap_x.jsonl.gz
```

또는 새 0.2.0 원본이면:

```bash
node tools/render_dataset.mjs local_data/m3/source/lap_x.jsonl.gz
```

출력:

```text
local_data/m3/renders/<recording_id>/
  flight.mp4
  frame_labels.csv
  render_manifest.json
```

고정 렌더 조건:

```text
FPV
640×360
30 fps
vertical FOV 75°
FPV tilt 15°
HUD/OSD 없음
```

`frame_labels.csv`의 BC label은 오직 다음 4개다.

```text
assist_target_vx
assist_target_vz
assist_target_vertical
assist_target_yaw_rate
```

`appliedInput`은 label로 내보내지 않는다.

## 5. 정렬 및 재현성 직접 확인

영상과 CSV에서 다음 구간을 비교한다.

1. 출발
2. 급회전
3. 각 gate 통과 전후

확인 기준:

```text
frame_time_s
physics_tick
next_gate_index
assist_target_*
```

같은 recording을 다시 렌더한 뒤 두 `render_manifest.json`의 다음 값이 같은지 비교한다.

```text
frameCount
planSha256
framesSha256
```

## 6. BC CPU 학습

`tools/train_bc.py`는 **PyTorch CPU (`torch`)**가 필요하다. 설치 여부:

```bash
python -c "import torch; print(torch.__version__)"
```

없으면 사용 중인 Python/OS에 맞는 PyTorch CPU 패키지를 설치한 뒤 실행한다. 다른 ML 패키지는 M3 기본 경로에 필요하지 않다.

3개 랩 중 한 complete lap 전체를 validation으로 지정한다.

```bash
python tools/train_bc.py \
  --renders local_data/m3/renders \
  --out local_data/m3/models \
  --val-id <validation-recording-id>
```

출력:

```text
local_data/m3/models/
  bc_model.pt
  bc_model.json
  metrics.json
  training_manifest.json
```

`training_manifest.json`에서 반드시:

```text
label = assist_targets
appliedInputLabel = false
```

를 확인한다.

## 7. 로컬 bot 추론

```bash
npm run dev
```

브라우저에서:

```text
http://localhost:5173/bot.html
```

`local_data/m3/models/bc_model.json`을 선택하고 시작한다.

경로:

```text
FPV frame
→ BC predicted assist_targets
→ 기존 applyAssistTargets()
→ appliedInput
→ shared physics step()
```

bot UI는 development-only이며 production Pages 메인 UI에 노출하지 않는다.

## 8. browser re-simulation

Playwright에 해당 browser가 설치되어 있으면 Chromium/Firefox/WebKit을 순서대로 검사한다.

```bash
node tools/browser_resim.mjs local_data/m3/compact/lap_x.jsonl.gz
```

결과:

```text
local_data/m3/benchmarks/browser_resim_*.json
```

설치되지 않은 browser는 `unavailable_or_failed`로 명시한다.

## 9. recording benchmark

예:

```bash
python tools/benchmark_recordings.py \
  local_data/m3/compact/lap_a.jsonl.gz \
  local_data/m3/compact/lap_b.jsonl.gz \
  local_data/m3/compact/lap_c.jsonl.gz
```

결과:

```text
local_data/m3/benchmarks/recordings.json
```

최종 M3 완료 전에는 새 schema 0.2.0으로 실제 30/60/90초 기록을 각각 만들어 용량/CPU/메모리/quota를 확인한다.

## 10. M3 완료 전 확인

M3는 `docs/ROADMAP.md`의 **M3 내가 직접 확인하는 방법** 12개가 모두 확인되기 전 완료 처리하지 않는다.
