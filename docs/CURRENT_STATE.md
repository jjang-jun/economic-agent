# Current State

Codex가 새 세션에서 전체 개발 이력을 다시 읽지 않고 작업을 이어가기 위한 짧은 SSoT입니다. 현재 판단에는 이 문서를 먼저 사용하고, 과거 근거가 필요할 때만 `docs/PROGRESS.md`를 조회합니다.

## 목표

경제 뉴스, 공시, 정책, 가격, 수급, 포트폴리오와 실제 거래를 연결해 경제적 자유 목표 달성 확률을 높이는 개인 AI 경제 사무실을 운영합니다. AI는 분석과 초안을 제공하며 매매·현금 변경은 사용자 확인 전에는 실행하지 않습니다.

## 현재 운영 구조

- 사용자 인터페이스와 알림: Discord 단독
- 대화: 허용된 서버·사용자·채널에서 `@Economic Agent` 봇 계정 또는 명시적으로 허용된 Agent 역할 멘션
- 민감 변경: 자연어 초안 생성 후 Discord `기록하기` 버튼으로 확정
- 상시 실행 목표: Windows/macOS/Linux 공통 Node.js PC worker
- 현재 검증 장비: macOS ARM64, LaunchAgent `com.economic-agent.worker`
- worker 모드: `shadow`; Gateway 재귀 오류 방지·AC 절전 방지·외부 백업 설정을 반영한 관찰은 2026-08-06 11:50 KST부터 72시간이며 종료 전에는 정기 작업을 실제 실행하지 않음
- 현재 worker는 Codex 세션을 실행하지 않음. Node 예약 작업과 Gateway가 중심이며, 전문가 답변을 켤 때만 별도 AI API를 사용함
- 목표 DB: 같은 장비의 PostgreSQL 17 + localhost 전용 PostgREST
- 로컬 포트: PostgreSQL `127.0.0.1:5432`, PostgREST `127.0.0.1:3210`
- Supabase와 GitHub Actions: 최종 증분 동기화와 shadow 검증이 끝날 때까지 안전망으로 유지
- Cloud Run: 전환 검증이 끝날 때까지 즉시 제거하지 않음

## 2026-08-05 검증 상태

- Docker Desktop에서 PostgreSQL/PostgREST 정상 기동
- Supabase 초기 data-only 복원 및 29개 테이블 REST pull 완료
- AES-256-GCM 백업 및 격리 임시 DB 복원 시험 통과
- Discord Message Content Intent 활성화 완료
- Discord Gateway heartbeat `gateway_connected=true`
- Gateway가 `error`만 내고 `close`를 내지 않는 경우에도 재연결하도록 보강
- Discord에서 봇과 같은 이름의 역할을 선택하는 UX를 지원하기 위해 `DISCORD_AGENT_ROLE_IDS` 추가
- 역할 멘션으로 보낸 포트폴리오 요청을 `portfolio_status`로 처리하고 Discord 답장 참조와 DB 단일 기록을 확인
- 전문가 SSoT 컨텍스트는 역할별 약 2.3K~5.1K자로 축소하고 기본 AI 제한을 주 담당 550, 검토 220토큰, 30초로 조정
- 당시 전체 기준 테스트 `403/403`, agent harness `17/17` 통과

## 2026-08-06 검증 상태

- 로컬 PostgreSQL/PostgREST와 Discord Gateway heartbeat 정상
- Mac 절전·네트워크 단절 구간 때문에 이전 shadow 관찰에서 스케줄 누락이 확인되어 active 전환 보류
- 최초 Gateway API 연결 실패가 worker 전체 종료와 LaunchAgent 재시작 폭주로 이어지지 않도록 scheduler를 유지한 채 지수 백오프로 재연결
- 동일 WebSocket의 반복 오류 로그를 억제하고 `worker:status-report -- --no-report`가 Discord를 전송하지 않도록 수정
- shadow 감사에 현재 worker 연속 실행 시간과 관찰 시작 후 재기동 여부 표시
- macOS 임시 검증 호스트는 전역 전원 설정 변경 없이 AC 연결 중에만 `caffeinate -s`로 유휴 시스템 절전을 방지
- 전체 기준 테스트 `406/406`, agent harness `17/17`, 홈 DB 연결 검사 통과
- Discord 자연어 삼성전자 매도 문장을 실제 local SSoT 경로에서 `draft_sell`로 생성한 뒤 취소했으며 pending 상태는 `cancelled`, 포트폴리오와 거래 원장은 불변임을 확인
- 실제 Discord UI에서 현금 0원 자연어 입력이 `draft_cash`로 생성되고 사용자의 취소 버튼으로 `cancelled` 처리됨을 확인; 현금 0원·14종목·삼성전자 73주 유지, 거래 원장 0건
- 홈 PostgreSQL 백업은 `HOME_DB_OFFSITE_BACKUP_DIR`가 설정되면 암호화 `.aes` 파일만 별도 디스크/동기화 폴더에 추가 복제하며, 암호화 키가 없으면 외부 백업을 시작하지 않음
- 2026-08-06 11:45 KST 새 키로 만든 약 14.5MB 백업을 iCloud Drive `EconomicAgentBackups`에 복제하고, 외부 사본에서 TOC 146개·테이블 32개·기사 31,505건 임시 DB 복원 검증 통과
- 매일 02:30 KST 예약 백업은 `.env`에 활성화 준비됨; 현재 실행 중인 shadow LaunchAgent에는 아직 주입하지 않고 active 전환 재설치 때 반영
- 미연결 WebSocket의 `close()`가 동기적으로 error를 재발행할 때 Gateway 오류 로그가 재귀 폭주하던 원인을 확인; close 호출 전에 해당 socket을 처리 완료로 표시하고 재연결을 한 번만 예약하도록 수정
- 초기 이관 뒤 Supabase와 로컬에 각각 추가된 행을 안전하게 합치기 위한 `home:db:sync:dry-run` 준비; 로컬 전용 행은 삭제하지 않고 최신 로컬 포트폴리오/대화/pending action과 가격 serial ID 충돌을 보호하며 apply는 cutover 승인 전 금지
- 실제 읽기 전용 dry-run에서 포트폴리오 계정·14개 포지션은 실질 차이 0, 로컬 전용 대화 7건·pending action 2건 보존 확인. 정렬된 기사 비교는 원격 신규 780건·내용 갱신 100건, 가격 이력은 신규 399건·갱신 1건으로 산출됐고 어떤 행도 쓰지 않음

## Codex 컨텍스트 원칙

- 자동 적재되는 루트 `AGENTS.md`는 12KiB 미만의 얇은 실행 지침으로 유지하고 새 세션은 이 문서를 다음 SSoT로 읽습니다.
- `docs/PROGRESS.md` 362줄 전체는 역사나 근거가 필요할 때만 부분 검색합니다.
- `README.md` 전체를 기본 컨텍스트로 적재하지 말고 필요한 명령·환경변수만 `rg`로 찾습니다.
- 한 작업의 commentary는 결과·현재 장애·다음 검증만 짧게 남깁니다.
- 긴 웹 자료와 미래 AI 조직 설계는 현재 경제 Agent 구현에 필요할 때만 `docs/future/AI_AGENT_TEAM_BLUEPRINT.md`에서 조회합니다.
- 대화에만 남은 운영 판단은 이 문서 또는 해당 전문 문서에 압축하고 다음 세션으로 넘깁니다.
- 향후 PC worker의 선택형 Codex 작업은 독립 작업마다 새 세션을 사용하고 같은 작업을 이어갈 때만 resume하며, 전체 Discord history 대신 12KiB 이하 작업 아티팩트를 전달합니다.

## 바로 이어서 할 일

1. 2026-08-06 11:50 KST부터 shadow 72시간 동안 heartbeat, 중복 실행, catch-up, 실패 알림 관찰
2. Windows PC worker 전환 후 `policy:radar -- --baseline-only`로 새 DB의 과거 알림을 기준선 처리하고, active 승인 단계에서 법제처 현행법령 8개와 정책 레이더 10:10/18:10 실행을 검증
3. shadow 통과 후 최종 Supabase 증분 동기화와 active 전환을 별도 승인 단계로 수행
4. active 전환 때 macOS 서비스를 다시 설치해 새 백업 키·외부 경로·예약 백업 설정을 LaunchAgent 환경에 반영

## 빠른 검증 명령

```bash
npm test
npm run agent:harness-check
npm run worker:service:status:macos
npm run home:check
```

`.env`, 봇 토큰, Webhook URL, 개인 포트폴리오 값은 문서나 로그에 남기지 않습니다.
