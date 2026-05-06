# 작업 기록 (Changelog)

## 2026-05-06: Supabase 히스토리 저장과 AI 토큰 예산 추가
- Supabase/Postgres 스키마와 CLI 기반 `db:push` 스크립트 추가
- direct DB 연결이 IPv6에서 막힐 때를 대비해 `SUPABASE_DB_URL` pooler 연결 문자열을 지원
- 로컬 검증에서 direct DB 연결은 IPv6/DNS 문제로 실패했고, REST pull은 테이블 미생성 상태를 확인
- 기사, 일일 요약, 종목 리포트, 추천, 추천 성과, 시장 스냅샷, 의사결정 컨텍스트를 Supabase에 병행 저장하도록 연결
- `db:pull`로 Supabase 데이터를 `data/supabase/*.json`과 `data/economic-agent.db`에 내려받는 로컬 미러 추가
- AI 프롬프트 입력을 중요도 상위 기사와 핵심 시장 스냅샷으로 제한해 API 토큰 사용량을 줄이는 예산 모듈 추가
- Telegram 문구를 의사결정 중심으로 간결하게 재정렬
- 개발 진행 컨텍스트를 사람이 읽기 쉬운 `docs/PROGRESS.md`로 분리
- GitHub Actions에 Supabase 런타임 Secret 연결
- 변경 파일:
  - `supabase/schema.sql`
  - `supabase/migrations/20260506120000_init_history.sql`
  - `scripts/push-supabase.js`
  - `scripts/pull-supabase.js`
  - `src/utils/persistence.js`
  - `src/config/ai-budget.js`
  - `src/utils/ai-budget.js`
  - `src/check-news.js`
  - `src/digest.js`
  - `src/stock-report.js`
  - `src/evaluate-recommendations.js`
  - `src/utils/daily-summary.js`
  - `src/utils/recommendation-log.js`
  - `src/analysis/digest.js`
  - `src/analysis/stock-analyzer.js`
  - `src/notify/telegram.js`
  - `docs/PROGRESS.md`
  - `.github/workflows/*.yml`
  - `.env.example`
  - `README.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `ROADMAP.md`
  - `memory/MEMORY.md`
  - `memory/architecture.md`
  - `memory/changelog.md`

## 2026-05-06: 투자 의사결정 엔진과 로드맵 추가
- 장기 방향을 `ROADMAP.md`에 정리
- 포트폴리오/리스크 제약 설정 파일 추가
- 시장 레짐(`RISK_ON`, `NEUTRAL`, `RISK_OFF`)과 행동 가드레일을 만드는 의사결정 엔진 추가
- 장 마감 종목 리포트에 시장 레짐, 리스크 플래그, 오늘 행동 가드레일 표시
- AI 종목 분석 프롬프트에 리스크 플래그와 조건부 추천 원칙 추가
- 변경 파일:
  - `ROADMAP.md`
  - `src/config/portfolio.js`
  - `src/utils/decision-engine.js`
  - `src/stock-report.js`
  - `src/analysis/stock-analyzer.js`
  - `src/notify/telegram.js`
  - `README.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `memory/MEMORY.md`
  - `memory/architecture.md`
  - `memory/changelog.md`

## 2026-05-06: 다이제스트 시간/내용 최적화
- KRX 정규장(09:00~15:30), 미국 정규장(09:30~16:00 ET), 주요 미국 지표 발표(대개 08:30/10:00 ET), 유럽장 초반을 기준으로 하루 5회 브리핑 시간을 재조정
- 브리핑 세션 변경:
  - 07:30 아침 → 08:20 개장 전 (`preopen`)
  - 12:00 점심 → 11:50 오전장 점검 (`midday`)
  - 15:40 장 마감 → 15:45 장 마감 (`close`)
  - 19:00 저녁 → 17:10 유럽장 체크 (`europe`)
  - 23:30 마감 → 22:40 미국장 오픈 (`usopen`)
- 세션별 AI 프롬프트 초점을 분리해 개장 전/오전장/마감/유럽장/미국장 브리핑 내용이 서로 다르게 나오도록 개선
- 개장 전/미국장 오픈 브리핑에 관심 지수·종목·원자재 가격 스냅샷을 포함하도록 추가
- 다이제스트 입력 기사에 score/source를 포함하고, 프롬프트에 숫자/지수 임의 생성 금지 규칙 추가
- 변경 파일:
  - `src/config/watchlist.js`
  - `src/utils/market-snapshot.js`
  - `.github/workflows/digest-morning.yml`
  - `.github/workflows/digest-lunch.yml`
  - `.github/workflows/digest-close.yml`
  - `.github/workflows/digest-evening.yml`
  - `.github/workflows/digest-night.yml`
  - `src/analysis/digest.js`
  - `src/digest.js`
  - `src/notify/telegram.js`
  - `README.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `memory/MEMORY.md`
  - `memory/architecture.md`
  - `memory/changelog.md`

## 2026-05-06: DART 공시와 벤치마크 성과 평가 추가
- OpenDART 공시 수집 소스 추가 (`DART_API_KEY` 선택)
- 뉴스 수집과 장 마감 리포트 보강 수집에 DART 공시를 RSS와 함께 통합
- 주요 공시 키워드(잠정실적, 공급계약, 자기주식, 유상증자, 전환사채 등)를 필터/섹터에 추가
- 추천 저장/평가 시 KOSPI(`^KS11`) 벤치마크 가격을 함께 기록하고 `alphaPct` 계산 추가
- GitHub Actions에 `DART_API_KEY` Secret 연결
- 변경 파일:
  - `src/sources/dart-api.js`
  - `src/check-news.js`
  - `src/stock-report.js`
  - `src/config/keywords.js`
  - `src/sources/yahoo-finance.js`
  - `src/utils/recommendation-log.js`
  - `src/notify/telegram.js`
  - `.github/workflows/news-alert.yml`
  - `.github/workflows/stock-report.yml`
  - `.env.example`
  - `README.md`
  - `AGENTS.md`
  - `memory/MEMORY.md`
  - `memory/architecture.md`
  - `memory/changelog.md`

## 2026-05-06: 추천 성과 평가 루프 추가
- 종목 리포트의 추천 신호를 `data/recommendations/recommendations.json`에 저장하도록 추가
- Yahoo Finance chart 엔드포인트 기반 가격 조회 소스 추가
- 추천 저장 시 진입 가격을 기록하고, 1일/5일/20일 후 수익률을 평가하는 스크립트 추가
- 평가 결과를 Telegram으로 전송하는 성과 리포트 포맷 추가
- 평일 KST 17:30에 추천 성과를 평가하는 GitHub Actions 워크플로우 추가
- `npm run evaluate` 스크립트 추가
- 변경 파일:
  - `src/sources/yahoo-finance.js`
  - `src/utils/recommendation-log.js`
  - `src/evaluate-recommendations.js`
  - `src/stock-report.js`
  - `src/notify/telegram.js`
  - `.github/workflows/evaluate-recommendations.yml`
  - `package.json`
  - `README.md`
  - `AGENTS.md`
  - `memory/MEMORY.md`
  - `memory/architecture.md`
  - `memory/changelog.md`

## 2026-05-06: 투자 판단용 데이터 흐름 보강
- score 4 이상 점수화 기사를 `data/daily-articles/YYYY-MM-DD.json`에 누적 저장하는 `article-archive` 유틸 추가
- 뉴스 수집 시 점수화 기사를 일별 아카이브에 저장하도록 변경
- 장 마감 종목 분석이 현재 신규 RSS만 보지 않고 당일 누적 기사 아카이브를 우선 분석하도록 변경
- 다이제스트 생성/Telegram 전송 실패 시 `article-buffer.json`을 비우지 않도록 변경
- 종목 분석 프롬프트에 확신도/리스크를 추가하고, Telegram 종목 리포트에 표시
- 변경 파일:
  - `src/utils/article-archive.js`
  - `src/utils/article-buffer.js`
  - `src/check-news.js`
  - `src/digest.js`
  - `src/stock-report.js`
  - `src/analysis/stock-analyzer.js`
  - `src/notify/telegram.js`
  - `README.md`
  - `AGENTS.md`
  - `memory/MEMORY.md`
  - `memory/architecture.md`
  - `memory/changelog.md`

## 2026-05-06: Codex 초기화 및 프로젝트 메모리 정리
- Codex가 프로젝트 구조와 운영 규칙을 자동으로 읽을 수 있도록 `AGENTS.md` 추가
- README에 Codex 작업 지침 위치 안내 추가
- 현재 구현 기준으로 `memory/MEMORY.md`, `memory/architecture.md`의 Claude 중심/구버전 설명 갱신
- 변경 파일:
  - `AGENTS.md`
  - `README.md`
  - `memory/MEMORY.md`
  - `memory/architecture.md`
  - `memory/changelog.md`

## 2026-03-07: 프로젝트 초기 구축
- 전체 프로젝트 구조 생성 (CLAUDE.md 기반)
- 구현 파일:
  - `src/check-news.js` - 메인 파이프라인
  - `src/sources/rss-fetcher.js` - 연합뉴스/이데일리/한경 RSS 수집
  - `src/sources/bok-api.js` - 한국은행 기준금리 API
  - `src/sources/fred-api.js` - FRED 미국 경제지표 API
  - `src/filters/keyword-filter.js` - 1단계 키워드 필터
  - `src/filters/claude-scorer.js` - 2단계 Claude Haiku 중요도 판단
  - `src/filters/relevance-matcher.js` - 3단계 개인 관련성 매칭
  - `src/notify/telegram.js` - Telegram 알림 발송
  - `src/config/keywords.js` - 키워드 설정
  - `src/config/interests.js` - 개인 관심사 설정
- GitHub Actions 워크플로우 설정 (`.github/workflows/news-alert.yml`)
- `.env.example` 및 `.env` 환경변수 파일 설정
- `package.json` - Node.js 20+ `--env-file` 플래그 적용
- `.gitignore` 추가 (node_modules, .env)

## 2026-03-08: 환경 수정 및 첫 실행 테스트
- Node.js v18 → v20.19.6 전환 (nvm use 20), `.nvmrc` 추가
- `package.json`: `dotenv/config` → `--env-file=.env`로 복원, dotenv 의존성 제거
- RSS URL 수정: 연합뉴스 (`/RSS/` → `/rss/`), 이데일리 (`rss.edaily.co.kr` → `www.edaily.co.kr/rss/`)
- 첫 실행 성공: 연합뉴스+한경 170건 수집, 16건 Telegram 전송 확인
- 미해결: Claude API 크레딧 부족 (console.anthropic.com에서 충전 필요), 이데일리 RSS 406 오류

## 2026-03-08: 피드 확장 및 키워드 추가
- `src/sources/rss-fetcher.js`: 이데일리 → 매일경제(`mk.co.kr/rss/30100041/`)로 교체, Bloomberg Markets RSS 추가, Trump Truth Social RSS 추가 (동작 안 함)
- `src/config/keywords.js`: 영문 키워드 추가 (Trump, tariff, Fed, rate cut/hike, inflation, treasury, bond, recession, executive order, sanction, ban)
- 실행 테스트: 250건 수집, 93건 키워드 통과, 28건 Telegram 전송
- 미해결: Claude API 크레딧 여전히 부족, Trump Truth Social RSS 400 에러

## 2026-03-08: 코드 리뷰 및 전체 버그 수정
- Trump Truth Social RSS 제거 (동작 불가)
- `news-alert.yml`: cron 시간대 수정 (월요일 KST 07시 누락 해결), `actions/cache`로 seen-articles.json 캐싱 추가
- `check-news.js`: data/ 디렉토리 자동 생성 (mkdirSync), bok-api/fred-api 연동 추가 (경제지표 로깅)
- `telegram.js`: HTML 이스케이핑 추가 (escapeHtml), Telegram 429 rate limit 재시도 로직 추가, 전송 간격 100ms→1s
- `keyword-filter.js`, `relevance-matcher.js`: 대소문자 무시 매칭 (toLowerCase)
- `claude-scorer.js`: JSON 파싱 개선 (첫 [ ~ 마지막 ] 추출), content 옵셔널 체이닝 추가
- `rss-fetcher.js`: 순차 fetch → Promise.allSettled 병렬 처리
- `bok-api.js`, `fred-api.js`: HTTP 응답 상태 확인 추가, FRED 병렬 호출
- 실행 테스트: 경제지표 정상 출력 (한국 기준금리 2.5%, 미국 3.64%), Telegram 21건 전송 (7건 rate limit)

## 2026-03-08: 호재/악재 기능 추가 + Claude API 정상화
- `claude-scorer.js`: 프롬프트에 sentiment(bullish/bearish/neutral) 판단 추가
- `telegram.js`: 알림 포맷에 호재/악재 표시 추가 (📈 호재 / 📉 악재 / ➖ 중립)
- Claude API 크레딧 $5 충전 후 정상 작동 확인
- 전체 파이프라인 성공: 250건 수집 → 97건 키워드 → 52건 Claude 4점+ → 23건 관련성 → Telegram 23건 전송

## 2026-03-08: 메시지 템플릿 개선 + 마켓 브리핑 + 영문 번역
- `claude-scorer.js`: 프롬프트에 title_ko(영문→한국어 번역) 추가, max_tokens 1024→4096
- `telegram.js`: 전면 리디자인 — 색상 원(🟢/🔴/⚪)+라벨 구분, 링크 프리뷰 비활성화, 영문 번역 표시
- `telegram.js`: 마켓 브리핑 기능 추가 (시장 무드 게이지, 주요 지표, 핵심 뉴스 TOP 5)
- `check-news.js`: 개별 알림 전 마켓 브리핑 먼저 발송하도록 변경

## 2026-03-08: UI 개선 + 장 마감 종목 분석 기능 추가
- `telegram.js`: 호재/악재 색상 한국 주식 컨벤션 적용 (호재=🔴, 악재=🔵, 중립=⚪)
- `telegram.js`: 시간 포맷 24시간제로 변경 (hour12: false)
- 장 마감 종목 분석 리포트 기능 신규 구현:
  - `src/analysis/stock-analyzer.js` - Claude API로 뉴스 기반 섹터/종목 분석
  - `src/stock-report.js` - 마감 후 리포트 엔트리포인트
  - `telegram.js`: formatStockReport/sendStockReport 추가 (섹터 동향, 주목 종목, 내일 체크포인트)
  - `.github/workflows/stock-report.yml` - KST 16시(UTC 07시) 평일 스케줄
  - `package.json`: `npm run report` 스크립트 추가
- 로컬 테스트 성공: 250건 수집 → 종목 분석 → Telegram 전송 확인

## 2026-03-08: 리팩토링 + 일일 요약 + README
- 코드 리팩토링:
  - `src/utils/config.js` - 공통 설정 (MODEL, BATCH_SIZE, MIN_SCORE 등) 중앙 관리
  - `src/utils/seen-articles.js` - 중복 기사 관리 유틸리티 (check-news/stock-report 중복 제거)
  - `src/utils/indicators.js` - 경제지표 수집 유틸리티 (중복 제거)
  - `claude-scorer.js`, `stock-analyzer.js`: 하드코딩 모델명 → config.MODEL 참조
  - `check-news.js`, `stock-report.js`: 중복 코드 제거, 유틸리티 사용
- 일일 요약 기능 추가:
  - `src/utils/daily-summary.js` - 매일 시장 데이터를 `data/daily-summary/{날짜}.json` 에 저장
  - 같은 날 데이터는 병합 (topNews 중복 제거, stockReport 최신 사용)
- 종목 리포트 포맷 개선:
  - `telegram.js` formatStockReport: 섹션별 줄바꿈 적용 (sections.join 방식)
  - formatBriefing도 동일하게 sections 방식으로 리팩토링
- `.gitignore`: `data/` 추가
- GitHub Actions: 캐시 경로 `data/seen-articles.json` → `data/` 전체로 확장
- `README.md` 작성 (아키텍처, 설치, 실행, 커스터마이징, 비용)

## 2026-03-08: AI 멀티 프로바이더 + 로컬 스코어러 + 섹터 분류
- AI 제공자 추상화:
  - `src/utils/ai-client.js` - fetch 기반 멀티 프로바이더 (Anthropic, OpenAI, Groq, Ollama, Custom)
  - `@anthropic-ai/sdk` 의존성 제거 → 제로 AI SDK 의존성
  - 환경변수: AI_PROVIDER, AI_MODEL, AI_API_KEY, AI_BASE_URL
- 로컬 스코어러 (AI 비용 0원):
  - `src/filters/local-scorer.js` - 키워드 가중치 + 감성 사전으로 스코어링
  - `AI_SCORING=false` (기본) → 로컬, `AI_SCORING=true` → AI
  - `claude-scorer.js` → `ai-scorer.js` 리네임
- 섹터 분류 기능:
  - `keywords.js`: 7개 섹터 키워드 추가 (반도체, 에너지·원자재, 금융·통화, 부동산, 거시경제, 테크, 무역·지정학)
  - `keywords.js`: 감성 사전 확장 (도메인 특화 — 유가/원유/공급차질 등)
  - `keywords.js`: 에너지 키워드 추가 (유가, 원유, WTI, OPEC, 배럴, 석유)
  - `local-scorer.js`: 기사별 `sectors` 배열 자동 태깅
  - `telegram.js`: 개별 알림에 #섹터 태그 표시
  - `telegram.js`: 브리핑에 섹터별 뉴스 분포 섹션 추가
  - `telegram.js`: 핵심 뉴스에 섹터명 이탤릭 표시
- 프롬프트 영문화: ai-scorer.js, stock-analyzer.js 프롬프트를 영문으로 변경 (다국어 모델 호환)
- stock-analyzer.js: interests.js에서 관심사 동적 로드 (하드코딩 제거)
- `package.json`: v2.0.0, `@anthropic-ai/sdk` 제거
- `.env.example`: 멀티 프로바이더 설정 가이드 추가
- `README.md`: AI 제공자 비교표, 스코어링 모드, 비용 추정표 업데이트
- 테스트: 로컬 스코어러로 250건→114건→34건→29건 알림 (AI 비용 $0)

## 2026-03-08: FinBERT 금융 감성 분석 통합
- `src/filters/finbert.js` - FinBERT (Xenova/finbert) 로컬 ML 모델 통합
  - 영문 기사 감성 분석: positive→bullish, negative→bearish, neutral
  - INT8 양자화 모델 사용 (~110MB, CPU 추론, 비용 $0)
  - 싱글톤 패턴으로 모델 1회 로딩 후 재사용
  - `isEnglish()` 함수로 영문/한국어 자동 판별
- `local-scorer.js`: 하이브리드 감성 분석 적용
  - 영문 기사 → FinBERT ML 모델 (문맥 이해, 높은 정확도)
  - 한국어 기사 → 키워드 사전 (기존 방식 유지)
  - FinBERT 실패 시 키워드 사전으로 자동 폴백
- `@huggingface/transformers` 의존성 추가 (onnxruntime-node 포함)
- GitHub Actions: `.cache/` 디렉토리 캐싱 추가 (FinBERT 모델 재다운로드 방지)
- `.gitignore`: `.cache/` 추가
- 테스트: 영문 26건 FinBERT 분석 성공, 전체 29건 알림 (AI API 비용 $0)

## 2026-03-08: 다이제스트 모드 + 감성 강도 세분화
- 아키텍처 변경: 개별 알림 → 하루 5회 AI 다이제스트
  - `check-news.js`: 수집+스코어링만 수행, 기사를 버퍼에 저장 (알림 X)
  - `src/digest.js`: 버퍼 기사를 AI로 요약 + Telegram 발송
  - `src/utils/article-buffer.js`: 기사 버퍼 관리 (addToBuffer, flushBuffer)
  - `src/analysis/digest.js`: AI 다이제스트 프롬프트 (headline, sections, key_numbers, watch_list)
- 다이제스트 스케줄 (시장 의미 있는 시간대):
  - 🌅 07:30 아침 — 미국장 마감 + 아시아 프리마켓
  - ☀️ 12:00 점심 — 오전장 정리
  - 🔔 15:40 장 마감 — 코스피/코스닥 마감 직후
  - 🌆 19:00 저녁 — 유럽장 오픈 + 오후 뉴스
  - 🌙 23:30 마감 — 미국장 오픈 + 하루 마무리
- `telegram.js`: formatDigest/sendDigest 추가, SESSION_EMOJI 매핑
- 감성 강도 세분화 (getSentimentDisplay):
  - confidence >= 85%: 🔴 강한 호재 / 🔵 강한 악재
  - confidence 60~85%: 🔴 호재 / 🔵 악재
  - confidence < 60%: 🟠 약한 호재 / 🟣 약한 악재
  - 한국어 기사: 키워드 매칭 수로 의사 confidence 생성
- GitHub Actions: 워크플로우 3개 분리 (collector, digest, stock-report)
- `package.json`: `npm run digest` 추가
- 테스트: 30건 버퍼 → AI 다이제스트 생성 → Telegram 전송 (AI 1회 호출)
