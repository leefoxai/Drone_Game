# 프로젝트 상태

갱신: 2026-09-26 (Asia/Seoul)

## 현재 단계

M0 완료. **M1 안정화 구현 완료 후보**이며, `npm test`/GitHub Actions/배포 사이트 검증까지 모두 통과하면 M1을 닫고 M2 기록·고스트로 넘어간다.
M2는 아직 시작하지 않았다.

## M1 마무리 구현

- 기존 훈련장(`training-five-v1`) 유지.
- 별도 대회용 트랙(`race-five-v1`) 추가: 1.8 m × 1.8 m 게이트 5개, 높이 2.5~5 m 변화.
- 기체 프로파일 `version: 2`: 질량 0.62 kg, 모터당 최대 추력 15.2 N. full-voltage/zero-sag 명목 추력대중량비 약 10.0:1.
- Acro 기본 rates: RC rate 1.0 / Super rate 0.7 / Expo 0, 최대 약 667°/s.
- Easy 보조 로직은 유지(`ASSIST_VERSION=1`). Acro 기본 FPV tilt 27°, Easy 기본 15°.
- 장치별 기본 deadzone: 비표준 USB 조종기 1%, 표준 Gamepad 5%.
- Easy는 매 물리 tick에 사람 입력(`pilotInput`)과 실제 물리 입력(`appliedInput`)을 둘 다 기록하며 `controlMode`와 `assistVersion`을 함께 남긴다.
- Easy/Acro는 랩 순위와 세션 내 학습용 랩 버퍼를 동일 파티션으로 섞지 않는다. 파티션 키에 track/mode/profile/assist 버전을 포함한다.
- 카메라 기록은 vertical FOV, aspect ratio, viewport width/height, devicePixelRatio를 함께 보존한다.
- `npm test`가 타입 검사 → production build → 전체 Playwright 테스트를 한 번에 수행하도록 통합.
- GitHub Actions는 `npm ci` → Playwright Chromium 설치 → `npm test` → Pages용 재빌드 순서이며 테스트 실패 시 deploy job이 실행되지 않는다.

## M1 완료 게이트

- [ ] 로컬 또는 CI에서 `npm test` 전부 통과
- [ ] GitHub Actions test-and-build 성공
- [ ] GitHub Pages deploy 성공
- [ ] 배포 사이트에서 `training-five-v1` 실행 가능
- [ ] 배포 사이트에서 `race-five-v1` 실행 가능

위 항목이 모두 확인되면 이 문서의 현재 단계를 **M1 완료**로 변경한다.

## 자동 검증 범위

- Betaflight식 rates 기본값과 full-stick 약 667°/s
- 프로파일 v2 명목 T/W 약 10:1
- 호버 스로틀과 10초 고도 유지
- 최대 상승 초기 가속 목표값 ±10%
- full-stick 360° 롤 시간 프로파일 목표값 ±10%
- 동일 입력을 두 번 실행했을 때 숨은 상태까지 동일
- 30/60/120 Hz 렌더 주기에서 고정 물리 결과 동일
- 훈련장 형상 회귀, 대회 트랙 실제 크기 게이트/고도 변화
- 게이트 통과 방향, 프레임 충돌, 랩 순서/시간/무효 처리
- Easy 감속·고도 유지
- 조종기 1% / 게임패드 5% 기본 deadzone
- Easy pilot/applied input 이중 기록과 assist version
- Easy/Acro 데이터 파티션 분리
- vertical FOV + aspect ratio 카메라 메타데이터
- 실제 브라우저 로드, 안정 호버, 입력/일시정지/카메라/튜닝, 두 트랙 선택

## 알려진 한계

- 기체 물리는 개발용 근사 모델이다. 15.2 N은 10:1 명목 T/W를 위한 설계값이며 실측 모터 데이터가 아니다. 배터리 sag 적용 시 순간 가용 T/W는 더 낮다.
- 실제 USB 조종기/게임패드 하드웨어 호환성과 조작감은 자동 테스트로 대체할 수 없다.
- M1 텔레메트리는 세션 메모리의 랩 버퍼/분리 규칙을 검증하는 수준이다. 파일 저장·고스트·재시뮬레이션 기록 포맷은 M2에서 구현한다.
- 서버 업로드·계정·공개 리더보드·학습 파이프라인은 아직 구현하지 않았다.
