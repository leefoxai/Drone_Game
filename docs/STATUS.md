# 프로젝트 상태

갱신: 2026-09-26 (Asia/Seoul)

## 현재 단계

- M0 완료.
- M1 비행 프로토타입 및 안정화 완료.
- **M2 기록·고스트 완료.**
- **M3 파이프라인 시험 진행 중 — Phase 1 학습 활용 동의 기능 구현·배포 완료, 사용자 동의 기록 3~5랩 생성 대기.**

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
- recording schema `0.1.6`
- recording container `drone-lap-jsonl-gzip-v1`

## M2 완료

M1 `telemetry.ts`와 `data_spec`의 필드·partition·training_use 계약을 확장해 다음을 완료했다.

- rAF frame 입력 관측
- 240 Hz physics tick 입력/state/controller state/Easy assist target
- gate/collision/complete/abort events
- data_spec 필수 metadata와 SHA-256
- 한 랩 단위 gzip JSON Lines
- IndexedDB 영속 저장
- 기록 목록/replay/export/delete
- same-partition personal-best ghost
- recorded-state / authoritative-input re-simulation ghost
- position error UI
- `tools/validate.py`
- deterministic fixture 3개 validator + re-simulation regression

실제 사용자 export도 schema 0.1.6 validator를 통과했다.

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

**M2 완료 판정: 2026-09-26.**

## M3 Phase 1 · 최소 학습 활용 동의

M3의 실제 BC 학습에는 동의된 사용자 기록이 필요하므로 정식 M4 동의 시스템 전에 최소 로컬 동의 기능을 먼저 추가했다.

기록 화면:

```text
□ 내 비행 기록을 AI 학습 시험에 활용하는 데 동의합니다.
```

정책:

- 최초 기본값 OFF
- 체크 상태는 로컬 설정으로 보존
- 랩이 실제 시작되는 순간의 동의 상태를 recording metadata에 snapshot
- 진행 중 랩에서 체크 상태를 바꿔도 해당 랩 metadata는 바뀌지 않음
- 변경 상태는 다음 새 랩부터 적용
- 과거 IndexedDB 기록은 소급 변경하지 않음
- OFF 기록도 원본 로컬 기록으로는 보존 가능
- M3 학습 export는 이후 `consent.granted=true` 및 허용 scope를 강제할 예정

동의 metadata는 기존 data_spec 0.1.6 필드를 그대로 사용하므로 이번 단계에서 schema version은 올리지 않았다.

동의 ON snapshot:

```text
consent.granted = true
consent.scope = ["local_bc_training"]
consent.policyVersion = "m3-local-training-v1"
consent.grantedAtUtc = <동의 시각 UTC>
```

동의 OFF snapshot:

```text
consent.granted = false
consent.scope = []
consent.policyVersion = null
consent.grantedAtUtc = null
```

자동 테스트:

- 최초 OFF
- ON 상태 reload 유지
- OFF 복귀
- 진행 중 랩 비소급
- 다음 랩부터 ON 적용
- 다시 OFF한 다음 랩은 OFF
- 기존 M1/M2 회귀 전체

검증 commit:

```text
f0dd05d43669930b4b03390e2ab28fc4a48f4ee7
```

GitHub Actions:

```text
run 36239918319
36 tests passed
production build success
GitHub Pages deploy success
```

## M3 다음 작업을 위한 사용자 기록

Phase 1 배포 후 사용자가 다음 순서로 기록한다.

1. 기록 화면의 학습 활용 동의를 ON.
2. 가능하면 `race-five-v2` / keyboard / Easy / FPV / 같은 보조 설정을 유지.
3. complete lap 3~5개를 기록.
4. 각 랩을 `.jsonl.gz`로 내보냄.
5. 저장소 로컬의 `local_data/m3/source/` 아래에만 저장.
6. Git에는 기록 파일을 추가하지 않음.

사용자 기록이 준비되면 다음 단계에서 실제 파일의 채널별 byte breakdown과 30/60/90초 환산을 먼저 수행한다.

## M3 기록 형식 개선 목표

현재 실제 M2 export는 약 26.6초에 gzip 3.70 MB 수준이었다. 단순 60초 환산은 약 8 MB대로, M4 업로드/저장에는 크다.

M3에서는 학습 정보와 authoritative-input 재시뮬레이션 검증을 유지하면서 **60초 gzip 약 1 MB**를 목표로 형식 개선을 검토한다.

우선 검토 항목:

- 240 Hz `appliedInput`과 Easy `assistTargets`는 유지
- full state를 매 tick 저장하는 방식에서 initial/full checkpoint + authoritative input 방식으로 변경 검토
- `states`와 `controller_states` 중복 제거 검토
- input row chunking으로 JSON key 반복 제거
- 매 frame camera pose의 재구성 가능성 검증 후 중복 제거 검토

breaking change를 채택하면 schema version을 올리고 recorder/codec/sample/validator/ghost/regression을 동시에 갱신한다.

## M3 학습 규칙

현재 사용자의 키보드 + Easy 기록은 `flight_method`다.

BC label은 **`appliedInput`이 아니다.**

정답은 data_spec의 Easy `assistTargets`:

```text
horizontalVelocityWorldMps [vx, vz]
verticalVelocityMps
yawRateRadPerSec
```

모델 출력도 같은 target 4개이며, 봇은 예측 target을 기존 Easy 보조 장치의 제어 단계에 넣어 실제 `appliedInput`을 계산한 뒤 physics를 진행한다.

`stick_pattern`은 M3에서 모델 학습하지 않는다. 기존 tester fixture로 export 가능 여부와 `flight_method` 누출 0건만 검사한다.

## local_data 정책

다음은 모두 `local_data/` 아래에서만 관리하고 Git에 커밋하지 않는다.

- 실제 recording
- 렌더 MP4
- frame/input 대응표
- benchmark 결과
- dataset export
- 학습 결과/metric
- 모델 checkpoint

봇 추론 확인도 production Pages가 아니라 로컬 개발 서버에서만 수행한다.

## 알려진 한계

- 브라우저별 IndexedDB quota는 다르다. 장시간/다량 기록 한도는 M3에서 측정한다.
- 현재 input re-simulation은 physics v3만 지원한다.
- M2 schema 0.1.6은 용량 최적화 전 형식이다.
- 실제 RC/Gamepad 하드웨어 호환성은 자동 테스트로 완전히 대체할 수 없다.
- `?tester=1`은 인증이 아니다.
- 현재 동의 UI는 **M3 로컬 학습 시험용 최소 구현**이다. 계정 연동, 동의 version 이력, 철회 정책 등 정식 동의 기능은 M4에서 확장한다.
- 서버 업로드, 계정, 공개 leaderboard는 M4 범위다.
