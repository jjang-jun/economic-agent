# Telegram Agent Deploy

Telegram 채팅창에서 `/portfolio`, `/goal`, `/risk`, `/buy`, `/sell`, `/cash`를 쓰려면 Agent 서버가 외부 HTTPS URL에서 항상 떠 있어야 한다.

## 1. 필요한 환경 변수

서버 배포 환경에 아래 값을 넣는다.

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_SECRET_CHAT_ID=...
TELEGRAM_WEBHOOK_SECRET=...

SUPABASE_PROJECT_URL=...
SUPABASE_PUBLISHABLE_KEY=...

PORT=3000

PORTFOLIO_JSON_BASE64=...

KIS_APP_KEY=...
KIS_APP_SECRET=...
KIS_BASE_URL=https://openapi.koreainvestment.com:9443

ALPACA_API_KEY_ID=...
ALPACA_API_SECRET_KEY=...
ALPACA_DATA_FEED=iex

FMP_BASE_URL=https://financialmodelingprep.com/stable/
FMP_API_KEY=...
```

`TELEGRAM_SECRET_CHAT_ID`는 개인방 chat id다. 공유방에는 포트폴리오 명령을 열지 않는다.

## 2. 배포

컨테이너 기반 플랫폼에 배포한다.

추천 순서:

1. Cloud Run
2. Render
3. Fly.io

서버 시작 명령:

```bash
npm run agent:server
```

헬스체크:

```bash
curl https://YOUR_AGENT_URL/health
```

정상 응답:

```json
{"ok":true,"service":"economic-agent","mode":"agent-server"}
```

## 3. Telegram webhook 등록

배포 URL이 `https://YOUR_AGENT_URL`이면 webhook URL은 아래다.

```text
https://YOUR_AGENT_URL/telegram/webhook
```

로컬에서 등록:

```bash
TELEGRAM_WEBHOOK_URL=https://YOUR_AGENT_URL/telegram/webhook npm run telegram:set-webhook
```

또는:

```bash
npm run telegram:set-webhook -- https://YOUR_AGENT_URL/telegram/webhook
```

## 4. 동작 확인

개인 Telegram 방에서 아래 명령을 보낸다.

```text
/help
/portfolio
/goal
/risk
/cash 15000000
```

`/cash`, `/buy`, `/sell`은 바로 반영되지 않고 `기록하기`/`취소` 버튼을 보여준다.

## 5. 주의

- Agent 서버는 실제 주문을 넣지 않는다.
- `/buy`, `/sell`은 거래 기록과 로컬 포트폴리오 갱신만 수행한다.
- Telegram webhook은 HTTPS URL만 사용할 수 있다.
- 로컬 `localhost`는 Telegram에서 접근할 수 없다.
