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
- `trade_executions`: 실제 매수/매도 실행 기록
- `portfolio_snapshots`: 보유 종목 현재가/평가손익 스냅샷
- `performance_reviews`: 주간/월간 추천·실제거래 성과 리뷰
- `market_snapshots`: 지수/종목/원자재 스냅샷
- `investor_flows`: KOSPI 외국인/기관/개인 일자별 순매수
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
- 네이버 금융 일자별 순매수 표를 기반으로 KOSPI 외국인/기관 수급 수집 모듈 추가. 시장 레짐 점수, AI 브리핑 입력, Supabase `investor_flows` 저장 대상으로 연결.
- 2026-05-06 코스피 급등 사례를 반영해 강세장도 `OVERHEATED`, `CONCENTRATED_LEADERSHIP`, `SEMICONDUCTOR_LEADERSHIP`, `MOMENTUM_ALLOWED` 태그로 세분화. RISK_ON이어도 급등 당일 전액 진입 금지, 3회 이상 분할 진입, 1회 손실 허용액 1~2% 가드레일을 Telegram 리포트에 표시.
- 추천 신호와 실제 매매 실행을 분리하기 위해 `trade_executions` 테이블, 로컬 `data/trades/trade-executions.json` 미러, `npm run trade:record` 입력 명령 추가.
- 섹터 무관 매매 원칙을 추천 구조에 반영. AI 종목 추천은 기대상승폭, 예상손실폭, 손익비, 손절 기준, 무효화 조건을 내야 하며, 코드는 포트폴리오 기준 제안 매수금액과 비중을 계산해 Telegram에 표시.
- 보유 종목 현재가/평가손익 자동 계산 추가. 장 마감 리포트는 포트폴리오 평가손익과 상위 보유 평가를 표시하고, `npm run portfolio:snapshot`으로 로컬/Supabase 스냅샷을 생성할 수 있음.
- `portfolio-snapshot.yml` 추가. 기사/AI 리포트 생성 여부와 무관하게 평일 16:10 KST에 포트폴리오 평가손익을 저장.
- GitHub Actions에서는 ignored `data/portfolio.json`을 읽을 수 없으므로 `PORTFOLIO_JSON_BASE64` 또는 `PORTFOLIO_JSON` secret을 통해 비공개 포트폴리오를 주입하도록 지원.
- 추천 종목별 Yahoo 가격/거래량 기반 `market_profile` 추가. 20일 상대강도, 5일 상대강도, 20일 평균 거래대금, 거래량 배율을 계산하고 유동성 부족 또는 시장 대비 약세 종목은 거래 가능 후보에서 제외.
- 추천 종목별 20일/60일 고점, 20일 고점 대비 거리, 20일 돌파 여부 추가. 공격형 후보는 20일 고점에서 3% 이내인 종목만 거래 가능 후보로 유지.
- `npm run trade:performance`와 `trade-performance.yml` 추가. 실제 매매 기록의 현재가 기준 평가손익, 추천 연결 여부, 거래 수를 별도 리포트로 계산.
- `keywords.js`를 시장/종목/공시 목적별 설정으로 분리하고, 기존 import 호환을 위해 통합 facade로 유지. 개인 관심사성 키워드는 투자 필터에서 제거하고 `interests.js` relevance 용도로 분리.
- 한국어/공시 감성 분석을 `sentiment-dictionary.js`로 분리. 단순 개수 비교 대신 강한 투자 신호(`자사주 소각`, `주주환원`, `유상증자`, `전환사채`, `거래정지` 등)에 가중치를 부여하고 sentiment reason을 저장.
- FinceptTerminal에서 코드가 아닌 개념만 차용해 `risk-reviewer.js` 추가. 추천 저장 전 시장 레짐, 손익비, 손절폭, 유동성, 상대강도, 모멘텀, 포지션 크기 factor를 검토하고 `risk_review`에 차단 사유/주의사항을 저장.
- 추천마다 `thesis`, `target_horizon`, `failure_reason` 저장 필드 추가.
- `review:weekly`, `review:monthly`, `performance-review-weekly.yml`, `performance-review-monthly.yml` 추가. 추천 승률/평균 수익률/초과수익률과 실제 거래 추천 연결률을 리뷰하고 Supabase `performance_reviews`에 저장.
- `npm run dashboard` 추가. `data/supabase/*.json` 미러를 기반으로 로컬 HTML 대시보드 `data/dashboard/index.html` 생성.
- `trade:record`가 기본적으로 `data/portfolio.json`의 현금/수량/평단을 갱신하도록 변경. `--noPortfolio`로 비활성화 가능. `npm run portfolio:sync-secret`으로 로컬 포트폴리오를 GitHub Actions secret에 동기화.
- `npm run recommendations:list` 추가. 실제 거래를 추천과 연결할 때 필요한 최근 추천 ID, risk action, 제안금액을 터미널에서 확인 가능.
- 텔레그램 중복 기사 완화. 기존 `article.id` 기준에서 `id + 정규화 URL + 정규화 제목` 기준으로 seen/buffer/archive 중복 제거를 강화하고, seen 키 보존량을 15,000개로 확대.
- 외부 AI 피드백을 반영해 README 정체성을 뉴스봇에서 투자 의사결정 보조 시스템으로 재정의하고 운영 모드, 추천 생성 원칙, 리스크 가드레일, 성과 평가 기준을 문서화.
- 추천 성과 평가에 MFE, MAE, 최대낙폭, 손절선 터치 여부, 목표구간 터치 여부, 결과 라벨을 추가하고 Supabase `recommendation_evaluations` 컬럼으로 저장.
- AI 종목 분석 프롬프트에 외부 기사 데이터는 신뢰할 수 없는 입력이며 기사 속 지시문을 무시하라는 prompt injection 방어 규칙 추가.
- 5분 뉴스 수집 workflow에 concurrency를 적용해 중복 실행/캐시 충돌 가능성을 완화.
- `npm run action:report`와 `action-report.yml` 추가. 최근 추천과 현재 포트폴리오를 합쳐 신규 매수/관찰/보유/축소/매도 후보를 토큰 비용 없이 분리하고 Telegram으로 발송.
- `freedom-engine.js`와 `npm run freedom:report` 추가. 월 생활비, 목표 인출률, 월 저축액, 현재 순자산 기준으로 목표 순자산, 달성률, 예상 달성 시점, 하락 스트레스 지연 기간을 계산.
- 월간 성과 리뷰와 로컬 대시보드가 최신 `data/freedom/freedom-status.json`을 표시하도록 연결.
- 대화형 Agent 플랫폼 방향 확정. Telegram은 대화 UI, GitHub Actions는 정기 루틴, 별도 Node.js Agent Server는 webhook/질의응답/승인 처리, Supabase는 포트폴리오와 대화 상태의 기준 저장소로 둠. 상세 설계는 `docs/AGENT_PLATFORM.md`.
- Telegram 방 라우팅 분리. `TELEGRAM_CHAT_ID`는 기존 공유 뉴스/시장 브리핑 방, `TELEGRAM_PRIVATE_CHAT_ID` 또는 `TELEGRAM_SECRET_CHAT_ID`는 포트폴리오/거래/행동 리포트/성과 리뷰/경제적 자유 전용 비공개 방으로 사용. private chat id가 없으면 기존 chat id로 fallback.
- `strategy-policy.js`와 `position-sizer.js` 추가. 투자 헌법, 레버리지 금지, 레짐별 신규 매수 한도, 손실 허용액/종목/섹터/현금 한도를 하나의 포지션 사이징 공식으로 통합.
- 한국 주식 가격 소스를 Yahoo 우선에서 Naver Finance 우선으로 변경. 국내 6자리 종목코드는 Naver realtime 현재가를 사용하고, Yahoo의 국내 history 기반 5일/20일 수익률은 혼합 오류를 막기 위해 제외.
- `current-portfolio.md`의 현재 포트폴리오를 `data/portfolio.json`에 반영하고 `PORTFOLIO_JSON_BASE64` GitHub Secret을 동기화. USD 보유 종목은 USD/KRW 환산 후 KRW 총자산으로 계산.
- 가격 소스 계층을 `price-provider.js`로 분리. 국내 주식은 KIS REST -> Naver Finance -> Yahoo fallback 순서로 조회하고, 사용한 가격은 Supabase `price_snapshots`에 source/as_of와 함께 저장.
- 해외 주식 가격 provider 후보 추가. 글로벌 종목은 Alpaca Market Data -> FMP -> Alpha Vantage -> Tiingo EOD -> Yahoo fallback 순서로 조회하며, FMP는 미국 기업 재무/실적 분석 엔진으로 확장 예정.
- KIS App Key/Secret 실호출 검증 완료. `.env`의 `KIS_BASE_URL` 오타를 자동 보정하고, KIS 접근토큰은 `data/kis-token.json` 캐시로 재사용하며, 현재가 호출은 1.1초 간격 큐로 직렬화해 초당 거래건수 제한을 회피.
- 대화형 Agent 서버 초안 추가. `npm run agent:server`가 `/health`, `/telegram/webhook`을 제공하고, Telegram allowlist를 통과한 `/portfolio`, `/goal`, `/risk`, `/help` 명령에 응답하며 `conversation_messages`에 대화 로그를 저장.
- Alpaca API key 실호출 검증 완료. 보유 미국 종목 UBER/VOO/VGT/NFLX가 `alpaca-iex` source로 조회되고, 환율/지수 심볼은 Alpaca/FMP/Alpha/Tiingo provider를 건너뛰고 Yahoo fallback으로 처리.
- FMP API key 실호출 검증 완료. `FMP_BASE_URL` trailing slash와 endpoint 조합 버그를 수정했고, NFLX quote/profile이 `stable/quote`, `stable/profile`에서 정상 조회됨.
- Telegram Agent 배포 준비 추가. `Dockerfile`, `.dockerignore`, `telegram:set-webhook` 스크립트, `docs/TELEGRAM_AGENT_DEPLOY.md`를 추가하고 `agent:server`가 `.env`가 없어도 배포 환경변수만으로 실행되도록 변경.
- Telegram Agent의 `/buy`, `/sell`, `/cash` pending action 초안과 inline button 승인/취소 흐름 추가. 승인 전에는 포트폴리오를 변경하지 않고, 승인 시에만 거래 기록 또는 현금 변경을 반영.
- 뉴스 알림 폭주 완화. 5점 긴급 기사는 기본 상위 3건만 즉시 Telegram 전송하고, 나머지는 다이제스트 버퍼로 이월하도록 변경. `MAX_URGENT_ALERTS_PER_RUN` 환경변수로 상한 조정 가능.
- 기사 중복 제거 보강. tracking parameter 제거 범위를 넓히고, DART 접수번호, 제목 signature, 유사 제목 Jaccard 판정으로 RSS/공시/버퍼/스코어링 단계의 중복을 더 강하게 제거.
- 로컬 스코어링 보강. 단일 최고 키워드 방식에서 `importanceScore`, `tradabilityScore`, `urgencyScore`, `eventType`, `matchedKeywords`를 계산하는 구조로 변경해 중요 뉴스와 실제 매매 연결 가능 뉴스를 구분.
- DART 공시 시간 표시 보정. DART 목록 API는 접수 시각이 아니라 접수일만 제공하므로 Telegram 알림에는 `00:00` 대신 `공시일`로 표시.
- 중복 제거와 스코어링 회귀 테스트 추가. `npm test` 기준 6개 테스트 통과.
- 뉴스 수집기를 `src/jobs/run-news-collector.js` 공용 job으로 분리. CLI(`npm run collect:news`)와 Agent Server `POST /jobs/news-collector`가 같은 로직을 호출한다.
- 수집 신뢰도 계층 도입. GitHub Actions `news-alert.yml`은 5분 메인 수집기에서 15분 백업 수집기로 격하하고, 메인 5분 수집은 Agent Server + 외부 Scheduler가 담당하도록 구조 변경. GitHub Actions cron은 timezone 필드가 아니라 UTC cron 두 줄로 KST 평일 07:00~23:00을 표현.
- 수집 상태 테이블 추가. `collector_runs`, `source_cursors`, `alert_events`, `job_locks` migration/schema를 추가해 lookback, 실행 성공/실패, 알림 이벤트, 동시 실행 방지 상태를 Supabase에 남길 수 있게 함.
- 마지막 성공 시각 기준 lookback 계산 추가. 기본 30분, 최대 240분, 10분 버퍼로 실행 누락을 따라잡고, catch-up run의 오래된 긴급 기사는 즉시 알림 폭탄 대신 버퍼로 이월.
- Supabase `20260507110000_add_collector_state.sql` migration 원격 적용 완료.
- `npm run collector:call` 추가. 배포된 Agent Server의 `POST /jobs/news-collector` endpoint를 `JOB_SECRET`으로 수동 검증할 수 있음.
- 운영 배포 보안 보강. `NODE_ENV=production`에서 `JOB_SECRET`이 없으면 `/jobs/news-collector`가 500으로 실패하도록 fail-closed 처리.
- 로컬 Agent Server smoke 확인 완료. `/health` 정상 응답, production에서 `JOB_SECRET` 미설정 수집 endpoint 차단 확인.
- Render Blueprint 추가. `render.yaml`로 web service와 5분 cron job을 정의하고, `npm run collector:scheduled`가 KST 평일 07:00~23:59 밖에서는 수집을 건너뛰도록 guard 추가.
- `performance-lab.js`, `behavior-reviewer.js` 추가. 주간/월간 리뷰에서 전체 추천, 실제 매수로 연결된 추천, 매수하지 않은 추천의 성과를 분리하고, 추천과 연결되지 않은 매수/차단 후보 매수/최소 손익비 미달 매수 같은 행동 경고를 생성.
- `recommendation-schema.js` 추가. 근거 기사, 기준 가격, 손절 기준, 손익비, 제안 비중/금액, 무효화 조건이 없는 후보는 `watch_only`로 강등하고 추천 성과 로그 저장에서 제외.
- Cloud Run Agent Server 운영 시작. `/health`, Telegram webhook, `/jobs/news-collector` 동작 확인. Cloud Scheduler가 5분 메인 수집을 담당하고 GitHub Actions는 백업 수집기로 유지.
- Cloud Run 메모리를 1GiB로 상향하고 `DISABLE_FINBERT=1` 적용. 5분 메인 수집은 안정성 우선으로 키워드/사전 감성을 사용하고, FinBERT는 GitHub Actions/로컬/배치 분석에서 사용.
- Supabase 포트폴리오 원본 전환. `portfolio_accounts`, `positions`를 `/portfolio` 우선 저장소로 쓰고 `/cash`, `/buy`, `/sell` 승인 시 Supabase 포트폴리오를 갱신. `PORTFOLIO_JSON_BASE64`는 bootstrap/fallback으로 격하.
- Cloud Run 중복 알림 방지 보강. 로컬 `seen-articles` 파일에만 의존하지 않고 Telegram 전송 전에 Supabase `alert_events`의 `sent`/`pending` 상태를 조회해 이미 보낸 즉시 알림과 이미 큐에 들어간 다이제스트 항목을 제외.
- 공공데이터포털 주식시세정보 provider 추가. 국내 EOD 가격은 `data-go-kr`를 우선 사용하고 KIS 일봉 fallback으로 `price_snapshots`에 백필할 수 있으며, `npm run prices:backfill-eod -- 005930,000660 2026-05-01 2026-05-07` 명령을 추가.
- 수집 운영 리뷰 추가. 주간/월간 성과 리뷰가 `collector_runs`와 `alert_events`를 조회해 Cloud Run/Scheduler 성공률, 실패 건수, lookback, 즉시 알림/다이제스트 대기 상태를 Telegram 점검 항목으로 표시.
- 로컬 대시보드 확장. `npm run dashboard` 결과 HTML에 추천 평가 품질, 미실행 추천 평균 성과, 행동 경고, Cloud Run/Scheduler 수집 운영 상태를 표시.
- Telegram `/help` 최신화. `/buy`, `/sell`, `/cash` 문법과 승인 버튼이 있어야 Supabase 포트폴리오에 반영된다는 운영 원칙을 명시.
- 추천 성과 평가를 국내 EOD 가격 계층에 연결. 국내 종목 1일/5일/20일 평가는 가능한 경우 공공데이터/KIS 일봉의 평가 대상일 종가와 high/low history를 사용하고, source/priceType/targetDate를 evaluation payload에 남김.
- `collector:ops-report`와 `collector-ops-report.yml` 추가. 평일 23:50 KST에 최근 1일 수집 성공률, 실패, lookback, 즉시 알림 실패, catch-up 대기 이상치를 private Telegram으로 전송.
- 해외 추천 평가 EOD 계층 추가. FMP historical EOD를 우선 사용하고 Tiingo/Alpha/Yahoo를 fallback으로 두어 미국 주식 추천도 평가 대상일 종가와 high/low history 기반으로 평가 가능.
- 다이제스트/캐치업 알림 이벤트 상태 정리. 즉시 전송 대상이 아닌 digest/catch_up 항목은 `pending` 대신 `buffered`로 저장하고, 중복 방지 active 상태에 포함. 운영 이상치 알림의 catch-up 기준은 기본 20건 초과로 완화.
- Telegram Agent 보안 보강. 개인방 chat id가 설정되어 있으면 공유방 `TELEGRAM_CHAT_ID`를 Agent 명령 allowlist에서 제외하고, pending action callback은 action 생성 chat과 승인 chat이 일치해야 처리.
- 해외 종목 후보에 FMP `fundamental_profile` 연결. 리스크 리뷰가 비활성 거래 종목을 차단하고, 고베타/ADR/미국 소형주/ETF 노출을 경고로 표시. Telegram 종목 리포트에는 섹터, 시가총액, beta를 함께 표시.
- Telegram `/pending` 명령 추가. private 채팅에서 최근 대기 중인 `/buy`, `/sell`, `/cash` 승인 초안을 조회할 수 있어 승인 전 상태를 확인 가능.
- Telegram `/recommendations` 명령 추가. 최근 추천 ID, 진입가, 손절가, 제안금액을 확인하고 `/buy ... rec=추천ID` 형태로 실제 거래 기록과 추천을 연결 가능.
- FMP 재무제표 요약 연결. 해외 후보의 `fundamental_profile.statements`에 매출/순이익 YoY, FCF 마진, 마진율, D/E, current ratio, P/E를 저장하고, 역성장/음수 FCF/높은 D/E를 리스크 리뷰 경고로 표시.
- FMP earnings calendar 연결. 해외 후보의 `fundamental_profile.earnings`에 다음 실적일, 예상 EPS/매출, 직전 EPS surprise를 저장하고, 7일 이내 실적발표와 직전 EPS 쇼크를 리스크 경고로 표시.
- 로컬 대시보드 추천 검증 화면 보강. `Latest Recommendations`에 진입가, 손절가, 제안금액, 차단/경고 요인을 표시하고, 최근 추천의 반복 리스크 이벤트를 별도 섹션으로 집계.
- KRX Open API 공식 EOD provider 추가. 국내 추천 성과 평가와 백필용 일별 종가는 KRX 일별매매정보를 우선 사용하고, 실패 시 Data.go.kr/KIS fallback으로 내려간다.
- GitHub Actions `KRX_OPENAPI_KEY` Secret 등록 확인. 추천 성과 평가 workflow가 KRX 공식 EOD provider를 사용할 수 있도록 env 주입 추가.
- Telegram `/recommendations` 문구 개선. `neutral/low/watch_only` 같은 내부 코드를 한국어 행동 문구로 번역하고, 제안금액에는 실제 제한 요인(`손실한도`, `1회 신규매수 상한`, `현금` 등)을 표시한다.
- 1회 신규매수 절대 상한 추가. 총자산 5%가 커져도 기본 제안금액은 `maxNewBuyAmount=1000000`을 넘지 않도록 보수적으로 제한.
- GitHub Actions `.env` 강제 로딩 제거. `action:report` 등 운영 npm script는 `.env`가 있으면 읽고, 없으면 Actions/Cloud 환경변수만으로 실행된다.
- DART 즉시 알림 정책 조정. DART 목록 API는 접수 시각이 없으므로 일반 중요 공시는 즉시 알림 대신 다이제스트로 이월하고, 거래정지/상장폐지/불성실공시/감사의견/횡령·배임 같은 치명 공시만 즉시 알림 후보로 유지.
- 장 마감 의사결정 리포트 문구 개선. `NEUTRAL`, VIX, USD/KRW, `risk_reward` 차단 사유를 사람이 이해하기 쉬운 한국어 설명으로 표시하고, 후보 종목 제안금액도 1회 신규매수 상한을 적용해 보여준다.
- KIS 접근토큰 공유 캐시 추가. 국내 현재가는 정확도 기준으로 KIS를 다시 우선 사용하되, `data/kis-token.json` 로컬 캐시와 Supabase service role 전용 `api_token_cache` 원격 캐시를 함께 사용해 Cloud Run/GitHub Actions/로컬이 같은 24시간 토큰을 재사용하도록 한다. EOD 평가는 KRX 우선으로 불필요한 KIS 일봉 호출을 줄인다.
- 일일 행동 리포트 문구 개선. 한국 주식 후보는 기준매수가/손절가/정수 주식 수/실제 투자금으로 표시하고, 1주 가격이 1회 상한보다 크면 매수 보류로 표시한다. 보유 유지에는 손익·비중·손절 기준 미도달 근거를, 축소 후보에는 매도 수량/비율 제안을 표시한다.
- 주간 성과 리뷰 문구 개선. AI 추천 성과, 내 실행 품질, 수집/알림 운영, 이번 주 점검 항목으로 분리하고 평균 추천 수익률/시장 대비 초과수익/추천 연결 거래의 의미를 한국어로 설명한다.
- Cloud Run 수집기 중복 카운트 보강. 휘발 로컬 캐시만 믿지 않고 Supabase `articles`를 기준으로 이미 저장된 원문을 제외하며, 낮은 점수/키워드 탈락 원문도 저장해 다음 실행에서 신규 카운트가 부풀지 않도록 조정했다.
- 포트폴리오 원본 동기화 보강. 평가 필드(`marketValue`, `costBasis`, `unrealizedPnlPct`, `quoteSource`, `fxRate`)를 정규화 과정에서 보존하고, `portfolio:snapshot`이 Supabase 원본을 우선 읽은 뒤 평가 결과를 `portfolio_snapshots`뿐 아니라 `portfolio_accounts`/`positions`에도 다시 저장한다.
- Telegram 추천/성과 문구 추가 개선. `/recommendations`의 `risk_reward`, `position_size` 같은 내부 차단 코드를 손익비 부족/매수 가능 금액 없음처럼 설명형 한국어로 바꾸고, 추천 성과 평가의 “방향 반영 수익률” 계산 의미를 메시지 본문에 함께 표시한다.
- 추천 후보 필터 강화. 손익비가 낮거나 리스크 리뷰를 통과하지 못한 종목은 `recommendations` 로그/성과평가 대상에 새로 저장하지 않고, Telegram `/recommendations` 기본 화면도 `risk_review.approved=true`, `action=candidate`, 손익비/진입가/손절가가 모두 있는 후보만 “매수 검토 후보”로 표시한다. 차단/관찰 후보는 기본 화면에서 숨기고 `/recommendations blocked`처럼 명시적으로 요청했을 때만 참고 섹션에 보여준다.
- 시장 레짐 세분화 적용. 기존 `RISK_ON/NEUTRAL/RISK_OFF`에 더해 `STRONG_RISK_ON`, `FRAGILE_RISK_ON`, `PANIC`을 실제 `scoreMarketRegime` 결과로 반환하고, Telegram 설명과 행동 가드레일에 연결했다. 과열/대형주 쏠림 장은 `FRAGILE_RISK_ON`으로 분류되어 더 높은 손익비 기준과 제한적 매수 정책을 적용한다.
- Telegram 포트폴리오 변경 승인 흐름을 실제 Supabase 기준으로 점검했다. `/buy`, `/sell`은 초안 생성 후 취소, `/cash 15000000`은 현재 현금과 같은 값으로 승인해 버튼 승인/취소 경로와 `pending_actions` 상태 전환을 확인했다.
- 가격 데이터 품질 요약을 주간/월간 성과 리뷰에 연결했다. `price_snapshots` 기준으로 KRX/Data.go.kr 공식 EOD, KIS EOD fallback, Naver/Yahoo fallback 비중과 오래된 가격 의심 건수를 계산하고 Telegram 성과 리뷰에 별도 섹션으로 표시한다.
- 로컬 HTML 대시보드를 Freedom 중심으로 재구성했다. `npm run dashboard`는 `data/dashboard/index.html`을 생성하며, 첫 화면에서 목표 자산/현재 자산/달성률/필요 연수익률/예상 도달일/하락 스트레스 지연을 먼저 보여주고 가격 데이터 품질 섹션도 함께 표시한다.
- 리포트 입력 데이터의 Supabase 우선순위를 높였다. 장 마감 종목 분석은 Supabase `articles`의 중요 기사와 로컬 아카이브를 병합해 사용하고, 일일 행동 리포트는 로컬 `portfolio.json`보다 Supabase `portfolio_accounts`/`positions` 원본을 먼저 사용한다.
- 다이제스트 입력 버퍼를 Supabase 우선으로 전환했다. `digest`는 `alert_events`의 `digest`/`catch_up` 대기 항목과 로컬 `article-buffer.json`을 병합해 요약하고, Telegram 전송 성공 후 Supabase 대기 이벤트를 `sent`로 갱신한다.
- 추천 성과 분석을 고도화했다. `performance-lab`이 실패 원인을 `stop_touched`, `low_risk_reward`, `underperformed_benchmark`, `large_drawdown` 등으로 자동 분류하고, 섹터별/리스크 요인별 승률·평균 신호수익률을 주간/월간 성과 리뷰에 표시한다.
- Telegram 승인 흐름 smoke를 추가했다. `npm run telegram:smoke-actions`는 `/buy`, `/sell`, `/cash` 초안을 생성한 뒤 모두 취소해 Supabase `pending_actions`와 callback 경로를 검증하며, 실제 거래/현금 변경은 수행하지 않는다. GitHub Actions `telegram-smoke-actions.yml`로 평일 08:10 KST에 정기 점검한다.
- 가격 provider 호출 시도 로그를 추가했다. `price_provider_attempts`에 provider/ticker/price_type/status/latency/error를 저장하고, 주간/월간 성과 리뷰의 가격 데이터 품질 섹션에서 provider 호출 수, 실패율, 빈 응답률을 함께 표시한다.
- 다이제스트 전송 후 상태 추적을 운영 리포트에 보강했다. 주간/월간 성과 리뷰의 수집/알림 운영 섹션이 `digest`와 `catch_up` 각각의 전송완료/대기/실패 건수를 따로 보여주고, 상태 전환 실패가 있으면 이상치로 표시한다.
- 추천 생성 AI 버전 추적을 추가했다. 종목 분석 리포트와 추천 로그에 `aiMetadata`를 저장하고, Supabase `recommendations`에 `ai_provider`, `ai_model`, `prompt_version`, `ai_metadata`를 별도 컬럼으로 남긴다. 주간/월간 성과 리뷰는 프롬프트/모델 조합별 승률과 평균 추천 수익률을 분리 표시한다.
- Telegram 승인 흐름 smoke 실패 알림을 추가했다. `telegram-smoke-actions.yml`에서 smoke 단계가 실패하면 `notify:workflow-failure`가 private Telegram으로 워크플로우명, 작업명, 브랜치, 커밋, GitHub Actions 로그 링크를 보낸다.
- 가격 provider 운영 알림을 추가했다. `price-provider:ops-report`는 최근 provider 호출 실패율, 빈 응답률, fallback 비중, 오래된 가격 스냅샷을 점검하고 기준 초과 시 private Telegram으로 보낸다. GitHub Actions `price-provider-ops-report.yml`은 평일 23:55 KST에 실행된다. fallback 탐색 과정의 빈 응답은 정상적으로 발생할 수 있어 경보 기준을 90%로 둔다.
- 운영 알림 end-to-end를 확인했다. `notify:workflow-failure` dry-run은 private Telegram 전송에 성공했고, 가격 provider 점검은 의도적으로 낮춘 기준에서 private Telegram 경보 전송이 성공했다. Action Report workflow는 수동 실행에서 리포트 저장과 Telegram 전송까지 성공했다.
- 프롬프트/모델별 추천 성과에 최소 표본 기준을 추가했다. 주간/월간 성과 리뷰는 모델별 평가 건수가 5건 미만이면 `표본 부족`으로 표시해, Claude Sonnet 전환 효과를 성급하게 판단하지 않도록 한다.
- 가격 provider 운영 판단을 추가했다. 가격 점검과 주간/월간 성과 리뷰가 실패율, 공식 EOD 비중, fallback 비중을 보고 `현재 구조 유지`, `API 장애 점검`, `해외/글로벌 가격 API 보강 검토` 같은 행동 판단을 함께 표시한다.
- 일일 행동 리포트에 포트폴리오 섹터 한도 강제 적용을 추가했다. 이미 특정 섹터가 `maxSectorRatio`를 초과하면 같은 섹터 신규 추천은 매수 후보가 아니라 관찰 후보로 내려가고, 해당 섹터 보유 종목은 축소 후보로 표시된다.
- 보유 종목 손절/익절/리밸런싱 규칙을 보강했다. 일일 행동 리포트는 평단 기준 손절가와 수익 구간의 추적 손절가 중 더 보수적인 값을 표시하고, 종목/섹터 한도 초과 또는 이익 잠금 후보는 초과분/25% 기준 축소 수량을 계산해 보여준다.
- 브리핑/리포트 입력 데이터의 DB 조회 경로를 보강했다. Supabase `daily_summaries`, `stock_reports` 로더를 추가하고 다이제스트/장마감 종목 분석 프롬프트에 최근 저장 요약과 최근 종목 리포트의 압축 컨텍스트를 함께 넣어 시장 레짐과 이전 후보 맥락을 이어간다.
- 시장 레짐 점수에 원자재와 가격 반응을 추가했다. WTI 유가 급등/급락, 구리 20일 약세, 금 상승과 VIX 동반 상승을 위험 태그로 반영하고, 호재성 뉴스가 많은데 KOSPI가 하락하는 `NEGATIVE_PRICE_REACTION`과 악재에도 시장이 오르는 `RESILIENT_PRICE_REACTION`을 구분한다.
- 추천 품질 리포트를 모델별, 프롬프트 버전별, 프롬프트+모델 조합별로 분리했다. 주간/월간 성과 리뷰는 각 그룹의 평가 건수, 승률, 평균 추천 수익률, 표본 부족 여부를 따로 표시하고, 추천을 실제로 산 경우와 추천했지만 매수하지 않은 경우의 평균 성과 차이를 계속 보여준다.
- 로컬 백테스트용 선택형 worker를 추가했다. `npm run backtest:worker -- providers`로 pykrx/FinanceDataReader 설치 여부를 확인하고, 설치된 로컬 환경에서는 `ohlcv` 명령으로 국내 종목 일봉을 JSON으로 가져올 수 있다. 운영 수집은 계속 KRX/Data.go.kr/KIS 등 공식 API 경로를 사용한다.

## 다음 작업

1. 프롬프트/모델별 추천 성과 5건 이상 누적 후 Claude Sonnet 전환 효과 평가
2. Action Report 정기 실행 안정성 모니터링
3. 가격 provider의 `해외/글로벌 가격 API 보강 검토` 판단이 반복되는지 모니터링
4. 다음 실제 workflow 실패 시 private 알림 도착 여부 재확인
