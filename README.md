# Fantasy Library

공개 RP / 소설 로그를 바탕으로 정리한 플레이어 공개용 세계관 Codex입니다.

이 저장소는 GM 비밀 설정집이 아닙니다. 모든 문서는 저장소에 포함된 공개 로그를 출처로 하며, 확정 정보와 추정 정보를 분리합니다.

## 구조

- `source/rp-logs/`: 가공된 공개 원문 로그
- `src/content/sessions/`: 세션별 정리 문서
- `src/content/characters/`: 캐릭터 문서
- `src/content/locations/`: 지역 문서
- `src/content/factions/`: 팩션 문서
- `src/content/events/`: 사건 문서
- `data/relations.json`: 관계 데이터
- `data/timeline.json`: 타임라인 데이터
- `data/glossary.json`: 용어집 데이터

## 명령

```bash
npm install
npm run build
npm run dev
```

## 원칙

- 원문 로그와 정리된 Codex 문서를 분리합니다.
- 비공개 스포일러나 GM 전용 정보는 넣지 않습니다.
- 모든 정리 문서에는 출처 로그를 남깁니다.
- 자동 초벌 문서는 `확인 필요` 섹션을 통해 불확실한 정보를 분리합니다.
