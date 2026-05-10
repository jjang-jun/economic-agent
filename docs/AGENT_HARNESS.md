# Agent Harness

이 문서는 Codex와 보조 agent가 장시간 작업을 할 때 따라야 하는 작업 하네스다. 목적은 더 많은 지시를 추가하는 것이 아니라, 작업을 작게 나누고 검증 가능한 상태로 남기는 것이다.

## 적용 범위

- 하루 이상 이어질 수 있는 기능 변경
- 여러 파일이나 저장소 문서를 함께 바꾸는 변경
- 투자 로직, 운영 workflow, 데이터 저장소, Telegram 메시지처럼 실패 비용이 큰 변경
- sub-agent를 병렬로 쓰는 작업

작은 오타 수정, 단일 테스트 보강, 단순 문서 정리는 `AGENTS.md`의 Working Rules만 따르면 된다.

## 지식 맵

`AGENTS.md`는 진입점이고, 세부 지식은 아래 문서에 둔다.

- `ROADMAP.md`: 장기 제품 방향, phase, 다음 우선순위
- `docs/PROGRESS.md`: 현재 운영 상태, 최근 변경, 다음 점검 항목
- `docs/AGENT_PLATFORM.md`: Telegram Agent Server와 배포 구조
- `docs/TELEGRAM_AGENT_DEPLOY.md`: webhook/Cloud Run 배포 절차
- `docs/AGENT_HARNESS.md`: 장기 작업 계약, 검증 루프, handoff 규칙

새로운 장기 지식은 대화에만 남기지 말고 위 문서 중 하나에 연결한다.

## 작업 계약

장기 작업을 시작할 때는 아래 계약을 짧게 만든다. 문서 파일을 새로 만들 필요는 없지만, 작업 중 판단 기준은 이 형태를 유지한다.

```text
Goal:
- 사용자가 체감할 최종 상태

Scope:
- 바꿀 파일/모듈
- 바꾸지 않을 파일/모듈

Safety:
- 네트워크/API/Telegram/Supabase 호출 여부
- 데이터 삭제, 버퍼 clear, 원격 push 여부
- 실패해도 정기 운영을 막지 않는 fallback

Verification:
- 실행할 테스트/스크립트
- 실행하지 못하는 검증과 이유

Handoff:
- 변경 요약
- 남은 리스크
- 다음 운영 점검
```

## 작업 분해

- 먼저 차단 작업과 병렬 가능한 보조 작업을 분리한다.
- 단순 파일 탐색, 좁은 분석, 테스트 보조는 경량 sub-agent에 맡길 수 있다.
- 투자 판단, 저장소 schema, 운영 workflow, 최종 통합은 메인 세션에서 결정한다.
- sub-agent 결과는 그대로 병합하지 말고 파일 diff와 테스트 결과로 확인한다.

## 검증 루프

변경은 가능한 한 기계적으로 검증한다.

- 코드 변경: `npm test` 또는 변경 모듈 로딩/포맷 테스트
- 문서 맵 변경: `npm run agent:harness-check`
- workflow 변경: UTC와 KST 시간을 함께 확인
- Telegram/Supabase/외부 API 변경: dry-run 또는 private channel smoke를 우선 사용
- 로컬 Python worker 변경: provider가 없어도 JSON 실패로 끝나는지 확인
- MCP가 연결된 작업: Supabase MCP는 DB/로그 확인, GitHub MCP는 Actions/PR 상태 확인, Playwright MCP는 dashboard/browser 흐름 검증에 우선 사용한다.

테스트가 네트워크, 비밀값, 유료 API에 의존하면 기본 경로에서는 비활성으로 둔다.

## 관측 가능성

장기 실행 job은 사람이 로그를 읽기 전에 agent가 상태를 해석할 수 있어야 한다.

- 성공/실패/건수/latency/경고를 구조화된 payload나 요약 문구에 남긴다.
- 실패가 정상 fallback인지 운영 장애인지 구분한다.
- 정기 리뷰나 운영 리포트에 반복되는 실패율과 빈 응답률을 표시한다.
- 생성 파일은 `data/`처럼 ignored 경로에 두고, 기준 schema와 의미는 문서에 남긴다.

## 엔트로피 관리

- 새 옵션은 기본 비활성 또는 보수적 기본값으로 둔다.
- 유료 데이터 소스, 자동매매, 원격 push는 명시 요청 없이는 켜지 않는다.
- 오래된 문서나 중복 규칙을 발견하면 새 규칙을 추가하기보다 기존 문서를 정리한다.
- `README.md`, `AGENTS.md`, `ROADMAP.md`, `docs/PROGRESS.md` 중 사용자에게 영향을 받는 문서는 함께 갱신한다.
