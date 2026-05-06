# Economic Agent

경제 뉴스를 자동으로 수집하고 AI로 요약하여 Telegram 다이제스트를 보내는 개인용 경제 뉴스 에이전트입니다.

## 주요 기능

- **실시간 뉴스 수집** — 연합뉴스, 매일경제, 한국경제, Bloomberg RSS 피드 (5분 간격)
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
- **히스토리 영구 저장** — Supabase/Postgres에 기사, 리포트, 추천, 성과, 시장 스냅샷 저장
- **로컬 분석 미러** — Supabase 데이터를 JSON과 SQLite로 내려받아 로컬 파일시스템에서 직접 질의
- **AI 토큰 예산 관리** — 중요도 상위 기사와 핵심 가격 스냅샷만 AI 프롬프트에 투입

## 아키텍처

```
5분마다 ─ 뉴스 수집 파이프라인 (무료)
  RSS 피드 (연합뉴스, 매경, 한경, Bloomberg) + DART 공시
      ↓
  1단계: 키워드 필터
      ↓
  2단계: 스코어링 (키워드 가중치 + FinBERT 감성 + 섹터 분류)
      ↓
  일별 기사 아카이브 저장
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
├── check-news.js              # 뉴스 수집 + 스코어링 → 버퍼 저장 (5분 간격)
├── digest.js                  # AI 다이제스트 생성 + 발송 (하루 5회)
├── stock-report.js            # 장 마감 종목 분석 (하루 1회)
├── evaluate-recommendations.js # 추천 성과 평가
├── sources/
│   ├── rss-fetcher.js         # RSS 수집 (4개 소스)
│   ├── dart-api.js            # DART 공시 수집
│   ├── bok-api.js             # 한국은행 기준금리 API
│   ├── fred-api.js            # FRED 미국 경제지표 API
│   └── yahoo-finance.js       # 추천 성과 평가용 가격 조회
├── filters/
│   ├── keyword-filter.js      # 1단계: 키워드 필터
│   ├── local-scorer.js        # 2단계: 로컬 스코어링 (FinBERT + 키워드)
│   ├── finbert.js             # FinBERT 금융 감성 분석 (영문)
│   └── relevance-matcher.js   # 3단계: 개인 관련성 매칭
├── analysis/
│   ├── digest.js              # AI 다이제스트 프롬프트
│   └── stock-analyzer.js      # AI 종목/섹터 분석 프롬프트
├── notify/
│   └── telegram.js            # Telegram 포맷팅 및 전송
├── config/
│   ├── keywords.js            # 키워드 + 가중치 + 감성사전 + 섹터분류
│   ├── interests.js           # 개인 관심사
│   ├── watchlist.js           # 프리마켓/시장 스냅샷 관심 종목
│   ├── portfolio.js           # 포트폴리오/리스크 제약
│   └── ai-budget.js           # AI 프롬프트 토큰 예산
└── utils/
    ├── ai-client.js           # AI 제공자 추상화 (멀티 프로바이더)
    ├── ai-budget.js           # AI 입력 데이터 선별/축약
    ├── article-archive.js     # 점수화 기사 일별 아카이브
    ├── article-buffer.js      # 기사 버퍼 관리
    ├── config.js              # 공통 설정
    ├── recommendation-log.js  # 추천 저장 및 성과 평가
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

## 데이터 보존

- `data/article-buffer.json`: 다음 다이제스트에서 처리할 score 4 기사
- `data/daily-articles/YYYY-MM-DD.json`: 수집 중 점수화된 당일 기사 누적 아카이브
- `data/daily-summary/YYYY-MM-DD.json`: 다이제스트/종목 리포트 요약
- `data/recommendations/recommendations.json`: 추천/성과 평가 로컬 미러. 기준 저장소는 Supabase `recommendations`, `recommendation_evaluations`
- `data/trades/trade-executions.json`: 실제 매수/매도 기록 로컬 미러. 추천과 실제 실행은 분리합니다.
- Supabase tables: `articles`, `daily_summaries`, `stock_reports`, `recommendations`, `recommendation_evaluations`, `trade_executions`, `market_snapshots`, `investor_flows`, `decision_contexts`
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
```

종목 추천은 단순 `매수/관찰` 문구가 아니라 기대 손익 구조를 포함해야 합니다. 장 마감 리포트는 가능한 경우 `손익비`, `손절폭`, `무효화 조건`, `제안 매수금액`, `계좌 비중`을 함께 표시합니다. 2,000만원 계좌 기준 기본 1회 신규 매수 상한은 100만원이고, 거래 1회 손실 허용액은 20만~40만원입니다.

`db:push`에는 `SUPABASE_PROJECT_URL`과 `SUPABASE_DB_PASSWORD`가 필요합니다. 네트워크가 Supabase direct DB의 IPv6 연결을 지원하지 않으면 Supabase 대시보드의 pooler 연결 문자열을 `SUPABASE_DB_URL`로 넣어 우회합니다. 런타임 저장과 `db:pull`에는 `SUPABASE_PROJECT_URL`과 `SUPABASE_PUBLISHABLE_KEY`를 사용합니다.

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
TELEGRAM_CHAT_ID=-100...

# 경제지표 (선택)
BOK_API_KEY=...
FRED_API_KEY=...
DART_API_KEY=...

# Supabase 히스토리 저장소 (선택)
SUPABASE_PROJECT_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_DB_PASSWORD=...
# SUPABASE_DB_URL=postgresql://postgres.your-project-ref:password@aws-0-region.pooler.supabase.com:6543/postgres
# SUPABASE_DNS_RESOLVER=https

# 로컬 포트폴리오 파일 (선택, 커밋 금지)
# PORTFOLIO_FILE=data/portfolio.json
```

### 실행

```bash
# 뉴스 수집 (5분마다 자동 실행, 버퍼에 저장)
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
| **한국어** | 키워드 감성 사전 | 보통 (단어 매칭) |

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
| `news-alert.yml` | 평일 07:00~23:00 KST, 5분 간격 | 뉴스 수집 + 버퍼 저장 |
| `digest-morning.yml` | 평일 08:20 KST | 개장 전 브리핑 |
| `digest-lunch.yml` | 평일 11:50 KST | 오전장 점검 |
| `digest-close.yml` | 평일 15:45 KST | 장 마감 브리핑 |
| `digest-evening.yml` | 평일 17:10 KST | 유럽장 체크 |
| `digest-night.yml` | 평일 22:40 KST | 미국장 오픈 브리핑 |
| `stock-report.yml` | 평일 16:00 KST | 장 마감 종목 분석 |
| `evaluate-recommendations.yml` | 평일 17:30 KST | 추천 성과 평가 |

GitHub 저장소의 **Settings > Secrets and variables > Actions**에 환경 변수를 등록하세요. DART 공시 수집을 쓰려면 `DART_API_KEY`도 Secret에 추가합니다.

Supabase 저장을 GitHub Actions에서도 활성화하려면 `SUPABASE_PROJECT_URL`, `SUPABASE_PUBLISHABLE_KEY`를 Secret에 추가합니다. `SUPABASE_DB_PASSWORD`는 로컬에서 `npm run db:push`를 실행할 때만 필요합니다.

## 커스터마이징

### 키워드 / 가중치 / 감성 사전 / 섹터

`src/config/keywords.js`에서 모든 필터링 규칙을 관리합니다:

```javascript
module.exports = {
  must_include: ['금리', '환율', ...],             // 1단계 키워드
  high_priority: ['속보', '폭락', '전쟁', ...],   // 즉시 긴급 알림 (score 5)
  weight: { 5: [...], 4: ['tariff', 'sanction', ...], ... }, // 중요도 가중치 (4점: 다이제스트, 5점: 즉시 알림)
  sentiment: { bullish: [...], bearish: [...] },   // 감성 사전
  sectors: { '반도체': [...], '에너지·원자재': [...] }, // 섹터 분류
};
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

### 실제 포트폴리오

실제 보유 종목과 현금 비중은 커밋하지 않는 로컬 파일 `data/portfolio.json`에 둡니다. 형식은 `docs/portfolio.example.json`을 복사해 맞추면 됩니다.

```bash
cp docs/portfolio.example.json data/portfolio.json
```

`cashAmount`와 `totalAssetValue`를 넣으면 현금 비중이 자동 계산됩니다. 종목별 `weight`를 넣으면 장 마감 리포트의 행동 가드레일에서 종목/섹터 쏠림을 점검합니다.

초기 현금 2,000만원, `maxNewBuyRatio=0.05` 기준이면 장 마감 리포트의 1회 신규 매수 상한은 100만원으로 표시됩니다.

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

## 라이선스

MIT
