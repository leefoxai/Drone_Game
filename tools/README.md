# 데이터·학습 도구

## M2 · 기록 검증

내보낸 랩 원본 `.jsonl.gz`는 Python 표준 라이브러리만 사용하는 validator로 검사한다.

```bash
python3 tools/validate.py lap_<recording_id>.jsonl.gz
```

Windows에서 `python` 명령을 쓰는 경우:

```powershell
python tools/validate.py .\lap_<recording_id>.jsonl.gz
```

여러 파일을 한 번에 넣을 수도 있다.

```bash
python3 tools/validate.py lap_a.jsonl.gz lap_b.jsonl.gz lap_c.jsonl.gz
```

성공 시 각 파일마다 `OK`와 channel sample 수/압축 크기를 출력하고 exit code 0을 반환한다. 실패하면 `ERROR`와 원인을 stderr에 출력하고 non-zero로 종료한다.

검증 범위:

- gzip / UTF-8 / JSONL
- schema `0.1.6`
- 필수 metadata
- payload 및 track/ruleset/profile SHA-256
- 유한 숫자
- partition key
- `training_use`
- tester/public leaderboard 규칙
- N inputs ↔ N+1 states
- controller state tick
- Easy assist target / Acro null 규칙
- rAF frame sequence와 timestamp
- keyboard key state 또는 joystick raw axes
- event sequence와 terminal event

Python에 비행 물리를 복제하지 않는다. 물리 재현 정확성은 저장된 authoritative `appliedInput`을 shared TypeScript physics에 다시 넣는 `tests/recording.spec.ts`가 검사한다.

## 이후 단계

M3에서 소수 랩 리렌더 결과를 검사하고 작은 BC(행동 모방) 모델을 학습한다. M6에서 대량 렌더·라벨 검사·큐레이션, M7에서 PyTorch 학습과 ONNX 내보내기를 추가한다.

학습용 Python 환경은 실제 PyTorch 사용 시점에 지원 버전을 확인해 별도 의존성으로 고정한다. 학습 원본·영상·가중치는 Git에 넣지 않는다. 동의가 없는 기록은 학습용 데이터셋 내보내기에서 제외한다.
