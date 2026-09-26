# 드론 플레이 기록 명세

상태: **M2 구현 계약**. `schema_version: "0.1.6"`.
이 문서가 기록 형식의 기준이다. 기록 구조를 바꾸기 전 사용자에게 알리고 `schema_version`을 올린다. 물리 계산을 바꾸면 별도로 `physics_version`도 올린다.

## 1. 원칙과 시간

- 원본은 입력·상태·이벤트 로그다. 영상과 학습용 파생물은 원본을 대체하지 않는다.
- `training_use`는 원본 보존 여부가 아니라 학습 용도 라벨이다. complete/invalid/aborted 원본 기록은 로컬에서 보존할 수 있다.
- 물리는 고정 **240 Hz**, `dt=1/240 s`다. 시뮬레이션 시간은 `tick / physics_hz`가 기준이다.
- `state[0]`은 랩 기록 시작 직전의 완전한 초기 상태다. `input[k]`는 한 physics step에 적용되고 결과가 `state[k+1]`이다. 따라서 N개 입력에는 N+1개 상태가 있어야 한다.
- rAF(render) 시각과 physics 시각은 분리한다. 화면 주사율이나 wall clock으로 physics를 적분하지 않는다.
- 지원하지 않는 schema/physics 버전을 최신 버전으로 조용히 해석하지 않는다.

## 2. 좌표계·단위

- SI 단위: m, s, m/s, m/s², kg, N, N·m, rad, rad/s.
- 오른손 좌표계: 월드 +X 오른쪽, +Y 위, -Z 전방.
- 자세는 body→world 단위 쿼터니언 `[x,y,z,w]`.
- body 각속도 `[wx,wy,wz]`: pitch +X, yaw +Y, roll +Z.
- JSON 숫자는 유한 값만 허용한다. NaN/Infinity는 기록 및 검증에서 거부한다.

## 3. 기록 채널

M2 파일은 한 랩당 하나의 gzip JSON Lines 파일이지만, 아래 논리 채널 계약은 M1에서 만든 구조를 그대로 확장한다. JSONL의 `channel` 필드는 같은 gzip 파일 안에서 기존 채널을 라우팅하기 위한 컨테이너 태그이며 별도 기록 형식이 아니다.

### 3.1 프레임 입력 관측 `frames`

매 `requestAnimationFrame`에서, 랩 recorder가 활성화되어 있는 동안 기록한다.

필드:

- `frameSequence`: 0부터 연속 증가.
- `simulationTick`: 입력을 읽은 시점의 현재 physics tick.
- `physicsAlpha`: 현재 고정-step accumulator의 렌더 보간 비율.
- `inputReadMonotonicMs`: 입력을 읽은 `performance.now()` 계열 단조 증가 시각.
- `rafTimestampMs`: 해당 rAF callback이 전달받은 timestamp.
- `inputDeviceKind`: `keyboard | gamepad | rc_joystick`.
- `normalizedPilotInput`: 장치 보정 후·Easy assist 전 조종자 명령.
- keyboard: `keysDown`에 눌린 키 코드를 정렬된 배열로 저장하고 `rawAxes/rawButtons=null`.
- gamepad/rc_joystick: `rawAxes`, `rawButtons`와 `normalizedPilotInput`을 동시에 저장하고 `keysDown=null`.

`inputReadMonotonicMs`와 `rafTimestampMs`는 서로 다른 의미를 가지므로 하나로 합치지 않는다.

### 3.2 물리 tick 입력 `inputs`

매 physics tick에 다음 M1 논리 필드를 한 row에 함께 보존한다.

- `tick`
- `pilotInput`: 사람 입력. 장치 보정 후, Easy assist 전.
- `appliedInput`: 실제 `step()`에 전달된 권위 있는 입력.
- `controlMode`
- `assistVersion`
- `assistTargets`

Easy에서는 `assistTargets`가 반드시 존재한다.

```text
horizontalVelocityWorldMps: [vx, vz]
verticalVelocityMps
yawRateRadPerSec
```

Acro에서는 `assistTargets=null`이다. Easy 재시뮬레이션 시 `appliedInput`에 assist를 다시 적용하지 않는다.

### 3.3 강체 상태 `states`

초기 상태 1개 + 매 physics tick 이후 상태를 저장한다. 최소 필드는 다음이며 현재 shared physics `State` 전체를 보존한다.

- tick
- position
- velocity
- orientation
- omega
- integral
- previousOmega
- derivative
- motors
- charge
- voltage
- thrustN
- targetOmega
- acceleration

N inputs ↔ N+1 states를 강제한다.

### 3.4 제어기 상태 `controller_states`

재시뮬레이션에 필요한 숨은 상태를 initial state 포함 매 상태 tick에 저장한다.

- tick
- integral
- previousOmega
- derivative
- motors
- charge
- voltage
- thrustN
- targetOmega
- acceleration

개수는 `states`와 같아야 한다.

### 3.5 이벤트 `events`

`(tick, sequence)` 순서로 안정적으로 정렬한다.

M2 이벤트:

- `lap_start`
- `gate_pass`: gate ID/index와 당시 position 포함.
- `collision`: collision 당시 position 포함.
- `lap_complete`
- `lap_abort`: aborted 또는 invalid 종료 사유 포함.

정상 complete에는 `lap_complete`, 중단/무효 종료에는 `lap_abort`가 있어야 한다. collision으로 invalid가 된 기록에는 `collision`도 반드시 존재한다.

### 3.6 카메라 변경 `camera_changes`

카메라 투영/보조 조건이 바뀔 때만 저장한다.

- tick
- cameraMode
- verticalFovRad
- aspectRatio
- viewportWidth/Height
- devicePixelRatio
- artificialHorizonEnabled
- heightAssistEnabled

M2에서는 카메라/보조 변경이 현재 랩을 중단하고 새 파티션으로 시작하므로 일반적인 complete 랩은 하나의 카메라 조건을 갖는다.

## 4. 필수 메타데이터

첫 JSONL line은 `channel="metadata"`이며 다음을 포함한다.

| 필드 | 계약 |
|---|---|
| schemaVersion | `0.1.6` |
| recordingFormat | `drone-lap-jsonl-gzip-v1` |
| recordingId / sessionId | 충돌 방지 ID. session은 같은 탭 세션 동안 유지 |
| createdAtUtc | ISO 8601 UTC |
| track | ID, version, 전체 snapshot, SHA-256 |
| ruleset | ID, version, ordered-gate 규칙 snapshot, SHA-256 |
| aircraftProfile | ID, version, 전체 profile snapshot, SHA-256 |
| rates | Betaflight model과 rcRate/superRate/expo/maxRateRadS |
| inputDeviceKind | `keyboard / gamepad / rc_joystick` |
| inputDevice | mapping, browser mapping, 축/버튼 수, 보정값. 일련번호는 저장하지 않음 |
| display | refresh/render FPS 추정, viewport, devicePixelRatio |
| physicsVersion | 현재 3 |
| physicsHz | 240 |
| controlProfile | mode, assistVersion, Easy일 때 ASSIST_SETTINGS snapshot |
| testerMode | `?tester=1` 활성 여부 |
| publicLeaderboardEligible | complete이고 tester가 아닌 기록만 true |
| trainingUse | `stick_pattern / flight_method` |
| seed / prng | 현재 결정적 물리에서 `0 / none` |
| initialState | 완전한 초기 physics state |
| environment | gravity와 wind. 현재 wind=[0,0,0] |
| camera | mode, projection, viewport, near/far, 재현 가능한 카메라 조건 |
| practiceAssist | heightAssistEnabled |
| clientBuild | Vite build에 주입된 Git commit SHA. 로컬 개발은 `dev` 가능 |
| runtime | userAgent/language. 이름·이메일·IP·장치 일련번호는 넣지 않음 |
| consent | granted/scope/policyVersion/grantedAtUtc. M2 기본값은 미동의 |
| outcome | complete/invalid/aborted, finalTick, seconds, completedGates, reason |
| partitionKey | §5의 키 |
| payloadSha256 | metadata line을 제외한 정확한 비압축 JSONL payload bytes의 SHA-256 |

트랙/ruleset/profile snapshot도 canonical JSON 기준 SHA-256을 저장한다.

## 5. 파티션 키

M1의 단일 `dataPartitionKey()`를 계속 사용한다.

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

Acro의 assist version은 `none`이다. 조건이 하나라도 다르면 다른 학습/비교 파티션이다.

## 6. training_use

M1 `classifyTrainingUse()`가 유일한 판정 함수다.

```text
if control_mode == acro
and input_device_kind in {gamepad, rc_joystick}
and assist_version is none
and every tick has pilotInput == appliedInput:
    stick_pattern
else:
    flight_method
```

- keyboard + Easy → `flight_method`
- keyboard + Acro → `flight_method`
- gamepad/RC + Easy → `flight_method`
- gamepad/RC + Acro direct stick → `stick_pattern`
- tester 여부는 training_use 조건이 아니다.
- 원본은 training_use와 관계없이 보존한다.
- `stick_pattern` 내보내기는 저장 라벨만 믿지 않고 동일 판정 함수를 재검증한다.

## 7. M2 파일 형식과 무결성

파일명:

```text
lap_<recording_id>.jsonl.gz
```

압축을 풀면 UTF-8 JSONL이다.

```jsonl
{"channel":"metadata", "schemaVersion":"0.1.6", "...":"..."}
{"channel":"frames", "frameSequence":0, "...":"..."}
{"channel":"inputs", "tick":0, "pilotInput":{}, "appliedInput":{}, "...":"..."}
{"channel":"states", "tick":0, "state":{}}
{"channel":"controller_states", "tick":0, "...":"..."}
{"channel":"events", "tick":0, "sequence":0, "type":"lap_start", "payload":{}}
```

행 순서는 파일 생성 시 채널별 묶음으로 쓸 수 있으며, 채널 내부 순서는 반드시 sequence/tick 순서를 지킨다. 논리적 시간 결합은 tick/frameSequence를 사용한다.

`payloadSha256`는 첫 metadata line을 제외하고 뒤따르는 비압축 JSONL payload를 정확한 UTF-8 bytes로 해시한다. 파일 손상/수정을 검출한다.

### 예상 용량

240 Hz에서 전체 state/controller state를 JSON으로 보존하는 보수적 계획값:

| 랩 길이 | 비압축 예상 | gzip 예상 |
|---:|---:|---:|
| 30초 | 7–10 MB | 1.5–3.5 MB |
| 60초 | 14–20 MB | 3–7 MB |
| 90초 | 21–30 MB | 4.5–10 MB |

브라우저/입력장치와 주행 패턴에 따라 달라진다. 실제 장시간 랩의 측정치는 M3 용량 시험에서 다시 기록한다.

## 8. 로컬 저장

랩 원본은 IndexedDB `drone-recordings / laps`에 저장한다. `localStorage`는 랩 저장에 사용하지 않는다.

IndexedDB row에는 목록용 summary와 gzip Blob을 함께 둔다.

- recordingId
- createdAtUtc
- trackId
- partitionKey
- seconds
- outcome
- trainingUse
- testerMode
- publicLeaderboardEligible
- compressedBytes / uncompressedBytes
- gzip Blob

목록 조회는 gzip 전체를 해제하지 않고 summary만 사용한다. 재생/내보내기 시에만 Blob을 읽는다.

## 9. 고스트와 재시뮬레이션

### 9.1 최고랩 고스트

자동 최고랩은 **현재 partitionKey와 정확히 같은 complete 기록** 중 최소 lap time을 사용한다. 다른 physics version, 장치, Easy/Acro, tester 조건을 섞지 않는다.

고스트는 반투명 드론이며 플레이어 물리/충돌에 영향을 주지 않는다.

### 9.2 상태 재생

저장된 `states`를 시뮬레이션 경과 시간에 따라 재생한다. 이 경로는 기록된 결과 자체를 보여 주는 기준 ghost다.

### 9.3 입력 재시뮬레이션

`initialState + recorded appliedInput[] + 동일 physicsVersion`으로 shared TypeScript `step()`을 다시 실행한다. Easy에서도 assist를 다시 계산하지 않는다.

현재 구현은 `physicsVersion=3` 재시뮬레이션을 지원한다. 지원하지 않는 과거 physics version은 오류를 표시하고 최신 물리로 조용히 대체하지 않는다.

화면에는 recorded-state ghost와 re-simulation 사이의 현재 position error 및 최대 position error를 m 단위로 표시한다.

### 9.4 회귀 허용 오차

동일 JS shared physics와 동일 profile을 사용하는 deterministic fixture 3개에서 현재 기준은 다음과 같다.

```text
position <= 1e-9 m
velocity <= 1e-9 m/s
orientation quaternion Euclidean error <= 1e-10
angular velocity <= 1e-9 rad/s
```

테스트를 통과시키기 위해 이 수치를 임의로 느슨하게 만들지 않는다. 브라우저/플랫폼 간 실제 export에서 더 큰 오차가 확인되면 원인과 측정값을 기록하고 사용자 승인 후 명세 버전을 올린다.

## 10. 검증 도구

```bash
python3 tools/validate.py lap_<recording_id>.jsonl.gz
```

Python validator는 표준 라이브러리만 사용하며 다음을 검사한다.

- gzip/UTF-8/JSONL
- schemaVersion 및 필수 metadata
- 유한 숫자
- payload 및 snapshot SHA-256
- 허용 channel
- input/state/controller tick 및 N/N+1 관계
- Easy assistTargets / Acro null 정책
- frame sequence와 monotonic timestamp
- keyboard key-state / joystick raw axes 존재
- event sequence 및 terminal event
- partitionKey
- trainingUse 재판정
- tester/public leaderboard 규칙

Python에 physics를 복제하지 않는다. 실제 재시뮬레이션 정확성은 shared TypeScript physics 회귀 테스트가 담당한다.

## 11. 동의·학습 내보내기

- 로컬 원본 저장과 학습 동의는 별개다.
- M2 metadata의 consent 기본값은 미동의다. M4 동의 UI/정책 구현 전 학습 데이터셋 자동 배포 대상으로 간주하지 않는다.
- 학습 내보내기는 수집 시 동의와 최신 철회 상태를 모두 확인해야 한다.
- 이름·이메일·IP·장치 일련번호를 학습 파일에 넣지 않는다.
- 같은 플레이어/세션/랩이 train/validation/test에 중복되지 않도록 그룹 단위 분할한다.
- `stick_pattern` 데이터셋에 `flight_method`가 들어갈 수 없다.

## 12. M3에서 검증할 항목

- 실제 30/60/90초 랩 gzip 용량과 IndexedDB quota 여유
- 240 Hz 기록 CPU/메모리 비용
- 브라우저 간 재시뮬레이션 수치 오차
- rAF 입력 관측과 영상 frame 시간 정렬
- 카메라 pose/renderer 버전과 영상 재현성
- 60 Hz 학습 행동 다운샘플 정책
- 깊이/분할/게이트 코너 파일 포맷
- 기록 압축/스트리밍 최적화 필요성

## 변경 이력

- **0.1.6 (2026-09-26)**: M2 영속 기록 구현. 매 rAF 입력 관측과 시각, 매 physics tick authoritative input/state/controller state/Easy assist target, gate/collision/complete/abort events, 필수 metadata를 한 랩 단위 gzip JSONL로 저장. IndexedDB 저장, SHA-256 무결성, 상태 고스트/입력 재시뮬레이션, Python validator 및 3개 deterministic fixture 허용 오차를 명시.
- 0.1.5 (2026-09-26): input_device_kind/physics_version/tester_mode를 파티션에 추가하고 training_use와 Easy assist_targets 규칙을 추가.
- 0.1.4 (2026-09-26): 시각/충돌 정합화, physics_version=3, track v2, camera/horizon/height-assist partition 추가.
- 0.1.3 (2026-09-26): pilot/applied 입력 이중 기록, Easy/Acro 분리, 카메라 projection metadata 추가.
- 0.1.2 (2026-09-26): Easy assist 도입, physics_version=2.
- 0.1.1 (2026-09-26): M1 physics_version=1 및 rates 단위 구체화.
- 0.1.0: 최초 초안.
