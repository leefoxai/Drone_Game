# 프로젝트 상태

갱신: 2026-09-26 (Asia/Seoul)

## 현재 단계

M0 완료. **M1 최종 시각/충돌 정합성 보정 구현 완료 후보**이며, 최신 `npm test`/GitHub Actions/Pages 배포와 사용자 시각 확인까지 통과하면 M1을 닫고 M2 기록·고스트로 넘어간다.
M2는 아직 시작하지 않았다.

## M1 현재 구현

- 훈련장 배치는 유지하고 트랙 ID/버전을 `training-five-v2`, version 2로 상승.
- 대회용 트랙은 `race-five-v2`, version 2: 1.8 m × 1.8 m 게이트 5개, 높이 2.5~5 m 변화.
- `PHYSICS_VERSION=3`: 게이트 프레임/지지대와 드론 충돌 크기의 의미를 화면 형상과 일치시킴.
- 게이트 프레임 두께는 `GATE_FRAME_THICKNESS_M=0.22 m` 하나를 renderer/collision이 공동 사용.
- 드론은 `DRONE_COLLISION_RADIUS_M=0.22 m`, 시각 기준 반경도 동일 상수 사용.
- 모든 게이트에 지면까지 내려오는 좌우 지지대와 바닥 표시 추가. 지지대는 실제 충돌체.
- DirectionalLight 기반 실제 그림자 활성화: 드론/게이트 castShadow, 지면 receiveShadow.
- 크기 기준물: 0.5 m 콘 4개, 2.0 m 깃발 2개.
- 3인칭 chase camera를 드론 높이에 가깝게 낮춤.
- FPV 인공 수평선 추가. 카메라 자세/FPV tilt/vertical FOV/aspect ratio를 사용해 실제 world horizon을 투영하고 ON/OFF 가능.
- 다음 게이트 높이 차 표시 추가: 훈련장 또는 Easy에서만 활성. 대회용 Acro에서는 비활성.
- 시야/보조 상태 `cameraMode`, `artificialHorizonEnabled`, `heightAssistEnabled`를 텔레메트리 메타데이터와 학습 파티션 키에 포함.
- `docs/data_spec.md` schema_version을 0.1.4로 상승.
- 기체 프로파일은 version 2 유지: 질량 0.62 kg, 모터당 최대 추력 15.2 N, 명목 T/W 약 10.0:1.
- Acro 기본 rates: RC rate 1.0 / Super rate 0.7 / Expo 0, 최대 약 667°/s.
- Easy 보조 로직은 `ASSIST_VERSION=1` 유지. Acro 기본 FPV tilt 27°, Easy 기본 15°.
- 장치별 기본 deadzone: 비표준 USB 조종기 1%, 표준 Gamepad 5%.
- Easy는 매 물리 tick에 사람 입력(`pilotInput`)과 실제 물리 입력(`appliedInput`)을 둘 다 기록.
- GitHub Actions는 `npm ci` → Playwright Chromium 설치 → `npm test` → Pages용 재빌드 순서이며 테스트 실패 시 deploy job이 실행되지 않는다.

## M1 완료 게이트

- [ ] 최신 커밋에서 `npm test` 전부 통과
- [ ] GitHub Actions test-and-build 성공
- [ ] GitHub Pages deploy 성공
- [ ] 배포 사이트에서 `training-five-v2` 실행 가능
- [ ] 배포 사이트에서 `race-five-v2` 실행 가능
- [ ] 사용자가 대회용 트랙 3인칭에서 게이트 높이를 눈으로 가늠 가능하다고 확인
- [ ] 사용자가 대회용 트랙 FPV에서 게이트 높이를 눈으로 가늠 가능하다고 확인

위 항목이 모두 확인되면 이 문서의 현재 단계를 **M1 완료**로 변경한다.

## 자동 검증 범위

- Betaflight식 rates 기본값과 full-stick 약 667°/s
- 프로파일 v2 명목 T/W 약 10:1
- 호버 스로틀과 10초 고도 유지
- 최대 상승 초기 가속 목표값 ±10%
- full-stick 360° 롤 시간 프로파일 목표값 ±10%
- 동일 입력을 두 번 실행했을 때 숨은 상태까지 동일
- 30/60/120 Hz 렌더 주기에서 고정 물리 결과 동일
- 트랙 v2와 physics v3 버전 회귀
- 게이트 시각/충돌 프레임 두께 공통 상수와 드론 시각/충돌 반경 일치
- 게이트 통과 방향, 프레임/지지대 충돌, 랩 순서/시간/무효 처리
- Easy 감속·고도 유지
- 조종기 1% / 게임패드 5% 기본 deadzone
- Easy pilot/applied input 이중 기록과 assist version
- Easy/Acro 및 camera/horizon/height-assist 데이터 파티션 분리
- vertical FOV + aspect ratio + viewport + 시야 보조 카메라 메타데이터
- 실제 브라우저 로드, 안정 호버, FPV 수평선 토글, 높이 보조 조건, 두 v2 트랙 선택
- renderer shadow map, gate legs/ground markers, cone/flag 스케일 단서 활성 상태

## 알려진 한계

- 기체 물리는 개발용 근사 모델이다. 15.2 N은 10:1 명목 T/W를 위한 설계값이며 실측 모터 데이터가 아니다. 배터리 sag 적용 시 순간 가용 T/W는 더 낮다.
- 드론 시각 형상은 collision sphere와 같은 0.22 m 기준 반경을 사용하지만 실제 기체의 모든 세부 부품을 구형 충돌체로 개별 모델링하지는 않는다.
- 그림자와 카메라가 실제로 사용자의 높이 판단에 충분한지는 자동 테스트로 대체할 수 없으며 마지막 판단은 배포 사이트에서 사용자가 직접 한다.
- 실제 USB 조종기/게임패드 하드웨어 호환성과 조작감은 자동 테스트로 대체할 수 없다.
- M1 텔레메트리는 세션 메모리의 랩 버퍼/분리 규칙을 검증하는 수준이다. 파일 저장·고스트·재시뮬레이션 기록 포맷은 M2에서 구현한다.
- 서버 업로드·계정·공개 리더보드·학습 파이프라인은 아직 구현하지 않았다.
