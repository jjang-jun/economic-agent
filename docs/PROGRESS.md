# Development Progress

이 문서는 현재 개발 상태, 운영 판단, 다음 작업을 사람이 빠르게 확인하기 위한 진행 기록입니다. 현재 운영 기준 문서는 `AGENTS.md`, `README.md`, `ROADMAP.md`, `docs/PROGRESS.md`입니다.

## 목표

이 프로젝트의 목표는 단순 뉴스 요약이나 종목 추천기가 아니라, **내 순자산이 경제적 자유 목표에 도달할 확률을 높이는 개인 AI 경제 사무실**이 되는 것입니다. AI는 분석 참모로서 상태 파악과 행동 후보·리스크·성과 검증을 돕고, 외부 행동과 자산 변경의 최종 판단은 사용자가 맡습니다.

```
경제적 자유 목표와 포트폴리오 상태
  -> 시장/공시/정책/가격/수급 수집
  -> 시장 레짐 판단
  -> 내 자산 영향과 종목 후보·리스크 도출
  -> 포트폴리오 기준 행동 가드레일 적용
  -> 사용자 확인·승인
  -> 추천/결정/실행/성과 기록
  -> 누적 히스토리로 개선
```

범용 개인 AI 조직 운영체제는 현재 구현 범위에서 분리하고 `docs/future/AI_AGENT_TEAM_BLUEPRINT.md`에 미래 설계로 보존합니다. 현재 저장소는 경제적 자유 목표에 직접 기여하는 경제·투자·자산관리 도메인에 집중합니다.

## 현재 상태

- 뉴스/RSS/DART 공시 수집: 동작
- 로컬 스코어링: 키워드, 섹터, FinBERT 기반으로 동작
- Discord 즉시 알림: score 5 중 보유/명시적 critical 종목의 치명 공시 또는 시장 전체 사건만 대상
- 정기 AI 다이제스트: 평일 08:20, 11:50, 15:45, 17:10, 22:40 KST
- 장 마감 종목 리포트: 당일 기사 아카이브 기반
- 추천 성과 평가: 1일/5일/20일, KOSPI 벤치마크 대비 평가
- 시장 레짐/행동 가드레일: 초안 적용
- 홈 서버 PostgreSQL/PostgREST 히스토리 저장: macOS ARM64 Docker에서 기동, 초기 Supabase 시점 복원과 29개 테이블 REST pull 완료; 최종 cutover 증분 동기화 대기
- 로컬 파일시스템 미러: `npm run db:pull`로 JSON/SQLite 생성
- AI 토큰 절약: 상위 기사/핵심 스냅샷만 프롬프트에 사용

## 최근 변경

> 2026-08-05 이전 항목은 당시 운영 상태를 보존한 역사 기록입니다. 그 안의 이전 메시징 플랫폼 명령·환경변수·배포 경로는 현재 실행 지침이 아니며, 현재 운영은 Discord 단독 기준입니다.

### 2026-08-06 부동산 저점 매수 레이더 1차

- 최종 주택 목표를 서울·경기 아파트의 정확한 바닥 예측이 아니라, 2~3년 안에 저점에 가까운 `매수 검토 구간`에서 합리적으로 매수하는 것으로 명시했다. 관찰 가격대는 5.8억~9.5억원, 우선 목표는 8.5억~9.5억원이다.
- 국토교통부 아파트 매매·전월세 API 수집기와 매일 03:20 KST PC worker 작업을 추가했다. 신고 지연·정정·해제를 반영하도록 최근 2개월을 반복 조회한다.
- 지역·월별 거래량, 중위가격, ㎡당 가격, 전월 대비 가격·거래량, 전세가율, 계약해제 비율을 저장하고 `하락 지속/안정화/거래 회복 관찰/추격 위험/표본 부족`으로 분류한다.
- 생애최초 70% LTV·6억원 가격구간 한도·DSR 40%를 현재 시점의 **검증 필요 가정**으로 둔 가격대별 대출/현금/월상환 시나리오를 추가했다. 실제 매수 시점 규정과 부부소득·기존부채 없이는 확정 한도로 표현하지 않는다.
- 호가는 실거래와 분리한 `real_estate_listing_snapshots`에 저장한다. 공식 공개 API가 없는 플랫폼의 무단 크롤링은 넣지 않았고, 허가받은 JSON feed가 있을 때만 03:50 작업을 활성화하도록 fail-closed 처리했다.
- 부동산 전문가 컨텍스트에 주택 목표·대출 시나리오·최근 지역 지표·정책을 추가했다. 상세 운영 기준은 `docs/REAL_ESTATE_STRATEGY.md`다.
- 24개월 실거래 백필을 지역별로 실행하고 완료 지역을 ignored 체크포인트에 기록해 네트워크 중단 후 재개할 수 있게 했다. 백필 지표에는 1·3·12개월 가격 변화, 12개월 거래량 변화, 24개월 중위가격 고점 대비 낙폭을 포함한다.
- 한국부동산원 R-ONE 공식 월간 아파트 매매가격지수 표 `A_2024_00045` 수집기를 추가했다. 월요일 04:10 KST에 24개월 서울·경기 지수를 재조회하되 `REB_OPEN_API_KEY`와 활성화 플래그가 없으면 실행하지 않는다.
- 2026-08-07 공공데이터포털 활용신청 반영 후 서울·경기 69개 지역의 24개월 초기 백필을 완료했다. 로컬 PostgREST 기준 목표 가격대 매매 118,247건, 전월세 1,126,303건, 지역월 지표 1,431건과 R-ONE 지수 1,982건을 저장했다.
- 2026-08-05/06 정책 레이더의 정부 공식 RSS 동시 timeout 재발에 대응해 소스별 25초 timeout과 2회 재시도를 Workflow에 적용했다. 가격 Provider 감사 로그의 저장 실패는 부가 관측 장애로 격리해 핵심 종목 리포트 저장 회로차단기를 열지 않도록 수정했다.

### 2026-08-05 홈 서버 전환

- 목표 운영 구조를 항상 켜진 Windows/macOS/Linux 공통 Node.js PC worker와 같은 장비의 오픈소스 PostgreSQL DBMS로 변경했다. PostgREST는 기존 저장 코드 호환을 위한 localhost 전용 내부 API로만 사용한다.
- PC scheduler에 KST 기준 수집·다이제스트·리포트·평가·리뷰 일정, catch-up, 동시 실행 제한, retry, job lock, 실행 이력, heartbeat를 추가했다. 기본값은 실제 작업을 실행하지 않는 `shadow`이며 72시간 검증 후에만 `active`로 전환한다.
- Discord Gateway worker가 일반 멘션뿐 아니라 `INTERACTION_CREATE`의 Slash와 승인 버튼도 처리하도록 확장했다. 자연어 본문 수신을 위해 Message Content Intent를 명시하며 guild/user/channel allowlist는 그대로 유지한다.
- `infra/home-server/docker-compose.yml`에 PostgreSQL 17과 PostgREST를 추가하고 두 포트를 `127.0.0.1`에만 바인딩했다. 스키마 적용·상태 점검·AES-256-GCM 선택형 백업 명령과 `docs/HOME_SERVER.md`를 추가했다.
- 현재 macOS ARM64 장비의 Docker Desktop에서 PostgreSQL 17과 PostgREST를 기동했다. PostgREST 호스트 포트는 일반 개발 서버와 충돌하지 않도록 `127.0.0.1:3210`으로 정했고 PostgreSQL 5432도 loopback에만 바인딩했다. Supabase data-only dump 약 14.8MB를 로컬에 복원하고 29개 테이블 REST pull/SQLite mirror 생성을 완료했다. 핵심 22개 테이블은 원본과 건수가 일치했고, 기사·가격·수집 로그 7개는 백업 이후 원본 workflow가 계속 기록해 원본이 더 많다. 최종 cutover 때 스케줄을 잠시 정지하고 마지막 동기화·정확 대조·백업 복원 시험을 수행한다.
- Discord Developer Portal에서 Message Content Intent를 활성화한 뒤 Gateway READY와 로컬 PostgreSQL heartbeat `gateway_connected=true`를 확인했다. Gateway가 네트워크 `error`만 내고 `close` 이벤트를 내지 않는 경우에도 다음 재연결을 예약하도록 보강했다. Discord 자동완성에서 봇 계정 대신 같은 이름의 관리 역할이 선택되는 실제 사례를 반영해, guild/user/channel allowlist를 모두 통과한 경우에만 `DISCORD_AGENT_ROLE_IDS`의 역할 멘션도 처리한다.
- Codex 장기 대화의 컨텍스트 지연을 줄이기 위해 `docs/CURRENT_STATE.md`를 새 세션용 압축 SSoT로 추가했다. 새 세션은 `AGENTS.md`와 이 문서를 먼저 읽고, 362줄 이상의 `docs/PROGRESS.md`와 800줄 이상의 `README.md`는 필요한 부분만 검색한다.
- PC worker shadow 판정을 자동화하는 `npm run worker:shadow-audit`을 추가했다. 설정된 관찰 시작부터 기대되는 27개 작업 스케줄과 DB 기록을 대조하고 누락, 잘못된 상태, 10분 초과 지연, heartbeat/Gateway, 72시간 진행률을 함께 판정한다. 초기 설정·재시작 구간은 준비 관찰로 남기고 최종 수정본 기준 2026-08-05 18:07 KST부터 깨끗한 72시간을 다시 측정한다.

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

항상 켜진 PC의 PostgreSQL을 장기 기준 저장소로 사용하고 PostgREST는 localhost 전용 호환 API로 둡니다. 로컬 `data/`는 실행 중 fallback과 분석 미러입니다. Supabase는 이관 대조와 72시간 shadow가 끝날 때까지만 안전망으로 유지합니다.

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
- 추천 종목별 진입 타이밍 프로필 추가. 5일선/20일선 정렬, 20일선 대비 이격, 20일선 기울기, 거래량 확인, 20일 고점 돌파/눌림목 여부를 계산하고 추격매수 또는 20일선 하회 후보는 `entry_timing` 차단 사유로 매수 보류 처리.
- 장전/장중 매매 타이밍 알림을 추가했다. 최근 국내주식 추천을 기준으로 08:45 KST 장전 후보표를 보내고, 장중에는 돌파/눌림목 조건이 충족된 후보만 중복 없이 Telegram private 채널로 알린다.
- 타이밍 알림 실행 시각 가드를 추가했다. GitHub Actions schedule이 1시간 이상 지연돼도 `premarket` 스텝이 10:25 KST처럼 장중에 도착하면 제목을 장전으로 보내지 않고 실제 KST 시각 기준으로 장중 모드로 자동 전환한다. 장 종료 뒤 실행되면 전송을 건너뛴다.
- 무료/저비용 `pre-news:signal` 엔진을 추가했다. 보유 종목, 최근 국내 추천, 워치리스트 대표주만 15분 간격으로 감시해 거래량 증가, 20일 고점 돌파/근접, 5일선·20일선 정렬, KOSPI 대비 상대강도 개선을 점수화하고 강한 가격·거래량 이상징후가 생겼을 때만 Telegram private 채널로 보낸다.
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
- `action:report`에 `가격 모멘텀 관찰` 섹션을 추가했다. 최근 뉴스 기반 추천이 없더라도 `watchlist.domesticMomentum` 대표주에서 20일 고점 근접, 거래량 증가, 상대강도 개선이 잡히면 별도 관찰 후보로 보여준다. 과열 이격은 `추격 금지` 경고로 표시한다.
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
- 뉴스 알림 폭주 완화. 5점이나 관심 키워드만으로 즉시 전송하지 않고 보유 종목·`watchlist.criticalAlerts`의 치명 공시 또는 시장 전체 긴급 사건만 Telegram 속보로 허용한다. 가격 관찰 watchlist와 거래정지 해제·불성실공시 미지정/예고·액면병합 같은 행정 공시는 다이제스트로 이월하며 기본 실행당 상한은 1건, KST 일일 상한은 2건이다.
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
- Telegram 승인 흐름 smoke의 외부 장애 분류를 보강했다. 2026-06-10부터 2026-07-13까지 정기 실행 24회가 Supabase/PostgREST `503 PGRST002 schema cache`로 연속 실패했다. 이후 일시 장애 스킵을 넣었으나 2주 장애까지 녹색 workflow로 숨긴 문제가 확인되어, 2026-07-29부터 정기/수동 실행 모두 persistence 불가를 실패로 표시한다.
- 가격 provider 호출 시도 로그를 추가했다. `price_provider_attempts`에 provider/ticker/price_type/status/latency/error를 저장하고, 주간/월간 성과 리뷰의 가격 데이터 품질 섹션에서 provider 호출 수, 실패율, 빈 응답률을 함께 표시한다.
- `db:pull`을 누적 데이터에 맞게 보강했다. Supabase REST 기본 1000건 한도에 걸리지 않도록 페이지 단위로 전체 테이블을 내려받고, PostgREST 408/429/5xx 일시 오류에는 retry/backoff를 적용한다.
- 가격 provider 운영 점검을 provider별 빈 응답률까지 보강했다. 전체 empty 비율이 임계값 이하라도 Alpha Vantage/FMP/Tiingo처럼 특정 provider가 반복적으로 100% empty를 내면 이상치로 표시한다.
- 다이제스트 전송 후 상태 추적을 운영 리포트에 보강했다. 주간/월간 성과 리뷰의 수집/알림 운영 섹션이 `digest`와 `catch_up` 각각의 전송완료/대기/실패 건수를 따로 보여주고, 상태 전환 실패가 있으면 이상치로 표시한다.
- 추천 생성 AI 버전 추적을 추가했다. 종목 분석 리포트와 추천 로그에 `aiMetadata`를 저장하고, Supabase `recommendations`에 `ai_provider`, `ai_model`, `prompt_version`, `ai_metadata`를 별도 컬럼으로 남긴다. 주간/월간 성과 리뷰는 프롬프트/모델 조합별 승률과 평균 추천 수익률을 분리 표시한다.
- GPT-5.6 모델 패밀리 전환 경로를 추가했다. OpenAI 기본은 비용/품질 균형형 `gpt-5.6-terra`이고, OpenAI 호출은 Responses API와 Structured Outputs를 사용한다. 다이제스트는 low, 종목 분석은 medium reasoning을 기본으로 하며 실제 응답 모델·토큰·지연·종료 상태를 `aiMetadata`에 기록한다. 다른 provider의 기존 API 경로는 유지한다.
- 2026-07-29 GPT-5.6 기준선 마이그레이션을 보강했다. OpenAI 요청은 작업별 `text.verbosity`를 명시하고 reasoning/verbosity 값을 호출 전에 검증한다. 응답의 캐시 읽기·쓰기 토큰, reasoning context, 미완료 사유를 `aiMetadata`에 추가했으며, 성과 분석은 같은 모델이라도 reasoning/verbosity 설정이 다르면 별도 조합으로 집계한다. 선택적 `OPENAI_SAFETY_IDENTIFIER`는 요청에만 전달하고 기록하지 않는다.
- 운영 추천 생성이 `claude-sonnet-4-20250514` 404를 성공 workflow로 숨기던 문제를 확인했다. AI provider 오류는 workflow 실패로 전파하고, OpenAI key 등록 전 Anthropic 안전망은 공식 현재 ID `claude-sonnet-5`를 사용한다. 주간 리뷰는 Supabase 조회 실패를 추천 0건이나 수집기 stale로 표시하지 않고 `데이터 조회 불가`로 구분한다.
- GPT-5.6 프롬프트 계약을 보강했다. 다이제스트에도 외부 기사 prompt-injection 경계를 추가했고, 종목 분석은 근거가 부족할 때 억지로 3개 이상 추천하지 않고 빈 `stocks`를 허용한다. 종목 프롬프트는 최신 거시 위험 규칙을 반영한 `stock-analysis-v2.3`, 다이제스트는 `digest-v1.1`로 구분한다.
- 저비용 중국 모델 canary 경로를 추가했다. `AI_PROVIDER=qwen`은 Alibaba Cloud 국제 OpenAI 호환 endpoint와 `qwen3.7-flash`, `AI_PROVIDER=deepseek`은 `deepseek-v4-flash`를 사용한다. 두 provider는 JSON object 모드와 작업별 thinking on/off를 지원하며 기본은 비용 통제를 위해 `disabled`다. 실제 운영 provider와 비밀키는 자동 변경하지 않았다.
- 2026-07-29 공식 지표를 기준으로 거시 레짐을 재검토했다. 한국은 Q2 GDP +0.6% QoQ, 6월 CPI 3.2%, 기준금리 2.75%와 추가 인상 편향, 강한 수출·반도체 집중이 동시에 나타났고 제조업/건설 고용은 감소했다. 미국은 6월 CPI 3.5%, 실업률 4.2%, 6월 신규고용 +57천명으로 물가와 고용 둔화가 겹쳤으며, 중국은 첨단 제조/무역과 부동산/내수의 양극화가 지속됐다. 이를 날짜별 상수로 고정하지 않고 현재 FRED 지표와 기사 조합에서 `STAGFLATION_RISK`, `KOREA_TIGHTENING_RISK`, `EXPORT_CONCENTRATION`, `CHINA_DEMAND_RISK`, `OIL_GEOPOLITICAL_TAIL_RISK`를 동적으로 생성하도록 했다.
- FRED `CPIAUCSL` 원지수(예: 300대)를 물가상승률처럼 프롬프트에 전달하던 의미 오류를 수정했다. FRED의 `units=pc1`을 사용해 전년동월비를 가져오고 지표 날짜와 `%` 단위를 명시한다.
- 2026-07-13 운영 AI canary에서 현재 안전망인 Anthropic `claude-sonnet-5`가 실제 응답 모델과 `end_turn`을 반환해 과거 404 모델 ID 장애가 해소됐음을 확인했다. GPT-5.6 실운영 비교는 GitHub Actions에 `OPENAI_API_KEY`가 등록된 뒤 시작한다.
- 종목 분석 `related_news` 인덱스가 전체 기사 배열의 다른 기사 ID로 저장될 수 있던 문제를 수정했다. AI에 실제 제공한 선택 기사 배열에서 즉시 `related_article_ids`를 확정하고 추천 로그는 이 ID를 우선 사용한다.
- 속보 정책을 실제 발송 이력 기준으로 강화했다. 로컬 미러의 과거 즉시 전송 164건은 모두 관련성 없는 DART 공시였고 새 정책을 재적용하면 164건 모두 다이제스트 대상이다. 앞으로 보유·명시적 critical 종목의 치명 공시와 시장 전체 긴급 사건만 즉시 허용하며 실행당 기본 상한은 1건, 일일 상한은 2건이다. 같은 금리 결정·서킷브레이커·동일 기업의 같은 치명 공시 후속 기사는 24시간 동안 한 사건으로 묶고 나머지는 정기 다이제스트로 이월한다.
- Telegram 중요 알림 모드는 정기 다이제스트 5회와 하루 단위 리포트는 유지하고 실시간성 알림만 축소한다. 장전/장중 타이밍 알림은 리스크와 진입 타이밍을 모두 통과한 신규 후보만 하루 한 번 보낸다.
- 가격·거래량 선행 이상징후는 보유·최근 추천의 점수 7 이상 복합 신호 또는 관심 종목의 당일 ±10% 이상 극단 움직임으로 제한한다. 이 탐지기는 기사 발생을 예측하거나 관련 뉴스가 없음을 확인하지 않으며 원인 조사 대상만 알린다.
- Telegram 승인 흐름 smoke 실패 알림을 추가했다. `telegram-smoke-actions.yml`에서 smoke 단계가 실패하면 `notify:workflow-failure`가 private Telegram으로 워크플로우명, 작업명, 브랜치, 커밋, GitHub Actions 로그 링크를 보낸다.
- 가격 provider 운영 알림을 추가했다. `price-provider:ops-report`는 최근 provider 호출 실패율, 빈 응답률, fallback 비중, 오래된 가격 스냅샷을 점검하고 기준 초과 시 private Telegram으로 보낸다. GitHub Actions `price-provider-ops-report.yml`은 평일 23:55 KST에 실행된다. fallback 탐색 과정의 빈 응답은 정상적으로 발생할 수 있어 경보 기준을 90%로 둔다.
- 가격 provider 운영 알림에 야간 전송 가드를 추가했다. GitHub Actions가 크게 지연돼 02:14 KST처럼 새벽에 실행되면 운영 점검 메시지는 Telegram 전송을 건너뛰고 로그만 남긴다. 필요하면 `PRICE_PROVIDER_ALLOW_OFF_HOURS=1`로 강제 전송할 수 있다.
- 운영 알림 end-to-end를 확인했다. `notify:workflow-failure` dry-run은 private Telegram 전송에 성공했고, 가격 provider 점검은 의도적으로 낮춘 기준에서 private Telegram 경보 전송이 성공했다. Action Report workflow는 수동 실행에서 리포트 저장과 Telegram 전송까지 성공했다.
- 프롬프트/모델별 추천 성과에 최소 표본 기준을 추가했다. 주간/월간 성과 리뷰는 모델별 평가 건수가 5건 미만이면 `표본 부족`으로 표시해, Claude Sonnet 전환 효과를 성급하게 판단하지 않도록 한다.
- 가격 provider 운영 판단을 보정했다. 가격 점검과 주간/월간 성과 리뷰가 실패율, 공식 EOD 비중, 국내 fallback 비중, 해외 Yahoo 현재가 사용률을 분리해 보고, 해외 Yahoo 현재가 비중만 높을 때는 장애성 `해외/글로벌 가격 API 보강 검토` 대신 `해외 실시간 가격 API는 필요 시 보강`으로 모니터링한다. `npm run db:pull`도 `price_provider_attempts` 미러를 함께 생성한다.
- 서버 로그 점검에서 2026-05-29 20:40 KST Supabase/Cloudflare 521 응답이 HTML 본문 전체로 기록되던 문제를 확인했다. PostgREST 실패 로그는 HTTP 상태와 JSON 메시지 또는 Cloudflare error code만 한 줄로 남기도록 줄였고, 주간 성과 리뷰의 `recommendationSummary is not defined` 런타임 실패와 `protobufjs` audit 실패를 함께 해소했다.
- 배포 최신성 점검을 추가했다. `npm run deploy:freshness`와 `deploy-freshness.yml`은 서버 `/version`의 `commitSha`와 GitHub 최신 커밋을 비교해 Cloud Run/Render 배포가 밀리면 private Telegram으로 알린다. Supabase/PostgREST 호출은 521/429/5xx/네트워크 오류에 한해 기본 1회 재시도하고, `SUPABASE_RETRY_COUNT`, `SUPABASE_RETRY_DELAY_MS`로 조정할 수 있다.
- 기업가치평가 1차 모델을 추가했다. FMP 재무 요약에서 PER, PSR, P/FCF, FCF 수익률을 보존하고 `valuation-profile`이 성장률/현금흐름과 함께 평가한다. 비싸면서 성장/현금흐름이 약한 후보는 `watch_only`로 차단하고, AI/반도체 사이클에서 강한 성장으로 일부 정당화되는 고밸류 후보는 차단 대신 눌림/분할 경고로 남긴다.
- 공백 감지와 자체 개선 루프를 보강했다. Collector Ops는 마지막 성공 시각과 경과분을 추적해 수집 성공이 45분 이상 비면 `stale`로 경고하고, workflow를 12:05 KST에도 추가 실행한다. Agent Server `/health`는 시작 시각과 uptime을 반환하고 요청별 상태/소요시간 로그를 남긴다. 주간/월간 성과 리뷰는 점검 메모와 별도로 `다음 개선 액션`을 만들어 놓친 추천의 성과, 손익비 실패 반복, 손절 기준 누락, 운영 공백/가격 provider 경고를 행동 항목으로 Telegram에 표시한다.
- 성과 리뷰 학습을 다음 종목 추천에 환류하도록 했다. `performance-learning`이 최신 주간/월간 리뷰에서 손익비 실패, 큰 낙폭/손절 문제, 손절 기준 누락, 실행 연결 문제를 읽어 `performanceLearning.rules`를 만들고, 장마감 종목 분석의 `decision`에 붙인다. `recommendation-risk`와 `risk-reviewer`는 이 룰을 반영해 최소 손익비를 일시 상향하거나 손절/진입 타이밍 미승인 후보를 `watch_only`로 내린다.
- Telegram 소음 관리를 위해 반복성 private 리포트 빈도를 낮췄다. 경제적 자유 상태와 실제 거래 성과 workflow는 평일 매일 대신 금요일 1회로 조정하고, 일일 포트폴리오 스냅샷과 추천 성과 평가는 기존처럼 운영 데이터 갱신 위주로 유지한다.
- 일일 행동 리포트에 포트폴리오 섹터 한도 강제 적용을 추가했다. 이미 특정 섹터가 `maxSectorRatio`를 초과하면 같은 섹터 신규 추천은 매수 후보가 아니라 관찰 후보로 내려가고, 해당 섹터 보유 종목은 축소 후보로 표시된다.
- 보유 종목 손절/익절/리밸런싱 규칙을 보강했다. 일일 행동 리포트는 평단 기준 손절가와 수익 구간의 추적 손절가 중 더 보수적인 값을 표시하고, 종목/섹터 한도 초과 또는 이익 잠금 후보는 초과분/25% 기준 축소 수량을 계산해 보여준다.
- 브리핑/리포트 입력 데이터의 DB 조회 경로를 보강했다. Supabase `daily_summaries`, `stock_reports` 로더를 추가하고 다이제스트/장마감 종목 분석 프롬프트에 최근 저장 요약과 최근 종목 리포트의 압축 컨텍스트를 함께 넣어 시장 레짐과 이전 후보 맥락을 이어간다.
- 시장 레짐 점수에 원자재와 가격 반응을 추가했다. WTI 유가 급등/급락, 구리 20일 약세, 금 상승과 VIX 동반 상승을 위험 태그로 반영하고, 호재성 뉴스가 많은데 KOSPI가 하락하는 `NEGATIVE_PRICE_REACTION`과 악재에도 시장이 오르는 `RESILIENT_PRICE_REACTION`을 구분한다.
- 추천 품질 리포트를 모델별, 프롬프트 버전별, 프롬프트+모델 조합별로 분리했다. 주간/월간 성과 리뷰는 각 그룹의 평가 건수, 승률, 평균 추천 수익률, 표본 부족 여부를 따로 표시하고, 추천을 실제로 산 경우와 추천했지만 매수하지 않은 경우의 평균 성과 차이를 계속 보여준다.
- 로컬 백테스트용 선택형 worker를 추가했다. `npm run backtest:worker -- providers`로 pykrx/FinanceDataReader 설치 여부를 확인하고, 설치된 로컬 환경에서는 `ohlcv` 명령으로 국내 종목 일봉을 JSON으로 가져올 수 있다. 운영 수집은 계속 KRX/Data.go.kr/KIS 등 공식 API 경로를 사용한다.
- 월간 성과 리뷰에 선택형 Python 리서치 worker 연결을 추가했다. `LOCAL_RESEARCH_WORKER_ENABLED=true`일 때만 최근 국내 추천 후보 최대 3개에 대해 로컬 `ohlcv` worker를 호출하고, 기간 수익률/최대낙폭/거래일 수를 `backtestResearch` sidecar와 Telegram 로컬 리서치 섹션에 표시한다. 기본값은 비활성이라 Python 의존성이나 데이터 provider 실패가 정기 리뷰를 막지 않는다.
- Agent harness 문서를 추가해 Codex/sub-agent 장기 작업의 목표·범위·안전·검증·handoff 계약을 명시했다. `npm run agent:harness-check`는 `AGENTS.md`, `README.md`, `docs/README.md`, `docs/AGENT_HARNESS.md`, `package.json`의 문서 맵 연결이 깨졌는지 점검한다.
- Codex MCP 설정에 Playwright, GitHub, Supabase 서버를 등록했다. Playwright는 headless browser 검증용이고, GitHub/Supabase는 각각 `GITHUB_PAT_TOKEN`, `SUPABASE_ACCESS_TOKEN` 환경변수로 bearer token을 읽는다. Supabase MCP는 read-only URL로 등록했다.
- Action Report 안정성 점검을 진행했다. 2026-05-08 17:53 KST scheduled 실패는 원격 main의 과거 `node --env-file=.env` 실행이 `.env` 없는 GitHub Actions에서 실패한 건으로 확인했고, 현재 로컬 `action:report`는 `--env-file-if-exists=.env`라 로컬 `--noTelegram`과 2026-05-08 수동 workflow 실행이 성공했다. 다음 scheduled 성공 여부는 현재 로컬 변경분이 원격에 반영된 뒤 재확인해야 한다.
- Telegram 승인 흐름 smoke를 로컬에서 실제 Supabase/Telegram 환경으로 재확인했다. `/buy`, `/sell`, `/cash` 초안 3건을 생성한 뒤 모두 `cancelled` 상태로 취소했고, 실제 거래/현금 변경은 수행하지 않았다. 실패 알림 경로는 다음 실제 workflow 실패 시 private Telegram 도착 여부를 확인해야 한다.
- 월간 로컬 리서치 worker를 `LOCAL_RESEARCH_WORKER_ENABLED=true`로 실행해 월간 리뷰 sidecar 연결을 확인했다. 로컬에 `pykrx`를 설치한 뒤 국내 후보 2개에 대해 19거래일 OHLCV, 기간 수익률, 최대낙폭이 생성되는 것을 확인했다. `FinanceDataReader`는 아직 미설치이며, worker는 matplotlib cache 경고를 줄이기 위해 임시 `MPLCONFIGDIR`를 사용한다.
- 서버 `/dashboard`와 로컬 `npm run dashboard` 렌더링을 맞췄다. 최신 성과 리뷰의 점검 항목과 월간 로컬 리서치 sidecar를 두 대시보드 모두에 표시하고, 로컬 Supabase 미러 기반 HTML도 테스트에서 직접 생성해 회귀를 잡도록 했다.
- Agent Server에 인증된 `/dashboard`를 추가했다. Cloud Run 서버가 Supabase를 직접 조회해 경제적 자유 진행률, 포트폴리오 요약, 추천 평가, 수집기 상태, 최근 추천의 진입가/손절가를 보여준다. 인증은 `DASHBOARD_SECRET`을 우선 사용하고 없으면 `JOB_SECRET`을 대체값으로 쓴다.
- 전체 점검에서 운영 설정 불일치를 정리했다. `.env.example`과 `render.yaml`에 `DASHBOARD_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `KRX_OPENAPI_KEY`, `DATA_GO_KR_API_KEY`, `DISABLE_FINBERT` 등 최근 운영 변수를 반영하고, 서버 `/dashboard`도 Telegram `/recommendations`와 동일하게 리스크 기준을 통과한 매수 후보만 기본 표시하도록 맞췄다. 대시보드 포트폴리오 요약은 `portfolio_snapshots`가 없으면 Supabase 원본 `portfolio_accounts`를 fallback으로 사용한다. Anthropic 기본 모델은 공식 안정 ID인 `claude-sonnet-4-20250514`로 정리했다.
- 런타임 언어 원칙을 로드맵에 반영했다. 운영 서버는 Node.js 1대를 기본으로 유지하고, Python은 pykrx/FinanceDataReader, 백테스트, 대량 OHLCV 처리 같은 분석 worker로만 사용한다. 별도 Python 서버는 장시간/대량 분석을 API로 자주 호출해야 할 때만 검토한다.
- Telegram 리포트 문구와 숫자 방어를 개선했다. 일일 행동/장마감/성과 리포트에서 기준매수가, fallback, EOD, RS20 같은 초보자에게 어려운 표현을 기준가, 대체 가격, 장마감 가격, 20일 상대강도 등으로 풀어 쓰고, 상한 적용 시 원안과 실제 제안 금액을 함께 표시한다. 평가 데이터가 없을 때 `NaN%`나 가짜 `0%`가 보이지 않도록 추천 성과/실제 거래 성과 포맷 테스트를 추가했다.
- 모델/프롬프트 성과 판단 준비도 명령을 추가했다. `npm run model:performance`는 `data/supabase/recommendations.json`과 `recommendation_evaluations.json`을 읽어 모델별, 프롬프트별, 조합별 평가 건수/평균 추천 수익률/승률/표본 충족 여부를 보여준다. 2026-05-10 기준 미러에는 평가 완료 6건이 있으나 모두 legacy/unknown 메타데이터라 Claude Sonnet 전환 효과 평가는 새 메타데이터가 붙은 추천 평가가 더 쌓인 뒤 가능하다.
- 추천 로그의 AI 메타데이터 전달 계약을 테스트로 고정했다. stock별 `ai_metadata`가 있으면 우선 사용하고, 없으면 report/context의 `provider`, `model`, `promptVersion`을 추천 로그로 내려보낸다. 과거 `stock_reports`에도 메타데이터가 없어 기존 6개 평가 건은 안전한 backfill이 불가능하므로 legacy/unknown으로 유지한다.
- `npm run model:performance` 출력에 전체 추천 중 메타데이터 보유 건수와 평가 대기 중 메타데이터 보유 건수를 추가했다. 새 추천에는 메타데이터가 붙었지만 아직 1/5/20일 평가가 안 끝난 상태인지 바로 구분하기 위한 용도다.
- `npm audit`에서 확인된 `@huggingface/transformers` 하위 `protobufjs < 7.5.5` critical, `tar <= 7.5.10` high 취약점을 lockfile 패치로 해소했다. 직접 의존성인 `@huggingface/transformers@3.8.1`은 유지하고, 하위 패키지만 `protobufjs@7.5.7`, `tar@7.5.15`로 갱신했다. 2026-05-10 재점검 기준 `npm audit`은 0 vulnerabilities이며, 반복 점검용 `npm run security:audit` 명령을 추가했다.
- `security-audit.yml`을 추가했다. 매주 월요일 09:10 KST에 `npm run security:audit`를 실행하고, 취약점 발견 또는 registry/audit 실패 시 private Telegram으로 Actions 로그 링크를 보낸다.
- `quality-gate.yml`을 추가했다. main push, main 대상 pull request, 수동 실행에서 `npm test`와 `npm run agent:harness-check`를 실행한다. 실패 알림은 secrets가 없는 PR을 피하기 위해 push/수동 실행에서만 private Telegram으로 보낸다.
- Quality Gate와 Security Audit job에 10분 timeout을 설정했다. 테스트, npm registry, audit endpoint가 비정상적으로 오래 걸릴 때 비용과 알림 지연을 제한한다.
- 기존 주요 GitHub Actions workflow에도 10분 timeout을 일괄 적용했다. 다이제스트, 장마감 분석, 추천 평가, 포트폴리오 스냅샷, 성과 리뷰, 운영 점검, Action Report, 실제 거래 성과가 장시간 멈추면 실패로 종료되고 private 알림 경로를 탄다.
- 모든 GitHub Actions workflow에 `permissions: contents: read`를 명시했다. checkout과 실행만 필요한 workflow들이 기본 토큰 권한을 넓게 쓰지 않도록 하고, 새 workflow가 권한 선언을 빠뜨리면 테스트에서 잡히게 했다.
- `telegram-smoke-actions.yml`도 다른 workflow와 맞춰 `actions/checkout@v6`, `actions/setup-node@v6`로 정리하고 실패 알림 env에 `TELEGRAM_PRIVATE_CHAT_ID`를 추가했다. 전체 workflow 테스트가 checkout/setup-node v6 사용 여부도 검증한다.
- 모든 GitHub Actions workflow에 concurrency group을 명시했다. 다이제스트/리포트/운영 점검은 중복 실행을 큐잉하도록 `cancel-in-progress: false`를 사용하고, Quality Gate는 같은 ref의 새 실행이 오면 이전 실행을 취소하도록 했다.
- `AGENTS.md`의 운영 명령 설명에서 과거 `.env` 강제 로딩 문구를 정리했다. 현재 대부분의 운영 script는 `--env-file-if-exists=.env`를 사용하고, `npm start`만 로컬 one-shot collector용 `--env-file=.env` 진입점으로 남아 있다.
- 가격 provider 운영 점검 명령을 보강했다. `npm run price-provider:ops-report -- --noTelegram`처럼 숫자가 아닌 옵션을 넘기면 `Invalid time value`가 나던 문제를 고치고, `--days`, `--days=N`, `--no-telegram`도 지원한다. 2026-05-10 실조회 기준 최근 1일은 스냅샷 21건, 실패율 0%, 빈 응답률 34.02%, fallback 4.76%로 `현재 가격 provider 구조 유지` 판단이며 Massive 과금 필요는 없다.
- 수집기 운영 점검 명령도 같은 인자 파싱 문제를 수정했다. `npm run collector:ops-report -- --noTelegram`, `--days`, `--days=N`, `--no-telegram`을 지원하고, 최근 실행이 0건이면 `ok`가 아니라 `empty`와 `최근 수집 실행 기록이 없습니다` 이상치로 표시한다. 이후 과거 해결 실패와 최근 조치 필요 실패를 분리하도록 고도화했다.
- 성과 리뷰 명령에 안전한 dry-run을 추가했다. `npm run review:weekly -- --dry-run`은 리뷰를 만들되 로컬 파일 저장, Supabase 저장, Telegram 전송을 모두 생략한다. `--noTelegram`은 기존처럼 전송만 생략하고 저장은 수행하며, Supabase 저장만 생략하려면 `--noPersist`/`--no-persist`를 사용한다.
- 주간/월간 성과 리뷰 workflow에도 private Telegram 실패 알림 단계를 추가했다. 리뷰 생성/저장/전송 단계가 실패하면 `notify:workflow-failure`가 workflow명, 작업명, 브랜치, 커밋, GitHub Actions 로그 링크를 보내도록 했다.
- 수집기 운영 점검과 가격 데이터 점검 workflow에도 private Telegram 실패 알림 단계를 추가했다. 운영 점검 스크립트 자체가 실패할 때도 Actions 로그 링크가 private 방으로 전송된다.
- 포트폴리오 스냅샷, 장마감 분석, 추천 성과 평가, 실제 거래 성과 workflow에도 private Telegram 실패 알림을 추가했다. 의사결정 숫자를 만드는 핵심 스케줄 작업이 실패하면 해당 작업명과 Actions 로그 링크를 바로 확인할 수 있다.
- 뉴스 백업 수집과 5개 다이제스트 workflow에도 같은 실패 알림 표준을 적용했다. 브리핑 본문은 기존 공유방으로 유지하고, 워크플로 실패만 private Telegram으로 라우팅한다.
- 모든 `.github/workflows/*.yml`에 `Notify private chat on failure` 단계가 있는지 확인하는 회귀 테스트를 추가했다. 새 workflow를 만들 때 실패 알림을 빠뜨리면 `npm test`에서 잡힌다.
- 경제적 자유 상태를 정기 운영 루프에 연결했다. `npm run freedom:report`는 기존처럼 저장과 콘솔 출력을 유지하고, `--telegram`을 붙이면 목표 순자산/현재 순자산/달성률/예상 도달일/목표일 대비 속도/하락 스트레스를 private Telegram으로 전송한다. `freedom-report.yml`은 평일 16:20 KST, 포트폴리오 스냅샷 직후 실행된다.
- Action Report 드라이런에서 국내 종목 가격을 네이버 실시간 API와 대조했다. 2026-05-10 기준 삼성전자 268,500원, SK하이닉스 1,686,000원 수준으로 저장 가격 단위는 정상이며, 추천 당시 가격과 현재가 혼동을 줄이기 위해 후보 종목 문구를 `기준가(추천시)`로 바꿨다.
- Action Report 후보 종목에 최신 현재가를 추가했다. 최근 bullish 후보 중 보유 중이 아닌 종목만 현재가를 다시 조회해 `기준가(추천시)` 옆에 `현재가`와 추천가 대비 변동률을 표시한다. 가격 조회가 실패해도 리포트는 기존 추천시 기준가로 계속 생성된다.
- Action Report 문구를 초보자도 읽기 쉽게 정리했다. 상단에 Telegram `<pre>` 고정폭 요약표를 추가하고, 후보/보유 종목은 현재가·추천가·손절·제안수량·판정을 줄 단위로 분리한다. 해외 종목 축소 수량 계산에는 환율을 반영해 원화 리밸런싱 금액을 달러 주가로 직접 나누던 오류를 막았다.
- 포트폴리오 원본과 저장 포트폴리오를 최신 수동 입력으로 맞췄다. DRAM ETF는 200주와 평가손익 +2,239,016원, NFLX는 현재가 $87.33과 평가손익 -156,702원을 기준으로 Action Report를 생성하며, GitHub Actions용 `PORTFOLIO_JSON_BASE64` secret도 같은 원본으로 동기화했다.
- 경제적 자유 목표 입력을 갱신했다. 목표 순자산은 10억원, 월 투자 가능 금액은 200만원으로 설정했다. 최신 매크로/반도체 업황을 반영해 기준 계획 수익률은 연 12%, 공격 운용 목표는 연 15%로 둔다.
- 경제적 자유 시나리오 리포트를 추가했다. 월 투자금 200/250/300/400만원과 연수익률 7/10/12/15% 조합별 목표 도달일을 계산해 Freedom Report에는 핵심 행만, 로컬 대시보드에는 전체 표를 표시한다. 현재 기준 월 400만원·연 12%는 2035-10-10 도달로 목표보다 1년 2개월 빠르다.
- 모델/프롬프트 성과 표본을 재확인했다. 2026-07-10 `npm run model:performance -- --json` 기준 추천 11건, 평가 완료 8건, 평균 방향 수익률 +1.92%, 승률 62.5%지만 모두 `legacy_prompt / unknown_provider:unknown_model`이라 기존 모델 효과는 비교할 수 없다. GPT-5.6 메타데이터가 붙은 추천 평가가 5건 이상 쌓인 뒤 Terra reasoning 설정과 필요 시 Sol을 비교한다.
- 대시보드 숫자 일관성을 재확인했다. `npm run dashboard` 생성 HTML은 목표 1,000,000,000원, 월 투자 가능 금액 2,000,000원, 현재 순자산 57,377,347원, 달성률 5.74%를 표시한다.
- 수집기 운영 점검의 주말 오탐을 줄였다. KST 평일 07:00-23:59 수집 시간대가 아니면 최근 1일 실행 0건을 이상치로 보지 않고 `idle` 상태로 표시한다. 2026-05-10 일요일 재실행 기준 이상치 없음으로 확인했다.
- 수집기 운영 점검에서 이미 해결된 과거 실패를 분리했다. `stale run cleaned` 계열 redeploy/smoke 실패와 과거 `toAdd` 초기화 버그 실패는 `resolvedFailureRuns`로 따로 보여주고, 성공률·상태·실패 이상치는 조치 필요 실패 기준으로 계산한다. 즉시 알림 실패도 최근 24시간 조치 필요 실패와 과거 실패로 나눈다. 2026-05-10 실조회 기준 최근 7일은 성공 244건, 조치 필요 실패 0건, 정리된 과거 실패 6건, 최근 즉시 알림 실패 0건, 과거 즉시 알림 실패 3건이며 이상치는 없다.
- 로컬 HTML 대시보드와 서버 `/dashboard`의 수집기 상태 표시도 같은 기준으로 맞췄다. 기존 `Failures`/`실패` 대신 조치 필요 실패, 정리된 과거 실패, 최근/과거 즉시 알림 실패를 나눠 보여준다.
- 예정 매매 체크리스트를 추가했다. `npm run trade:plan`은 아직 체결되지 않은 매수/매도 계획을 `data/trades/trade-plans.json`과 포트폴리오 payload에 남기고, 일일 행동 리포트는 오늘까지 확인해야 할 계획을 `예정 매매 확인` 섹션에 표시한다. 이후 같은 방향/종목/수량의 `trade:record`가 들어오면 열린 계획을 자동으로 실행 완료 처리한다.
- 가격/환율 provider 장애 시 포트폴리오 숫자 방어를 보강했다. 환율 또는 현재가 조회가 실패하면 USD 보유 종목을 환율 1로 재계산하지 않고 기존 `fxRate`, `marketValue`, `unrealizedPnl`, `totalAssetValue`를 보존한다. 로컬 포트폴리오는 총자산 57,377,347원, 현금 15,000,000원, 평가손익 3,027,997원 기준으로 복구하고 GitHub Actions secret을 재동기화했다.
- 해외 보유/관심 종목 모멘텀 누락을 보강했다. `watchlist.globalMomentum`에 MU/GOOGL/NVDA/AMD/TSM/AVGO를 추가하고, 기사 없이 당일 급등이 포착된 해외 개별주도 `pre-news:signal`과 `action:report` 가격 모멘텀 후보가 되도록 했다. 이미 보유 중인 종목은 신규 매수 후보에서 사라지는 대신 `추가매수/수익보호 점검`으로 분리해 눌림 대기, 조건부 추가매수, 고수익 일부 이익 잠금 판단을 표시한다.
- 경제/시장 테마 감지를 추가했다. `decision-engine`은 시장 스냅샷과 기사에서 `AI_SEMICONDUCTOR_CYCLE`, `GROWTH_CONCENTRATION`을 감지해 장마감 종목 분석 프롬프트와 레짐 태그에 반영한다. AI 데이터센터/HBM/DRAM 기사와 SOXX/NVDA/MU/AMD/TSM 강세가 동시에 나타나면 AI/반도체 사이클을 별도 테마로 보고, 급등일 추격보다 눌림·분할 진입과 수익보호를 우선하는 playbook을 붙인다.
- 2026-06-30 운영 점검에서 GitHub Actions와 Cloud Run 모두 Supabase PostgREST `PGRST002` schema cache 503에 흔들리는 것을 확인했다. 공통 persistence에 60초 circuit breaker를 추가해 첫 503 이후 후속 DB 호출을 빠르게 건너뛰고, KIS remote token cache도 같은 persistence 래퍼를 사용하도록 맞췄다.
- 포트폴리오 스냅샷 workflow 안정성을 보강했다. 스냅샷 파일 생성은 Supabase 원본 동기화 실패와 분리해 DB 장애 중에도 완료되도록 했고, `portfolio-snapshot.yml`과 `telegram-smoke-actions.yml`에는 Supabase 재시도 env를 명시했다. pending action 생성은 저장 실패를 성공처럼 반환하지 않고 즉시 오류로 돌려 Telegram 승인 smoke가 실제 persistence 상태를 검증하게 했다.
- Cloud Run 서버는 2026-06-30 로그 기준 `/jobs/news-collector`에 200으로 응답했지만 DB 저장/조회가 503으로 실패하고 있었다. 로컬 서버 `/health`와 `/version`은 정상 확인했고, 배포 최신성 점검에서는 운영 서버 커밋 `7e09c08`이 로컬 HEAD `1a9952d`보다 오래된 상태로 확인됐다.
- Cloud Run source deploy 업로드 범위를 명시하기 위해 `.gcloudignore`를 추가했다. `.env`, `data/`, `.cache/`, `node_modules/`, 로컬 포트폴리오 문서가 배포 소스 tarball에 들어가지 않도록 `.dockerignore`와 같은 기준으로 관리한다.
- Cloud Run 자동 배포가 최신 이미지를 사용하면서도 `COMMIT_SHA` 환경변수만 과거 값으로 남겨 배포 최신성 점검이 실패하던 문제를 수정했다. 저장소 `cloudbuild.yaml`이 이미지 태그, revision label, 런타임 `COMMIT_SHA`를 같은 `$COMMIT_SHA`로 갱신하도록 하고 회귀 테스트를 추가했다.
- 2026-07-13 Supabase REST 재점검에서도 `PGRST002` 503이 3회 재시도 후 계속됐고, pooler 직접 연결 dry-run도 인증 단계 시간 초과로 실패했다. 애플리케이션 코드 문제가 아니라 프로젝트 DB/Data API 상태 또는 DB 접속 자격 증명을 Supabase Dashboard에서 복구해야 하는 외부 장애로 분리했다.
- 2026-07-29 Unified Logs에서 Auth migrator, PostgREST, PgBouncer가 모두 내부 `localhost (::1/127.0.0.1):5432 connection refused`를 반복하고 Postgres 로그는 0건인 상태를 확인했다. SQL/키/클라이언트 연결 문제가 아니라 관리형 PostgreSQL 프로세스가 기동하지 못한 장애다. Compute and Disk에는 2GB provisioned disk에 `System 7.75GB`, available 0, Database/WAL 0이라는 비정상 표시가 함께 있었으므로 관리형 system disk/compute 이상이 강하게 의심되지만, 최종 원인은 Supabase 지원팀의 인프라 확인이 필요하다. Dashboard의 `Restart project` 후 REST/Auth/Storage와 `articles`, `collector_runs`, `daily_summaries`, `stock_reports`, `recommendations` 실조회가 모두 200으로 복구됐다.
- 같은 장애가 다시 장시간 숨지 않도록 공통 Supabase REST 요청에 기본 10초 timeout, 429 `Retry-After`, jitter가 있는 capped backoff를 추가했다. 정기 Telegram 승인 smoke는 더 이상 Supabase 408/429/5xx를 성공으로 스킵하지 않으며, 운영용 Telegram 알림은 자격정보 누락을 미리보기 성공으로 처리하지 않고 실패시킨다. Collector Ops 장애 메시지에는 프로젝트 재시작 화면과 `localhost:5432` 확인 절차를 포함한다.
- Telegram 승인 smoke에 Supabase persistence preflight를 추가했다. DB/API 장애가 있으면 `/buy` assertion diff 대신 `Supabase persistence unavailable for Telegram smoke`로 초반에 실패해 코드 회귀와 외부 저장소 장애를 구분한다.
- `npm audit` 경고로 다시 올라온 transitive `protobufjs <=7.6.2`, `tar <=7.5.15` moderate 취약점을 `overrides`와 lockfile 갱신으로 해소했다. 현재 `npm audit` 기준 0 vulnerabilities다.
- 2026-07-29 목표 정렬 감사를 진행했다. Supabase 미러에는 기사 26,747건과 수집 실행 4,768건이 있지만 추천은 11건, 평가 가능 8건, 실제 거래 0건이고 추천/평가는 5월 이후 멈춰 있어 수집 기능보다 검증 가능한 의사결정 루프가 뒤처진 상태로 판단했다.
- 추천 성과 계약을 수정했다. 1/5/20 평가는 달력일이 아니라 거래 세션을 사용하고, Yahoo chart historical EOD를 정식 fallback으로 추가했으며 KOSPI도 종목과 같은 평가일 종가로 비교한다. 정확한 EOD가 없을 때 현재가로 과거 평가를 만드는 fallback은 기본 비활성화했다. 중립 신호는 방향 성과에서 제외하고 당일에 손절·목표가가 모두 닿으면 `stop_first_assumed`로 보수 처리한다.
- 성과 학습 표본을 엄격히 분리했다. `risk_review.approved=true`, `action=candidate`, 진입가·손익비·손절 기준이 있는 추천만 검증 코호트로 사용하며, 기본 20거래일 평가 30건과 AI 메타데이터 커버리지 80% 전에는 소수 실패로 운영 규칙을 자동 조정하지 않는다. 목표 기여 검증에는 추천과 연결한 실제 거래 10건도 별도로 요구한다.
- 현재와 같은 시장 급락을 뉴스보다 먼저 감지하도록 5분 수집기에 KOSPI/KOSDAQ 장중 가격 감시를 추가했다. -3% 경계, -5% 위기, -8% KRX 1단계 서킷브레이커 가격 기준을 하루 단계별 한 번만 private Telegram으로 보내며, -8% 알림은 실제 1분 지속/거래소 발동 확인과 구분한다.
- 장마감 분석에 글로벌 ETF 19개 자금이동 레이더를 추가했다. 미국·지역·섹터·회사채·국채·금·원유·달러의 5일/20일 가격과 거래량 배율을 비교해 위험선호/위험회피를 레짐에 반영하되, 실제 creation/redemption 순유입이 아닌 가격·거래량 프록시임을 데이터와 프롬프트에 명시한다.
- 정기 Telegram 전송을 fail-closed로 바꿨다. 다이제스트, 종목/행동/타이밍/선행신호/성과/경제적 자유 리포트는 자격정보 누락을 미리보기 성공으로 간주하지 않으며, 장마감 종목 리포트 전송이 실패하면 추천 로그 생성을 중단한다.
- 2026-07-31 개장 전 다이제스트의 시장 분위기 오분류를 수정했다. GitHub Actions 지연으로 09:00 이후 도착한 `preopen`은 `midday`로 전환하고, 각 가격의 KST 기준 시각과 신선도를 프롬프트에 전달한다. 장중의 전일 국내 지수는 현재 분위기 계산에서 제외하고 KOSPI/KOSDAQ·국내 반도체·SPY/QQQ/SOXX·VIX를 우선한다. 신선한 가격 신호가 강한데 AI 분위기가 반대면 규칙 기반 검증기가 교정하며 Telegram에는 단기 가격판정, 중기 추세, 오래된 시세 제외와 AI 초안 보정 여부를 표시한다. 다이제스트 감사정보는 일일 요약 `digests` payload에 세션별로 저장한다.
- 2026-08-01 월간 성과 리뷰의 데이터 계약을 바로잡았다. 최신 포트폴리오 평가와 평가손익을 첫 섹션에 표시하고, 입출금 미보정 자산 증감을 명시하며, 포트폴리오 조회 실패를 0원으로 계산하지 않는다. 장마감 리포트의 분석 후보·강세·관찰/차단·승인 퍼널을 추천 로그와 분리해 `추천 0건`의 의미를 명확히 했다.
- 월간 운영 품질 오탐도 정리했다. 주말/비수집 시간대는 collector stale로 경고하지 않고, digest `buffered`는 실제 `pending`과 분리한다. 가격 stale은 전체 과거 행이 아니라 종목별 최신 스냅샷만 평가하고, 설정되지 않은 유료 provider 호출은 `empty` 대신 `skipped`로 기록한다. 포트폴리오 수동 현재가는 `valuationLocked=true`가 아니면 최신 시세로 갱신하며 미분류 자산은 총자산에는 포함하되 현금으로 보지 않는다.
- AI 추천 성과 상태를 재점검했다. 2026-07-31까지 추천 평가 workflow는 연속 성공했고, 저장 신호 11건 중 8건은 1/5/20거래일 평가 이력이 있으므로 평가 엔진 중단은 아니다. 최신 승인 추천은 2026-05-08이며 7월 장마감 후보는 리스크 승인에서 모두 관찰/차단되어 새 평가 입력이 없었다. 월간 Telegram은 평가기 이력, 이번 달 신규 승인, 레거시 저장 신호, 엄격한 검증 코호트를 분리하고 6개 핵심 섹션으로 축약했다. 추천·평가 Supabase 저장 오류도 workflow 성공으로 숨기지 않도록 fail-closed 처리했다.
- 2026-08-02 shadow 연구 코호트를 추가했다. 스키마를 통과했지만 리스크 규칙에 차단된 bullish/bearish 후보는 실제 추천과 다른 `research_candidates`에 저장하고 `researchOnly=true`, `tradeEligible=false`로 고정한다. 동일한 거래일 EOD 평가기를 사용하되 shadow 성과는 실제 추천 성과와 자동 규칙 학습 표본에 섞지 않는다.
- 2026-08-02 종목 식별과 시점 데이터 게이트를 강화했다. 관련 DART 공시와 고정 관찰목록으로 회사명/6자리 코드를 가격 조회 전에 결정하고, 공식 가격명과 충돌하면 승인하지 않는다. 가격 출처/시점, 20일 상대강도·평균 거래대금·진입 타이밍, 펀더멘털 출처/시점과 국내 시가총액이 모두 있어야 스키마를 통과한다. 네이버 당일 누적 거래대금을 20일 평균 거래대금으로 오인하던 필드도 분리했다.
- 2026-08-02 포트폴리오 현금흐름 원장을 추가했다. 입금/출금은 외부 흐름, 배당/이자/수수료/세금은 운용 수익·비용으로 구분하고 월간 리뷰에서 일별 스냅샷 TWR, 연환산 MWR(XIRR), 같은 구간 KOSPI 초과수익을 계산한다. 원장 조회 실패는 입출금 0원으로 간주하지 않고 성과 판단 보류로 표시한다.
- 2026-08-02 전체 성과 계약을 재감사했다. 기본 성과 분석은 각 추천의 1일/1주/1개월 목표기간과 1/5/20거래일 평가를 정렬하고 bearish 신호의 KOSPI 수익률도 방향을 보정한다. 해석된 기사 ID가 없는 후보는 원본 배열 인덱스가 있어도 승인하지 않고, 추천 기준가와 벤치마크는 분석 시점 스냅샷을 유지한다.
- 2026-08-02 실데이터 미러를 재점검한 결과 저장 추천 11건 중 엄격한 승인 계약과 20거래일 평가를 통과한 표본은 1건이고 모델 메타데이터는 없었다. 반면 과거 장마감 리포트에는 시점 가격과 AI 메타데이터가 남은 shadow 복원 가능 후보 22건이 있어 `research:backfill`로 실제 추천과 분리해 저장·평가하도록 했다. `model:performance`는 승인과 shadow 코호트를 합치지 않고 각각 표시한다.
- 2026-08-02 외부 입출금이 있는 스냅샷 구간의 수익률을 단순 기말 흐름 차감에서 linked Modified Dietz로 바꾸어 현금흐름 시점을 가중했다. 외부 흐름이 있는 경우는 `daily_weighted_estimate`, 없는 경우는 `exact_without_external_flows`로 계산 품질을 구분한다.
- 2026-08-03 가격·거래량 이상징후의 선행성 검증 루프를 추가했다. 감지 당시 시각과 직전 12시간 기사·DART 일치 여부를 `market_anomaly_signals`에 저장하고, 이후 24시간 안의 첫 관련 기사 시각을 후속 갱신한다. 날짜만 있는 공시는 선후 미확인, 기사 저장소 장애는 판단 보류로 분리하며 이 데이터는 연구용으로만 사용하고 추천·매매 신호로 자동 승격하지 않는다.
- 2026-08-03 Telegram 자금 흐름을 AI 요약과 분리된 고정 섹션으로 만들었다. 모든 다이제스트는 Naver Finance KOSPI 외국인·기관 당일/5일 순매수와 기준일을 표시하고, 장 마감 리포트는 글로벌 ETF 19개 가격·거래량 프록시의 위험선호/회피·강세/약세 자산을 추가한다. 실제 순유입액과 프록시를 명시적으로 구분하고 조회 실패는 0이 아니라 조회 불가로 표시한다.
- 2026-08-03 가격·거래량 이상징후와 KOSPI 시장 수급을 시점 기준으로 연결했다. 새 신호에는 감지 당시 외국인·기관 당일/5일 순매수 스냅샷을 저장하고, 이후 같은 거래일 누적값이 변하면 감지 시점 대비 차이를 갱신한다. 전 거래일 수급은 당일 동행으로 분류하지 않고 해외 종목에는 KOSPI 방향 일치를 적용하지 않으며, Telegram에도 종목별 수급이나 급등락 원인이 아닌 시장 전체 배경임을 고정 표시한다.
- 2026-08-04 일일 행동 리포트의 최신 가격 재평가액을 Supabase 포트폴리오 원본에 다시 동기화하고, 평가 시각·가격 출처·갱신 종목 수·직전 저장 평가액과의 차이를 Telegram에 표시하도록 개선했다. 모바일에서 깨지기 쉬운 고정폭 요약 표는 문장형 요약으로 교체했다. 가격 Provider 점검은 빈 응답을 최종 가격 실패와 분리하고, 해외 Yahoo 대체 경로 의존이 높아도 실제 오류가 없으면 즉시 장애가 아님을 먼저 설명한다.
- 2026-08-04 가격·거래량 이상징후 성과 평가기를 추가했다. 감지 가격과 시각을 고정한 뒤 추천 평가기와 같은 공식 EOD 거래세션 선택으로 1·5거래일 방향 성과와 MFE/MAE를 payload에 누적한다. 주간·월간 Telegram은 기사→신호/신호→후속기사 시차, 1일 비지속·후속기사 미확인, 가격·거래량·고점·이동평균·상대강도·시장 수급 조합을 연구 전용으로 요약한다. 5일 평가 30건 전에는 추천 규칙에 반영하지 않는다.
- 2026-08-04 Telegram 실제 거래 기록을 실행 데이터 루프로 보강했다. `/buy`는 같은 종목의 최근 30일 리스크 승인 추천과 열린 매매계획을 자동 연결하고 현금·수량을 승인 전에 검증한다. `/sell`은 평균단가와 원화 환산액으로 예상 실현손익을 계산하고 `reason=` 매도 사유를 보존한다. USD 거래를 원화 현금에 그대로 반영하던 위험을 `currency`/`fxRate`/`cashAmountKrw`로 차단했으며, 승인 재시도는 거래 ID 기준으로 포트폴리오에 한 번만 적용한다. 거래·포트폴리오·승인 상태의 Supabase 저장 실패는 성공으로 숨기지 않는다.
- 2026-08-04 Telegram에 `/trades`와 `/trade_performance`를 추가했다. 최근 승인 체결은 원화 반영액, 추천·계획 연결, 매도 실현손익·사유를 표시하고, 실제 거래 성과는 매수·매도 원장을 평균원가로 상계해 열린 수량의 미실현 성과와 매도 실현손익을 분리한다. 승인 완료 응답에는 반영 후 현금·잔여 수량·기록 시각을 포함한다. 이는 증권사 계좌 전체가 아니라 에이전트에 기록한 체결 범위이며 저장소 장애는 0건으로 표시하지 않는다. 정기 Telegram smoke도 변경 초안 3건의 취소뿐 아니라 두 읽기 명령의 운영 Supabase 응답을 검증한다.
- 2026-08-04 `telegram:sync-commands`를 추가해 포트폴리오·추천·거래 입력·최근 체결·실제 거래 성과 명령을 Telegram 입력창 메뉴와 동기화한다. webhook이나 거래 데이터는 건드리지 않는다.
- 2026-08-04 정책·자산 레이더 1단계 MVP를 추가했다. 재정경제부·금융위원회·국토교통부 공식 RSS를 별도 수집하고 세금·부동산·대출·연금·자본시장, 정부안·설명정정·입법예고·국회단계·공포·시행으로 결정론적으로 분류한다. 소스별 장애는 격리해 미확인 상태와 재시도를 표시하고, 첫 실행의 72시간 이전 문서는 기준선 처리하며 Telegram 성공 후에만 통지 해시를 갱신한다. Supabase `policy_events`/`policy_event_versions`가 기준 저장소이며 미설정 환경은 ignored 로컬 state로 fallback한다. 평일 10:10·18:10 KST workflow는 private 채널로 신규·변경만 전송한다.
- 운영 Supabase에 정책 레이더 스키마를 적용하고 첫 실데이터 실행을 검증했다. 공식 문서 46건 중 72시간 이전 41건은 기준선 처리하고 최근 5건만 Discord로 전송했으며, 직후 재실행은 신규/변경 0건으로 확인됐다. 2026-08-05 13:20 KST 실행에서 금융위원회·국토교통부가 10초 timeout으로 부분 실패한 원인을 재현했다. 금융위원회는 일시 지연, 국토교통부는 동일 URL 307과 세션 쿠키를 요구하는 WAF 절차였다. 소스별 20초/2회 재시도와 국토부 쿠키 재사용을 추가했고 실공식 dry-run에서 5/5 소스·110건 수집을 확인했다. 알림 문구도 정책 자체의 미확정이 아닌 `이번 실행 수집 공백`임을 명시한다.
- 2026-08-04 Discord 전환 1단계 인프라를 추가했다. 긴급·일일행동·시장브리핑·포트폴리오·세금정책·부동산정책·선행신호·성과·시스템점검 9개 채널을 하나의 base64 Webhook map 또는 채널별 환경변수로 라우팅한다. Webhook URL은 형식만 검사하고 로그에 출력하지 않으며, `allowed_mentions` 차단, Telegram HTML의 Discord Markdown 변환, 긴 메시지 분할, 10초 요청 timeout을 적용했다.
- Discord Bot API 자동 프로비저너를 실제 서버에 적용했다. `01 핵심 신호`(긴급·일일행동·시장브리핑·선행신호), `02 자산 관리`(포트폴리오·성과), `03 정책 인텔리전스`(세금·부동산), `04 운영`(시스템점검)의 4개 카테고리로 정렬했다. 기존 리소스는 재사용하고 삭제하지 않으며 Webhook map은 ignored 파일에 `0600`으로 저장한다. 9개 채널 모두 실제 Webhook 수신을 확인했다.
- Discord 병행 전송 마이그레이션을 시작했다. `DISCORD_REPORTS_ENABLED=true`인 24개 GitHub Actions Workflow에서 긴급뉴스→긴급, 다이제스트→시장브리핑, 종목·행동·타이밍→일일행동, 경제적 자유→포트폴리오, 정책 도메인→세금/부동산, 이상징후→선행신호, 추천·거래 성과→성과, 수집·가격·배포·Workflow 실패→시스템점검으로 분기한다. Discord 실패는 Telegram 성공과 버퍼·저장을 되돌리지 않으며 GitHub Secret에는 9개 Webhook 지도를 동기화했다.
- Discord 메시지를 채널별 색상·고정 제목·Footer·시각·페이지가 있는 Embed 카드로 개선했다. Telegram HTML은 Discord Markdown으로 정리하고 본문은 Embed 제한보다 여유 있는 3,800자 단위로 분할한다. `DISCORD_USE_EMBEDS=false` 일반 텍스트 fallback과 `allowed_mentions` 차단은 유지한다.
- Discord 전달 경로의 조용한 누락을 줄이기 위해 `discord-smoke.yml`을 평일 08:10 KST에 예약했다. 첫 장전 브리핑 10분 전에 9개 Webhook 설정을 검증하고 `#시스템-점검`에 설정 수·배포 커밋·Actions 링크가 포함된 health 카드를 보내며, 실패는 private Telegram Workflow 장애 알림으로 승격한다. 수동 실행의 채널 선택 기능은 유지한다.
- 2026-08-04 프로젝트 North Star를 뉴스 에이전트에서 `경제적 자유 목표 달성 확률을 높이는 개인 AI 경제 사무실`로 명확히 했다. 범용 개발·법무·이메일·다중 프로젝트 팀은 현재 범위에서 제외하고, 향후 개인 AI 조직 운영체제의 SSoT·`to/cc`·다중 인스턴스·승인·기억·이메일 Draft 설계를 `docs/future/AI_AGENT_TEAM_BLUEPRINT.md`에 별도로 보존했다.
- 2026-08-04 Discord 읽기 전용 Interaction 경로를 추가했다. Cloud Run의 `POST /discord/interactions`가 원문 body의 Ed25519 서명과 5분 timestamp freshness, guild/user/선택적 channel allowlist를 검증하고 `/portfolio`, `/goal`, `/risk`, `/recommendations`, `/trades`, `/trade-performance`를 ephemeral deferred 응답으로 제공한다. 응답은 기존 Telegram 포맷을 Discord Markdown으로 변환하며 Interaction token은 저장하지 않는다. `/buy`, `/sell`, `/cash`는 Slash 명령으로 등록하지 않는다.
- 2026-08-04 Discord 멘션 자연어 worker를 추가했다. 항상 켜진 PC/VM의 최소-intent Gateway 연결이 직접 멘션과 명시된 guild/user/channel만 처리한다. 완료형 자연어 `샀어/매수했어`, `팔았어/매도했어`, 현금 잔액 입력을 보수적으로 canonical command로 변환하고, 종목·수량·가격이 불명확하면 추측하지 않는다. 변경은 기존 `pending_actions` 초안과 요청자별 `기록하기/취소` 버튼을 거치며 `DISCORD_MENTION_ACTIONS_ENABLED`는 기본 비활성이다. 상담 질문은 거래로 승격하지 않고 실제 증권사 주문은 수행하지 않는다.
- 2026-08-05 Discord Gateway worker의 실행 계약을 Windows·macOS·Linux 공통 Node.js 22+ 런타임으로 명시했다. worker와 npm 명령에는 OS 전용 셸·절대 경로를 사용하지 않으며 `discord:agent-worker:check`가 네트워크 없이 현재 플랫폼, Node 버전, fetch/WebSocket/timeout 지원을 검사한다. `Discord Worker Portability` Workflow도 Windows·macOS·Ubuntu 실제 runner에서 동일 검사와 멘션 테스트를 실행한다. Gateway 재연결은 공통 코드가 담당하고 재부팅 자동 시작만 Windows 서비스 관리자·macOS `launchd`·Linux `systemd` 같은 호스트 계층이 담당한다. 대화·승인 SSoT는 Supabase에 유지해 실행 OS가 바뀌어도 동일 상태를 사용한다.
- 2026-08-05 하나의 `@Economic Agent` 뒤에 경제 도메인 전문가 팀을 추가했다. 결정론적 router가 투자·부동산·세금/연금·포트폴리오·리스크·데이터 검증 중 주 담당 1명과 의사결정 질문의 검토자 최대 2명을 선택한다. 각 역할은 필요한 SSoT 범위만 로딩하고 별도 AI 호출·출력 토큰 상한·호출 제한 시간·`expert:<role_id>` 대화 namespace를 사용한다. 검토 실패는 주 답변을 폐기하지 않고, 정책 단계·기준 시점·데이터 공백·자동 실행 금지 규율을 공통 적용한다. 기능은 provider 개인정보 처리 확인 전까지 `DISCORD_EXPERT_RESPONSES_ENABLED=false`가 기본이다.
- 2026-08-05 메시징 플랫폼을 Discord로 완전히 통합했다. 이전 전송 모듈, webhook endpoint, 명령 동기화, 승인 smoke 스크립트·workflow, 환경변수와 배포 문서를 제거했다. 공용 리포트 포맷은 `src/notify/reports.js`, 정책 리포트는 `policy-report.js`, Discord 필수 전달 계약은 `discord-reports.js`로 분리했다. 기존 Supabase 알림 이력과 마이그레이션 열은 데이터 보존을 위해 삭제하지 않았다. `DISCORD_ALLOWED_USER_IDS`는 봇 사용 허용 목록이며 비어 있으면 모두 거부한다.
- 2026-08-05 진단 출력에 노출 가능성이 있었던 `#정책-세금`, `#정책-부동산` Webhook을 새로 생성하고 로컬 9채널 map과 GitHub Actions Secret을 갱신했다. 두 채널 smoke 성공 후 기존 Webhook 2개를 폐기했다. 이후 회전은 새 URL 준비 → Secret 동기화 → smoke → 기존 URL 폐기의 2단계 명령으로 수행한다.
- 2026-08-05 16:26 KST macOS LaunchAgent `com.economic-agent.worker`로 `macos-home-01` shadow worker를 시작했다. Message Content Intent의 limited flag, Gateway READY, 로컬 PostgreSQL heartbeat `gateway_connected=true`, 최근 예정 작업 기록을 확인했다. 72시간 최소 관찰 종료 기준은 2026-08-08 16:26 KST다. 4014 같은 재연결 불가 close에서는 scheduler도 종료해 supervisor가 단일 프로세스로 재시작하도록 보강했다.
- 2026-08-05 홈 PostgreSQL 첫 AES-256-GCM 암호화 백업 약 14.5MB를 생성했다. 복호화/TOC 146개 구조 검증에 이어 격리 임시 DB에 32개 테이블과 기사 31,505건을 실제 복원하고 임시 DB를 제거해 복원 가능성을 확인했다. 키는 비공개 `.env`에만 두며 값은 로그에 출력하지 않는다. 장비 장애 대비용 외부 암호화 백업 위치는 최종 active 전환 전에 별도로 정한다.
- 2026-08-06 shadow 감사에서 Mac 절전·네트워크 단절 구간의 예정 작업 누락과 Gateway 최초 조회 실패에 따른 LaunchAgent 반복 재기동을 확인했다. 네트워크 일시 장애는 scheduler를 종료하지 않고 Gateway만 지수 백오프로 재연결하며, 같은 WebSocket의 반복 오류 로그를 억제한다. `worker:status-report -- --no-report`가 실제 Discord를 전송하던 옵션 버그도 수정하고 shadow 감사에 현재 연속 실행 시간과 관찰 시작 후 재기동 여부를 추가했다. 이후 연결 전 WebSocket error 재귀 방지와 외부 백업 설정을 적용해 LaunchAgent를 마지막 재시작했으며, 최종 72시간 관찰은 2026-08-06 11:50 KST부터 시작한다.
- 같은 점검에서 macOS의 AC 전원 설정도 유휴 1분 뒤 시스템 절전으로 확인됐다. 전역 `pmset`은 변경하지 않고 `PC_WORKER_PREVENT_SLEEP_ON_AC=true`일 때 LaunchAgent가 `/usr/bin/caffeinate -s`로 worker를 실행하도록 선택 옵션을 추가했다. 전원 어댑터가 연결된 동안만 절전을 막고 배터리에서는 기존 절전 정책을 유지한다.
- Discord 자연어 거래의 실제 local SSoT smoke로 `삼성전자 1주 매도` 문장을 `draft_sell` 초안으로 만든 뒤 취소 버튼 callback을 실행했다. `pending_actions.status=cancelled`와 취소 시각이 저장됐고 포트폴리오 수량·현금 및 `trade_executions` 건수는 전후 동일했다. 실제 증권사 주문이나 매매 기록은 생성하지 않았다.
- 사용자가 실제 Discord에서 `현금 잔액은 0원` 자연어 메시지를 보내고 취소 버튼을 눌렀다. Gateway 대화는 `draft_cash`, pending action은 `cancelled`와 취소 시각으로 저장됐으며 confirmed 시각은 비어 있다. 포트폴리오는 현금 0원·14종목·삼성전자 73주 그대로이고 거래 원장은 0건이다.
- 홈 PostgreSQL 백업에 OS 공통 외부 복제 경로 `HOME_DB_OFFSITE_BACKUP_DIR`를 추가했다. 로컬 백업과 동일한 AES-256-GCM `.aes` 파일만 별도 디스크나 동기화 폴더에 기록하며, 외부 경로가 설정됐는데 암호화 키가 없거나 로컬 경로와 같으면 백업을 거부한다. 암호화 키와 평문 dump는 외부 경로에 복제하지 않는다.
- 백업 키가 로그나 화면에 노출된 사고에 대응할 수 있도록 `home:db:backup-key:rotate`를 추가했다. 새 키 값은 출력하지 않으며 `.env`의 기존 키 한 줄만 교체한다. 키 교체 후에는 새 로컬·외부 백업을 만들고 복원 검증을 통과시킨 뒤 과거 키로 암호화된 파일의 보존 여부를 결정한다.
- 2026-08-06 11:45 KST 노출된 기존 백업 키를 즉시 교체하고 새 키로 약 14.5MB 암호화 백업을 만들었다. iCloud Drive `EconomicAgentBackups` 외부 사본에서 PostgreSQL TOC 146개를 읽고 격리 임시 DB에 테이블 32개·기사 31,505건을 실제 복원한 뒤 임시 DB를 제거했다. 기존 키로 만든 과거 백업은 자동 삭제하지 않았으며 새 키로는 열리지 않는 교체 전 세대로 취급한다.
- 외부 복원 검증 통과 후 `.env`의 매일 02:30 KST DB 백업을 활성화 준비했다. 72시간 shadow 연속 실행 시간을 보존하기 위해 현재 LaunchAgent는 재설치하지 않았고, active 전환 때 새 키·외부 경로·예약 플래그를 함께 주입한다.
- 2026-08-06 11:47 KST Discord Gateway가 새 WebSocket을 OPEN하기 전에 닫힐 때 Node WebSocket의 `close()`가 error를 동기 재발행해 같은 오류가 재귀적으로 로그에 쌓이는 문제를 확인했다. error 처리에서 socket을 먼저 종료 처리·재연결 예약한 뒤 `close()`하도록 순서를 바꾸고, 재진입형 가짜 WebSocket 회귀 테스트로 disconnect·재연결이 정확히 한 번만 발생함을 고정했다.
- 최종 cutover의 데이터 병합 공백을 보완했다. 초기 dump 복원 뒤 Supabase 예약 작업과 로컬 Discord worker가 양쪽에 서로 다른 행을 추가하므로 빈 DB 재복원을 반복하지 않고 `home:db:sync:dry-run`/`home:db:sync:apply`로 원격 신규·갱신 행만 로컬에 upsert한다. 로컬 전용 행은 삭제하지 않고, 포트폴리오·리스크·대화·pending action은 최신 `updated_at` 우선, 가격 이력은 serial ID가 아닌 자연키 우선으로 충돌을 막는다. apply는 72시간 shadow 통과와 원격 writer 정지 후에만 수행한다.
- 증분 dry-run에서 기사 신규 건수가 비정상적으로 부풀어 페이지 중복을 발견했다. PostgREST offset 페이지 조회가 기본키 정렬 없이 실행되어 원격 writer가 동작하는 동안 페이지 경계가 흔들릴 수 있었던 문제로, `db:pull`과 증분 동기화가 모든 테이블을 실제 기본키(`id`, `date`, `source_name`, `job_name`) 오름차순으로 읽도록 고정했다.
- 기본키 정렬과 타임스탬프·JSON 정규화 후 실제 읽기 전용 cutover dry-run을 재검증했다. 포트폴리오 계정과 14개 포지션은 실질 내용이 일치했고, 로컬에만 있는 대화 7건과 pending action 2건은 삭제 없이 유지된다. 원격 기사 증분은 신규 780건·내용 갱신 100건, 가격 이력은 자연키 기준 신규 399건·갱신 1건이었다. `--apply`는 실행하지 않았다.
- 2026-08-06 13:22 KST `Policy & Asset Radar` 실패는 원격 이전 커밋의 공식 소스별 10초 단발 제한 때문에 재정경제부·금융위원회·국토교통부 5개 RSS가 모두 timeout 난 것으로 확인했다. 실패 알림 Discord 전송은 정상 완료됐다. 현재 소스별 retry/WAF 보완에 더해 workflow에 25초·2회 재시도·1초 backoff를 명시했고, 실공식 `--dry-run`에서 5/5 소스·110건 수집을 재확인했다.
- Discord 공통 렌더러를 고도화해 정기 리포트 전 채널과 멘션/Interaction 응답에 heading, bullet, blockquote, inline code, link 문법을 일관 적용한다. Embed는 리포트 자체 제목, 채널별 색상, 운영 메타데이터 fields, 생성 시각, 페이지 번호와 안전 안내 footer를 사용하며 `allowed_mentions` 차단과 일반 텍스트 fallback은 유지한다. Workflow 실패 메시지도 상태·작업·브랜치·커밋·실행자와 로그 링크가 분리되어 보이도록 개편했다.
- 정책·세금 알림을 제목 중심에서 `상세 요약 → 개인 영향 → 지금 할 일 → 반드시 확인할 조건 → 공식 근거` 구조로 개편했다. 알림 후보의 금융위원회 공식 상세 페이지 본문을 추가 조회하고 보도설명은 언론 주장보다 정부의 확정/미확정 설명을 우선 표시한다. 재정경제부 첨부문서형 페이지와 국토교통부 WAF처럼 안정적으로 본문을 읽을 수 없는 경우에는 내용을 추정하지 않고 원문 확인 필요를 명시한다. 실제 dry-run에서 공식 소스 5/5, 110건 수집, 관련 54건을 확인했다.

## 다음 작업

1. shadow 백필 22건과 1/5/20거래일 평가 63행은 생성됐다. 2026-07-31 Qwen 후보 1건은 아직 거래 세션이 지나지 않았으므로 다음 평일 추천평가 workflow에서 1일 평가 생성을 확인한다.
2. `PGRST000/PGRST002`와 내부 `localhost:5432 connection refused`가 함께 반복되면 SQL/schema 변경을 중단하고 Project availability에서 재시작을 한 번만 시도한다. Compute and Disk의 `System` 사용량이 다시 비정상이면 티켓 `SU-419701`에 로그와 디스크 화면을 첨부해 managed compute/disk 복구를 요청한다.
3. 실제 입출금이 발생할 때 `cashflow:record`로 기록하고, 다음 월간 리뷰에서 TWR/MWR와 KOSPI 비교가 생성되는지 확인한다.
4. Qwen 메타데이터가 붙고 리스크 승인을 받은 추천의 20거래일 평가가 30건 이상 쌓이면 `npm run db:pull && npm run model:performance`로 모델 효과를 평가한다. 그 전에는 지연·JSON 준수율·비용만 canary 지표로 본다.
5. 가격 provider의 `해외/글로벌 가격 API 보강 검토` 판단이 주간/월간 리뷰에서 반복되는지 모니터링하되, 최근 1일 점검은 정상이라 Massive 과금은 필요성이 명확해질 때까지 보류
6. 새 공통 Embed 렌더러 배포 후 첫 정기 리포트와 다음 실제 workflow 실패에서 제목·필드·링크·모바일 줄바꿈을 확인한다.
7. `/dashboard` 실제 사용 빈도에 따라 탭 분리와 상세 차트 추가 여부 결정
8. 월간 리서치 worker 결과를 다음 월간 리뷰에서 실제 의사결정에 도움이 되는지 확인
9. 다음 실제 매매에서 Discord 자연어 매수/매도 초안의 추천·계획 연결, 원화 반영액, 실현손익을 확인하고 주간 리뷰의 연결률·매도 사유 기록률을 검증
10. `policy-radar.yml` 배포 후 첫 예약 실행의 공식 소스별 건수와 국토교통부 RSS 복구 여부를 확인한다. 다음 단계는 국가법령정보와 국회 의안 상태를 연결해 정부안부터 시행까지 동일 사건으로 추적하는 것이다.
11. Discord 단독 전송을 관찰해 긴급·브리핑·행동·정책·성과·운영 채널의 누락과 모바일 가독성을 확인한다.
12. Agent Server에 Discord 환경변수를 넣고 배포한 뒤 Developer Portal의 Interaction URL을 연결하고 `npm run discord:sync-commands`를 실행한다. 선택한 Windows/macOS/Linux 상시 호스트에서 `npm run discord:agent-worker:check` 후 `npm run discord:agent-worker`를 배치한다. 개인 `#포트폴리오` 채널에서 여섯 Slash 조회와 멘션 자연어 초안, 기록/취소 버튼, 요청자·채널 경계, 미허용 사용자 차단을 smoke 검증한다.
