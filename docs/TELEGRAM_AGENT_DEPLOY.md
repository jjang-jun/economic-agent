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
JOB_SECRET=...

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

`JOB_SECRET`은 Scheduler가 `POST /jobs/news-collector`를 호출할 때 쓰는 공유 secret이다. Telegram secret과 다르게 둔다.

`PORTFOLIO_JSON_BASE64`가 없으면 컨테이너에는 로컬 `data/portfolio.json`이 포함되지 않으므로 `/portfolio`가 0원으로 보일 수 있다. 로컬에서 아래 명령으로 GitHub secret과 같은 값을 만들 수 있다.

```bash
base64 -i data/portfolio.json
```

Cloud Run 환경 변수에 넣은 뒤 새 revision으로 재배포한다. Supabase에 최신 `portfolio_snapshots`가 있으면 Agent가 보조 fallback으로 사용하지만, 기준 원본은 `PORTFOLIO_JSON_BASE64`다.

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

### Render Blueprint

`render.yaml`을 repo root에 추가했다. Render에서 Blueprint로 이 repo를 연결하면 아래 두 서비스가 생성된다.

```text
economic-agent
= Telegram webhook용 web service

economic-agent-news-collector
= 5분마다 실행되는 cron job
```

Render cron은 `*/5 * * * *`로 실행하지만, `npm run collector:scheduled`가 KST 평일 07:00~23:59 밖에서는 바로 종료한다.

주의:
- `plan: starter` 기준이라 Render 비용이 발생할 수 있다.
- `sync: false` 환경변수는 Render Dashboard에서 직접 입력해야 한다.
- Web service가 뜬 뒤 Telegram webhook URL을 등록해야 한다.

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

## 5. 뉴스 수집 Scheduler 연결

메인 5분 수집은 Agent Server의 아래 endpoint를 호출한다.

```text
POST https://YOUR_AGENT_URL/jobs/news-collector
x-job-secret: <JOB_SECRET>
x-trigger-source: cloud_scheduler
```

로컬에서 배포 서버를 수동 검증:

```bash
AGENT_BASE_URL=https://YOUR_AGENT_URL JOB_SECRET=... npm run collector:call
```

정상 응답 예:

```json
{
  "ok": true,
  "newArticleCount": 0,
  "immediateAlertCount": 0,
  "digestBufferCount": 0,
  "lookbackMinutes": 30
}
```

### Cloud Run + Cloud Scheduler 예시

Cloud Run에는 이 repo의 `Dockerfile`을 배포한다. 서비스 URL이 정해지면 Cloud Scheduler가 5분마다 HTTP POST를 보낸다.

```bash
gcloud scheduler jobs create http economic-agent-news-collector \
  --schedule="2/5 7-23 * * 1-5" \
  --time-zone="Asia/Seoul" \
  --uri="https://YOUR_AGENT_URL/jobs/news-collector" \
  --http-method=POST \
  --headers="x-job-secret=YOUR_JOB_SECRET,x-trigger-source=cloud_scheduler" \
  --attempt-deadline=180s
```

GitHub Actions `news-alert.yml`은 15분 백업 수집기로 남겨둔다. 메인 수집이 장애나도 다음 백업 실행에서 lookback으로 따라잡는다.

### Render Cron 직접 실행 방식

Render Blueprint를 쓰면 HTTP endpoint 호출 대신 cron job이 직접 아래 명령을 실행한다.

```bash
npm run collector:scheduled
```

이 방식은 Agent Server URL을 몰라도 되고, 같은 Supabase lock/state를 사용하므로 GitHub Actions 백업 수집기와 겹쳐도 중복 알림을 줄인다.

## 6. 주의

- Agent 서버는 실제 주문을 넣지 않는다.
- `/buy`, `/sell`은 거래 기록과 로컬 포트폴리오 갱신만 수행한다.
- Telegram webhook은 HTTPS URL만 사용할 수 있다.
- 로컬 `localhost`는 Telegram에서 접근할 수 없다.
- `JOB_SECRET`이 없으면 `/jobs/news-collector` endpoint는 인증 없이 열릴 수 있으므로 운영 배포에는 반드시 설정한다.
