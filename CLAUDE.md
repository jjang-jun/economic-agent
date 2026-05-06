# Economic Agent

## 아키텍처
RSS/DART 수집 → 키워드 필터 → 로컬 스코어링(FinBERT + 키워드) → 일별 기사 아카이브 → 긴급 알림 또는 다이제스트 버퍼 → AI 다이제스트/종목 리포트 → 추천 성과 평가

## 데이터 소스
- **RSS**: 연합뉴스, 매일경제, 한국경제, Bloomberg
- **DART**: OpenDART 공시 (`DART_API_KEY`, 선택)
- **한국은행 ECOS**: 기준금리, 경제지표 (`BOK_API_KEY`, 선택)
- **FRED**: 미국 기준금리/CPI/실업률 (`FRED_API_KEY`, 선택)
- **Yahoo Finance**: 추천 성과 평가, KOSPI 벤치마크, 프리마켓/글로벌 스냅샷

## 파이프라인
1. **뉴스/공시 수집**: `src/check-news.js`가 RSS와 DART 공시를 5분 간격으로 수집
2. **키워드 필터**: `src/config/keywords.js`의 must_include/high_priority 매칭
3. **로컬 스코어링**: `src/filters/local-scorer.js`가 키워드 가중치, FinBERT, 섹터 태깅 적용
4. **일별 아카이브**: score 4 이상 기사를 `data/daily-articles/YYYY-MM-DD.json`에 저장
5. **라우팅**:
   - score 5: 개인 관련성 매칭 후 Telegram 즉시 알림
   - score 4: `data/article-buffer.json`에 저장해 예약 다이제스트에서 처리
6. **종목 분석**: 장 마감 리포트는 당일 기사 아카이브 전체를 분석
7. **추천 검증**: 추천 신호를 저장하고 1일/5일/20일 후 KOSPI 대비 초과수익률 평가

## 다이제스트 스케줄
| 시간 (KST) | 세션 | 목적 |
|:---:|------|------|
| 08:20 | `preopen` | KRX 호가 접수 전, 미국장 마감 + 국내 개장 체크 |
| 11:50 | `midday` | 오전장 흐름 + 오후장 체크 |
| 15:45 | `close` | KRX 정규장 마감 직후 |
| 17:10 | `europe` | 유럽장 초반 + 국내 시간외/미국 프리마켓 |
| 22:40 | `usopen` | 미국 주요 지표/정규장 오픈 + 다음날 국내 영향 |

스케줄 근거:
- KRX 정규장 09:00~15:30, 호가 접수 08:30부터
- 미국 정규장 09:30~16:00 ET
- 미국 주요 지표는 주로 08:30 ET 또는 10:00 ET 발표
- 유럽장은 한국시간 오후 늦게 시작하므로 17:10 브리핑에서 초반 흐름을 반영

## 주요 파일
```
src/
├── check-news.js
├── digest.js
├── stock-report.js
├── evaluate-recommendations.js
├── sources/
│   ├── rss-fetcher.js
│   ├── dart-api.js
│   ├── bok-api.js
│   ├── fred-api.js
│   └── yahoo-finance.js
├── filters/
│   ├── keyword-filter.js
│   ├── local-scorer.js
│   ├── finbert.js
│   └── relevance-matcher.js
├── analysis/
│   ├── digest.js
│   └── stock-analyzer.js
├── notify/telegram.js
├── config/
│   ├── keywords.js
│   ├── interests.js
│   └── watchlist.js
└── utils/
    ├── ai-client.js
    ├── article-archive.js
    ├── article-buffer.js
    ├── market-snapshot.js
    ├── recommendation-log.js
    ├── seen-articles.js
    ├── indicators.js
    └── daily-summary.js
```

## 환경변수
로컬: `.env` 파일, CI: GitHub Secrets
- AI: `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- 데이터: `BOK_API_KEY`, `FRED_API_KEY`, `DART_API_KEY`

## 명령어
- `npm start`: 뉴스/공시 수집
- `npm run digest -- preopen`: 특정 세션 다이제스트
- `npm run report`: 장 마감 종목 분석
- `npm run evaluate`: 추천 성과 평가
- `npm test`: 테스트

## 작업 규칙
- 작업 완료 시 `memory/changelog.md`에 날짜/내용/변경 파일 기록
- README에 사용자-facing 변경사항 반영
- 구조 변경 시 `memory/architecture.md`, `memory/MEMORY.md`, `AGENTS.md`도 업데이트
- 원격 push는 사용자 요청 또는 운영상 필요한 경우에만 수행
