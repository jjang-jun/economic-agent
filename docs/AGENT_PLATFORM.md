# Agent Platform Direction

이 문서는 개인 AI 경제 사무실의 대화·조회·승인 실행 구조를 정의한다. 정기 리포트, 긴급 알림, 자연어 입력과 승인은 Discord로 통합한다. 대화형 Agent는 항상 요청을 받을 수 있는 Node.js 런타임과 Supabase를 사용한다.

현재 저장소는 경제·투자·자산관리 도메인에 한정한다. 투자·부동산·세금/연금·포트폴리오·리스크·데이터 검증 담당을 하나의 Discord 봇 뒤에서 제한적으로 `to/cc` 협업시킨다. 범용 개발·법무 조직, 독립 봇 다수의 자유 대화, 여러 프로젝트/PC 세션 오케스트레이션, 이메일 Draft 비서는 [`future/AI_AGENT_TEAM_BLUEPRINT.md`](future/AI_AGENT_TEAM_BLUEPRINT.md)의 미래 별도 프로젝트 범위다.

## 최종 구조

```text
사용자
  -> Discord Webhook: 정책·행동·포트폴리오·성과·운영 리포트
  -> Discord Interaction: 포트폴리오·목표·리스크·추천·거래 성과 비공개 조회
  -> Discord Gateway 멘션: 자연어 조회·전문가 to/cc·거래 기록 초안
  -> Discord 버튼: 기록/취소 승인
  -> Agent API Server + Gateway worker -> Supabase/Postgres
  -> 뉴스, 공시, 시장 데이터, 포트폴리오, 추천, 실제 거래 기록
```

```text
GitHub Actions
  - 뉴스 수집 백업
  - 다이제스트와 장마감 리포트
  - 추천 성과 평가와 포트폴리오 스냅샷
  - 주간/월간 리뷰
  - Discord 채널별 Webhook 전달

Agent API Server
  - Discord Interaction 서명 검증
  - 읽기 전용 Slash 조회
  - 거래 초안 버튼 승인/취소
  - 뉴스 수집 job endpoint

Gateway worker
  - Discord WebSocket 연결 상시 유지
  - 허용된 멘션만 라우팅
  - 자연어 거래 초안과 경제 전문가 응답
```

GitHub Actions 단독으로는 사용자의 즉시 질문을 받을 수 없다. 배치형 루틴은 Actions가 맡고, Slash·버튼은 Agent Server, 일반 멘션은 항상 켜진 Gateway worker가 맡는다.

## 실행 플랫폼

- Agent Server: Cloud Run, Fly.io, Render 또는 개인 서버
- Gateway worker: 인터넷에 연결된 개인 PC·미니PC·NAS·VM
- 공통 런타임: Node.js 22+
- 지원 OS: Windows, macOS, Linux

`scripts/discord-agent-worker.js`는 OS별 shell 기능에 의존하지 않는다. 모든 OS에서 `npm run discord:agent-worker`로 실행하며, 재부팅 자동 시작만 작업 스케줄러·`launchd`·`systemd` 등 OS 계층에서 설정한다.

## Discord 역할

- 긴급 알림과 시장 브리핑
- 일일 행동·포트폴리오·성과 리포트
- 세금·부동산 정책 레이더
- `/portfolio`, `/goal`, `/risk`, `/recommendations`, `/trades`, `/trade-performance`
- 허용된 개인 채널에서 `@Economic Agent ...` 자연어 조회·기록 초안
- 투자·부동산·세금/연금·포트폴리오·리스크·데이터 검증 전문가의 내부 `to/cc`

정기 리포트는 Incoming Webhook으로 전달한다. 개인 조회는 `POST /discord/interactions`에서 Ed25519 서명과 guild/user/channel allowlist를 검증한 뒤 ephemeral 응답으로 처리한다. Gateway worker는 정확한 봇 멘션만 받고 같은 사용자·서버·채널 정책을 적용한다.

## 권한과 사용자 추가

```dotenv
DISCORD_GUILD_ID=서버_ID
DISCORD_ALLOWED_USER_IDS=사용자_ID_1,사용자_ID_2
DISCORD_ALLOWED_CHANNEL_IDS=개인_채널_ID_1,개인_채널_ID_2
```

- `DISCORD_ALLOWED_USER_IDS`는 서버 초대 목록이 아니라 봇 사용 허용 목록이다.
- 비어 있으면 모든 조회와 멘션 요청을 거부한다.
- 다른 사람을 서버에 초대해도 그 ID를 추가하기 전에는 봇을 사용할 수 없다.
- `DISCORD_ALLOWED_CHANNEL_IDS`를 설정하면 목록 밖 채널의 개인 자산 요청을 거부한다.

## 자연어 입력과 승인

```text
@Economic Agent 지금 내 포트폴리오 상태 알려줘
@Economic Agent 부동산 전문가에게 내집마련 예산을 검토해줘
@Economic Agent to: 투자 전문가 cc: 리스크 관리자 삼성전자 추가 매수를 검토해줘
@Economic Agent 삼성전자 3주를 7만원에 샀어
@Economic Agent 현금 잔액은 500만원이야
```

포트폴리오를 바꾸는 요청은 바로 반영하지 않는다. `pending_actions`에 초안을 저장하고 요청자 범위의 `기록하기`/`취소` 버튼으로 승인받는다. 승인된 작업도 증권사 주문이 아니라 포트폴리오와 실제 거래 기록만 변경한다.

## 대화 안전 원칙

1. guild/user/channel allowlist를 모두 통과해야 한다.
2. 조회 응답은 가능한 경우 ephemeral로 제공한다.
3. 변경은 반드시 확인 버튼을 거친다.
4. AI는 DB를 직접 변경하지 않고 승인된 Tool만 구조화 데이터를 변경한다.
5. 모든 답변에는 데이터 기준 시점을 포함한다.
6. 증권사 주문 API는 연결하지 않는다.
7. Interaction token과 Bot token은 저장하거나 로그에 출력하지 않는다.

## 서버 구조

```text
src/
├── server/
│   ├── index.js
│   ├── discord-interactions.js
│   └── dashboard.js
├── agent/
│   ├── agent-router.js
│   ├── discord-mention-router.js
│   ├── natural-action-parser.js
│   ├── expert-team.js
│   ├── expert-context.js
│   ├── pending-actions.js
│   └── response-composer.js
├── notify/
│   ├── reports.js
│   ├── policy-report.js
│   ├── discord-reports.js
│   └── discord.js
└── config/
    ├── discord-access.js
    ├── discord-commands.js
    └── expert-roles.js
```

## Supabase 원본화

```text
Supabase = 포트폴리오·거래·승인·대화의 원본
data/portfolio.json = 로컬 bootstrap/fallback
Discord = 리포트·긴급 알림·입력·승인 UI
Agent Server = 계산·검증·Interaction
Gateway worker = 상시 멘션 수신
GitHub Actions = 정기 리포트
```

주요 테이블은 `financial_freedom_goals`, `portfolio_accounts`, `positions`, `risk_policy`, `conversation_messages`, `pending_actions`, `collector_runs`, `source_cursors`, `alert_events`, `job_locks`다. 과거 알림 데이터와 기존 스키마 열은 마이그레이션 이력 보존을 위해 삭제하지 않는다.

## 수집 런타임

```text
Agent Server + Scheduler = 5분 메인 수집
GitHub Actions = 15분 백업 수집
GitHub Actions = 브리핑·리포트·평가
Supabase = 수집 상태와 중복 방지 기준 저장소
```

```text
POST /jobs/news-collector
x-job-secret: <JOB_SECRET>
x-trigger-source: cloud_scheduler | fly_cron | render_cron
```

`runNewsCollector()`는 CLI와 HTTP endpoint가 같이 쓰는 공용 job이다. 실행 간격이 벌어진 catch-up run에서는 오래된 score 5 기사를 즉시 쏟지 않고 다이제스트/캐치업 버퍼로 넘긴다.

## 현재 구현

- `npm run agent:server`
- `GET /health`, `GET /version`, `GET /dashboard`
- `POST /discord/interactions`
- `POST /jobs/news-collector`
- 읽기 전용 Slash 명령과 요청자 범위 승인 버튼
- `npm run discord:agent-worker`
- 자연어 조회·거래 초안·전문가 `to/cc`
- `conversation_messages`, `pending_actions` 저장
- Discord Webhook 리포트와 실패 알림

## 다음 운영 단계

1. 24시간 worker 장비에 재부팅 자동 시작과 로그 회전을 설정한다.
2. `DISCORD_ALLOWED_USER_IDS`와 개인 채널 allowlist를 최소 권한으로 유지한다.
3. worker heartbeat와 마지막 응답 시각을 `#시스템-점검`에 보고한다.
4. Codex 구독 인증 기반 worker는 개인 신뢰 장비에서만 사용하고, 공유 서버 전환 시 별도 API 비용·키 정책을 검토한다.
