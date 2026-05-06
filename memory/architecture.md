# 아키텍처

## 파이프라인 흐름
```
RSS/DART 수집 → 중복 제거(seen-articles.json) → 키워드 필터 → 로컬 스코어링 → 일별 기사 아카이브/Supabase 저장 → 긴급 알림 또는 다이제스트 버퍼
```

## 뉴스 수집 파이프라인
1. **수집**: RSS 뉴스와 DART 공시를 같은 기사 객체로 정규화
2. **키워드 필터** (비용 0원): must_include / high_priority 키워드 매칭
3. **로컬 스코어링** (비용 0원): 키워드 가중치로 1~5점 산정, 영문 기사는 FinBERT 감성 분석, 한국어 기사는 감성 사전 사용
4. **일별 기사 아카이브**: score 4 이상 기사를 `data/daily-articles/YYYY-MM-DD.json`에 누적 저장
5. **영구 저장**: Supabase가 설정되어 있으면 기사, 요약, 리포트, 추천, 성과, 시장 스냅샷을 Postgres에 병행 저장
6. **라우팅**:
   - score 5: 개인 관련성 매칭 후 Telegram 즉시 알림
   - score 4: `data/article-buffer.json`에 저장 후 예약 다이제스트에서 처리

## 다이제스트 안정성
- 다이제스트는 `data/article-buffer.json`을 먼저 읽고, AI 생성과 Telegram 전송이 모두 성공한 뒤에만 버퍼를 비운다.
- AI 호출 실패 또는 Telegram 전송 실패 시 버퍼를 보존해 다음 실행에서 재시도한다.
- `preopen`, `usopen` 중심으로 `src/config/watchlist.js`의 관심 지수/종목과 글로벌 자산 가격을 Yahoo Finance에서 조회해 프리마켓 스냅샷으로 제공한다.
- AI 프롬프트에는 전체 히스토리를 넣지 않고 `src/config/ai-budget.js`의 한도에 따라 중요도 상위 기사와 핵심 스냅샷만 넣는다.

## 종목 분석 데이터
- 장 마감 종목 분석은 5분 수집기가 누적한 `data/daily-articles/YYYY-MM-DD.json`을 우선 사용한다.
- 실행 시점의 RSS도 다시 점수화해 아카이브 누락분을 보강한 뒤, 당일 누적 중요 기사 전체를 AI 분석에 전달한다.
- 종목 리포트의 `stocks` 항목은 `data/recommendations/recommendations.json`에 저장한다.
- 종목 리포트, 시장 레짐, 추천 항목은 Supabase에도 저장해 장기 성과 분석의 기준 데이터로 사용한다.

## 추천 성과 평가
- 추천 저장 시 Yahoo Finance chart 엔드포인트로 진입 가격과 KOSPI(`^KS11`) 벤치마크 가격을 조회한다.
- 평가 작업은 1일/5일/20일이 지난 추천 중 아직 평가되지 않은 항목을 찾아 현재 가격과 진입 가격을 비교한다.
- bullish는 가격 상승률을 그대로, bearish는 하락 방향을 맞춘 경우 양수로 계산한 `signalReturnPct`를 기록하고, 벤치마크 대비 `alphaPct`도 저장한다.
- 신규 평가 결과가 있으면 Telegram으로 성과 리포트를 보낸다.

## 저장소와 로컬 미러
- Supabase/Postgres 테이블: `articles`, `daily_summaries`, `stock_reports`, `recommendations`, `recommendation_evaluations`, `market_snapshots`, `decision_contexts`
- `npm run db:push`: `supabase/migrations/` 스키마를 Supabase CLI로 적용
- `npm run db:pull`: Supabase REST 데이터를 `data/supabase/*.json`과 `data/economic-agent.db`로 내려받아 로컬 파일시스템에서 직접 질의
- GitHub Actions의 `data/` 캐시는 실행 간 보조 상태이며 영구 저장소는 아니다.

## 의사결정 엔진
- `src/utils/decision-engine.js`가 기사 감성, VIX, 달러지수, 금리 등으로 시장 레짐을 `RISK_ON`, `NEUTRAL`, `RISK_OFF`로 분류한다.
- `src/config/portfolio.js`의 현금 비중, 최대 신규 매수 비중, 손절/익절 기준을 행동 가드레일에 반영한다.
- 종목 리포트는 AI 추천과 별도로 시장 레짐, 리스크 플래그, 오늘 행동 가드레일을 함께 전송한다.

## 예약 작업
- `news-alert.yml`: 평일 KST 07:00~23:00, 5분 간격 뉴스 수집
- `digest-morning.yml`: KST 08:20 개장 전 브리핑
- `digest-lunch.yml`: KST 11:50 오전장 점검
- `digest-close.yml`: KST 15:45 장 마감 브리핑
- `digest-evening.yml`: KST 17:10 유럽장 체크
- `digest-night.yml`: KST 22:40 미국장 오픈 브리핑
- `stock-report.yml`: KST 16:00 장 마감 종목 분석
- `evaluate-recommendations.yml`: KST 17:30 추천 성과 평가

## AI 사용 지점
- 뉴스 수집 스코어링은 기본적으로 AI API를 쓰지 않는다.
- 다이제스트와 종목 리포트만 `src/utils/ai-client.js`를 통해 AI 제공자를 호출한다.
- `src/utils/ai-budget.js`가 기사 수, 제목 길이, 사유 길이, 시장 스냅샷 수를 제한해 API 토큰 비용을 억제한다.
- 지원 제공자: Anthropic, OpenAI, Groq, Ollama, Custom(OpenAI 호환)

## 비용 구조
- GitHub Actions: 공개 repo 무료
- 로컬 스코어링/FinBERT: 무료
- AI 다이제스트/리포트: 제공자별 비용 발생. Groq/Ollama 사용 시 무료 운영 가능
- Telegram Bot / 한은 ECOS / FRED / DART: 무료
- Supabase: 무료 티어로 시작 가능

## 환경변수
- AI_PROVIDER, AI_MODEL, AI_API_KEY, AI_BASE_URL
- ANTHROPIC_API_KEY, OPENAI_API_KEY, GROQ_API_KEY
- TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, BOK_API_KEY, FRED_API_KEY, DART_API_KEY
- SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_DB_PASSWORD
- 로컬: .env 파일 (--env-file 플래그)
- CI: GitHub Secrets
