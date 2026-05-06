# Economic Agent

경제 뉴스를 자동으로 수집하고 AI로 요약하여 Telegram 다이제스트를 보내는 개인용 경제 뉴스 에이전트입니다.

## 주요 기능

- **실시간 뉴스 수집** — 연합뉴스, 매일경제, 한국경제, Bloomberg RSS 피드 (5분 간격)
- **3단계 필터링** — 키워드 → 중요도 스코어링 → 즉시 알림(5점)은 관련성 매칭, 나머지는 다이제스트 버퍼
- **FinBERT 감성 분석** — 영문 기사는 금융 특화 ML 모델로 호재/악재 판단 (로컬, 무료)
- **감성 강도 표시** — 강한 호재/호재/약한 호재/중립/약한 악재/악재/강한 악재 7단계
- **섹터 자동 분류** — 반도체, 에너지·원자재, 금융·통화, 부동산, 거시경제, 테크, 무역·지정학, 공시·기업이벤트
- **DART 공시 수집** — 주요 공시를 뉴스와 함께 스코어링하여 기업 이벤트 반영
- **하루 5회 AI 다이제스트** — 시장 이벤트 시간대에 맞춘 뉴스 요약 브리핑
- **장 마감 종목 분석** — AI 기반 섹터/종목 인사이트 리포트
- **추천 성과 추적** — 종목 신호를 저장하고 1일/5일/20일 후 수익률 평가
- **일일 요약 아카이빙** — 매일 시장 데이터를 JSON으로 저장

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
```

## 다이제스트 스케줄

| 시간 (KST) | 세션 | 의미 |
|:---:|------|------|
| 🌅 07:30 | 아침 브리핑 | 미국장 마감 결과 + 아시아 프리마켓 |
| ☀️ 12:00 | 점심 브리핑 | 오전장 정리 |
| 🔔 15:40 | 장 마감 브리핑 | 코스피/코스닥 마감 직후 |
| 🌆 19:00 | 저녁 브리핑 | 유럽장 오픈 + 오후 뉴스 |
| 🌙 23:30 | 마감 브리핑 | 미국장 오픈 + 하루 마무리 |

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
│   └── interests.js           # 개인 관심사
└── utils/
    ├── ai-client.js           # AI 제공자 추상화 (멀티 프로바이더)
    ├── article-archive.js     # 점수화 기사 일별 아카이브
    ├── article-buffer.js      # 기사 버퍼 관리
    ├── config.js              # 공통 설정
    ├── recommendation-log.js  # 추천 저장 및 성과 평가
    ├── seen-articles.js       # 중복 기사 관리
    ├── indicators.js          # 경제지표 수집
    └── daily-summary.js       # 일일 요약 저장
```

## Codex 작업 지침

Codex에서 작업할 때는 저장소 루트의 `AGENTS.md`를 기준으로 프로젝트 구조, 실행 명령, 환경 변수, 변경 기록 규칙을 따릅니다.

## 데이터 보존

- `data/article-buffer.json`: 다음 다이제스트에서 처리할 score 4 기사
- `data/daily-articles/YYYY-MM-DD.json`: 수집 중 점수화된 당일 기사 누적 아카이브
- `data/daily-summary/YYYY-MM-DD.json`: 다이제스트/종목 리포트 요약
- `data/recommendations/recommendations.json`: 종목 리포트 추천과 1일/5일/20일 성과 평가

다이제스트는 AI 생성과 Telegram 전송이 모두 성공한 뒤에만 버퍼를 비웁니다. 장 마감 종목 분석은 `daily-articles` 아카이브를 우선 사용하므로, 5분 수집기가 이미 seen 처리한 기사와 DART 공시도 하루 단위 분석에 포함됩니다.

## 설치 및 실행

### 요구 사항

- Node.js 20+
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
```

### 실행

```bash
# 뉴스 수집 (5분마다 자동 실행, 버퍼에 저장)
npm start

# AI 다이제스트 발송 (시간대 자동 감지)
npm run digest

# 특정 세션 지정 (morning/lunch/close/evening/night)
npm run digest -- morning

# 장 마감 종목 분석
npm run report

# 추천 성과 평가
npm run evaluate
```

## AI 제공자 지원

| 제공자 | 설정값 | 모델 예시 | 비용 |
|--------|--------|-----------|------|
| **Groq** | `groq` | llama-3.3-70b-versatile | 무료 티어 |
| **Ollama** | `ollama` | llama3 | 완전 무료 (로컬) |
| **Anthropic** | `anthropic` | claude-haiku-4-5-20251001 | ~$0.18/일 |
| **OpenAI** | `openai` | gpt-4o-mini | ~$0.12/일 |
| **Custom** | `custom` | - | AI_BASE_URL 설정 |

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
| `digest-morning.yml` | 평일 07:30 KST | 아침 브리핑 |
| `digest-lunch.yml` | 평일 12:00 KST | 점심 브리핑 |
| `digest-close.yml` | 평일 15:40 KST | 장 마감 브리핑 |
| `digest-evening.yml` | 평일 19:00 KST | 저녁 브리핑 |
| `digest-night.yml` | 평일 23:30 KST | 마감 브리핑 |
| `stock-report.yml` | 평일 16:00 KST | 장 마감 종목 분석 |
| `evaluate-recommendations.yml` | 평일 17:30 KST | 추천 성과 평가 |

GitHub 저장소의 **Settings > Secrets and variables > Actions**에 환경 변수를 등록하세요. DART 공시 수집을 쓰려면 `DART_API_KEY`도 Secret에 추가합니다.

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

## 월간 비용 (추정)

| 구성 | 비용 |
|------|------|
| 수집 + 스코어링 (FinBERT + 키워드) | **무료** |
| 다이제스트 + 종목분석 (Groq) | **$0/월** |
| 다이제스트 + 종목분석 (Claude Haiku) | **~$5.4/월** |
| GitHub Actions (Public) | 무료 |
| Telegram / BOK / FRED / DART API | 무료 |

## 라이선스

MIT
