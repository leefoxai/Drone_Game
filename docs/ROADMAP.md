# 개발 로드맵

목표 A: 게임 플레이 기록에서 조종 입력과 시각 라벨이 연결된 드론 영상 데이터셋을 만든다.
목표 B: 검증된 상위 기록으로 AI 드론 조종 모델을 학습하고 브라우저에서 실행한다.

기록의 원본은 입력·상태·이벤트 로그이며 영상은 로그를 재생해 생성한다.
한 번에 한 기능씩 구현하고, 각 단계의 실행 결과를 직접 확인한 후 다음 단계로 간다.

현재 상태:

- M0 완료
- M1 완료
- **M2 구현 및 자동 검증 완료, 배포 사이트 사용자 직접 확인 대기**
- M3~M8 미시작
- 공개 제품은 keyboard + Easy. Acro/Gamepad/RC/Rates/보정은 `?tester=1` 전용

## M0 · 프로젝트 준비 — 완료

Git, npm workspace, TypeScript/Vite/Three.js, 기본 문서와 프로젝트 뼈대를 구성했다.

## M1 · 비행 프로토타입 — 완료

드론 1대, 대형 게이트 훈련장과 실제 크기·고도 변화가 있는 대회용 트랙, Easy/Acro, Gamepad/RC 입력, 튜닝 패널과 고정 240 Hz shared physics를 구현했다.

M1 안정화에서:

- 보이는 게이트/드론 크기와 충돌 의미 정합화
- 게이트 다리/그림자/크기 기준물
- 낮춘 chase camera / FPV 인공 수평선 / 높이 차 보조
- 공개 keyboard+Easy / tester Acro+외부입력 분리
- partition key와 `training_use` 계약 확정
- GitHub Actions test gate와 Pages 배포

를 완료했다.

## Acro 공개 · 조건부 마일스톤

M2 이후와 병행하며 완료 전까지 Acro와 외부 입력 장치는 `?tester=1` 전용이다.

공개 전 조건:

1. 실제 FPV 조종자 여러 명의 RC joystick 테스트
2. 대표 Gamepad/RC의 축 매핑·끝점·반전·deadzone 호환성 확인
3. Acro rates / FPV tilt 공개 기본값 확정
4. 잘못된 축/중립/끝점 보정 거부 확인
5. `stick_pattern`과 keyboard/Easy 데이터 격리 확인
6. M4 서버에서 tester 기록 공개 순위 제외
7. 공개 전 전체 `npm test` + 실제 배포 확인

## M2 · 기록·고스트 — 구현 완료 / 사용자 확인 대기

M1 `telemetry.ts`와 `data_spec` 계약을 그대로 확장했다. 별도 학습 기록 형식은 만들지 않는다. schema는 **0.1.6**이다.

구현:

- 매 rAF frame: key state 또는 joystick raw+normalized input, input-read time, rAF timestamp, simulation tick/alpha
- 매 physics tick: pilot/applied input, Easy assist target, full state, controller hidden state
- gate/collision/complete/abort event
- data_spec 필수 metadata와 snapshot/payload SHA-256
- 한 랩 단위 `.jsonl.gz`
- IndexedDB 영속 저장
- 로컬 기록 목록 / replay / export / delete
- 현재 partition의 personal-best ghost
- recorded-state replay와 authoritative-input re-simulation
- 두 경로의 현재/최대 position error 표시
- `tools/validate.py`
- deterministic sample lap 3개 gzip round-trip + validator + re-simulation regression

자동 회귀 허용 오차:

```text
position <= 1e-9 m
velocity <= 1e-9 m/s
orientation <= 1e-10
angular velocity <= 1e-9 rad/s
```

**사용자가 직접 확인할 완료 게이트**

1. 배포 사이트에서 한 랩을 완주하고 기록 목록에 생성되는지 확인한다.
2. 새로고침 후 IndexedDB 기록이 유지되는지 확인한다.
3. 같은 조건 최고랩 ghost를 불러와 실제로 함께 주행한다.
4. state / resim ghost를 전환하고 position error 표시를 확인한다.
5. 기록을 `.jsonl.gz`로 내보낸다.
6. 내보낸 파일에 `python3 tools/validate.py <file>`을 실행해 통과한다.

위 6개를 사용자가 확인하면 M2를 최종 완료로 닫는다.

## M3 · 파이프라인 시험과 기록 형식 확정

자신의 동의된 기록 몇 랩으로 FPV 영상 리렌더 → 입력/영상 정렬 → 작은 BC 학습 → 봇 추론까지 한 번 끝까지 수행한다. 대량 수집 전에 반드시 거친다.

확인 항목:

1. 자신의 3~5개 랩으로 MP4와 frame/input 대응표 생성
2. 출발·급회전·게이트 통과 frame에서 시간 정렬 직접 확인
3. 한 랩 전체를 validation으로 분리한 작은 CPU BC 학습
4. `stick_pattern` / `flight_method` 별도 dataset export와 누출 검사
5. 학습하지 않은 랩에서 봇 추론 연결 확인
6. 동일 recording 재렌더의 frame count/time metadata 재현
7. 실제 30/60/90초 gzip 크기, CPU/메모리, IndexedDB quota 측정
8. 브라우저 간 re-simulation 오차 측정
9. 누락 필드가 발견되면 사용자에게 알리고 schema version 상승

실패하면 M4로 넘어가지 않는다.

## M4 · 공개

배포, 계정, 데이터 활용 동의, 약관·개인정보 처리방침 초안, 기록 업로드, 서버 re-simulation 검증, 트랙별 leaderboard를 구현한다. 초기 저장은 SQLite + 파일.

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

장애물 코스, PVE, 비동기 팀 레이스를 추가하고 모든 성공·실패·점수·팀 합산 규칙을 versioned ruleset으로 관리한다.

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

검증된 기록으로 Python/PyTorch BC를 CPU에서 시작하고 ONNX로 내보내 브라우저에서 실행한다. 이후 강화학습으로 보정한다.

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
