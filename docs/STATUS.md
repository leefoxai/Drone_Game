# 프로젝트 상태

갱신: 2026-09-26 (Asia/Seoul)

## 현재 단계

M0 완료. **M1 비행 프로토타입 및 안정화 완료.**
M2 기록·고스트는 아직 시작하지 않았다.

이번 변경은 M1 코어를 다시 여는 것이 아니라 **현재 제품 공개 정책과 학습 데이터 용도 규칙을 추가한 상태**다.

## 현재 공개 제품 방향

기본 배포 URL에서는 다음만 공개한다.

- `keyboard`
- Easy / assisted
- 두 트랙
- 3인칭 / FPV
- 인공 수평선 / 높이 차 보조

다음 기능은 삭제하지 않고 `?tester=1`에서만 활성화한다.

- Acro
- Gamepad
- RC joystick
- 축 보정/반전/끝점/deadzone
- Rates 설정

기본 모드에서는 관련 UI가 보이지 않으며, 저장된 조종기 설정이나 UI change 우회로 Acro/Gamepad를 활성화하지 못하게 런타임에서도 Easy + keyboard를 강제한다.
`?tester=1`은 인증이 아니라 초대 테스터용 기능 플래그다.

## 기록 및 학습 용도 정책

기록 계약은 기존 M1 `telemetry.ts`와 `docs/data_spec.md`를 확장해 사용한다. 별도 형식을 만들지 않았다.
현재 스키마는 **0.1.5**다.

원본 유효 랩은 `training_use`와 관계없이 모두 보존한다.
`training_use`는 원본 삭제 기준이 아니라 학습 용도 라벨이다.

### 파티션 키

최소 다음 조건을 포함한다.

- track ID
- control mode
- `inputDeviceKind`: `keyboard` / `gamepad` / `rc_joystick`
- `physicsVersion`
- aircraft profile version
- assist version
- camera mode
- artificial horizon enabled
- height assist enabled
- tester mode

따라서 키보드/조이스틱 랩과 서로 다른 physics version의 랩이 같은 파티션에 섞이지 않는다.

### training_use

`classifyTrainingUse()` 하나를 단일 판정 기준으로 사용한다.

- `stick_pattern`: `gamepad` 또는 `rc_joystick` + Acro + assist 없음 + 모든 tick에서 `pilotInput === appliedInput`
- `flight_method`: 그 밖의 모든 유효 랩

따라서 다음은 모두 `flight_method`다.

- keyboard + Easy
- keyboard + Acro
- gamepad + Easy
- rc_joystick + Easy

`stick_pattern` 내보내기는 라벨만 신뢰하지 않고 동일 판정 함수를 다시 적용해 `flight_method` 랩 유입을 차단한다.
원본 배열 자체는 변경하거나 삭제하지 않는다.

### Easy assist targets

Easy에서는 기존 assist 동작을 바꾸지 않고 매 physics tick에 다음 목표값을 추가 기록한다.

- `horizontalVelocityWorldMps: [vx, vz]`
- `verticalVelocityMps`
- `yawRateRadPerSec`

`flight_method` 학습에서는 궤적·속도 및 이 목표값을 사용할 수 있고, Easy의 `appliedInput`을 사람의 직접 스틱 패턴 정답으로 취급하지 않는다.

### tester 기록

- `testerMode`를 텔레메트리/파티션에 포함
- `testerMode=true` 랩은 향후 공개 리더보드 대상에서 제외
- 원본 보존 및 학습 용도 분류와 공개 순위 자격은 별개

## M1 기반 버전

- `PHYSICS_VERSION=3`
- aircraft profile version 2
- `training-five-v2`
- `race-five-v2`
- `ASSIST_VERSION=1`
- `schema_version=0.1.5`

## 자동 검증 범위

기존 M1 테스트를 삭제하지 않고 다음을 추가/변경했다.

- 공개 URL에서 Acro/Input source/조종기 보정/Rates UI 숨김
- 공개 URL에서 Easy + keyboard 강제 및 UI change 우회 차단
- `?tester=1`에서 기존 Acro/Gamepad/RC/보정/Rates 기능 복원
- 기존 Acro 물리/rates 테스트 유지
- 기존 Gamepad/RC 보정 테스트 유지
- 입력 장치 종류별 파티션 분리
- physics version별 파티션 분리
- tester/public 파티션 분리
- keyboard Acro가 `stick_pattern`으로 분류되지 않음
- gamepad/RC + Easy가 `stick_pattern`으로 분류되지 않음
- gamepad/RC + Acro 직접 입력만 `stick_pattern`
- Easy assist 목표 속도/요율 기록
- 기존 `assistedInput()`과 새 telemetry 노출 경로의 applied input 동일성
- stick_pattern 내보내기에서 flight_method 강제 제외
- tester 랩 공개 순위 제외 규칙

## M1 완료 이력

- [x] M1 기존 자동 테스트/배포 게이트 통과
- [x] `training-five-v2` 배포 실행 확인
- [x] `race-five-v2` 배포 실행 확인
- [x] 대회용 트랙 3인칭에서 사용자가 게이트 높이 판단 가능 확인
- [x] 대회용 트랙 FPV에서 사용자가 게이트 높이 판단 가능 확인

**M1 완료 판정: 2026-09-26.**

## 다음 단계

1. 이번 공개 기능 플래그/학습 용도 변경의 최신 `npm test`와 GitHub Pages 배포를 확인한다.
2. 이후 M2 · 기록/고스트로 진행한다.
3. Acro 공개는 ROADMAP의 별도 조건부 마일스톤 기준을 만족할 때 진행한다.

## 알려진 한계

- `?tester=1`은 인증/권한 제어가 아니다.
- 실제 USB 조종기/게임패드의 모든 하드웨어 호환성은 자동 테스트로 대체할 수 없다.
- M1 telemetry는 세션 메모리 수준이며 파일 저장·고스트·재시뮬레이션은 M2 범위다.
- 서버 업로드·계정·공개 리더보드는 아직 구현하지 않았다. `publicLeaderboardEligible`는 M4 서버 구현 시 반드시 서버에서도 검증해야 한다.
