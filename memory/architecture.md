# 아키텍처

## 파이프라인 흐름
```
RSS 수집 → 중복 제거(seen-articles.json) → 키워드 필터 → 로컬 스코어링 → 일별 기사 아카이브 → 긴급 알림 또는 다이제스트 버퍼
```

## 뉴스 수집 파이프라인
1. **키워드 필터** (비용 0원): must_include / high_priority 키워드 매칭
2. **로컬 스코어링** (비용 0원): 키워드 가중치로 1~5점 산정, 영문 기사는 FinBERT 감성 분석, 한국어 기사는 감성 사전 사용
3. **일별 기사 아카이브**: score 4 이상 기사를 `data/daily-articles/YYYY-MM-DD.json`에 누적 저장
4. **라우팅**:
   - score 5: 개인 관련성 매칭 후 Telegram 즉시 알림
   - score 4: `data/article-buffer.json`에 저장 후 예약 다이제스트에서 처리

## 다이제스트 안정성
- 다이제스트는 `data/article-buffer.json`을 먼저 읽고, AI 생성과 Telegram 전송이 모두 성공한 뒤에만 버퍼를 비운다.
- AI 호출 실패 또는 Telegram 전송 실패 시 버퍼를 보존해 다음 실행에서 재시도한다.

## 종목 분석 데이터
- 장 마감 종목 분석은 5분 수집기가 누적한 `data/daily-articles/YYYY-MM-DD.json`을 우선 사용한다.
- 실행 시점의 RSS도 다시 점수화해 아카이브 누락분을 보강한 뒤, 당일 누적 중요 기사 전체를 AI 분석에 전달한다.

## 예약 작업
- `news-alert.yml`: 평일 KST 07:00~23:00, 5분 간격 뉴스 수집
- `digest-morning.yml`: KST 07:30 아침 브리핑
- `digest-lunch.yml`: KST 12:00 점심 브리핑
- `digest-close.yml`: KST 15:40 장 마감 브리핑
- `digest-evening.yml`: KST 19:00 저녁 브리핑
- `digest-night.yml`: KST 23:30 마감 브리핑
- `stock-report.yml`: KST 16:00 장 마감 종목 분석

## AI 사용 지점
- 뉴스 수집 스코어링은 기본적으로 AI API를 쓰지 않는다.
- 다이제스트와 종목 리포트만 `src/utils/ai-client.js`를 통해 AI 제공자를 호출한다.
- 지원 제공자: Anthropic, OpenAI, Groq, Ollama, Custom(OpenAI 호환)

## 비용 구조
- GitHub Actions: 공개 repo 무료
- 로컬 스코어링/FinBERT: 무료
- AI 다이제스트/리포트: 제공자별 비용 발생. Groq/Ollama 사용 시 무료 운영 가능
- Telegram Bot / 한은 ECOS / FRED: 무료

## 환경변수
- AI_PROVIDER, AI_MODEL, AI_API_KEY, AI_BASE_URL
- ANTHROPIC_API_KEY, OPENAI_API_KEY, GROQ_API_KEY
- TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, BOK_API_KEY, FRED_API_KEY
- 로컬: .env 파일 (--env-file 플래그)
- CI: GitHub Secrets
