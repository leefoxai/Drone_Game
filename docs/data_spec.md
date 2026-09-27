# 드론 플레이 기록 명세

상태: **M3 compact recording 계약**. 현재 `schema_version: "0.2.0"`.

기록 구조를 바꾸기 전 사용자에게 알리고 schema version을 올린다. 물리 계산을 바꾸면 별도로 `physics_version`도 올린다. 기존 `0.1.6` 파일은 읽기·검증 호환을 유지한다.

## 1. 원칙과 시간

- 원본은 입력·상태 checkpoint·이벤트 로그다. 영상과 학습용 파생물은 원본을 대체하지 않는다.
- 물리는 고정 **240 Hz**, `dt=1/240 s`다. 시뮬레이션 시간은 tick이 기준이다.
- `initialState + appliedInput[] + 동일 physicsVersion/profile`로 전체 240 Hz trajectory를 재시뮬레이션할 수 있어야 한다.
- `appliedInput`은 재시뮬레이션의 authoritative input이며 정밀도를 줄이지 않는다.
- `pilotInput`과 Easy `assistTargets`도 240 Hz로 보존한다.
- rAF(render) 시각과 physics 시각은 분리한다.
- 지원하지 않는 schema/physics version을 최신 버전으로 조용히 해석하지 않는다.
- `training_use`는 원본 보존 여부가 아니라 학습 용도 라벨이다.

## 2. 좌표계·단위

- SI 단위: m, s, m/s, m/s², kg, N, N·m, rad, rad/s.
- 오른손 좌표계: 월드 +X 오른쪽, +Y 위, -Z 전방.
- 자세는 body→world 단위 쿼터니언 `[x,y,z,w]`.
- body 각속도 `[wx,wy,wz]`: pitch +X, yaw +Y, roll +Z.
- JSON 숫자는 유한 값만 허용한다.

## 3. schema 0.2.0 컨테이너

한 랩은 하나의 gzip JSON Lines 파일이다.

```text
lap_<recording_id>.jsonl.gz
```

첫 line은 `metadata`, 이후 허용 channel은 다음과 같다.

```text
frames
input_chunks
state_checkpoints
events
camera_changes
```

recording format:

```text
drone-lap-jsonl-gzip-v2
```

### 3.1 `frames`

매 rAF 입력 관측을 보존한다.

- `frameSequence`
- `simulationTick`
- `physicsAlpha`
- `inputReadMonotonicMs`
- `rafTimestampMs`
- `inputDeviceKind`
- `keysDown` 또는 `rawAxes/rawButtons`
- `normalizedPilotInput`

0.1.6에서 매 frame 저장하던 `cameraPose`는 0.2.0 disk format에서 제거한다. 카메라 조건은 metadata + `camera_changes`와 simulation state로 재구성한다. runtime recorder는 디버그 목적으로 pose를 가질 수 있다.

### 3.2 `input_chunks`

240 Hz logical input을 **256 tick 단위**로 묶는다. 개별 logical sample의 의미와 숫자 정밀도는 0.1.6과 동일하다.

compact row 순서:

```text
[
  tick,
  pilot.throttle, pilot.roll, pilot.pitch, pilot.yaw,
  applied.throttle, applied.roll, applied.pitch, applied.yaw,
  assistTarget.vx, assistTarget.vz,
  assistTarget.verticalVelocity,
  assistTarget.yawRate
]
```

Easy에서는 마지막 4개 값이 모두 존재해야 한다. Acro에서는 모두 `null`이다.

`appliedInput`은 BC 정답이 아니라 재시뮬레이션 검증용 authoritative input이다.

### 3.3 `state_checkpoints`

0.1.6의 매 tick full `states`와 중복 `controller_states`를 제거한다.

full `State` checkpoint는 다음 tick에 저장한다.

- initial tick
- 매 **24 tick = 0.1초 = 10 Hz**
- 모든 event tick
- final tick

full State에는 physics/controller hidden state가 함께 들어 있으므로 별도 `controller_states` channel을 저장하지 않는다.

decoder는 `initialState + appliedInput[]`으로 전체 240 Hz state를 재구성한다. checkpoint는 재시뮬레이션 결과 검증 기준이다.

### 3.4 `events`

- `lap_start`
- `gate_pass`
- `collision`
- `lap_complete`
- `lap_abort`

`(tick, sequence)` 순서를 유지한다.

### 3.5 `camera_changes`

카메라/시야 보조 조건이 바뀔 때만 저장한다.

- tick
- cameraMode
- verticalFovRad
- aspectRatio
- viewportWidth/Height
- devicePixelRatio
- artificialHorizonEnabled
- heightAssistEnabled

일반 complete lap은 한 파티션 안에서 카메라 조건이 고정된다.

## 4. metadata

필수 의미는 0.1.6과 동일하며 다음 compact 계약 필드를 추가한다.

| 필드 | 0.2.0 계약 |
|---|---|
| schemaVersion | `0.2.0` |
| recordingFormat | `drone-lap-jsonl-gzip-v2` |
| inputChunkSize | `256` |
| stateCheckpointIntervalTicks | `24` |
| physicsHz | `240` |
| recordingId / sessionId | 충돌 방지 ID |
| track/ruleset/profile | snapshot + SHA-256 |
| inputDeviceKind | keyboard / gamepad / rc_joystick |
| controlProfile | mode / assistVersion / Easy settings |
| testerMode | tester flag |
| trainingUse | flight_method / stick_pattern |
| initialState | 완전한 초기 physics state |
| camera | 시작 projection/조건 |
| consent | granted/scope/policyVersion/grantedAtUtc |
| outcome | status/finalTick/seconds/completedGates/reason |
| partitionKey | §5 키 |
| payloadSha256 | metadata 제외 payload bytes SHA-256 |

## 5. 파티션 키

```text
track_id
+ control_mode
+ input_device_kind
+ physics_version
+ aircraft_profile_version
+ assist_version
+ camera_mode
+ artificial_horizon_enabled
+ height_assist_enabled
+ tester_mode
```

하나라도 다르면 별도 학습/비교 파티션이다.

## 6. training_use

유일한 판정 규칙:

```text
if control_mode == acro
and input_device_kind in {gamepad, rc_joystick}
and assist_version is none
and every tick has pilotInput == appliedInput:
    stick_pattern
else:
    flight_method
```

따라서 keyboard + Easy는 `flight_method`다. `stick_pattern` exporter는 저장 라벨만 믿지 않고 동일 규칙을 재검사한다.

## 7. BC 학습 계약

`flight_method` BC의 label/output은 **Easy `assistTargets`**다.

```text
horizontalVelocityWorldMps.x
horizontalVelocityWorldMps.z
verticalVelocityMps
yawRateRadPerSec
```

`appliedInput`을 BC 정답으로 사용하지 않는다.

학습 후보는 최소 다음을 만족해야 한다.

```text
outcome == complete
consent.granted == true
consent.scope contains "local_bc_training"
training_use == "flight_method"
same partition
```

랩 단위로 train/validation을 분리한다.

## 8. 무결성·재시뮬레이션

`payloadSha256`는 metadata line을 제외한 정확한 비압축 JSONL payload UTF-8 bytes의 SHA-256이다.

재시뮬레이션:

```text
initialState
+ exact appliedInput[]
+ metadata.aircraftProfile.snapshot
+ same physicsVersion
→ full 240 Hz states
```

checkpoint에서 recorded state와 비교한다.

동일 shared physics deterministic fixture의 기준 허용 오차는 유지한다.

```text
position <= 1e-9 m
velocity <= 1e-9 m/s
orientation <= 1e-10
angular velocity <= 1e-9 rad/s
```

## 9. 0.1.6 호환과 변환

0.1.6:

```text
drone-lap-jsonl-gzip-v1
frames / inputs / states / controller_states / events / camera_changes
```

은 계속 decode/validate한다. 기존 파일을 덮어쓰지 않는다.

표준 라이브러리 converter:

```bash
python3 tools/compact_recording.py source.jsonl.gz destination.jsonl.gz
python3 tools/validate.py destination.jsonl.gz
```

converter는 physics를 재계산하지 않고 0.1.6의 authoritative input과 필요한 full state checkpoint를 그대로 재포장한다.

## 10. 용량 결정 근거

사용자 동의 실제 0.1.6 complete lap 3개 측정:

| 길이 | gzip |
|---:|---:|
| 24.52 s | 3.44 MB |
| 24.80 s | 3.48 MB |
| 25.12 s | 3.51 MB |

60초 환산 중앙값은 약 **8.42 MB**였다.

비압축 채널 비중은 대략:

```text
states             44.4%
controller_states  29.0%
inputs              19.2%
frames               7.2%
```

각 채널 독립 gzip 추정에서도 `states + controller_states`가 약 87%를 차지했다.

동일 실제 기록을 0.2.0 구조로 재포장한 설계 실측에서는 24-tick checkpoint 조건에서 **60초 환산 약 0.99 MB**가 나왔다. M3 최종 게이트에서는 새 0.2.0 실제 30/60/90초 기록으로 다시 측정한다.

## 11. 로컬 저장

IndexedDB:

```text
drone-recordings / laps
```

summary + gzip Blob을 저장한다. 목록 조회 시 전체 Blob을 해제하지 않는다.

실제 원본/영상/dataset/model/benchmark 결과물은 Git에 넣지 않고:

```text
local_data/
```

아래에만 둔다.

## 12. 검증 도구

```bash
python3 tools/validate.py lap_<recording_id>.jsonl.gz
```

표준 라이브러리만 사용한다. validator는 0.1.6과 0.2.0을 모두 지원하며 다음을 검사한다.

- gzip / UTF-8 / JSONL
- metadata / schema / format
- payload 및 snapshot SHA-256
- partition / trainingUse
- finite number
- frame sequence / timestamp / raw input
- compact input chunk 순서와 240 Hz tick 연속성
- Easy assist target / Acro null
- checkpoint 10 Hz + event/final tick 존재
- event terminal 규칙
- tester/public leaderboard 규칙

Python validator는 physics를 복제하지 않는다. physics correctness는 TypeScript shared `step()` 재시뮬레이션이 담당한다.

## 13. 변경 이력

- **0.2.0 (2026-09-27)**: M3 compact format. 240 Hz pilot/applied/assist target은 유지하고 input을 256 tick chunk로 묶음. full state는 10 Hz + event/final checkpoint로 축소, 중복 controller_states 제거, 반복 frame cameraPose 제거. 기존 0.1.6 decode/validator 호환 및 표준 라이브러리 converter 추가.
- **0.1.6 (2026-09-26)**: M2 영속 기록. 매 rAF 입력/pose, 매 physics tick input/full state/controller state, events, metadata를 gzip JSONL로 저장.
- 0.1.5 (2026-09-26): input_device_kind/physics_version/tester_mode partition 및 training_use/Easy assist_targets.
- 0.1.4 (2026-09-26): physics_version=3, track v2, camera/horizon/height-assist partition.
- 0.1.3 (2026-09-26): pilot/applied 이중 기록, 카메라 projection metadata.
- 0.1.2 (2026-09-26): Easy assist, physics_version=2.
- 0.1.1 (2026-09-26): M1 physics_version=1.
- 0.1.0: 최초 초안.
