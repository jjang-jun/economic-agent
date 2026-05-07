# Agent Platform Direction

Economic Agent의 대화 매개체는 Telegram을 유지하고, 실제 대화형 Agent 실행 플랫폼은 항상 요청을 받을 수 있는 Node.js 백엔드와 Supabase로 분리한다.

## 최종 구조

```text
사용자
  -> Telegram Bot
  -> Agent API Server
  -> Supabase/Postgres
  -> 뉴스, 공시, 시장 데이터, 포트폴리오, 추천, 실제 거래 기록
```

정기 작업은 GitHub Actions에 남긴다.

```text
GitHub Actions
  - 뉴스 수집
  - 다이제스트
  - 장마감 리포트
  - 추천 성과 평가
  - 포트폴리오 스냅샷
  - 주간/월간 리뷰

Agent API Server
  - Telegram webhook 수신
  - 포트폴리오 조회
  - 매수/매도 기록 초안 생성
  - 리스크 질의
  - 승인/취소 버튼 처리
```

GitHub Actions 단독으로는 사용자의 즉시 질문을 받기 어렵다. 배치형 루틴은 Actions가 맡고, 대화형 런타임은 별도 서버가 맡는다.

## 권장 실행 플랫폼

1. Cloud Run
   - Node.js 컨테이너 배포에 적합
   - Telegram webhook과 REST API 서버에 적합
   - 향후 worker/API 분리에 유리

2. Fly.io 또는 Render
   - 개인 프로젝트 배포가 단순함
   - 작은 Node.js 서버를 운영하기 좋음

3. 개인 미니PC/NAS + Docker
   - 프라이버시는 좋지만 운영 부담이 큼

비추천:
- GitHub Actions 단독 운영. 스케줄 작업에는 좋지만 실시간 대화에는 부적합하다.

## Telegram 역할

Telegram은 알림 채널에서 대화형 투자 비서 UI로 확장한다.

채널은 두 개로 분리한다.

```text
TELEGRAM_CHAT_ID
  - 공유 가능한 뉴스/시장 브리핑
  - 즉시 뉴스 알림
  - 일반 다이제스트

TELEGRAM_PRIVATE_CHAT_ID
  - 포트폴리오
  - 거래 기록
  - 행동 리포트
  - 추천/실거래 성과
  - 경제적 자유 상태
  - 대화형 Agent 승인 플로우
```

`TELEGRAM_SECRET_CHAT_ID`도 같은 비공개방 alias로 지원한다. `TELEGRAM_PRIVATE_CHAT_ID`와 `TELEGRAM_SECRET_CHAT_ID`가 모두 없으면 기존 `TELEGRAM_CHAT_ID`로 fallback한다.

지원할 대화:

```text
지금 내 포트폴리오 상태 알려줘
삼성전자 100만 원 더 사도 돼?
하이닉스 2주 34만 원에 샀어 기록해줘
오늘 신규매수 가능?
경제적 자유 목표 대비 지금 속도 어때?
```

명령어:

```text
/portfolio
/risk
/goal
/buy 005930 3 266000
/sell 000660 2 340000
/cash 5000000
/review weekly
/rebalance
```

포트폴리오를 바꾸는 명령은 바로 반영하지 않는다. 항상 `pending_actions`에 초안을 만들고 Telegram 버튼으로 승인받는다.

## 대화 안전 원칙

1. 조회는 자유롭게 가능
2. 변경은 반드시 확인 버튼 필요
3. 매수/매도는 주문이 아니라 기록으로 시작
4. 증권사 주문 API는 마지막 단계까지 연결하지 않음
5. 모든 답변에는 데이터 기준 시점 표시
6. AI는 DB를 직접 변경하지 않음
7. Tool과 Risk Engine만 구조화 데이터를 변경할 수 있음

답변 끝에는 아래 기준 시점을 붙인다.

```text
데이터 기준:
- 포트폴리오: 2026-05-06 16:10 KST
- 시장 레짐: 2026-05-06 15:45 KST
- 가격: 장마감 기준
```

## 서버 구조

```text
src/
├── server/
│   ├── index.js
│   └── telegram-webhook.js
├── agent/
│   ├── agent-router.js
│   ├── intent-classifier.js
│   ├── response-composer.js
│   └── tools/
│       ├── get-portfolio.js
│       ├── get-risk-policy.js
│       ├── get-market-regime.js
│       ├── get-recommendations.js
│       ├── calculate-position-size.js
│       ├── record-trade-draft.js
│       ├── confirm-action.js
│       ├── update-cash-draft.js
│       └── get-freedom-status.js
```

LLM 역할:
- intent 보조 분류
- 필요한 tool 선택
- 설명 문장 생성

Tool 역할:
- DB 조회
- 계산
- 기록 초안 생성
- 승인된 action 반영

Risk Engine 역할:
- 신규 매수 가능 여부
- 포지션 크기
- 차단 사유
- 레짐별 행동 제한

## Supabase 원본화

초기에는 `data/portfolio.json`을 기준으로 썼지만, 대화형 Agent에서는 Supabase가 원본이어야 한다.

```text
Supabase = 원본
data/portfolio.json = 로컬 캐시
Telegram = 입력/조회 UI
Agent Server = 계산/검증
GitHub Actions = 정기 리포트
```

추가 테이블:

```text
financial_freedom_goals
portfolio_accounts
positions
risk_policy
conversation_messages
pending_actions
collector_runs
source_cursors
alert_events
job_locks
```

민감 데이터 원칙:
- 포트폴리오, 거래, 목표 테이블은 RLS 활성화
- service_role key는 서버에서만 사용
- GitHub Actions와 클라이언트 로그에 secret 노출 금지

## 보안 원칙

1. Telegram `chat_id` allowlist
2. Telegram webhook secret token 검증
3. Supabase RLS 활성화
4. service_role key는 Agent Server 전용
5. 포트폴리오 변경은 pending action 승인 후 반영
6. 증권사 주문 API는 당분간 연결 금지

## 구현 순서

1. `strategy-policy.js`, `position-sizer.js`로 투자 정책과 계산 공식을 코드화
2. Supabase 포트폴리오 원본 테이블 추가
3. `pending_actions`, `conversation_messages` 테이블 추가
4. `src/server/telegram-webhook.js`와 `/health` 추가
5. `agent-router.js`와 기본 명령어 `/portfolio`, `/goal`, `/risk` 구현
6. `/buy`, `/sell`, `/cash`는 pending action과 버튼 승인 방식으로 구현
7. Cloud Run 또는 Fly.io/Render 배포

## 수집 런타임

GitHub Actions schedule은 5분 cron을 설정할 수 있지만 정시성과 실행 보장을 기대하면 안 된다. 뉴스와 DART 주요 공시는 다음 계층으로 운영한다.

```text
Agent Server + Scheduler = 5분 메인 수집
GitHub Actions = 15분 백업 수집
GitHub Actions = 브리핑/리포트/평가
Supabase = 수집 상태와 중복 방지 기준 저장소
```

메인 수집 endpoint:

```text
POST /jobs/news-collector
x-job-secret: <JOB_SECRET>
x-trigger-source: cloud_scheduler | fly_cron | render_cron
```

`runNewsCollector()`는 CLI와 HTTP endpoint가 같이 쓰는 공용 job이다. 마지막 성공 실행 이후 시간을 기준으로 lookback window를 계산하고, 기본 30분, 최대 240분까지 뒤로 겹쳐 수집한다. 실행 간격이 벌어진 catch-up run에서는 오래된 score 5 기사를 즉시 알림으로 쏟지 않고 다이제스트/캐치업 버퍼로 넘긴다.

수집 상태 테이블:

```text
collector_runs = 실행 이력, lookback, 수집/알림 건수, 실패 사유
source_cursors = 마지막 성공 시각과 마지막 published_at
alert_events = immediate/digest/catch_up 알림 상태
job_locks = 동시 실행 방지용 TTL lock
```

현재 구현:
- `npm run agent:server`
- `GET /health`
- `POST /telegram/webhook`
- `/portfolio`, `/goal`, `/risk`, `/help`
- `/buy`, `/sell`, `/cash` pending action
- Telegram chat_id allowlist
- `TELEGRAM_WEBHOOK_SECRET` 검증
- `conversation_messages` 저장
- Telegram inline keyboard 승인/취소
- `POST /jobs/news-collector`
- `src/jobs/run-news-collector.js`
- `collector_runs`, `source_cursors`, `alert_events`, `job_locks`
- GitHub Actions `news-alert.yml` 15분 백업 수집기 전환

아직 미구현:
- Cloud Run/Fly/Render 배포 설정
- Cloud Scheduler/Fly cron/Render cron 5분 메인 수집 연결
