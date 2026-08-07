# Home Server Operations

이 문서는 경제 에이전트를 **Windows, macOS, Linux 중 하나의 항상 켜진 개인 PC**에서 운영하는 기준 절차다. 목표 구조는 Supabase·Cloud Run·정기 GitHub Actions 없이도 Discord, 스케줄 작업, PostgreSQL이 한 장비에서 동작하는 것이다.

## 목표 구조

```text
Discord
  ↕ Gateway WebSocket / Webhook
Node.js 22 PC worker
  ├─ 멘션, Slash, 승인 버튼
  ├─ 뉴스 수집과 정기 리포트 스케줄
  ├─ 결정론적 작업 + 선택형 AI API 분석
  └─ http://127.0.0.1:3210
       PostgREST (내부 호환 API)
         └─ PostgreSQL 17 (기준 DBMS)
```

- PostgreSQL이 실제 오픈소스 기준 저장소다.
- PostgREST는 기존 REST 저장 코드를 연결하는 내부 어댑터일 뿐이며 DBMS가 아니다.
- PostgREST는 PostgreSQL superuser가 아니라 localhost API 전용 `economic_agent_api` 역할로 접속한다. 이 역할은 RLS가 활성화된 기존 서버용 테이블을 다루기 위해 `BYPASSRLS`를 갖지만 외부 네트워크에서는 접근할 수 없다.
- PostgreSQL 5432와 PostgREST 3210은 모두 `127.0.0.1`에만 바인딩한다. 공유기 포트포워딩이나 공인 인터넷 공개를 금지한다. 컨테이너 내부 PostgREST 포트는 3000이지만 호스트에서는 사용하지 않는다.
- Docker에는 DB 계층만 둔다. 현재 worker는 Codex를 실행하지 않으며 Node 작업과 선택형 AI API 분석만 호스트 OS에서 실행한다.
- 운영체제별 차이는 재부팅 자동 시작 방식뿐이며 앱 코드는 동일하다.

## 준비물

1. Node.js 22 이상
2. Docker Desktop 또는 Docker Engine + Compose
3. Git 저장소와 비공개 `.env`
4. Discord Bot token, guild/user/channel allowlist
5. 정전·디스크 장애에 대비한 암호화 외부 백업 위치

현재 macOS 장비에는 Docker Desktop과 Compose가 설치되어 있으며, ARM64 환경에서 PostgreSQL/PostgREST 컨테이너 기동을 확인했다. 장기 용량과 백업 크기는 계속 관찰한다.

## PostgreSQL 시작

```bash
# 1. OS 공통 Node 명령으로 비공개 설정과 48자리 난수 비밀번호 생성
npm run home:init

# 2. DB와 내부 REST API 시작
npm run home:up

# 3. 스키마 재적용과 상태 점검
npm run home:db:schema
npm run home:check

# 4. 값을 출력하지 않는 로컬 백업 암호화 키 생성
npm run home:db:backup-key:init
```

키가 로그·화면 등에 노출되었다면 값을 직접 복사하지 말고 `npm run home:db:backup-key:rotate`로 교체한다. 교체 전 키로 만든 백업은 새 키로 열리지 않으므로 검증 가능한 새 백업을 먼저 만든 뒤 과거 파일의 보존·폐기를 결정한다.

첫 백업과 실제 임시 DB 복원 훈련:

```bash
npm run home:db:backup
npm run home:db:backup:verify -- data/backups/<backup>.dump.gz.aes --restore-drill
```

복원 훈련은 임시 데이터베이스를 만들고 테이블·기사 데이터를 확인한 뒤 `dropdb --force`로 임시 DB만 제거한다. 운영 `economic_agent` 데이터베이스는 변경하지 않는다.

앱 루트 `.env`에는 다음 값을 추가한다.

```dotenv
DATABASE_REST_URL=http://127.0.0.1:3210
PC_WORKER_SCHEDULER_MODE=shadow
```

`DATABASE_REST_URL`이 설정되면 앱은 이를 Supabase 변수보다 우선한다. 로컬 PostgREST는 loopback 전용이므로 `DATABASE_REST_KEY`가 없어도 동작한다. 외부 호스트에서 이 URL에 접근할 수 있게 만들지 않는다.

2026-08-05 초기 이관에서는 data-only dump 약 14.8MB를 복원하고 29개 테이블을 PostgREST로 전부 읽어 JSON/SQLite mirror 생성까지 확인했다. 원본 GitHub workflow가 계속 실행되는 동안에는 기사·가격·수집 로그가 증가하므로, 이 결과는 초기 shadow용 시점 복사본이다. 최종 전환 직전에 원격 스케줄을 잠시 정지하고 마지막 백업·복원·정확 행 수 대조를 다시 수행한다.

## 72시간 전환 순서

1. PostgreSQL을 시작하고 현재 Supabase 원본을 백업한다.
2. 빈 로컬 DB에 데이터를 이관하고 테이블별 행 수와 핵심 포트폴리오 합계를 대조한다.
3. `PC_WORKER_SCHEDULER_MODE=shadow`로 72시간 실행해 예정 작업, heartbeat, Discord 연결을 기록한다. 이 모드에서는 정기 작업을 실제 실행하지 않는다.
4. 멘션, Slash, 승인/취소 버튼을 개인 채널에서 smoke 검증한다.
5. 새 PC가 사용하는 DB에서 `npm run policy:radar -- --baseline-only`를 한 번 실행하고, 이어서 `--no-report` 실행이 `신규/변경 0건`인지 확인한다.
6. `active`로 바꾸고 GitHub Actions 스케줄은 수동 실행 안전망만 남긴다.
7. 한 주간 백업 복원 시험까지 통과한 뒤 Cloud Run과 Supabase를 제거한다.

전환 기간에는 두 스케줄러를 동시에 active로 두지 않는다. `worker_job_runs`와 `job_locks`가 중복 실행을 방어하지만, 운영 설정 자체도 단일 실행 주체를 유지해야 한다.

현재 Supabase PostgreSQL에서 한 번만 이관할 때에는 다음처럼 진행한다. export는 원본을 읽기만 하며, apply는 핵심 대상 테이블이 모두 비어 있고 명시적 확인 옵션이 있을 때만 실행된다.

```bash
# .env의 SOURCE_DATABASE_URL 또는 기존 SUPABASE_DB_URL을 읽어 dump 생성
npm run home:db:migrate -- export

# 출력된 정확한 dump 경로를 확인한 뒤 빈 로컬 DB에만 적용
npm run home:db:migrate -- apply data/database-migration/source-....dump --confirm-empty-target

# 이관 후 전체 REST mirror와 SQLite를 만들어 건수/금액 대조
npm run home:db:migrate -- verify
npm run db:pull
```

초기 복원 뒤 원격 scheduler와 로컬 Discord worker가 각각 데이터를 추가한 상태에서는 빈 DB 복원을 반복하지 않는다. 기본 dry-run 증분 동기화로 Supabase 원본에서 로컬에 없는 행과 갱신 후보를 먼저 확인한다.

```bash
npm run home:db:sync:dry-run
# 72시간 shadow 통과 후 원격 writer를 멈춘 승인된 cutover 창에서만 실행
npm run home:db:sync:apply
```

증분 동기화는 로컬에만 존재하는 행을 삭제하지 않는다. 포트폴리오·리스크·대화·pending action 충돌은 `updated_at`이 더 새로운 로컬 행을 보존하며, `price_snapshots`는 양쪽 DB의 서로 다른 serial ID 대신 `(ticker, source, price_type, as_of)` 자연키로 병합한다. `job_locks`, worker heartbeat와 worker job run은 실행 호스트 고유 상태이므로 옮기지 않는다.

이관 dump에는 민감한 금융 데이터가 있으므로 권한 `0600`으로 생성되고 Git에서 제외된다. 대조가 끝날 때까지 안전한 위치에 두고, 장기 보존본은 `HOME_DB_BACKUP_KEY_BASE64`를 사용하는 암호화 백업으로 만든다.
단기 API token cache와 새 PC worker 실행 이력/heartbeat는 이관하지 않고 로컬 서버에서 새로 생성한다.

## Worker 실행

```bash
npm run discord:agent-worker:check
npm run discord:agent-worker
```

macOS에서는 foreground smoke가 성공한 뒤 LaunchAgent로 등록한다. 설치 명령은 현재 Node 실행 파일과 프로젝트 절대 경로를 계산하므로 저장소 자체는 Windows/macOS/Linux 공통으로 유지된다. NVM의 Node 버전 경로가 바뀌면 설치 명령을 다시 실행한다.

Mac을 임시 상시 호스트로 검증할 때 `PC_WORKER_PREVENT_SLEEP_ON_AC=true`를 설정하면 LaunchAgent가 `/usr/bin/caffeinate -s`로 worker를 감싼다. 이는 전원 어댑터 연결 중의 유휴 시스템 절전만 막으며 배터리 사용 중에는 강제로 깨워두지 않는다. 전역 `pmset` 설정은 변경하지 않는다.

```bash
npm run worker:service:install:macos
npm run worker:service:status:macos
```

표준 출력과 오류 로그는 ignored `data/logs/`에 저장된다. 제거가 필요할 때만 `npm run worker:service:uninstall:macos`를 실행한다.

초기 설정 중 Gateway 재연결 보강과 LaunchAgent 재시작이 반복되어 앞선 구간은 준비 관찰로 남겼다. 연결 전 WebSocket error 재귀 방지와 외부 백업 설정까지 반영한 macOS shadow 판정은 2026-08-06 11:50 KST부터 다시 시작하며 최소 72시간 종료 기준은 2026-08-09 11:50 KST다. 그 전에는 `active`로 전환하거나 원격 스케줄을 중지하지 않는다. `npm run worker:shadow-audit`으로 기대 스케줄, 실제 기록, 누락, 지연, heartbeat/Gateway와 남은 시간을 확인한다.

worker는 매분 heartbeat를 PostgreSQL에 기록하고 평일 08:05 KST에 `#시스템-점검`으로 최근 24시간 성공·실패·shadow 예정 건수를 보낸다. 서버 자체가 꺼지거나 인터넷이 끊기면 자기 자신이 장애 메시지를 보낼 수 없으므로, cloud 안전망을 제거하기 전에 별도의 외부 heartbeat 감시를 추가하는 것이 좋다.

자연어 멘션을 받으려면 Discord Developer Portal에서 Bot의 **Message Content Intent**를 켜야 한다. worker는 guild, guild message, message content intent만 요청하며 DM이나 전체 사용자 목록 intent는 요청하지 않는다.

Gateway가 close code `4014`로 종료되면 Developer Portal의 해당 intent가 꺼져 있거나 봇에 허용되지 않은 상태다. 설정을 저장한 뒤 worker를 다시 시작한다.

재부팅 자동 시작은 운영체제 표준 서비스 관리자를 사용한다.

- Windows: 작업 스케줄러 또는 Windows Service wrapper
- macOS: `launchd`
- Linux: `systemd`

서비스는 저장소 루트에서 `npm run discord:agent-worker`를 실행하고, 실패 시 재시작하며, 비공개 `.env`를 읽을 수 있는 전용 사용자 권한으로 구동한다. 현재 서비스에는 Codex 인증 파일 접근 권한이 필요 없다.

## 선택형 Codex 작업 원칙

현재 PC worker와 Discord 전문가 응답은 Codex 세션을 사용하지 않는다. 향후 신뢰된 개인 장비에서 Codex 구독 인증 기반 작업을 연결할 경우에도 다음 계약을 지킨다.

- Discord 전체 대화를 하나의 장기 세션에 누적하지 않는다.
- 독립 작업은 새 `codex exec`로 시작하고, 동일 작업의 검증·수정 단계에서만 해당 session ID를 `resume`한다.
- 입력은 `목표 + 허용 범위 + 완료 조건 + 관련 SSoT 발췌 + 변경분`으로 제한한다. 전체 README, PROGRESS, DB row, 채널 history를 전달하지 않는다.
- 작업별 입력 아티팩트는 기본 12KiB 이하로 만들고 초과 시 원문 링크/ID와 결정에 필요한 요약만 남긴다.
- 단순 조회·계산·라우팅·리포트 포맷은 Node 코드가 처리하고, 설계·코드 변경·복합 분석처럼 Codex가 필요한 작업만 호출한다.
- 인증은 개인 신뢰 계정과 OS credential store를 우선하며 `~/.codex/auth.json`을 저장소·로그·Discord에 노출하지 않는다.
- Codex가 만든 변경은 자동 배포·자동 push하지 않고 diff, 테스트, 승인 단계를 거친다.

## 백업

```bash
npm run home:db:backup
# 생성된 정확한 파일을 암호 해제·압축 해제한 뒤 pg_restore TOC까지 검사
npm run home:db:backup:verify -- data/backups/economic-agent-....dump.gz.aes
```

- 기본 위치는 ignored 경로인 `data/backups/`다.
- `HOME_DB_BACKUP_KEY_BASE64`가 있으면 AES-256-GCM으로 암호화한다.
- `HOME_DB_OFFSITE_BACKUP_DIR`를 별도 디스크나 동기화 폴더의 절대 경로로 설정하면 같은 암호화 `.aes` 파일을 추가 복제한다. 이 값이 설정됐는데 암호화 키가 없으면 백업을 시작하지 않는다.
- 키와 외부 복제 경로를 검증한 뒤 `HOME_DB_SCHEDULED_BACKUP_ENABLED=true`로 설정하면 PC scheduler가 매일 02:30 KST 백업을 실행한다. 기본값은 비활성이다.
- 같은 PC에만 둔 백업은 디스크 장애에 취약하다. 외부 경로에는 평문 dump나 암호화 키를 두지 않는다.
- 자동 삭제는 하지 않는다. 보존 정책은 검증과 별도 임시 DB 복원 시험을 거친 뒤 정한다.
- 암호화 키는 백업 파일과 같은 위치에 저장하지 않는다.

## 보안과 운영 원칙

- `.env`, `infra/home-server/.env`, 선택형 Codex 인증 파일, DB 백업은 Git에 커밋하지 않는다.
- 향후 Codex 연동 시 `~/.codex/auth.json`은 비밀번호처럼 취급한다.
- 공유기에서 3000/5432 포트를 열지 않는다.
- Discord는 guild/user/channel allowlist를 모두 통과한 요청만 처리한다.
- 매매 입력은 초안 후 사용자 버튼 승인을 유지하고 증권사 자동 주문은 연결하지 않는다.
- OS 보안 업데이트, Docker 이미지 업데이트, DB 백업/복원 시험은 사용자가 직접 책임진다.

## 아직 제거하지 않는 안전망

현재 단계에서는 Cloud Run, Supabase, scheduled GitHub Actions를 즉시 삭제하지 않는다. 로컬 DB 이관 검증과 72시간 shadow, active 전환, 백업 복원 시험이 모두 끝난 뒤 순서대로 제거한다. GitHub의 코드 저장·Quality Gate·Security Audit은 홈 서버 전환 후에도 유지할 가치가 있으며, 정기 투자 작업과는 분리한다.
