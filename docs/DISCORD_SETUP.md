# Discord Report Infrastructure

Discord 1단계는 읽기 전용 리포트 채널입니다. Telegram 긴급 알림과 `/buy`, `/sell`, 승인 버튼은 그대로 유지합니다.

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

정기 리포트 병행 전송은 명시적으로 활성화합니다. 이 값이 없거나 `false`이면 스모크 외 실제 작업은 Discord에 보내지 않습니다.

```env
DISCORD_REPORTS_ENABLED=true
```

Discord 메시지는 기본적으로 채널별 색상, 고정 제목, 본문, 페이지 번호, 기준 시각이 있는 Embed 카드로 전송됩니다. Telegram HTML의 굵게·기울임·밑줄·취소선·코드·링크는 Discord Markdown으로 변환하고 연속된 빈 줄은 정리합니다. 문제가 있을 때만 일반 텍스트로 되돌립니다.

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

이 명령은 `data/discord-webhooks.json`을 검증한 뒤 하나의 `DISCORD_WEBHOOKS_JSON_BASE64` Secret으로 저장하며 URL을 출력하지 않습니다. 이후 Actions의 `Discord Infrastructure Smoke`를 수동 실행합니다.

## 5. 마이그레이션 라우팅

| 리포트 | Discord | Telegram |
|---|---|---|
| 즉시 중요 뉴스 | `#긴급-알림` | 유지 |
| 정기 경제 다이제스트 | `#시장-브리핑` | 안정화 기간 유지 |
| 종목·일일 행동·진입 타이밍 | `#일일-행동` | 안정화 기간 유지 |
| 경제적 자유·자산 현황 | `#포트폴리오` | 안정화 기간 유지 |
| 세금·연금·금융정책 | `#정책-세금` | 안정화 기간 유지 |
| 주택·대출·부동산정책 | `#정책-부동산` | 안정화 기간 유지 |
| 기사 전 가격·거래량 신호 | `#선행신호` | 안정화 기간 유지 |
| 추천·실제 거래 성과 | `#성과-리뷰` | 안정화 기간 유지 |
| 수집·가격·배포·Workflow 장애 | `#시스템-점검` | 유지 |

Discord 실패는 로그에 남기되 Telegram 성공, 기사 버퍼 처리, 추천 저장을 되돌리지 않습니다. 1~2주 동안 누락·중복·모바일 가독성을 비교한 뒤 Telegram에서 정기 읽기 전용 리포트만 축소합니다. `/buy`, `/sell`, 승인 버튼과 긴급 알림은 Telegram에 유지합니다.

## 보안과 운영 원칙

- Webhook URL이 노출되면 Discord에서 즉시 삭제하고 새로 생성합니다.
- `allowed_mentions`를 비활성화해 기사·AI 텍스트가 `@everyone` 알림을 만들지 못하게 합니다.
- 메시지는 Discord 제한보다 여유 있게 분할합니다.
- Embed 본문은 3,800자 단위로 분리하고 여러 장이면 제목에 `1/2`처럼 페이지를 표시합니다.
- 한 채널 실패가 Telegram이나 다른 정기 작업을 중단시키지 않도록, 실제 리포트 연결은 병행 전송 단계에서 개별 적용합니다.
- 양방향 Slash command와 매매 승인은 Webhook이 아니라 Discord Application/Interaction 서명 검증이 필요하므로 후속 단계에서 다룹니다.
