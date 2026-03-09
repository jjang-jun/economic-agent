# Economic Agent

## 아키텍처
RSS/API 수집 → GitHub Actions(5분 간격) → Claude Haiku(중요도 판단) → Telegram Bot(알림)

## 데이터 소스 (무료)
- **한국은행 ECOS** (ecos.bok.or.kr/api): 기준금리, 경제지표
- **RSS**: 연합뉴스, 이데일리, 한경
- **FRED** (api.stlouisfed.org): 미국 경제지표
- Yahoo Finance (주가/환율), Finviz (히트맵)

## 3단계 필터링 파이프라인
1. **키워드 필터** (비용 0원): `src/config/keywords.js`의 must_include/high_priority 매칭. ~100건→~20건
2. **Claude 중요도** (Haiku): 1~5점 채점, 4점 이상 통과. 배치(20건) 처리. ~20건→~5건
3. **개인 관련성** (비용 0원): `src/config/interests.js` 카테고리 매칭. 5점은 무조건 통과. ~5건→~2건

## 디렉토리 구조
```
src/
├── check-news.js            # 메인 엔트리포인트
├── sources/                 # rss-fetcher.js, bok-api.js, fred-api.js
├── filters/                 # keyword-filter.js, claude-scorer.js, relevance-matcher.js
├── notify/telegram.js
└── config/                  # keywords.js, interests.js
data/seen-articles.json      # 중복 방지 캐시
.github/workflows/news-alert.yml  # cron: */5, 평일 KST 07~23시
```

## 환경변수
로컬: `.env` 파일 (`npm start` → `--env-file=.env`), CI: GitHub Secrets
- `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `BOK_API_KEY`, `FRED_API_KEY`

## 비용: ~$3~5/월
Claude Haiku만 유료 (~$0.002/호출 × ~50회/일). 나머지 전부 무료.

## 무료 한도 전략
- GitHub Actions: 공개 repo 권장 (무제한). 비공개 시 10분 간격 또는 Railway/Render 대체
- Claude API: 키워드 1차 필터 + 배치 처리 + seen-articles.json 캐싱

---

## 작업 규칙
- **모든 작업 완료 시** `memory/changelog.md`에 날짜/내용/변경 파일 기록
- **모든 작업 완료 시** `README.md`에 변경 내용 반영 후 remote push
- 구조 변경 시 `memory/architecture.md`, `memory/MEMORY.md`도 업데이트