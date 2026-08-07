# Discord Report And Read-only Interaction Infrastructure

Discord는 분야별 리포트 채널, 긴급 알림, 개인 자산 조회용 Slash 명령, 자연어 멘션 초안과 확인 버튼을 담당하는 유일한 메시징 플랫폼입니다.

## 1. 비공개 서버와 채널 생성

개인용 비공개 Discord 서버를 만든 뒤 아래 구조로 텍스트 채널을 구성합니다.

| 설정 키 | Discord 채널 | 용도 |
|---|---|---|
| `urgent` | `#긴급-알림` | 시장 스트레스·치명적 공시 |
| `action` | `#일일-행동` | 매수·관찰·보유·축소 후보 |
| `briefing` | `#시장-브리핑` | 장전·장중·마감·해외장 다이제스트 |
| `portfolio` | `#포트폴리오` | 평가액·현금·자금 흐름 |
| `policy_tax` | `#정책-세금` | 세제·ISA·연금·자본시장 |
| `policy_real_estate` | `#정책-부동산` | 주택·대출·청약·부동산 세제 |
| `pre_news` | `#선행신호` | 가격·거래량 이상징후 연구 |
| `performance` | `#성과-리뷰` | 주간·월간 성과 |
| `ops` | `#시스템-점검` | 수집·가격 Provider·workflow 장애 |

```text
01 핵심 신호
  #긴급-알림
  #일일-행동
  #시장-브리핑
  #선행신호
02 자산 관리
  #포트폴리오
  #성과-리뷰
03 정책 인텔리전스
  #정책-세금
  #정책-부동산
04 운영
  #시스템-점검
```

서버와 모든 채널은 본인만 읽을 수 있도록 역할과 채널 권한을 먼저 확인합니다.

### Bot API로 자동 생성

같은 Discord Application의 Bot을 서버에 `Guild Install`하고 `.env`에 아래 값을 저장하면 채널과 Webhook을 자동 생성할 수 있습니다.

```env
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
```

Bot에는 구축 시점에만 `View Channels`, `Manage Channels`, `Manage Webhooks`가 필요합니다. `Administrator`를 임시로 사용할 수 있지만 구축 후 최소 권한으로 낮춥니다.

```bash
# 읽기 전용 계획 확인
npm run discord:provision

# 목적별 카테고리, 누락 채널, Webhook 생성
npm run discord:provision -- --apply
```

이 명령은 기존 `Economic Agent` 카테고리를 `01 핵심 신호`로 전환하고 채널을 목적별 카테고리로 이동합니다. 동일 이름의 기존 채널·Webhook은 재사용하며 삭제하지 않습니다. 생성된 URL은 `0600` 권한의 ignored `data/discord-webhooks.json`에 저장되고 로컬 명령이 자동으로 읽습니다.

## 2. 채널별 Webhook 생성

자동 생성 기능을 사용하지 않을 때만 각 채널의 `채널 편집 → 연동 → 웹후크 → 새 웹후크`에서 Webhook URL을 복사합니다. Webhook URL은 비밀번호와 같은 비밀값이므로 문서, Git, 로그에 붙이지 않습니다.

[`discord-webhooks.example.json`](discord-webhooks.example.json)을 참고해 ignored 파일 `data/discord-webhooks.json`을 만듭니다. 아직 쓰지 않을 채널은 생략할 수 있습니다.

```json
{
  "policy_tax": "https://discord.com/api/webhooks/.../...",
  "policy_real_estate": "https://discord.com/api/webhooks/.../...",
  "ops": "https://discord.com/api/webhooks/.../..."
}
```

## 3. 로컬 설정과 점검

JSON 파일을 base64로 바꿔 `.env`의 `DISCORD_WEBHOOKS_JSON_BASE64`에 설정하거나, 테스트할 한 채널만 `DISCORD_WEBHOOK_OPS`처럼 설정할 수 있습니다. 공통 fallback인 `DISCORD_WEBHOOK_URL`도 지원하지만 채널 구분이 사라지므로 운영에서는 권장하지 않습니다.

정기 리포트 Discord 전송은 명시적으로 활성화합니다. 이 값이 없거나 `false`이면 스모크 외 실제 작업은 Discord에 보내지 않습니다. 운영에서는 이 값을 `true`로 유지해야 합니다.

```env
DISCORD_REPORTS_ENABLED=true
```

Discord 메시지는 기본적으로 채널별 색상, 고정 제목, 본문, 페이지 번호, 기준 시각이 있는 Embed 카드로 전송됩니다. 공용 리포트 HTML의 굵게·기울임·밑줄·취소선·코드·링크는 Discord Markdown으로 변환하고 연속된 빈 줄은 정리합니다. 문제가 있을 때만 일반 텍스트로 되돌립니다.

```env
DISCORD_USE_EMBEDS=false
```

```bash
npm run discord:check
npm run discord:smoke -- --channel=ops
```

`discord:check`는 URL 자체를 출력하지 않고 설정 여부와 형식만 검사합니다. `discord:smoke`만 실제 메시지를 보냅니다.

## 4. GitHub Actions Secret 동기화

GitHub CLI가 현재 저장소에 로그인된 환경에서 다음 명령을 실행합니다.

```bash
npm run discord:sync-secret
```

이 명령은 `data/discord-webhooks.json`을 검증한 뒤 하나의 `DISCORD_WEBHOOKS_JSON_BASE64` Secret으로 저장하며 URL을 출력하지 않습니다. 이후 Actions의 `Discord Infrastructure Smoke`를 수동 실행합니다. 운영에서는 같은 Workflow가 평일 08:10 KST에 자동 실행되어 9개 설정을 검사하고 첫 장전 브리핑 전에 `#시스템-점검` health 카드를 보냅니다. 실패 알림도 가능한 경우 같은 Discord 운영 채널로 전달됩니다.

Webhook URL이 노출됐을 때에는 새 URL을 먼저 적용하고 검증한 뒤 기존 URL을 폐기합니다.

```bash
npm run discord:webhooks:rotate -- --keys=policy_tax,policy_real_estate
npm run discord:sync-secret
npm run discord:smoke -- --channel=policy_tax
npm run discord:smoke -- --channel=policy_real_estate
npm run discord:webhooks:rotate -- --revoke-old
```

회전 상태에는 Webhook ID만 저장하고 token은 로컬 ignored Webhook map에만 둡니다. smoke가 실패하면 `--revoke-old`를 실행하지 않아 기존 전달 경로를 보존합니다.

## 5. 읽기 전용 Slash 명령 연결

Slash 명령은 기존 Webhook과 별개로 Discord Application의 Interaction endpoint를 사용합니다. 서버는 Discord의 Ed25519 서명을 원문 body 기준으로 검증하고, 허용한 서버·사용자·채널에서만 조회를 실행합니다. 모든 결과는 명령을 실행한 사용자만 볼 수 있는 ephemeral 응답으로 보냅니다.

Discord Developer Portal의 `General Information`에서 Application ID와 Public Key를 확인하고, Discord에서 개발자 모드를 켠 뒤 본인의 User ID를 복사합니다. Agent Server 배포 환경에 다음 값을 넣습니다.

```env
DISCORD_APPLICATION_ID=...
DISCORD_GUILD_ID=...
DISCORD_PUBLIC_KEY=...
DISCORD_ALLOWED_USER_IDS=...        # 여러 명이면 쉼표로 구분
DISCORD_ALLOWED_CHANNEL_IDS=...     # 선택: 비우면 허용 guild의 모든 채널
DISCORD_SIGNATURE_MAX_AGE_SECONDS=300
DISCORD_INTERACTION_ACK_TIMEOUT_MS=2500
```

`DISCORD_ALLOWED_USER_IDS`가 없으면 개인 자산 조회는 닫힌 상태로 동작합니다. 채널까지 제한하려면 `#포트폴리오` 등 허용할 채널 ID만 `DISCORD_ALLOWED_CHANNEL_IDS`에 넣습니다. `DISCORD_BOT_TOKEN`은 명령 등록에 사용하므로 계속 secret으로 보관합니다.

서버를 먼저 배포한 뒤 Developer Portal의 `Interactions Endpoint URL`에 아래 주소를 입력합니다. Discord가 보내는 PING도 동일한 서명 검증을 통과해야 등록됩니다.

```text
https://YOUR_AGENT_URL/discord/interactions
```

위 HTTP endpoint는 Cloud Run 안전망 단계에서만 사용합니다. Discord는 Interaction 전달을 HTTP endpoint와 Gateway 중 하나로만 선택하므로, 홈 PC worker에서 Slash/버튼까지 받는 최종 전환 시 Developer Portal의 `Interactions Endpoint URL`을 비워 Gateway `INTERACTION_CREATE`로 되돌립니다. 72시간 shadow 중에는 endpoint를 유지하고 worker의 멘션·heartbeat만 검증합니다.

이후 현재 비공개 서버에 guild 명령을 동기화합니다. Guild 명령은 테스트 서버에서 즉시 반영되므로 운영 전 확인에 적합합니다.

```bash
npm run discord:sync-commands
```

지원 명령:

| 명령 | 내용 |
|---|---|
| `/portfolio` | 현재 평가액·현금·상위 보유 |
| `/goal` | 경제적 자유 목표 진행률 |
| `/risk` | 신규 매수 상한·비중 경고 |
| `/recommendations` | 최근 리스크 승인 후보, `include_blocked` 선택 가능 |
| `/trades` | 사용자가 승인해 기록한 최근 실제 체결 |
| `/trade-performance` | 기록된 체결의 실현·미실현 성과 |

응답 처리가 3초를 넘을 수 있으므로 endpoint는 먼저 ephemeral deferred 응답을 접수하고 완료된 결과로 원본 메시지를 갱신합니다. Discord Interaction token은 대화 로그에 저장하지 않습니다. `/buy`, `/sell`, `/cash` 같은 변경 명령은 Slash로 등록하지 않습니다. Discord에서 변경하려면 다음 절의 멘션 자연어 초안과 버튼을 사용합니다.

## 6. 봇 멘션 자연어와 거래 초안

일반 채널 메시지에서 `@Economic Agent`를 멘션해 자연어로 조회하거나 체결 기록 초안을 만들려면 HTTP Interaction endpoint 외에 Discord Gateway WebSocket worker가 항상 실행 중이어야 합니다.

```env
DISCORD_ALLOWED_CHANNEL_IDS=...       # 필수: 개인 #포트폴리오 채널 등
DISCORD_AGENT_ROLE_IDS=...           # 선택: 봇과 같은 이름의 역할 멘션 ID, 쉼표 구분
DISCORD_MENTION_ACTIONS_ENABLED=true  # 기본 false, 거래·현금 초안 명시적 활성화
DISCORD_EXPERT_RESPONSES_ENABLED=true # 기본 false, 경제 전문가 AI 응답 활성화
DISCORD_EXPERT_MAX_REVIEWERS=1        # 0~2, 기본 1
DISCORD_EXPERT_CONTEXT_MAX_CHARS=9000 # 역할별 SSoT 컨텍스트 상한
DISCORD_EXPERT_TIMEOUT_MS=45000       # AI 호출별 제한 시간, 5000~120000
AI_EXPERT_MAX_TOKENS=700              # 주 담당 출력 토큰 상한
AI_EXPERT_REVIEW_MAX_TOKENS=300       # 검토자별 출력 토큰 상한
```

```bash
npm run discord:agent-worker:check
npm run discord:agent-worker
```

### 지원 OS와 이식성 계약

Gateway worker 애플리케이션은 **Windows 10/11·Windows Server, macOS, Linux에서 동일한 Node.js 22+ 코드와 동일한 npm 명령**으로 실행합니다.

- Bash, PowerShell, 운영체제 전용 경로 또는 시스템 명령을 worker 런타임에서 사용하지 않습니다.
- `.env` 로딩, HTTP `fetch`, WebSocket, timeout은 Node.js 22의 내장 기능만 사용합니다.
- `npm run discord:agent-worker:check`는 네트워크에 연결하거나 Discord 메시지를 보내지 않고 현재 OS·Node 버전·필수 런타임 기능을 검사합니다.
- 변경이 원격 저장소에 반영되면 `Discord Worker Portability` Workflow가 `windows-latest`, `macos-latest`, `ubuntu-latest` 실제 runner에서 같은 검사와 멘션 worker 테스트를 실행합니다.
- Gateway 연결 종료 시 운영체제와 무관하게 지수 backoff로 재연결하고, Windows의 `SIGBREAK`와 공통 종료 신호를 처리합니다.
- 대화·승인 상태의 기준 저장소는 홈 서버 PostgreSQL이며 JSON 파일은 bootstrap/fallback입니다. 다른 OS 호스트로 옮길 때에는 PostgreSQL 백업도 함께 복원합니다.

설치와 수동 실행 절차도 세 운영체제에서 같습니다.

```text
1. Node.js 22 이상 설치
2. 저장소 복제 후 npm ci
3. 같은 Discord/PostgreSQL 환경변수 설정
4. npm run discord:agent-worker:check
5. npm run discord:agent-worker
```

애플리케이션 이식성과 **재부팅 후 자동 시작**은 별개의 문제입니다. 자동 시작은 호스트에 맞게 Windows 작업 스케줄러/서비스 관리자, macOS `launchd`, Linux `systemd` 또는 이미 운영 중인 크로스플랫폼 프로세스 관리자를 사용합니다. 이 계층은 worker 코드를 바꾸지 않으며 실행 명령은 항상 `npm run discord:agent-worker`입니다.

지원 예시:

```text
@Economic Agent 내 포트폴리오 상태 알려줘
@Economic Agent 경제적 자유 목표 진행은 어때?
@Economic Agent 부동산 전문가에게 내집마련 예산을 검토해줘
@Economic Agent ISA 세제개편 영향을 알려줘
@Economic Agent to: 투자 전문가 cc: 리스크 관리자 삼성전자 추가 매수를 검토해줘
@Economic Agent 삼성전자 3주를 7만원에 샀어
@Economic Agent 삼성전자(005930) 2주를 8만원에 팔았어
@Economic Agent 현금 잔액은 500만원이야
```

worker는 봇 계정 직접 멘션 또는 `DISCORD_AGENT_ROLE_IDS`에 명시한 역할 멘션의 `MESSAGE_CREATE`만 처리하며 봇 메시지, 미허용 guild/user/channel은 무시합니다. Discord 자동완성에서 봇과 같은 이름의 관리 역할이 선택될 수 있으므로 역할 ID도 명시적으로 허용할 수 있습니다. 자연어 본문을 안정적으로 받기 위해 Gateway는 `GUILDS + GUILD_MESSAGES + MESSAGE_CONTENT` intent를 요청하므로 Discord Developer Portal의 Bot 설정에서 Message Content Intent를 켭니다. 앱 로직은 허용 채널의 허용 멘션만 처리하고 나머지는 즉시 버립니다. 봇 권한은 `View Channels`, `Send Messages`, `Read Message History`로 제한합니다.

자연어 파서는 비용이 드는 LLM 호출 없이 보수적 규칙으로 먼저 동작합니다.

- `샀어`, `매수했어`, `팔았어`, `매도했어`처럼 체결 완료를 뜻하는 표현만 기록 초안으로 해석합니다.
- `지금 사도 돼?` 같은 상담 질문은 거래로 해석하지 않습니다.
- 종목명은 현재 포트폴리오·추천·고정 watchlist와 일치할 때만 코드로 변환합니다. 불명확하면 종목 코드를 다시 묻습니다.
- 수량·단가가 없으면 추측하지 않고 보완 입력을 요청합니다.
- 결과 메시지의 `기록하기`/`취소` 버튼을 눌러야 기존 `pending_actions` 승인 엔진이 실제 기록을 반영합니다.
- 버튼은 요청자별 `discord:guild:channel:user` 범위에 묶여 다른 허용 사용자가 대신 승인할 수 없습니다.

### 경제 도메인 전문가 팀

전문가 배정도 LLM에 맡기지 않고 결정론적 keyword/명시적 `to/cc` 규칙으로 먼저 처리합니다. 현재 역할은 투자 전문가, 부동산 전문가, 세금·연금 전문가, 포트폴리오 관리자, 리스크 관리자, 데이터 검증 담당입니다.

- 한 요청의 주 담당은 항상 1명입니다.
- 단순 설명 질문은 검토자를 호출하지 않습니다.
- 매수·매도·대출·계약·가입·리밸런싱 같은 의사결정 질문만 기본 1명, 최대 2명의 검토자를 별도 AI 호출로 실행합니다.
- 주 담당과 각 검토자 호출은 `DISCORD_EXPERT_TIMEOUT_MS` 안에 끝나지 않으면 해당 실행만 실패 처리해 상시 worker가 무기한 대기하지 않게 합니다.
- 주 담당과 검토자는 각각 다른 역할 프롬프트, SSoT 데이터 범위, 출력 토큰 예산, `discord:...:expert:<role_id>` 대화 namespace를 사용합니다.
- 전체 대화 기록을 모든 역할에 복사하지 않습니다. 투자 담당은 포트폴리오·추천·리스크 정책, 부동산 담당은 포트폴리오·목표·부동산/대출 정책처럼 필요한 자료만 받습니다.
- 검토자 장애는 완료된 주 담당 답변을 폐기하지 않으며, 누락 사실만 표시합니다.
- 현재 정책·가격 데이터가 컨텍스트에 없으면 모델이 추측하지 않고 재확인 필요로 표시하도록 강제합니다.
- `AI_EXPERT_MODEL`, `AI_EXPERT_REASONING_EFFORT`, `AI_EXPERT_VERBOSITY`, `AI_EXPERT_THINKING_MODE`와 `AI_EXPERT_REVIEW_*` 작업별 override도 기존 provider-agnostic AI client 규칙으로 사용할 수 있습니다.

이 기능은 개인 포트폴리오와 거래 요약을 설정된 AI provider로 전송할 수 있으므로 기본 비활성입니다. 현재 제공자의 데이터 처리 정책을 확인한 후에만 `DISCORD_EXPERT_RESPONSES_ENABLED=true`로 켭니다. 실제 주문·계약·가입은 수행하지 않습니다.

일반 봇 답변은 ephemeral이 아니므로 `DISCORD_ALLOWED_CHANNEL_IDS`는 본인만 볼 수 있는 개인 채널로 반드시 제한합니다. Slash와 버튼은 Gateway `INTERACTION_CREATE` 경로에서 ephemeral로 처리합니다. worker가 실행되는 호스트가 꺼지면 새 요청은 즉시 처리되지 않으므로 24시간 응답이 필요하면 OS와 무관하게 항상 켜진 개인 PC·미니PC·VM에서 실행해야 합니다. 구축과 cloud 전환 절차는 `docs/HOME_SERVER.md`를 따릅니다.

## 7. 리포트 라우팅

| 리포트 | Discord 채널 |
|---|---|
| 즉시 중요 뉴스 | `#긴급-알림` |
| 정기 경제 다이제스트 | `#시장-브리핑` |
| 종목·일일 행동·진입 타이밍 | `#일일-행동` |
| 경제적 자유·자산 현황 | `#포트폴리오` |
| 세금·연금·금융정책 | `#정책-세금` |
| 주택·대출·부동산정책 | `#정책-부동산` |
| 기사 전 가격·거래량 신호 | `#선행신호` |
| 추천·실제 거래 성과 | `#성과-리뷰` |
| 수집·가격·배포·Workflow 장애 | `#시스템-점검` |

Discord가 필수 전달 경로이므로 전송에 실패하면 다이제스트 버퍼 등 전달 성공이 필요한 상태를 완료 처리하지 않습니다.

## 보안과 운영 원칙

- Webhook URL이 노출되면 Discord에서 즉시 삭제하고 새로 생성합니다.
- `allowed_mentions`를 비활성화해 기사·AI 텍스트가 `@everyone` 알림을 만들지 못하게 합니다.
- 메시지는 Discord 제한보다 여유 있게 분할합니다.
- Embed 본문은 3,800자 단위로 분리하고 여러 장이면 제목에 `1/2`처럼 페이지를 표시합니다.
- Discord 전송 실패를 성공으로 숨기지 않으며 다른 정기 작업의 저장 상태와 전달 상태는 분리합니다.
- Slash 조회는 서명·guild·user·선택적 channel allowlist를 모두 통과해야 하며 응답은 항상 ephemeral로 전송합니다.
- 매매·현금 변경은 Discord Slash로 등록하지 않습니다. 멘션 초안과 요청자 전용 버튼만 사용합니다.

공식 참고 자료:

- [Discord Gateway와 Message Content Intent](https://docs.discord.com/developers/events/gateway)
- [Discord Interaction 수신과 응답](https://docs.discord.com/developers/interactions/receiving-and-responding)
- [Discord Message Components](https://docs.discord.com/developers/components/reference)
