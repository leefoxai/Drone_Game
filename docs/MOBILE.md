# 모바일 터치 조종

상태: 공개 Pages에서 touch-capable 브라우저를 감지하면 Easy 모드의 듀얼 가상 스틱을 자동 활성화한다.

## 조작

왼쪽 스틱:

- 위/아래: 상승/하강
- 좌/우: yaw 회전

오른쪽 스틱:

- 위/아래: 전진/후진
- 좌/우: 좌우 이동

중앙 버튼:

- `RESET`: 시작 위치로 초기화
- `FPV` / `CHASE`: 카메라 전환
- `PAUSE` / `RESUME`: 일시정지/재개
- `설정`: 기존 설정 패널 열기/닫기

가로 화면을 우선 권장하지만 세로 화면에서도 조작 UI를 유지한다.

## 입력·물리 계약

모바일이라고 별도 physics를 사용하지 않는다.

```text
touch dual sticks
  → normalized pilotInput
  → Easy assist targets
  → existing Easy assist controller
  → appliedInput
  → shared 240 Hz physics
```

터치 입력의 중립값은 `throttle=0.5, roll=0, pitch=0, yaw=0`이다. 손가락이 스틱에서 떨어지거나 pointer capture가 취소되면 해당 스틱은 즉시 중립으로 돌아간다.

## 데이터 분리

`InputDeviceKind`에 `touch`를 추가했다. 학습/비교 partition은 keyboard와 분리된다.

```text
device-touch
```

터치 프레임의 `rawAxes`는 다음 순서다.

```text
[leftX, leftY, rightX, rightY]
```

`inputDevice.browserMapping`은 `touch-dual-stick-v1`, axesCount는 4, buttonsCount는 0이다.

터치 Easy 기록의 `training_use`는 `flight_method`다. `stick_pattern`은 기존과 같이 Gamepad/RC + Acro direct input에만 해당한다.

## 모바일 렌더링

- Three.js shared scene/physics 유지
- renderer DPR은 기존 코드대로 최대 2로 제한
- touch surface에 `touch-action: none`
- safe-area inset을 반영해 노치/홈 인디케이터와 스틱이 겹치지 않게 배치
- 작은 화면에서는 진단 그래프와 미니맵을 숨김

## 확인 항목

1. iOS/Android에서 페이지 접속 시 `TOUCH` badge와 듀얼 스틱 표시
2. 왼쪽 스틱 상승/하강/yaw
3. 오른쪽 스틱 전후/좌우
4. 두 스틱 동시 입력
5. 손을 떼면 중립 복귀
6. RESET / FPV / PAUSE 버튼
7. 터치 기록 metadata의 `inputDeviceKind=touch`
8. partition에 `device-touch`
9. 터치 기록 export가 `tools/validate.py` 통과
10. PC keyboard 공개 조작에는 회귀가 없을 것
