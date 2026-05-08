# Economic Agent

경제 뉴스, 공시, 시장 데이터, 포트폴리오 기록을 수집해 시장 레짐과 종목 이벤트를 분석하고, 개인 투자 의사결정을 보조하는 경제/투자 에이전트입니다.

핵심 목적은 세 가지입니다.

1. 중요한 경제·시장 이벤트를 놓치지 않는다.
2. 종목 후보를 구조적으로 발굴하고 리스크를 먼저 검토한다.
3. 추천과 실제 거래의 성과를 분리해 검증한다.

## 주요 기능

- **실시간 뉴스 수집** — Agent Server + Scheduler가 연합뉴스, 매일경제, 한국경제, Bloomberg RSS 피드와 DART 공시를 5분 주기로 수집
- **3단계 필터링** — 키워드 → 중요도 스코어링 → 즉시 알림(5점)은 관련성 매칭, 나머지는 다이제스트 버퍼
- **FinBERT 감성 분석** — 영문 기사는 금융 특화 ML 모델로 호재/악재 판단 (로컬, 무료)
- **감성 강도 표시** — 강한 호재/호재/약한 호재/중립/약한 악재/악재/강한 악재 7단계
- **섹터 자동 분류** — 반도체, 에너지·원자재, 금융·통화, 부동산, 거시경제, 테크, 무역·지정학, 공시·기업이벤트
- **DART 공시 수집** — 주요 공시를 뉴스와 함께 스코어링하여 기업 이벤트 반영
- **프리마켓 스냅샷** — 개장 전/미국장 오픈 브리핑에 관심 지수·종목·원자재 가격 반영
- **시장 레짐 추세 점수** — KOSPI/KOSDAQ/S&P/Nasdaq/반도체 5일·20일 흐름으로 RISK_ON/OFF 보강
- **하루 5회 AI 다이제스트** — 시장 이벤트 시간대에 맞춘 뉴스 요약 브리핑
- **장 마감 종목 분석** — AI 기반 섹터/종목 인사이트 리포트
- **추천 성과 추적** — 종목 신호를 저장하고 1일/5일/20일 후 수익률 평가
- **추천 리스크 평가** — 추천 후 최대상승률, 최대하락률, 손절선/목표구간 터치 여부 추적
- **일일 행동 리포트** — 신규 매수/관찰/보유/축소/매도 후보를 포트폴리오 기준으로 분리
- **경제적 자유 추적** — 목표 순자산, 현재 달성률, 예상 달성 시점 계산
- **히스토리 영구 저장** — Supabase/Postgres에 기사, 리포트, 추천, 성과, 시장 스냅샷 저장
- **로컬 분석 미러** — Supabase 데이터를 JSON과 SQLite로 내려받아 로컬 파일시스템에서 직접 질의
- **AI 토큰 예산 관리** — 중요도 상위 기사와 핵심 가격 스냅샷만 AI 프롬프트에 투입

## 아키텍처

```
5분마다 ─ Agent Server 뉴스 수집 파이프라인 (무료)
  RSS 피드 (연합뉴스, 매경, 한경, Bloomberg) + DART 공시
      ↓
  1단계: 키워드 필터
      ↓
  2단계: 스코어링 (키워드 가중치 + FinBERT 감성 + 섹터 분류)
      ↓
  Supabase articles + 일별 기사 아카이브 저장
      ↓
  score 5 → 개인 관련성 매칭 → 즉시 알림
  score 4 → 다이제스트 버퍼에 저장

하루 5회 ─ AI 다이제스트 (AI 5회/일)
  버퍼 기사 수집 → AI 요약 → Telegram 발송 성공 후 버퍼 비움

하루 1회 ─ 종목 분석 (AI 1회/일)
  일별 기사 아카이브 기반 당일 뉴스 종합 → AI 섹터/종목 분석 → Telegram 발송
      ↓
  추천 로그 저장 → KOSPI 벤치마크 대비 1일/5일/20일 성과 평가

상시 ─ 히스토리 저장
  기사/요약/리포트/추천/성과/시장 스냅샷(5일/20일 추세 포함) → 로컬 JSON + Supabase 병행 저장
  npm run db:pull → data/supabase/*.json + data/economic-agent.db 로컬 미러 생성
```

## 다이제스트 스케줄

| 시간 (KST) | 세션 | 의미 |
|:---:|------|------|
| 🌅 08:20 | 개장 전 브리핑 | KRX 호가 접수 전, 미국장 마감 + 국내 개장 체크 |
| ☀️ 11:50 | 오전장 점검 | 오전장 흐름 + 오후장 체크 |
| 🔔 15:45 | 장 마감 브리핑 | KRX 정규장 마감 직후 |
| 🌆 17:10 | 유럽장 체크 | 유럽장 초반 + 국내 시간외/미국 프리마켓 |
| 🇺🇸 22:40 | 미국장 오픈 브리핑 | 미국 주요 지표/정규장 오픈 + 다음날 국내 영향 |

스케줄은 KRX 정규장 09:00~15:30과 호가 접수 08:30, 미국 정규장 09:30~16:00 ET, 미국 주요 지표의 08:30/10:00 ET 발표 시간, 유럽장 초반 흐름을 기준으로 맞췄습니다.

## 프로젝트 구조

```
src/
├── check-news.js              # 뉴스 수집 CLI entrypoint
├── jobs/run-news-collector.js # Agent Server/CLI 공용 뉴스 수집 job
├── server/index.js            # Cloud Run Agent Server + Telegram webhook + collector endpoint
├── digest.js                  # AI 다이제스트 생성 + 발송 (하루 5회)
├── stock-report.js            # 장 마감 종목 분석 (하루 1회)
├── evaluate-recommendations.js # 추천 성과 평가
├── sources/
│   ├── rss-fetcher.js         # RSS 수집 (4개 소스)
│   ├── dart-api.js            # DART 공시 수집
│   ├── bok-api.js             # 한국은행 기준금리 API
│   ├── fred-api.js            # FRED 미국 경제지표 API
│   ├── price-provider.js      # 가격 소스 우선순위 라우터
│   ├── kis-api.js             # 한국투자증권 Open API REST 가격 조회
│   ├── krx-openapi.js         # KRX Open API 공식 일별매매정보
│   ├── alpaca-api.js          # 미국 주식 실시간/히스토리 provider 후보
│   ├── fmp-api.js             # 해외 주식 가격/재무/실적 provider 후보
│   ├── alpha-vantage-api.js   # 해외 주식 fallback 가격 provider
│   ├── tiingo-api.js          # 해외 EOD/조정주가 fallback provider
│   ├── naver-finance.js       # 국내 종목 현재가 fallback
│   └── yahoo-finance.js       # 해외 종목/글로벌 fallback 가격 조회
├── filters/
│   ├── keyword-filter.js      # 1단계: 키워드 필터
│   ├── local-scorer.js        # 2단계: 로컬 스코어링 (FinBERT + 키워드)
│   ├── finbert.js             # FinBERT 금융 감성 분석 (영문)
│   ├── sentiment-dictionary.js # 한국어/공시 감성 사전
│   └── relevance-matcher.js   # 3단계: 개인 관련성 매칭
├── analysis/
│   ├── digest.js              # AI 다이제스트 프롬프트
│   └── stock-analyzer.js      # AI 종목/섹터 분석 프롬프트
├── notify/
│   └── telegram.js            # Telegram 포맷팅 및 전송
├── config/
│   ├── keywords.js            # 목적별 키워드 설정 통합 facade
│   ├── market-keywords.js     # 시장 국면/거시 키워드
│   ├── stock-keywords.js      # 종목/섹터 키워드
│   ├── disclosure-keywords.js # DART/공시 이벤트 키워드
│   ├── interests.js           # 개인 관심사
│   ├── watchlist.js           # 프리마켓/시장 스냅샷 관심 종목
│   ├── portfolio.js           # 포트폴리오/리스크 제약
│   ├── price-source-policy.js # KIS/Naver/Yahoo 가격 소스 우선순위
│   └── ai-budget.js           # AI 프롬프트 토큰 예산
└── utils/
    ├── ai-client.js           # AI 제공자 추상화 (멀티 프로바이더)
    ├── ai-budget.js           # AI 입력 데이터 선별/축약
    ├── article-identity.js    # 기사 중복 제거용 id/URL/제목 정규화
    ├── article-archive.js     # 점수화 기사 일별 아카이브
    ├── article-buffer.js      # 기사 버퍼 관리
    ├── config.js              # 공통 설정
    ├── recommendation-log.js  # 추천 저장 및 성과 평가
    ├── action-report.js       # 신규 매수/관찰/보유/축소/매도 후보 분리
    ├── freedom-engine.js      # 경제적 자유 목표/달성률/예상 달성 시점 계산
    ├── position-sizer.js      # 손실 허용액/현금/종목/섹터/레짐 기준 매수금액 계산
    ├── risk-reviewer.js       # 추천 전 리스크 관리자/factor 검토
    ├── market-snapshot.js     # 프리마켓/글로벌 가격 스냅샷
    ├── decision-engine.js     # 시장 레짐/행동 가드레일
    ├── portfolio.js           # 로컬 포트폴리오 파일 로딩
    ├── persistence.js         # Supabase 히스토리 저장
    ├── seen-articles.js       # 중복 기사 관리
    ├── indicators.js          # 경제지표/투자자 수급 수집
    └── daily-summary.js       # 일일 요약 저장
```

## Codex 작업 지침

Codex에서 작업할 때는 저장소 루트의 `AGENTS.md`를 기준으로 프로젝트 구조, 실행 명령, 환경 변수, 변경 기록 규칙을 따릅니다.

## 로드맵

경제적 자유를 목표로 시장 파악, 주식 후보 도출, 리스크 관리, 성과 검증을 강화하는 장기 계획은 `ROADMAP.md`에 정리되어 있습니다.

개발 진행 상황과 현재 운영 컨텍스트는 `docs/PROGRESS.md`에 기록합니다.

대화형 Agent 실행 플랫폼과 Telegram webhook 서버 방향은 `docs/AGENT_PLATFORM.md`에 정리되어 있습니다. 현재 결론은 Telegram을 대화 UI로 유지하고, GitHub Actions는 정기 작업, 별도 Node.js Agent Server는 실시간 대화 처리, Supabase는 기준 저장소로 두는 구조입니다.

Telegram 채팅창에서 명령어를 실제로 쓰기 위한 배포와 webhook 등록 절차는 `docs/TELEGRAM_AGENT_DEPLOY.md`에 정리되어 있습니다.

## 운영 모드

현재 기본 운영 모드는 `Assist Mode`입니다. 자동 주문은 하지 않습니다.

| 모드 | 의미 |
|------|------|
| Observe Mode | 뉴스 수집/요약만 수행 |
| Paper Mode | 추천을 생성하고 가상 성과만 평가 |
| Assist Mode | 추천, 리스크 리뷰, 제안 매수금액을 제공하고 매매는 사람이 결정 |
| Trade Log Mode | 사람이 실제 매수/매도한 결과를 기록하고 복기 |

추천 성과, 실제 거래 성과, 계좌 성과는 서로 다른 문제로 보고 분리해서 저장합니다.

## 데이터 보존

- `data/article-buffer.json`: 다음 다이제스트에서 처리할 score 4 기사
- `data/daily-articles/YYYY-MM-DD.json`: 수집 중 점수화된 당일 기사 누적 아카이브
- `data/daily-summary/YYYY-MM-DD.json`: 다이제스트/종목 리포트 요약
- `data/recommendations/recommendations.json`: 추천/성과 평가 로컬 미러. 기준 저장소는 Supabase `recommendations`, `recommendation_evaluations`
- `data/trades/trade-executions.json`: 실제 매수/매도 기록 로컬 미러. 추천과 실제 실행은 분리합니다.
- `data/portfolio-snapshots/YYYY-MM-DD.json`: 보유 종목 현재가/평가손익 스냅샷
- `data/action-reports/YYYY-MM-DD.json`: 신규 매수/관찰/보유/축소/매도 후보 일일 행동 리포트
- `data/freedom/freedom-status.json`: 경제적 자유 목표와 현재 달성률
- Supabase tables: `articles`, `daily_summaries`, `stock_reports`, `recommendations`, `recommendation_evaluations`, `trade_executions`, `portfolio_snapshots`, `market_snapshots`, `price_snapshots`, `investor_flows`, `decision_contexts`
- Agent/Supabase tables: `financial_freedom_goals`, `portfolio_accounts`, `positions`, `risk_policy`, `conversation_messages`, `pending_actions`
- `data/supabase/*.json`: Supabase 데이터를 내려받은 로컬 JSON 미러
- `data/economic-agent.db`: Supabase 데이터를 내려받은 로컬 SQLite 미러

다이제스트는 AI 생성과 Telegram 전송이 모두 성공한 뒤에만 버퍼를 비웁니다. 장 마감 종목 분석은 `daily-articles` 아카이브를 우선 사용하므로, 5분 수집기가 이미 seen 처리한 기사와 DART 공시도 하루 단위 분석에 포함됩니다. 외국인/기관 수급은 네이버 금융의 일자별 순매수 표를 보조 소스로 사용하고, 단위는 억원입니다.

## 영구 저장소

Supabase는 장기 히스토리 저장소, `data/`는 GitHub Actions 캐시와 로컬 분석용 보조 저장소입니다. GitHub Actions 캐시는 영구 DB가 아니므로 추천 성과 학습에는 Supabase를 기준 저장소로 사용합니다.

```bash
# Supabase 스키마 적용
npm run db:push

# Supabase 데이터를 로컬 파일시스템으로 내려받기
npm run db:pull

# 기존 data/*.json 히스토리를 Supabase로 업로드
npm run db:import-local

# SQLite 질의 예시
sqlite3 data/economic-agent.db "select count(*) from articles;"
```

추천 리포트를 보고 실제로 매수/매도했다면 별도 거래 기록으로 남깁니다. 이 기록은 추천 성과와 실제 계좌 성과를 분리해서 검증하기 위한 데이터입니다.

```bash
npm run trade:record -- --side buy --ticker 005930 --name 삼성전자 --quantity 3 --price 266000 --notes "1차 분할 진입"
npm run recommendations:list
npm run action:report
npm run freedom:report
npm run portfolio:seed-store
npm run trade:performance
npm run review:weekly
npm run review:monthly
```

`trade:record`는 기본적으로 `data/portfolio.json`의 현금, 보유수량, 평균단가를 함께 갱신합니다. 거래만 기록하고 포트폴리오를 건드리지 않으려면 `--noPortfolio`를 붙입니다.

대화형 Agent 배포 후에는 `portfolio:seed-store`로 현재 로컬 포트폴리오를 Supabase `portfolio_accounts`, `positions`에 올립니다. 이후 Telegram `/portfolio`는 Supabase 원본을 우선 읽고, `/cash`, `/buy`, `/sell` 승인도 Supabase 포트폴리오를 갱신합니다. `PORTFOLIO_JSON_BASE64`는 bootstrap/fallback 용도입니다. `portfolio:snapshot`은 Supabase 원본을 우선 읽어 현재가·환율로 평가한 뒤 `portfolio_snapshots`와 `portfolio_accounts`/`positions`를 함께 갱신합니다. 실제 매수/매도를 추천과 연결하려면 `/recommendations`로 리스크 기준을 통과한 최근 추천 ID를 확인한 뒤 `/buy 005930 3 70000 삼성전자 rec=추천ID`처럼 기록합니다. 손익비가 낮거나 리스크 리뷰를 통과하지 못한 종목은 기본 추천 목록에 나오지 않으며, 필요할 때만 `/recommendations blocked`로 차단/관찰 후보를 참고합니다.

## 추천 생성 원칙

종목 추천은 단순 `매수/관찰` 문구가 아니라 검증 가능한 구조를 포함해야 합니다. AI 출력은 JSON으로 제한하고, 저장 전 로컬 리스크 리뷰를 통과합니다.

모든 추천 후보는 가능한 경우 아래 값을 포함합니다.

- 진입 근거와 관련 기사/공시 ID
- 기준 가격과 가격 시각
- 손절 기준과 무효화 조건
- 기대 상승폭과 예상 손실폭
- 손익비
- 제안 매수금액과 계좌 비중
- 리스크 리뷰 통과 여부와 차단 사유

## 리스크 가드레일

장 마감 리포트는 가능한 경우 `손익비`, `손절폭`, `무효화 조건`, `제안 매수금액`, `계좌 비중`, `20일 상대강도`, `20일 평균 대비 거래량`, `20일 고점 근접/돌파 여부`를 함께 표시합니다.

2,000만원 계좌의 기본 포지션 사이징은 손실 허용액 기준으로 계산합니다.

```text
risk_amount = total_asset_value * risk_per_trade_ratio
position_by_risk = risk_amount / abs(stop_loss_pct)
position_by_cap = total_asset_value * max_new_buy_ratio
suggested_buy_amount = min(position_by_risk, position_by_cap, available_cash)
```

예를 들어 2,000만원 계좌에서 거래당 손실 허용률이 1%, 손절폭이 8%면 손실 기준 매수 가능 금액은 250만원입니다. 다만 기본 신규 매수 상한이 100만원이면 최종 제안 금액은 100만원으로 제한됩니다.

추천은 저장 전에 리스크 관리자 레이어를 통과합니다. `risk_review`는 시장 레짐, 손익비, 손절폭, 유동성, 상대강도, 모멘텀, 포지션 크기 factor를 검토하고 차단 사유를 기록합니다.

신규 매수 후보는 기본적으로 손익비 1:2 미만, 손절폭 과다, 유동성 기준 미달, 시장 대비 상대강도 약세, RISK_OFF 레짐에서는 차단 또는 강등됩니다.

`recommendation-schema.js`는 추천 저장 전 최소 계약을 검증합니다. 근거 기사, 기준 가격, 손절 기준, 손익비, 제안 비중/금액, 무효화 조건이 없으면 `schema_validation.passed=false`로 표시하고 `risk_review`를 `watch_only`로 강등합니다. 이런 후보는 Telegram 리포트에는 차단 사유로 보이지만 추천 성과 로그에는 저장하지 않습니다.

## 성과 평가 기준

추천은 단순 수익률만 보지 않습니다. `recommendation_evaluations`에는 1일/5일/20일 단위로 아래 값을 저장합니다.

- 추천 후 수익률과 KOSPI 벤치마크 대비 초과수익
- 추천 후 최대상승률(MFE)
- 추천 후 최대하락률/최대역행폭(MAE)
- 최대낙폭
- 손절선 터치 여부
- 목표 수익구간 터치 여부
- 결과 라벨: `target_touched`, `stop_touched`, `beat_benchmark` 등

주간/월간 리뷰는 `performance-lab.js`와 `behavior-reviewer.js`를 통해 추천 품질과 실제 행동을 분리해서 봅니다.

- 전체 추천, 실제 매수로 연결된 추천, 매수하지 않은 추천의 성과를 따로 비교
- 손익비 구간, 신뢰도, 신호 방향별 성과 분해
- 추천과 연결되지 않은 매수, 관찰/차단 후보 매수, 최소 손익비 미달 매수 경고
- 손절 기준이나 근거 기사 없이 생성된 호재 후보 점검

보유 종목의 현재가와 평가손익은 장 마감 리포트 생성 시 자동 계산되며, 필요하면 별도로 스냅샷을 만들 수 있습니다.

```bash
npm run portfolio:snapshot
```

로컬 대시보드는 Supabase 미러를 내려받은 뒤 HTML로 생성합니다.

```bash
npm run db:pull
npm run dashboard
```

`db:push`에는 `SUPABASE_PROJECT_URL`과 `SUPABASE_DB_PASSWORD`가 필요합니다. 네트워크가 Supabase direct DB의 IPv6 연결을 지원하지 않으면 Supabase 대시보드의 pooler 연결 문자열을 `SUPABASE_DB_URL`로 넣어 우회합니다. 런타임 저장과 `db:pull`에는 `SUPABASE_PROJECT_URL`과 `SUPABASE_PUBLISHABLE_KEY`를 사용합니다.

## 대화형 Agent 서버

Telegram 대화형 Agent는 별도 서버로 실행합니다.

```bash
npm run agent:server
```

현재 endpoint:

```text
GET  /health
POST /telegram/webhook
```

현재 지원 명령:

```text
/portfolio
/goal
/risk
/buy TICKER 수량 가격 [이름]
/sell TICKER 수량 가격 [이름]
/cash 현금잔액
/help
```

포트폴리오와 경제적 자유 상태를 다루므로 Telegram `chat_id` allowlist를 통과한 채팅만 응답합니다. allowlist는 `TELEGRAM_SECRET_CHAT_ID`, `TELEGRAM_PRIVATE_CHAT_ID`, `TELEGRAM_AGENT_CHAT_ID`, `TELEGRAM_PORTFOLIO_CHAT_ID`, `TELEGRAM_CHAT_ID` 순서로 구성됩니다.

`/buy`, `/sell`, `/cash`는 즉시 반영하지 않고 Supabase `pending_actions`에 초안을 만든 뒤 Telegram inline button의 `기록하기`/`취소` 승인으로 처리합니다.

Telegram webhook secret token을 쓰려면 아래 값을 설정하고, Bot API `setWebhook`에도 같은 secret token을 넣습니다.

```bash
TELEGRAM_WEBHOOK_SECRET=...
```

## 설치 및 실행

### 요구 사항

- Node.js 22+
- Telegram Bot Token ([BotFather](https://t.me/BotFather)에서 발급)
- AI API Key (다이제스트/종목분석용, 아래 지원 목록 참조)

### 설치

```bash
git clone https://github.com/<your-username>/economic-agent.git
cd economic-agent
npm install
```

### 환경 변수 설정

```bash
cp .env.example .env
```

```env
# AI 설정 (다이제스트 + 종목분석에 사용)
AI_PROVIDER=anthropic          # anthropic | openai | groq | ollama | custom
# AI_MODEL=                    # 모델 지정 (선택, 제공자별 기본값 있음)
# AI_BASE_URL=                 # 커스텀 엔드포인트 (선택)

# 사용하는 제공자의 키만 설정
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# GROQ_API_KEY=gsk_...

# Telegram (필수)
TELEGRAM_BOT_TOKEN=123456:ABC...
# 공유 뉴스/시장 브리핑 방
TELEGRAM_CHAT_ID=-100...
# 포트폴리오/거래/경제적 자유/대화형 Agent 전용 비공개 방 (선택)
# TELEGRAM_PRIVATE_CHAT_ID=-100...
# TELEGRAM_SECRET_CHAT_ID=-100...

# 경제지표 (선택)
BOK_API_KEY=...
FRED_API_KEY=...
DART_API_KEY=...

# Supabase 히스토리 저장소 (선택)
SUPABASE_PROJECT_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... # 선택: KIS 토큰 공유 캐시와 서버 전용 작업에 사용
SUPABASE_DB_PASSWORD=...
# SUPABASE_DB_URL=postgresql://postgres.your-project-ref:password@aws-0-region.pooler.supabase.com:6543/postgres
# SUPABASE_DNS_RESOLVER=https

# 로컬 포트폴리오 파일 (선택, 커밋 금지)
# PORTFOLIO_FILE=data/portfolio.json
```

### 실행

```bash
# 뉴스 수집 (수동 실행, 운영에서는 Agent Server/Scheduler가 5분 주기로 호출)
npm start

# AI 다이제스트 발송 (시간대 자동 감지)
npm run digest

# 특정 세션 지정 (preopen/midday/close/europe/usopen)
npm run digest -- preopen

# 장 마감 종목 분석
npm run report

# 추천 성과 평가
npm run evaluate

# Supabase 스키마 적용 / 로컬 미러 동기화
npm run db:push
npm run db:import-local
npm run db:pull
```

## AI 제공자 지원

| 제공자 | 설정값 | 모델 예시 | 비용 |
|--------|--------|-----------|------|
| **Groq** | `groq` | llama-3.3-70b-versatile | 무료 티어 |
| **Ollama** | `ollama` | llama3 | 완전 무료 (로컬) |
| **Anthropic** | `anthropic` | claude-haiku-4-5-20251001 | ~$0.18/일 |
| **OpenAI** | `openai` | gpt-4o-mini | ~$0.12/일 |
| **Custom** | `custom` | - | AI_BASE_URL 설정 |

AI 비용을 줄이기 위해 전체 히스토리를 매번 프롬프트에 넣지 않습니다. 다이제스트는 상위 기사 16건, 종목 리포트는 상위 기사 32건과 핵심 시장 스냅샷만 잘라 넣고, 장기 히스토리는 Supabase/SQLite에 저장해 필요할 때만 조회합니다.

## 감성 분석

뉴스 스코어링은 AI API 없이 **로컬에서 무료**로 동작합니다:

| 기사 언어 | 분석 방법 | 정확도 |
|-----------|-----------|--------|
| **영문** (Bloomberg 등) | FinBERT ML 모델 (로컬 CPU) | 높음 (문맥 이해) |
| **한국어/공시** | 가중 키워드 감성 사전 | 보통+ (강한 투자 신호 가중) |

감성 강도는 confidence 기반 7단계로 표시됩니다:

| confidence | 호재 | 악재 |
|:---:|------|------|
| >= 85% | 🔴 강한 호재 | 🔵 강한 악재 |
| 60~85% | 🔴 호재 | 🔵 악재 |
| < 60% | 🟠 약한 호재 | 🟣 약한 악재 |
| - | ⚪ 중립 | |

## GitHub Actions 배포

| 워크플로우 | 스케줄 | 설명 |
|-----------|--------|------|
| `news-alert.yml` | 평일 07:00~23:00 KST, 15분 간격 | 메인 수집 장애 대비 뉴스 백업 수집 |
| `digest-morning.yml` | 평일 08:20 KST | 개장 전 브리핑 |
| `digest-lunch.yml` | 평일 11:50 KST | 오전장 점검 |
| `digest-close.yml` | 평일 15:45 KST | 장 마감 브리핑 |
| `digest-evening.yml` | 평일 17:10 KST | 유럽장 체크 |
| `digest-night.yml` | 평일 22:40 KST | 미국장 오픈 브리핑 |
| `stock-report.yml` | 평일 16:00 KST | 장 마감 종목 분석 |
| `portfolio-snapshot.yml` | 평일 16:10 KST | 보유 포트폴리오 평가손익 스냅샷 |
| `action-report.yml` | 평일 16:25 KST | 신규 매수/관찰/보유/축소/매도 후보 분리 |
| `evaluate-recommendations.yml` | 평일 17:30 KST | 추천 성과 평가 |
| `trade-performance.yml` | 평일 17:40 KST | 실제 거래 성과 평가 |
| `performance-review-weekly.yml` | 금요일 18:10 KST | 주간 성과 리뷰 |
| `performance-review-monthly.yml` | 매월 1일 18:20 KST | 월간 성과 리뷰 |

메인 5분 수집은 Cloud Run Agent Server의 `POST /jobs/news-collector`를 Scheduler가 호출합니다. `news-alert.yml`에는 workflow concurrency를 설정해 15분 백업 수집 작업이 겹치더라도 같은 버퍼/캐시 상태를 동시에 건드릴 가능성을 줄입니다. 기사는 deterministic article id, 정규화 URL, 정규화 제목 기준으로 중복을 제거하고, 낮은 점수로 다이제스트에 들어가지 않는 원문도 Supabase `articles`에 저장해 Cloud Run의 휘발 로컬 캐시 때문에 같은 기사가 반복 신규 처리되지 않게 합니다.

GitHub 저장소의 **Settings > Secrets and variables > Actions**에 환경 변수를 등록하세요. DART 공시 수집을 쓰려면 `DART_API_KEY`도 Secret에 추가합니다.

기존 공유방을 계속 쓰되 포트폴리오·거래·경제적 자유 리포트를 별도 방으로 보내려면 `TELEGRAM_PRIVATE_CHAT_ID` 또는 `TELEGRAM_SECRET_CHAT_ID`를 Secret에 추가합니다. 설정하지 않으면 민감 리포트도 기존 `TELEGRAM_CHAT_ID`로 fallback됩니다.

Supabase 저장을 GitHub Actions에서도 활성화하려면 `SUPABASE_PROJECT_URL`, `SUPABASE_PUBLISHABLE_KEY`를 Secret에 추가합니다. `SUPABASE_DB_PASSWORD`는 로컬에서 `npm run db:push`를 실행할 때만 필요합니다.

## 커스터마이징

### 키워드 / 가중치 / 감성 사전 / 섹터

필터링 규칙은 목적별 파일로 나뉘며, 기존 호환성을 위해 `src/config/keywords.js`가 이를 통합합니다.

- `src/config/market-keywords.js`: 금리, 환율, 지수, 유가, 지정학 등 시장 국면
- `src/config/stock-keywords.js`: 반도체, AI 인프라, 조선, 방산, 2차전지, 바이오, 금융 등 종목 후보
- `src/config/disclosure-keywords.js`: 실적, 공급계약, 자사주, 유상증자, 전환사채, 거래정지 등 공시
- `src/config/keywords.js`: 위 설정을 합쳐 기존 필터/스코어러에 제공

한국어 감성 분석은 `src/filters/sentiment-dictionary.js`에서 처리합니다. 단순 키워드 개수 비교가 아니라 `자사주 소각`, `주주환원`, `유상증자`, `전환사채`, `거래정지` 같은 강한 투자 신호에 추가 가중치를 줍니다.

### 투자 정책 / 포지션 사이징

투자 헌법과 기본 리스크 한도는 `src/config/strategy-policy.js`에 둡니다. 추천 매수금액은 `src/utils/position-sizer.js`가 아래 한도 중 가장 작은 값을 사용합니다.

```text
손실 기준 금액
신규 매수 상한
종목별 최대 비중 잔여 한도
섹터별 최대 비중 잔여 한도
가용 현금
시장 레짐별 신규 매수 한도
```

### 관심사

`src/config/interests.js`에서 개인 관심사를 수정합니다:

```javascript
module.exports = {
  portfolio: ['ETF', '반도체', ...],
  macro: ['금리', '환율', '인플레이션'],
  career: ['프론트엔드', '금융IT', ...],
};
```

### 가격 데이터

가격 조회는 `src/sources/price-provider.js`를 통해 호출합니다. 국내 6자리 종목코드는 장중/현재가에서는 한국투자증권 Open API REST를 우선 사용하고, 실패하면 Naver Finance, 마지막으로 Yahoo Finance fallback을 사용합니다. KIS 접근토큰은 24시간/1일 1회 발급 원칙을 전제로 운용하므로, 같은 토큰을 재사용하기 위해 로컬 파일 캐시와 Supabase service role 전용 원격 캐시를 함께 사용합니다. 국내 현재가가 KIS 또는 Naver에서 확인된 경우 Yahoo의 국내 history 기반 5일/20일 수익률은 사용하지 않습니다.

추천 성과 평가와 백테스트용 일별 종가는 현재가와 분리합니다. 국내 EOD 가격은 KRX Open API 공식 일별매매정보(`krx-openapi`)를 우선 사용하고, 없으면 공공데이터포털 주식시세정보(`data-go-kr`), KIS 일봉 순서로 fallback합니다. 해외 EOD 가격은 FMP historical EOD를 우선 사용하고, Tiingo/Alpha/Yahoo fallback을 사용합니다. 추천 1일/5일/20일 평가는 가능한 경우 평가 대상일의 EOD 가격과 EOD high/low history로 수익률, MFE/MAE, 손절/목표 터치 여부를 계산합니다.

해외 주식은 Alpaca Market Data, FMP, Alpha Vantage, Tiingo EOD, Yahoo fallback 순서로 조회합니다. 키가 없는 provider는 자동으로 건너뛰므로 초기에는 Yahoo fallback으로 계속 동작하고, `FMP_API_KEY`를 넣으면 미국 기업 재무/실적 분석까지 확장할 수 있습니다. 미국 장중 실시간 알림이 중요해지면 Alpaca WebSocket 또는 Massive를 별도 실시간 계층으로 추가합니다.

FMP profile, 재무제표 요약, earnings calendar는 해외 종목 후보의 `fundamental_profile`로 저장합니다. 리스크 리뷰는 `isActivelyTrading=false` 종목을 차단하고, 고베타, ADR, 미국 소형주, ETF, 매출/순이익 역성장, 음수 FCF 마진, 높은 D/E, 실적발표 임박, 직전 EPS 쇼크를 경고로 표시합니다.

포트폴리오에 미국 주식과 한국 주식이 섞여 있으면 USD 종목은 USD/KRW로 KRW 환산해 총자산을 계산합니다.

사용한 가격은 Supabase `price_snapshots`에 `ticker`, `source`, `price_type`, `as_of`와 함께 저장합니다. 추천 성과와 포트폴리오 스냅샷은 나중에 어떤 가격 소스를 기준으로 계산됐는지 추적할 수 있어야 합니다.

한국투자증권 Open API를 쓰려면 아래 환경 변수를 설정합니다.

```bash
KIS_APP_KEY=...
KIS_APP_SECRET=...
# 선택: 기본값은 실전 REST URL
KIS_BASE_URL=https://openapi.koreainvestment.com:9443
KIS_MIN_REQUEST_INTERVAL_MS=1100

# 해외 주식 선택 provider
ALPACA_API_KEY_ID=...
ALPACA_API_SECRET_KEY=...
ALPACA_DATA_FEED=iex
FMP_API_KEY=...
ALPHA_VANTAGE_API_KEY=...
TIINGO_API_TOKEN=...

# 국내 EOD 백필 선택 provider
KRX_OPENAPI_KEY=...
# 선택: 기본값은 KRX Open API endpoint
KRX_OPENAPI_BASE_URL=https://data-dbg.krx.co.kr/svc/apis
DATA_GO_KR_API_KEY=...
```

KRX Open API는 키 발급 외에 사용할 API 서비스별 이용 권한이 필요할 수 있습니다. `401 Unauthorized API Call`이 나오면 KRX 포털에서 유가증권 일별매매정보와 코스닥 일별매매정보 이용신청/승인 상태를 확인하세요. KRX가 실패해도 시스템은 Data.go.kr, KIS 순서로 자동 fallback합니다.

KIS 접근토큰은 발급 제한이 있으므로 런타임에서 `data/kis-token.json`에 캐시합니다. `SUPABASE_SERVICE_ROLE_KEY`가 설정되어 있으면 `api_token_cache` 테이블에도 저장해 Cloud Run, GitHub Actions, 로컬 실행이 같은 토큰을 재사용합니다. 이 테이블은 RLS가 활성화되어 있고 일반 publishable key로 접근하지 않습니다. 현재가 조회는 기본 1.1초 간격으로 직렬화합니다.
KIS 접근토큰은 원칙적으로 24시간 유효하고 1일 1회 발급을 전제로 운용합니다. service role 기반 원격 캐시가 없으면 GitHub Actions처럼 실행 환경이 매번 새로 만들어지는 곳에서는 캐시가 사라져 토큰 발급 알림이 더 자주 올 수 있습니다. 추천 성과 평가/EOD는 KRX를 우선 사용해 불필요한 KIS 일봉 호출을 줄입니다.

국내 일별 종가를 Supabase `price_snapshots`에 백필하려면:

```bash
npm run prices:backfill-eod -- 005930,000660 2026-05-01 2026-05-07
```

KIS WebSocket은 장중 실시간 체결/호가 알림용입니다. 현재 운영은 REST 현재가/일봉을 우선 사용하고, WebSocket은 항상 켜진 Agent Server가 생긴 뒤 별도 모듈로 붙입니다.

### 실제 포트폴리오

실제 보유 종목과 현금 비중은 커밋하지 않는 로컬 파일 `data/portfolio.json`에 둡니다. 형식은 `docs/portfolio.example.json`을 복사해 맞추면 됩니다.

```bash
cp docs/portfolio.example.json data/portfolio.json
```

GitHub Actions에서도 실제 포트폴리오를 평가하려면 같은 JSON을 secret으로 넣습니다. 권장 방식은 base64입니다.

```bash
base64 < data/portfolio.json | gh secret set PORTFOLIO_JSON_BASE64
```

로컬 포트폴리오가 바뀐 뒤 Actions secret까지 갱신하려면:

```bash
npm run portfolio:sync-secret
```

`cashAmount`와 `totalAssetValue`를 넣으면 현금 비중이 자동 계산됩니다. 종목별 `weight`를 넣으면 장 마감 리포트의 행동 가드레일에서 종목/섹터 쏠림을 점검합니다.

### 경제적 자유 목표

`src/config/freedom.js`에서 월 생활비, 월 저축액, 목표 인출률, 목표일, 기대 연수익률을 수정합니다.

```bash
npm run freedom:report
```

기본 목표 순자산은 `월 생활비 * 12 / 목표 인출률`로 계산합니다. 현재 순자산은 로컬 포트폴리오의 `totalAssetValue`를 우선 사용합니다.

초기에는 `maxNewBuyRatio=0.05`와 `maxNewBuyAmount=1000000` 중 더 작은 값을 1회 신규 매수 상한으로 씁니다. 예를 들어 총자산이 커져 5%가 300만원이어도 기본 제안금액은 1회 100만원을 넘지 않습니다. `/recommendations`는 리스크 기준을 통과한 매수 검토 후보만 보여주고, 제안금액 옆에 `손실한도`, `1회 신규매수 상한`, `현금`처럼 어떤 한도가 실제 금액을 제한했는지 표시합니다. 차단/관찰 후보는 `/recommendations blocked`에서만 참고용으로 확인합니다.

## 월간 비용 (추정)

| 구성 | 비용 |
|------|------|
| 수집 + 스코어링 (FinBERT + 키워드) | **무료** |
| 다이제스트 + 종목분석 (Groq) | **$0/월** |
| 다이제스트 + 종목분석 (Claude Haiku) | **~$5.4/월** |
| 다이제스트 + 종목분석 (Claude Sonnet, 현재 호출량 기준) | **대략 $6~25/월** |
| GitHub Actions (Public) | 무료 |
| Telegram / BOK / FRED / DART API | 무료 |
| Supabase | 무료 티어로 시작 가능 |

## 수집 신뢰도

뉴스/DART 수집은 두 계층으로 운영합니다.

```text
Agent Server + Scheduler
= 5분 메인 수집, POST /jobs/news-collector

GitHub Actions
= 15분 백업 수집, 브리핑/리포트/평가
```

GitHub Actions schedule은 지연/누락 가능성이 있으므로 실시간성 수집의 단일 기준으로 쓰지 않습니다. 수집기는 마지막 성공 시각 이후를 겹쳐 조회하고, 오래된 긴급 기사는 즉시 알림 폭탄이 아니라 다이제스트/캐치업으로 넘깁니다.

## 라이선스

MIT
