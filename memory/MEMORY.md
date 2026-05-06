# Economic Agent - 프로젝트 메모리

## 프로젝트 개요
- RSS/API → 키워드 필터 → 로컬 스코어링(FinBERT + 키워드 가중치) → 일별 기사 아카이브 → 긴급 알림 또는 다이제스트 버퍼
- GitHub Actions로 5분 간격 수집, 하루 5회 AI 다이제스트, 장 마감 종목 리포트, 추천 성과 평가 실행
- 상세 아키텍처: [architecture.md](./architecture.md)

## 작업 기록
- 상세 작업 로그: [changelog.md](./changelog.md)

## 주요 파일 경로
- 엔트리포인트: `src/check-news.js`
- 다이제스트: `src/digest.js`
- 종목 리포트: `src/stock-report.js`
- 추천 성과 평가: `src/evaluate-recommendations.js`
- 설정: `src/config/keywords.js`, `src/config/interests.js`
- 필터/스코어링: `src/filters/keyword-filter.js` → `local-scorer.js`/`finbert.js` → `relevance-matcher.js`
- 데이터 소스: `src/sources/rss-fetcher.js`, `bok-api.js`, `fred-api.js`
- 알림: `src/notify/telegram.js`
- AI 추상화: `src/utils/ai-client.js`
- 기사 아카이브: `src/utils/article-archive.js`, `data/daily-articles/YYYY-MM-DD.json`
- 추천 로그/성과 평가: `src/utils/recommendation-log.js`, `data/recommendations/recommendations.json`
- 워크플로우: `.github/workflows/news-alert.yml`, `digest-*.yml`, `stock-report.yml`

## 기술 스택
- Node.js 20.19.6 (nvm, --env-file 플래그, .nvmrc 설정됨)
- CommonJS, rss-parser, @huggingface/transformers
- Yahoo Finance chart endpoint로 추천 종목 가격 조회
- AI 제공자 추상화: Anthropic/OpenAI/Groq/Ollama/Custom 지원

## 사용자 선호
- 작업 내용을 매번 changelog.md에 기록할 것
- README/아키텍처/운영 방식 변경 시 관련 문서도 함께 업데이트할 것
- 종목 리포트는 현재 RSS 신규분이 아니라 당일 점수화 기사 아카이브를 우선 사용해야 함
- 추천은 반드시 로그에 저장하고 1일/5일/20일 성과 평가로 검증해야 함
