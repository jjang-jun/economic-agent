# Personal AI Organization Blueprint

## 문서 상태

이 문서는 향후 별도 프로젝트로 만들 수 있는 **개인 AI 조직 운영체제**의 설계 기준을 보존한다. 현재 `economic-agent`에 즉시 모두 구현하기 위한 요구사항이 아니다.

- 현재 프로젝트: 경제적 자유 달성을 돕는 **개인 AI 경제 사무실**
- 미래 프로젝트: 경제·개발·리서치·이메일·일정 등 여러 업무 조직을 운영하는 **개인 AI 조직 운영체제**
- 현재 프로젝트에서 검증된 데이터, 승인, 기록, 운영 패턴은 미래 운영체제의 첫 실전 사례로 재사용한다.

이 문서의 영상 관련 내용은 공개 시연과 설명을 분석한 결과다. 보이는 상호작용은 확인할 수 있지만, 내부 구현·기억 동기화 품질·실제 이메일 처리 내역까지 독립적으로 검증된 것은 아니다.

## 1. 비전

사용자는 모든 세부 작업을 직접 지시하는 운영자가 아니라 다음 책임을 가진 조직의 최종 의사결정자가 된다.

1. 가치와 우선순위를 담은 큰 목표를 정한다.
2. 에이전트가 가져온 결과를 `go`, `revise`, `stop/reset`으로 평가한다.
3. 부족한 결과에는 경험과 판단에 기반한 핵심 단서를 제공한다.
4. 돈·법률·대외 발송·삭제·배포 같은 고위험 행동을 최종 승인한다.

AI 조직은 목표를 작업으로 분해하고, 전문 에이전트를 배정하고, 산출물을 교차 검토하고, 결과와 배운 점을 기록한다.

```text
사용자 목표
  -> 총괄 에이전트가 계획·담당·완료 조건 정의
  -> 전문 에이전트가 병렬 작업
  -> 독립 검토자가 사실·리스크·품질 검증
  -> 총괄 에이전트가 결과 통합
  -> 사용자가 승인·수정·중단 판단
  -> 산출물·결정·성과·교훈 저장
```

## 2. 핵심 설계 원칙

### 2.1 얇은 요청, 두꺼운 맥락과 산출물, 얇은 스킬

- 사용자의 요청은 목표와 제약을 알아들을 수 있을 만큼 간결하게 유지한다.
- 장기 기억은 거대한 프롬프트 하나가 아니라 구조화된 데이터, 결정 기록, 회의록, 개발 저널, 코드와 산출물로 보존한다.
- 스킬은 하나의 명확한 문제를 해결하되 지나치게 세분화하거나 모든 문제를 한 스킬에 넣지 않는다.
- 잘 정의된 독립 스킬을 에이전트가 상황에 맞게 조합하게 한다.

### 2.2 단일 에이전트가 아니라 팀과 규율을 신뢰한다

- 한 에이전트의 자신감은 정확성의 증거가 아니다.
- 산출물에는 작성자와 다른 검토자를 둔다.
- 리스크가 큰 작업일수록 검토자의 컨텍스트와 이해관계를 작성자와 분리한다.
- 동일 에이전트가 자신의 승인 조건을 만족시켰다고 판정하지 못하게 한다.
- 다중 에이전트는 역할 수를 늘리는 것이 아니라 서로 다른 전문성·기억·검증 관점을 제공할 때만 가치가 있다.

### 2.3 SSoT가 먼저다

Discord 대화, 에이전트 메모리, 문서, DB가 같은 사실을 각각 다른 값으로 보관하지 않게 한다.

- 구조화된 사실·작업·결정·승인: 데이터베이스
- 코드와 버전 관리 산출물: Git
- 긴 설명·설계·회의록: 문서 저장소
- Discord: 대화와 상태 표시 인터페이스
- 모델 컨텍스트: 기준 저장소에서 필요한 만큼 가져온 작업 캐시

충돌할 때 어떤 저장소가 우선인지 엔터티별로 하나만 지정한다.

### 2.4 총괄은 사용자 응답성과 조율을 우선한다

- Discord에 연결된 총괄 에이전트는 긴 실무 작업을 직접 붙잡지 않는다.
- 실무는 worker/subagent/독립 세션에 위임하고 총괄은 사용자 메시지와 팀 상태를 계속 받을 수 있어야 한다.
- 작업 중 새 메시지는 분실하지 않고 현재 태스크 수정, 새 태스크, 참고 메모 중 하나로 분류한다.

### 2.5 기록은 부가물이 아니라 기억이다

다음 기록을 작업과 동시에 만든다.

- 목표와 완료 조건
- 작업 계획과 담당자
- 결정과 결정 이유
- 미해결 이슈와 가정
- 사용한 근거와 데이터 기준 시점
- 생성한 산출물과 버전
- 실패, 수정, 사용자 피드백
- 다음 세션이 읽을 요약

모든 채팅을 영구 기억하는 대신 반복적으로 유용한 지식만 장기 기억이나 스킬로 승격한다.

### 2.6 점진적으로 팀을 키운다

- 처음부터 10명 이상의 에이전트를 만들지 않는다.
- 새로운 역할은 기존 역할로 해결되지 않는 반복적인 실제 문제가 확인될 때 추가한다.
- 역할 추가 전 책임 중복, 메시지 증가, 비용, 검토 가치와 사용자 체감을 측정한다.
- 새 역할은 관찰 모드에서 시작해 읽기, 제안, 제한적 쓰기 순서로 권한을 높인다.

## 3. 기본 개념

### 3.1 Bot, Agent, Instance, Project

```text
Discord Bot/App
  = 사용자가 보는 이름, 아바타, 멘션 주소, 온라인 상태

Agent
  = 역할 + 행동 규칙 + 기억 + 도구 + 모델 + 품질 계약

Agent Instance
  = 특정 컴퓨터/세션에서 실행되는 Agent 복제본
    예: CHIEF-WIN-HOME, CHIEF-MACBOOK

Project
  = 목표, 참여자, 작업, 산출물, 결정 기록을 묶는 협업 경계
```

Discord에 봇이 여러 개 보인다고 반드시 독립 에이전트인 것은 아니다. 반대로 하나의 Discord Gateway Bot 뒤에서 여러 독립 에이전트가 동작할 수도 있다.

### 3.2 정체성과 실행 위치를 분리한다

```json
{
  "agent_id": "chief",
  "instance_id": "chief:windows-home:01",
  "host": "windows-home",
  "session_id": "runtime-session-id",
  "capabilities": ["planning", "routing", "status"],
  "status": "online"
}
```

- `agent_id`는 전문성과 장기 기억의 주체다.
- `instance_id`는 실제 실행 프로세스다.
- 동일 에이전트 인스턴스가 여러 개면 router가 하나에만 작업 lease를 부여한다.
- 호스트별 자격증명과 도구 권한은 공유 기억과 분리한다.

## 4. 권장 시스템 구조

```text
Discord / Mobile / CLI
        │
        ▼
Conversation Gateway
  - 사용자·서버·채널 allowlist
  - 메시지 서명·중복 제거
  - mention / to / cc 해석
  - project / thread / reply 연결
        │
        ▼
Task & Message Bus
  - task envelope
  - queue / lease / retry / timeout
  - loop limit / reply budget
        │
        ├─ Chief / PM
        ├─ Specialist agents
        ├─ Independent reviewers
        └─ Journaler
        │
        ▼
Tool Gateway
  - 파일·Git·브라우저·DB·이메일·일정
  - 역할별 최소 권한
  - 외부 승인 서비스
        │
        ▼
SSoT & Artifacts
  - projects / tasks / messages
  - decisions / approvals / incidents
  - memories / skills / evaluations
  - documents / code / reports
```

Cloud Gateway와 개인 PC worker를 분리하면 외부에서는 항상 메시지를 받을 수 있고, 구독형 Codex 작업은 개인 PC에서 실행할 수 있다.

```text
Discord
  -> Cloud Gateway
  -> DB 작업 큐
  -> Windows/Mac local worker
  -> Codex/기타 agent session
  -> 결과 저장
  -> Discord 응답
```

개인 PC가 꺼져 있으면 작업은 `queued/offline`으로 표시한다. 24시간 즉시 실행이 필요한 태스크는 별도 cloud model/runtime이 필요하다.

## 5. Discord 협업 프로토콜

### 5.1 사용자 경험

```text
@AI-OFFICE
to: @RESEARCH
cc: @DATA @LEGAL
project: competitor-analysis

목표: 경쟁사 신규 요금제가 우리 계획에 미치는 영향을 분석해줘.
완료 조건: 공식 근거, 가격 비교표, 주요 위험, 다음 행동 3개.
```

초기 구현은 다음 조합을 권장한다.

- 실제 입력 수신: Gateway Bot 1개
- 전문 에이전트 선택: Discord 역할 또는 명시적 `to/cc`
- 전문 에이전트 출력: 이름·아바타를 구분한 Webhook
- 정확한 온라인 멤버 표시가 필요해진 역할만 별도 Bot으로 승격

여러 실제 Bot을 먼저 만들면 토큰·연결·권한·봇 간 무한대화 관리가 역할 수만큼 늘어난다.

### 5.2 메시지 Envelope

```json
{
  "message_id": "discord-message-id",
  "conversation_id": "project-or-thread-id",
  "project_id": "competitor-analysis",
  "from": { "type": "human", "id": "discord-user-id" },
  "to": ["research"],
  "cc": ["data", "legal"],
  "reply_to": null,
  "task_id": "task-id",
  "priority": "normal",
  "hop_count": 0,
  "approval_required": false
}
```

### 5.3 `to`와 `cc`

`to`:

- 실행 책임자다.
- 수신 확인과 진행 상태를 내야 한다.
- 결과 또는 명시적인 blocker를 반환한다.
- 필요 시 추가 전문가를 제안할 수 있다.

`cc`:

- 현재 문맥과 결과를 참고한다.
- 기본적으로 답하지 않는다.
- 사실 오류, 전문 위험, 이해관계 충돌, 사용자 승인 필요를 발견했을 때 개입한다.
- 검토가 필요한 산출물의 reviewer 후보가 된다.

동적 합류:

- 계약·저작권·대외 공개 -> 법무
- 개인정보·자격증명·외부 입력 -> 보안
- 숫자·통계·성과 주장 -> 데이터 검증
- 비용·구매·투자·거래 -> 재무/리스크
- 배포·삭제·권한 변경 -> 운영/감사

낮은 위험의 읽기·검토는 PM이 자동으로 `cc`할 수 있다. 새로운 쓰기 권한이나 외부 행동이 필요하면 사용자가 승인한다.

### 5.4 봇 간 루프 방지

- 자기 자신이 보낸 메시지는 무시한다.
- `to/cc`에 없는 봇 메시지는 전달하지 않는다.
- Discord message ID와 task ID로 중복을 제거한다.
- `hop_count`, 태스크당 reply budget, 최대 토론 라운드를 둔다.
- 에이전트가 새 에이전트를 추가할 수 있는 범위를 project policy로 제한한다.
- 같은 의견 반복은 토론이 아니라 중복으로 판정한다.
- 작업이 없으면 명시적으로 대기 상태로 돌아간다.

## 6. 역할과 페르소나

페르소나는 연극적인 말투보다 행동 계약이어야 한다.

```yaml
id: legal
display_name: Legal Reviewer
mission: 대외 공개와 계약 관련 위험을 발견하고 완화한다
owns:
  - contract_review
  - copyright_review
can_read:
  - project_artifacts
  - public_sources
can_write:
  - review_comments
cannot:
  - sign_contracts
  - send_external_messages
must_escalate:
  - money_commitment
  - binding_legal_language
reply_contract:
  - risk
  - evidence
  - required_change
  - residual_uncertainty
memory_scope: role_and_project
```

초기 공통 조직 예시:

- `CHIEF`: 사용자 응대, 목표·우선순위·팀 조율
- `PM`: 작업 분해, 담당·의존성·완료 조건 관리
- `RESEARCH`: 외부 정보와 근거 조사
- `DATA`: 수치·실험·성과·데이터 품질 검증
- `ENGINEERING`: 코드와 시스템 구현
- `DESIGN`: 사용자 경험과 시각 결과물
- `LEGAL`: 계약·저작권·규제 검토
- `SECURITY`: 비밀값·권한·외부 입력·공격 표면 검토
- `AUDITOR`: 독립 품질 검수와 승인 규칙 점검
- `JOURNALER`: 회의록·결정·handoff 기록의 단일 writer

모든 프로젝트에 전원을 넣지 않는다. 프로젝트에 필요한 최소 팀만 참여시킨다.

## 7. 프로젝트와 작업 수명주기

### 7.1 프로젝트 시작

1. 목표와 성공 조건을 정의한다.
2. 하지 않을 범위를 명시한다.
3. PM과 초기 참여자를 정한다.
4. 기준 문서와 SSoT를 연결한다.
5. 위험 등급과 승인 정책을 정한다.
6. 태스크와 의존성을 만든다.

### 7.2 작업 실행

1. 담당자는 필요한 맥락만 로드한다.
2. 작업 중간 산출물을 inspectable artifact로 남긴다.
3. PM은 진행 상태와 blocker를 갱신한다.
4. 전문 위험이 나타나면 reviewer를 동적으로 추가한다.
5. 사용자의 새 피드백은 관련 태스크와 결정 기록에 연결한다.

### 7.3 완료와 검증

완료는 에이전트의 선언이 아니라 측정 가능한 조건으로 판정한다.

- 필수 산출물 존재
- 테스트·검증 결과
- 근거와 기준 시점
- 독립 reviewer 결과
- 미해결 위험
- 사용자 승인 필요 여부

### 7.4 종료와 학습

- 프로젝트 요약과 다음 행동을 기록한다.
- 실패 원인과 사용자 피드백을 구조화한다.
- 반복 가능한 방법만 skill 후보로 만든다.
- 근거가 부족하거나 일회성인 내용은 장기 지식으로 승격하지 않는다.

## 8. 기억과 컨텍스트 모델

### 8.1 기억 종류

- 사실 기억: 사용자·조직·프로젝트의 검증된 현재 상태
- 사건 기억: 무엇이 언제 왜 일어났는지
- 절차 기억: 반복 가능한 workflow와 skill
- 결정 기억: 선택지, 결정, 근거, 승인자
- 성과 기억: 예상과 실제 결과, 실패 유형
- 선호 기억: 사용자의 형식·속도·위험 선호
- 런타임 상태: 어느 host/session이 어떤 task를 처리 중인지

### 8.2 기억 승격과 망각

- 대화 원문은 감사 로그로 저장하되 매번 전부 컨텍스트에 넣지 않는다.
- 반복 확인된 지식만 장기 기억으로 승격한다.
- 변경 가능한 사실은 `valid_from`, `valid_until`, source를 가진다.
- 서로 충돌하는 기억은 임의로 합치지 않고 conflict로 표시한다.
- 오래된 프로젝트 세부사항은 요약하고 원문 링크만 남긴다.
- 사용자가 삭제를 요청한 기억은 파생 요약과 인덱스까지 함께 처리한다.

### 8.3 권장 엔터티

```text
agents
agent_instances
projects
project_members
tasks
messages
artifacts
decisions
approvals
memory_entries
skills
evaluations
incidents
```

## 9. 이메일 비서

개인 이메일은 높은 가치와 높은 위험을 동시에 가진다. 첫 버전은 **읽기·분류·Draft 생성만** 허용한다.

```text
새 메일
  -> 발신자·제목·중요도 분류
  -> 필요한 메시지만 본문 조회
  -> 법무·재무·보안 위험 검토
  -> 회신 초안 작성
  -> Gmail Draft 생성
  -> Discord에 요약과 Draft 링크
  -> 사용자가 Gmail에서 검토 후 직접 발송
```

안전 원칙:

- 개인 Gmail OAuth 토큰을 모델이나 일반 shell에 노출하지 않는다.
- 별도 이메일 서비스가 토큰을 보유하고 제한된 `search/read/createDraft` 도구만 제공한다.
- `send`, `delete`, `forward`, `changeFilter`는 초기 도구 목록에 포함하지 않는다.
- 자동 발송과 자동 계약 동의는 금지한다.
- 민감 메일은 본문 저장과 모델 전송 정책을 별도로 둔다.
- 사용자에게 수신자, CC, 제목, 초안 내용을 명확히 보여준다.

## 10. 권한과 승인

### 10.1 위험 등급

- L0: 공개 데이터 읽기, 계산, 초안
- L1: 프로젝트 파일 생성·수정, 되돌릴 수 있는 내부 기록
- L2: 배포, 외부 Draft 생성, 캘린더 초안, 권한 요청
- L3: 외부 발송, 비용 발생, 데이터 삭제, 계정 변경
- L4: 거래 주문, 계약 체결, 자금 이동, 복구 불가능한 행동

L2 이상은 정책에 따라 사람 승인을 요구한다. L4는 장기간 검증 전까지 도구 자체를 제공하지 않는다.

### 10.2 승인은 에이전트 밖에서 검증한다

- 승인 레코드는 별도 서비스가 생성·검증한다.
- 승인자는 allowlist의 인간 사용자 ID여야 한다.
- 에이전트와 봇 메시지는 승인 주체가 될 수 없다.
- 승인에는 대상 action hash, 만료 시각, 1회 사용 nonce를 둔다.
- action 내용이 바뀌면 기존 승인은 무효다.
- 미응답과 timeout은 거절로 처리한다.

프롬프트에 `사용자에게 Y를 물어봐라`라고 쓰는 것만으로는 안전 경계가 되지 않는다.

## 11. 품질과 드리프트 관리

에이전트의 상태를 인간의 감정으로 단정하지 않는다. 관찰 가능한 행동 신호로 관리한다.

- 근거 없는 확신 증가
- 같은 오류 반복
- 과도한 자기 비난이나 장황한 해명
- 목표보다 쉬운 산출물로 조기 종료
- 승인 조건 우회
- source 충돌을 숨기고 임의 결론
- 컨텍스트 한도 근접 후 누락 증가
- 다른 에이전트 의견에 쉽게 흔들림

대응:

1. 작업을 중단하고 현재 상태를 보존한다.
2. 컨텍스트 독립적인 reviewer가 로그와 지침을 검사한다.
3. 프롬프트보다 데이터·도구·완료 조건을 먼저 점검한다.
4. 역할 기억을 재구성하고 불필요한 기억을 제거한다.
5. 작은 검증 태스크로 복귀 여부를 판단한다.

## 12. 평가 지표

에이전트 수, 대화량, 토큰 소비를 성공으로 보지 않는다.

- 목표 완료율과 완료까지 걸린 시간
- 사용자 수정 없이 채택된 결과 비율
- 사실 오류와 근거 누락률
- 독립 검토에서 발견된 결함 수
- 승인 없이 시도한 고위험 행동 수
- 중복 메시지와 무의미한 토론 비율
- 사용자 개입 횟수와 병목 시간
- 작업당 모델·컴퓨팅 비용
- 기억 회수 정확도와 stale memory 비율
- 생성한 skill의 재사용률과 실제 개선 효과

## 13. Hermes Agent에서 참고할 부분

Hermes Agent는 다음 기반을 이미 제공하는 오픈소스 후보다.

- Discord·Slack·Email 등을 연결하는 Gateway
- 지속 세션과 메모리 검색
- personality와 channel별 system prompt/model
- cron 자동화와 병렬 subagent
- local, Docker, SSH, Windows 등 여러 실행 backend
- 사용자 allowlist, pairing, 위험 명령 승인, sandbox

그러나 다음은 별도 검증·구현 대상으로 본다.

- `to/cc` 기반 장기 전문 에이전트 팀 프로토콜
- 여러 독립 main-agent 간 정확한 메시지 라우팅
- PM의 동적 전문가 합류와 권한 정책
- Draft-only 개인 이메일 정책
- 사람만 승인할 수 있는 외부 승인 경계
- 조직 전체 SSoT와 성과 평가 모델

따라서 미래 프로젝트를 Hermes로 즉시 고정하지 않는다. 격리된 PoC에서 Gateway·기억·보안·Windows 실행을 평가하고, 필요한 개념이나 MIT 라이선스 코드를 선택적으로 활용한다.

## 14. Codex와 구독형 사용의 위치

- Codex는 전문 worker나 코드·리서치 실행 세션으로 사용할 수 있다.
- 메인 Discord Gateway와 승인 서비스는 Codex 세션과 분리한다.
- 개인 PC의 구독 인증 세션을 활용하려면 PC가 켜져 있고 local worker가 실행 중이어야 한다.
- ChatGPT 웹 UI를 스크래핑하거나 비공식 자동화하지 않는다.
- 24시간 cloud 실행은 API/provider 비용과 데이터 처리 정책을 별도로 평가한다.
- subagent는 한 작업의 분업에 적합하고, 장기 전문 팀원은 별도 agent identity, memory, session registry가 필요하다.

## 15. 단계별 구현 계획

### Phase 0: 설계와 경계

- 목표, 비목표, 인간 책임 정의
- SSoT와 승인 모델 확정
- Discord UX와 task envelope 정의
- 3~4개 초기 역할 선정

완료 조건: 샘플 프로젝트를 종이 설계상 끝까지 추적할 수 있다.

### Phase 1: 단일 Gateway와 역할 라우팅

- Discord Gateway Bot
- 사용자·guild·channel allowlist
- mention과 `to/cc` 파서
- 역할별 Webhook 출력
- projects/tasks/messages 저장

완료 조건: 하나의 프로젝트에서 담당·참고·답글 라우팅이 중복 없이 동작한다.

### Phase 2: 전문 worker와 산출물

- Chief/PM과 2~3개 specialist
- task queue, lease, timeout, retry
- 문서·코드 artifact 연결
- 별도 Journaler와 handoff 요약

완료 조건: 총괄이 사용자에게 응답 가능한 상태로 실무를 위임하고 결과를 통합한다.

### Phase 3: 검토와 동적 팀 구성

- 독립 reviewer
- 전문 위험에 따른 동적 `cc`
- 완료 조건 검증
- agent/team 성과 지표

완료 조건: 법무·보안·데이터 위험 사례에서 필요한 reviewer만 합류하고 불필요한 대화가 발생하지 않는다.

### Phase 4: 여러 장치와 장기 기억

- Windows/Mac/cloud instance registry
- task lease와 heartbeat
- 기억 승격·요약·망각
- 동일 agent 여러 instance의 충돌 방지

완료 조건: 한 장치가 중단돼도 상태가 유실되지 않고 중복 실행되지 않는다.

### Phase 5: 개인 비서 도구

- Gmail 읽기·분류·Draft-only
- 캘린더 조회·일정 초안
- 승인 서비스와 action hash
- 민감 데이터 처리 정책

완료 조건: 외부 발송 권한 없이 유용한 초안을 만들고 모든 변경을 사람이 검토한다.

### Phase 6: 제한적 자동화와 자체 개선

- 반복 작업 cron
- 실패·사용자 수정 기반 skill 후보
- 검증 후 skill 승격
- 비용·성과 기반 모델/effort 선택

완료 조건: 자동 생성된 skill이 고정 평가셋에서 기존 방식보다 개선되고, 사람이 승인해야 활성화된다.

## 16. 현재 프로젝트와의 관계

`economic-agent`는 이 미래 운영체제의 첫 실전 도메인으로 본다.

재사용 가능한 기반:

- Supabase SSoT와 로컬 미러
- 뉴스·정책·가격·포트폴리오 도구
- 추천과 실제 실행을 분리한 성과 평가
- pending action과 사람 승인
- Discord 목적별 채널과 Webhook
- Cloud Run Gateway와 개인 worker 분리 가능성
- 운영 점검, 실패 알림, 데이터 신선도 표시

현재 프로젝트에 넣지 않을 범위:

- 범용 개발·법무·디자인 조직
- 개인 이메일·일정 전체 접근
- 여러 프로젝트의 독립 agent team orchestration
- 다수 Discord Bot 계정과 bot-to-bot 자유 대화
- 일반 목적의 recursive self-improvement 플랫폼

현재 프로젝트의 목표 달성에 필요한 기능만 경제 도메인 안에서 구현하고, 범용화는 이 문서를 기준으로 별도 프로젝트에서 시작한다.

## 17. 참고 자료

- 시연 영상: [12개의 AI 에이전트 팀 운영 인터뷰](https://www.youtube.com/watch?v=0huA3Fx7NVc&t=21s)
- Hermes Agent: [공식 GitHub](https://github.com/NousResearch/hermes-agent)
- Hermes Messaging Gateway: [공식 문서](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/)
- Hermes Security: [공식 문서](https://hermes-agent.nousresearch.com/docs/user-guide/security/)
- Hermes Email Gateway: [공식 문서](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/email)
- Discord Bots: [공식 문서](https://docs.discord.com/developers/platform/bots)
- Discord Gateway와 Message Content: [공식 문서](https://docs.discord.com/developers/events/gateway)
- Gmail Draft API: [공식 문서](https://developers.google.com/workspace/gmail/api/guides/drafts)
- Codex Subagents: [공식 문서](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- Codex Authentication: [공식 문서](https://learn.chatgpt.com/docs/auth)
