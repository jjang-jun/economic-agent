# Development Progress

이 문서는 현재 개발 상태, 운영 판단, 다음 작업을 사람이 빠르게 확인하기 위한 진행 기록입니다. 현재 운영 기준 문서는 `AGENTS.md`, `README.md`, `ROADMAP.md`, `docs/PROGRESS.md`입니다.

## 목표

이 프로젝트의 목표는 단순 뉴스 요약이 아니라 다음 투자 의사결정 루프를 자동화하고 검증하는 것입니다.

```
시장/공시/가격/지표 수집
  -> 시장 레짐 판단
  -> 종목 후보와 리스크 도출
  -> 포트폴리오 기준 행동 가드레일 적용
  -> 추천/실행/성과 기록
  -> 누적 히스토리로 개선
```

## 현재 상태

- 뉴스/RSS/DART 공시 수집: 동작
- 로컬 스코어링: 키워드, 섹터, FinBERT 기반으로 동작
- Telegram 즉시 알림: score 5 기사 대상
- 하루 5회 AI 다이제스트: 08:20, 11:50, 15:45, 17:10, 22:40 KST
- 장 마감 종목 리포트: 당일 기사 아카이브 기반
- 추천 성과 평가: 1일/5일/20일, KOSPI 벤치마크 대비 평가
- 시장 레짐/행동 가드레일: 초안 적용
- Supabase/Postgres 히스토리 저장: 스키마와 런타임 저장 코드 추가
- 로컬 파일시스템 미러: `npm run db:pull`로 JSON/SQLite 생성
- AI 토큰 절약: 상위 기사/핵심 스냅샷만 프롬프트에 사용

## 최근 변경

### 2026-05-06

- DART 공시 수집을 뉴스 파이프라인에 통합
- 추천 로그와 성과 평가 루프 추가
- 다이제스트 시간을 시장 이벤트 기준으로 재조정
- 프리마켓/글로벌 가격 스냅샷 추가
- 시장 레짐과 행동 가드레일 추가
- Supabase 히스토리 저장소와 로컬 SQLite 미러 추가
- Telegram 문구를 의사결정 중심 템플릿으로 재정렬
- 현재 운영/AI 참조 기준에서 제외된 `memory/`, `CLAUDE.md`, `.claude/` 정리
- GitHub Actions 경고 대응: Node.js 22 앱 런타임, Node 24 기반 공식 actions 버전으로 워크플로우 업데이트
- 추천/성과 평가 로딩을 Supabase 기준으로 전환하고, 로컬 JSON은 미러/장애 fallback으로 사용
- 실제 보유 종목 입력용 `data/portfolio.json` 로딩 구조와 `docs/portfolio.example.json` 템플릿 추가
- 초기 포트폴리오를 현금 2,000만원, 보유 종목 0개로 설정. 장 마감 리포트에 총자산/현금/1회 신규 매수 상한 100만원 표시.
- 시장 레짐 점수에 KOSPI/KOSDAQ/S&P/Nasdaq/반도체 5일·20일 추세와 USD/KRW 변화를 추가.

## 데이터 저장 전략

Supabase/Postgres를 장기 기준 저장소로 사용합니다. 로컬 `data/`는 실행 중 상태와 분석 미러입니다.

- `articles`: 기사/RSS/DART 공시
- `daily_summaries`: 일일 요약
- `stock_reports`: 장 마감 리포트
- `recommendations`: 추천 신호
- `recommendation_evaluations`: 추천 성과 평가
- `market_snapshots`: 지수/종목/원자재 스냅샷
- `decision_contexts`: 시장 레짐과 행동 가드레일

로컬 질의가 필요하면:

```bash
npm run db:pull
sqlite3 data/economic-agent.db "select count(*) from articles;"
```

## AI 사용 원칙

- AI는 최종 매수/매도 판단자가 아니라 근거 정리, 리스크 탐지, 시나리오 비교 도구로 사용합니다.
- 전체 히스토리를 매번 AI에 넣지 않습니다.
- 다이제스트는 중요 기사 16건, 종목 리포트는 중요 기사 32건과 핵심 시장 스냅샷만 프롬프트에 넣습니다.
- 장기 학습/검증은 Supabase와 SQLite에 쌓인 구조화 데이터로 수행합니다.

## 운영 체크리스트

- GitHub Secrets에 `SUPABASE_PROJECT_URL`, `SUPABASE_PUBLISHABLE_KEY` 등록
- 로컬 `.env`에 `SUPABASE_DB_PASSWORD` 유지
- direct DB가 IPv6 문제로 실패하면 `SUPABASE_DNS_RESOLVER=https`를 유지하고, 그래도 실패하면 Supabase pooler 연결 문자열을 `SUPABASE_DB_URL`로 추가
- `npm run db:push`로 Supabase 스키마 적용
- 기존 로컬 히스토리는 `npm run db:import-local`로 Supabase에 업로드
- GitHub Actions 실행 후 Supabase 테이블에 row가 쌓이는지 확인
- `npm run db:pull`로 로컬 JSON/SQLite 미러 생성 확인

## 현재 검증 상태

- Supabase Session pooler URL로 `npm run db:push` 성공
- `npm run db:import-local` 성공: articles 8건, daily summaries 2건 업로드
- `npm run db:pull` 성공: `data/supabase/*.json`, `data/economic-agent.db` 생성
- SQLite 확인: `articles=8`, `daily_summaries=2`, `stock_reports=2`, `recommendations=0`
- GitHub Actions `news-alert.yml` 수동 실행 성공. 신규 score 4+ 기사가 없어 Supabase row 수 증가는 없었지만, Secrets 주입과 수집 파이프라인은 정상 확인.
- Node.js 22와 `actions/checkout@v6`, `actions/setup-node@v6`, `actions/cache@v5` 조합으로 `news-alert.yml` 재검증 성공. Node 20 actions deprecation 경고 제거.
- `evaluate-recommendations.yml` 수동 실행 성공. Actions 캐시에 있던 추천 4건이 Supabase `recommendations` 테이블로 동기화됨.
- Yahoo Finance 실제 스냅샷에서 5일/20일 수익률 필드 확인. Supabase `market_snapshots` 추세 컬럼 migration 적용 완료.

## 다음 작업

1. 실제 `data/portfolio.json` 값 입력
2. 시장 레짐 점수에 외국인/기관 수급 데이터 추가
3. 추천과 실제 매매 실행 기록을 분리 저장
4. 추천 DB 이력을 기준으로 승률/초과수익률 리포트 고도화
5. 주간/월간 성과 리뷰 리포트 추가
