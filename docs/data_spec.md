# 드론 플레이 기록 명세 초안

상태: **설계 초안, 기록기는 미구현**. `schema_version: "0.1.3"`.
M1~M3에서 검증하고 M3의 소량 파이프라인 시험을 통과한 뒤 형식을 확정한다.
이 문서가 기록 형식의 기준이다. 변경 전 사용자에게 알리고 스키마 버전을 올린다.
물리 계산을 바꿀 때는 별도로 `physics_version`도 올린다.

## 1. 원칙과 시간

- 원본은 입력·상태·이벤트 로그다. 영상/학습 라벨은 원본에서 파생한다.
- 물리: **240 Hz 초안**, `dt = 1/240 s`. `tick`은 0부터 시작하는 정수다.
- `state[0]`은 초기 상태다. `input[k]`는 `[k*dt, (k+1)*dt)`에 적용하고 결과는 `state[k+1]`이다.
  N개 입력에 N+1개 상태가 대응한다. 종료 이벤트는 마지막 상태의 tick에 기록한다.
- 시뮬레이션 시간 `t_s = tick / physics_hz`가 기준이며 wall clock이나 화면 프레임 시간을 적분하지 않는다.
- 화면 렌더는 requestAnimationFrame, 재렌더 영상은 **60 fps 초안**이다. 화면 주사율과 물리 Hz를 혼동하지 않는다.
- 렌더 사이에 새 입력이 없으면 마지막 입력을 유지하되 매 물리 tick에 실제 적용한 입력을 기록한다.
- 탭 비활성화/장치 분리/긴 정지는 중단 이벤트와 이유를 남기고 해당 경쟁 주행을 무효 처리하는 방향으로 검증한다.
  시간을 건너뛰어 정상 랩처럼 기록하지 않는다. 재개/로컬 연습 정책은 M1~M2에서 룰셋으로 확정한다.

## 2. 좌표계·단위·수치

- SI 단위: 거리 m, 시간 s, 속도 m/s, 가속도 m/s², 질량 kg, 힘 N, 토크 N·m, 각도 rad, 각속도 rad/s.
- 오른손 좌표계. 월드 +X 오른쪽, +Y 위, -Z 전방. 기체 로컬 축도 +X 오른쪽, +Y 위, -Z 전방.
- 자세는 기체→월드 회전 단위 쿼터니언 `[x, y, z, w]`. 항등은 `[0, 0, 0, 1]`.
- 양의 회전은 오른손 법칙. 로컬 축 각속도 `[wx, wy, wz]`: 피치 +X, 요 +Y, 롤 +Z.
  양의 피치는 기수 위, 양의 요는 기수 왼쪽, 양의 롤은 오른쪽 날개 위를 뜻한다.
  장치 반전 설정은 보정 메타데이터에 둔다. 조작 UI와의 연결은 M1에서 직접 확인한다.
- 튜닝 UI가 deg/s를 표시해도 저장되는 rates의 단위는 rad/s로 통일하고 표시 단위를 명시한다.
- JSON 숫자는 유한 값만 허용한다. NaN/Infinity, 음수 tick, 중복/누락 tick은 거부한다.
- 고정 스텝만으로 모든 CPU/브라우저의 비트 단위 동일성을 보장하지 않는다. M2에서 위치/자세/속도 오차와
  게이트·완주 판정 기준을 측정해 버전별 검증 허용 오차를 정한다. 허용 오차는 기록 제출자가 지정하지 않는다.

## 3. 기록 채널

| 채널 | 주기 | 필드 초안 | 단위/의미 |
|---|---|---|---|
| 적용 입력 `inputs` | 매 물리 tick, 240 Hz | tick, throttle, roll, pitch, yaw | throttle [0,1], 나머지 [-1,1], 장치 보정 및 선택적 조종 보조를 거친 물리 엔진의 실제 입력 |
| 조종자 명령 `pilot_inputs` | 매 물리 tick, 240 Hz | tick, throttle, roll, pitch, yaw | 장치 보정 후·조종 보조 전 값. Acro는 inputs와 동일. 쉬운 조종의 throttle 0.5는 수직 속도 0 요청 |
| 강체 상태 `states` | 초기 상태 + 매 물리 tick | tick, position_world, orientation_body_to_world, velocity_world, angular_velocity_body | m, 쿼터니언, m/s, rad/s |
| 제어기 상태 `controller_states` | 초기 + 매 물리 tick | tick, 목표 각속도, 적분기·필터 상태, 모터/액추에이터 상태 | 각각 단위 명시; 물리 구현에서 필드 확정, 숨은 상태도 재현 가능하게 저장 |
| 이벤트 `events` | 발생 시 | tick, sequence, type, payload | 출발, 게이트 통과, 충돌, 리셋, 완주, 중단, 장치 분리 등 |
| 진단 `diagnostics` | 선택, 30 Hz 초안 | tick, render_dt_s, input_age_s, physics_steps | s 및 개수; 경쟁 판정/물리 입력에는 사용하지 않음 |
| 원시 장치 입력 `raw_inputs` | 선택, 관측될 때 | observation_seq, simulation_tick, axes, buttons, monotonic_time_s | 보정 전 값과 관측 시각, 적용 입력과 별도 |

권위 있는 재현 입력은 `inputs`다. M1 런타임에서도 매 물리 tick에 **사람이 넣은 `pilot_inputs`와 실제 물리에 전달된 `inputs`를 동시에 보존**하고, 각 샘플에 `control_mode`와 `assist_version`을 연결한다. 원시 입력과 진단은 누락 가능하며 이를 필수 물리 입력으로 삼지 않는다.
쉬운 조종 기록을 재시뮬레이션할 때 `inputs`에 보조기를 다시 적용하지 않는다.
사람의 선택을 학습할 때는 `pilot_inputs`와 조종 모드를 확인하고, 자동 보정된 값을 사람의 직접 조종으로 잘못 표시하지 않는다.
상태만 읽는 고스트 재생과 입력을 다시 계산하는 서버 검증을 구분한다.
이벤트 순서는 `(tick, sequence)`로 안정적으로 정렬하고 충돌/통과의 위치·대상 ID를 payload에 기록한다.
최종 랩타임은 출발/완주 tick과 룰셋에서 계산한다. 클라이언트 제출 점수를 그대로 신뢰하지 않는다.

## 4. 필수 메타데이터

| 필드 | 내용 |
|---|---|
| schema_version | 기록 구조 버전. 이 초안은 0.1.3 |
| recording_id, session_id | 충돌 방지 ID. 세션/랩 분할 및 중복 검사에 사용 |
| created_at_utc | UTC ISO 8601 시각. 시뮬레이션 시간과 별도 |
| track | 트랙 ID, 버전, 콘텐츠 해시. 게이트 순서와 좌표를 재현할 수 있는 불변 자산 참조 |
| ruleset | ID, 버전, 모드, 페널티, 완주 조건, 설정 스냅샷/해시 |
| aircraft_profile | ID, 버전, 질량·관성·모터·항력 등 전체 설정 스냅샷/해시 및 단위 |
| rates | 모델 ID/버전, roll/pitch/yaw의 최대 각속도(rad/s), 전체 파라미터. M1의 Betaflight식 곡선은 rcRate, superRate, expo(모두 무차원)를 사용하며 최대 각속도는 곡선 끝점에서 산출한다. 현재 세 축 공통 |
| input_device | 종류(gamepad/usb-controller 등), 브라우저 장치 매핑 정보, 축/버튼 매핑, 반전·데드존·끝점 보정. 일련번호는 수집하지 않음 |
| display | 화면 주사율 추정치(Hz, 알 수 없으면 null), 측정 방법, 실제 렌더 fps, 뷰포트 크기, devicePixelRatio. 추정치를 모니터 사양으로 단정하지 않음 |
| physics_version | 사용한 공유 물리의 불변 버전과 소스 커밋. 현재 M1은 정수 2(첫 Acro 계산 1 → 쉬운 조종 보조기 추가 2). 파라미터 변경은 전체 프로파일 스냅샷에도 반영 |
| control_profile | mode: acro 또는 assisted, 보조기 버전 및 전체 설정. M1 assisted v1은 수평 목표 속도 4 m/s, 수직 목표 속도 ±2 m/s, 요 각속도 최대 π/3 rad/s. 게인·가속 제한도 packages/physics의 ASSIST_SETTINGS 스냅샷으로 남김 |
| physics_hz | 고정 물리 주기. 초안 240 |
| seed, prng | 난수 시드와 알고리즘/버전. Math.random/실제 시계를 물리에서 사용하지 않음 |
| initial_state | 강체·제어기·모터·환경의 완전한 초기 상태. states[0] 등과 일치 |
| environment | 중력 벡터(m/s²), 바람(m/s), 기타 물리에 영향을 주는 설정/버전 |
| camera | 기체 상대 위치(m), 자세, **수직 FOV(vertical FOV, rad)**, 화면 비율(aspect ratio), 뷰포트 width/height(px), devicePixelRatio, near/far(m). 같은 투영 화면을 다시 만들 수 있도록 FOV 단독 저장을 금지 |
| client_build, runtime | 클라이언트 커밋/빌드, 브라우저/OS 버전. 불필요한 개인 식별 정보 제외 |
| consent | granted(boolean), scope, policy_version, granted_at_utc 또는 null. 기본 미동의 |
| outcome | complete/aborted/invalid, 마지막 tick, 게이트 결과, 중단 이유. 서버 검증 결과와 구분 |

랭킹 비교 키에는 최소 트랙 버전·룰셋 버전·physics_version을 포함한다.
조종 모드와 보조기 버전도 분리한다. **쉬운 조종과 Acro는 순위와 학습 데이터 모두 별도 파티션**으로 취급하며 기본 Acro 학습 데이터에 assisted 기록을 섞지 않는다. 파티션 키는 최소 `track_id + control_mode + aircraft_profile_version + assist_version`을 포함한다. Acro의 assist_version은 null/none이다.
기체/rates 자유 조정 허용 여부도 룰셋으로 정하고 필요한 경우 비교 키에 반영한다.
설정은 ID만으로 끝내지 않고 스냅샷 또는 내용 주소(해시)로 과거 값을 찾을 수 있게 한다.

## 5. 저장 구조 초안

처음에는 UTF-8 JSON/JSONL로 검사하기 쉽게 만들고 압축·이진화는 M3의 크기 측정 후 결정한다.
아래는 향후 기록기 출력 예시이며 이번 세션에 생성하거나 구현하지 않는다.

```text
recordings/<recording_id>/
  manifest.json           # 메타데이터, 파일별 SHA-256, 샘플 수, 종료 상태
  inputs.jsonl           # N개 적용 입력
  pilot_inputs.jsonl     # N개 조종자 명령 (보조 전)
  states.jsonl           # 초기 상태 포함 N+1개
  controller_states.jsonl
  events.jsonl
  diagnostics.jsonl      # 선택
  raw_inputs.jsonl       # 선택
```

기록 종료 시 완전한 manifest를 생성하며, 불완전한 기록은 완료 기록으로 취급하지 않는다.
크기 제한, 필수 키, 샘플 개수, 유한 수치, tick 순서, 해시를 검증한다.
버전 미지원 기록은 이유를 알려 거부하거나 별도 마이그레이션한다. 조용히 최신 버전으로 해석하지 않는다.
서버 검증 결과는 별도 파일/DB 필드에 검증기 버전·오차·통과 여부와 함께 저장한다.

## 6. 영상과 학습 라벨 연결

- 60 fps일 때 프레임 j의 관측 시각은 `t_s = j/60`, 물리 tick은 `4*j`이다.
  기본 프레임 수는 `floor(duration_s * fps)`이며 마지막 시각은 종료 시각 미만이다.
- 관측은 입력 적용 전 `state[k]`를 렌더링하고 행동 라벨은 같은 k의 `input[k]`로 연결한다.
  240 Hz 입력 전체는 보존한다. 60 Hz 봇의 행동 유지/다운샘플 정책은 M3에서 비교 후 버전 명시한다.
- 비정수 주기 조합은 프레임마다 state 양쪽 tick과 보간 비율을 남긴다. 위치는 선형, 자세는 slerp 초안.
  물리 재시뮬레이션에는 렌더 보간 값을 쓰지 않는다.
- `frames.jsonl`에 frame_index, timestamp_s, source_tick, recording_id, 관측/행동 대응,
  카메라 내·외부 파라미터, renderer_version, 자산 해시를 기록한다.
- MP4: RGB 영상, fps·크기·코덱·색 공간 기록. 원본 로그를 대체하지 않는다.
- 깊이: 카메라 전방 축 방향 거리(m), float32, 배경은 0 + 별도 유효 마스크. 비선형 GPU depth 값과 구분한다.
- 분할: 픽셀마다 정수 클래스/인스턴스 ID, 배경 0, ID 사전과 버전을 함께 저장한다. 손실 압축을 사용하지 않는다.
- 게이트 코너: track에서 정한 로컬 꼭짓점 순서의 네 월드 좌표 및 픽셀 좌표,
  gate_id, 화면 안/밖·카메라 앞/뒤·가림 여부. 픽셀 원점은 좌상단, u 오른쪽/v 아래, 픽셀 중심은 (0.5,0.5).
  보이지 않는 점을 화면 가장자리로 강제 이동시키지 않는다.
- RGB·깊이·분할·코너는 같은 카메라/상태/시각에서 생성한다. 파일 이름만으로 정렬하지 않는다.

## 7. 동의·선별·데이터 분할

- 동의가 없거나 필드가 누락되면 학습용 내보내기를 거부한다. 랭킹 공개와 학습 동의는 별개다.
- 수집 시점의 동의 스냅샷과 서버의 최신 동의/철회 상태를 모두 확인한다.
  철회된 기록은 이후 내보내기에서 제외한다. 이미 배포한 데이터의 처리 절차는 M4 정책 검토에서 확정한다.
- 이름·이메일·IP·장치 일련번호를 학습용 파일에 넣지 않는다. 익명화된 분할용 ID도 접근 범위를 제한한다.
- 검증 통과 + 동의 + 조건이 같은 상위 기록을 선택한다. 컷오프, 제외 사유, physics/schema 버전을 남긴다.
- 같은 플레이어/세션/랩이 학습·검증·평가에 중복되지 않게 그룹 단위로 분할한다.
  M3에 단일 플레이어만 있으면 최소 랩 전체를 분리하고 일반화 성능의 한계를 명시한다.

## 8. M3에서 확정할 항목

240 Hz/60 fps의 CPU·용량 비용, 제어기 전체 상태, 입력 지연 측정, 브라우저 간 재현 오차,
렌더 시간 정렬, 카메라 설정, BC 관측/행동 주기, 압축 방식, 깊이/분할 파일 포맷을 실제 랩으로 검증한다.
확정 전 대량 데이터를 모으지 않는다. 본 문서는 법률 문서가 아니며 동의 UI·약관은 M4에서 검토한다.

## 변경 이력

- 0.1.3 (2026-09-26): M1 마무리 요구사항 반영. 보조 전/후 입력을 런타임에서 동시에 기록하고 control_mode/assist_version을 결합, Easy/Acro 순위·학습 파티션 분리, 카메라에 vertical FOV + aspect ratio + viewport 크기/devicePixelRatio를 함께 기록하도록 명시.

- 0.1.2 (2026-09-26): 사용자의 조작 난이도 피드백으로 쉬운 조종 도입. physics_version=2,
  control_profile, 보조 전 pilot_inputs와 보조 후 inputs를 구분. 학습/랭킹의 모드 분리 규칙 추가.
- 0.1.1 (2026-09-26): M1 첫 `physics_version=1`과 rates 파라미터 단위를 구체화.
  입력·상태 채널 및 240 Hz 제안은 유지한다. 기록 파일은 아직 생성하지 않는다.
- 0.1.0: 최초 초안.
