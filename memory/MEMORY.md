# Economic Agent - 프로젝트 메모리

## 프로젝트 개요
- RSS/DART/API → 키워드 필터 → 로컬 스코어링(FinBERT + 키워드 가중치) → 일별 기사 아카이브/Supabase 저장 → 긴급 알림 또는 다이제스트 버퍼
- GitHub Actions로 5분 간격 수집, 하루 5회 AI 다이제스트, 장 마감 종목 리포트, 추천 성과 평가 실행
- Supabase/Postgres를 장기 히스토리 저장소로 쓰고, `npm run db:pull`로 로컬 JSON/SQLite 미러를 만든다.
- 상세 아키텍처: [architecture.md](./architecture.md)

## 작업 기록
- 상세 작업 로그: [changelog.md](./changelog.md)

## 주요 파일 경로
- 엔트리포인트: `src/check-news.js`
- 다이제스트: `src/digest.js`
- 종목 리포트: `src/stock-report.js`
- 추천 성과 평가: `src/evaluate-recommendations.js`
- 설정: `src/config/keywords.js`, `src/config/interests.js`
- 프리마켓 관심 종목: `src/config/watchlist.js`
- 필터/스코어링: `src/filters/keyword-filter.js` → `local-scorer.js`/`finbert.js` → `relevance-matcher.js`
- 데이터 소스: `src/sources/rss-fetcher.js`, `dart-api.js`, `bok-api.js`, `fred-api.js`, `yahoo-finance.js`
- 알림: `src/notify/telegram.js`
- AI 추상화: `src/utils/ai-client.js`
- 기사 아카이브: `src/utils/article-archive.js`, `data/daily-articles/YYYY-MM-DD.json`
- 추천 로그/성과 평가: `src/utils/recommendation-log.js`, `data/recommendations/recommendations.json` (KOSPI 벤치마크 대비 평가 포함)
- 프리마켓/시장 스냅샷: `src/utils/market-snapshot.js`
- 의사결정 엔진: `src/utils/decision-engine.js`, `src/config/portfolio.js`
- AI 토큰 예산: `src/config/ai-budget.js`, `src/utils/ai-budget.js`
- Supabase 저장/동기화: `src/utils/persistence.js`, `supabase/migrations/`, `scripts/push-supabase.js`, `scripts/pull-supabase.js`
- 워크플로우: `.github/workflows/news-alert.yml`, `digest-*.yml`, `stock-report.yml`

## 다이제스트 세션
- 08:20 KST `preopen`: 개장 전 브리핑
- 11:50 KST `midday`: 오전장 점검
- 15:45 KST `close`: 장 마감 브리핑
- 17:10 KST `europe`: 유럽장 체크
- 22:40 KST `usopen`: 미국장 오픈 브리핑

## 기술 스택
- Node.js 20.19.6 (nvm, --env-file 플래그, .nvmrc 설정됨)
- CommonJS, rss-parser, @huggingface/transformers
- Yahoo Finance chart endpoint로 추천 종목 가격 조회
- OpenDART 공시 API 선택 연동 (`DART_API_KEY`)
- AI 제공자 추상화: Anthropic/OpenAI/Groq/Ollama/Custom 지원
- Supabase CLI 2.90.0 사용 가능

## 사용자 선호
- 작업 내용을 매번 changelog.md에 기록할 것
- 개발 진행 상태와 운영 체크리스트는 `docs/PROGRESS.md`에도 기록할 것
- README/아키텍처/운영 방식 변경 시 관련 문서도 함께 업데이트할 것
- 종목 리포트는 현재 RSS 신규분이 아니라 당일 점수화 기사 아카이브를 우선 사용해야 함
- 추천은 반드시 로그에 저장하고 1일/5일/20일 성과 평가로 검증해야 함
- 다이제스트 시간/세션 변경 시 README, AGENTS.md, CLAUDE.md, memory 문서를 함께 업데이트할 것
- 장기 제품/투자 방향 변경 시 ROADMAP.md도 함께 업데이트할 것
- AI API 토큰은 매번 전체 히스토리를 넣지 말고 중요도 상위 기사/시장 스냅샷만 선별해서 사용한다.
