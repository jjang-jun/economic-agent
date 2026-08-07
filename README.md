# Economic Agent

Economic Agent는 **경제적 자유 목표 달성 확률을 높이기 위한 개인 AI 경제 사무실**입니다. 경제 뉴스·공시·정책·가격·자금 흐름·포트폴리오를 하나의 검증 가능한 의사결정 루프로 연결하고, 사용자가 더 나은 투자·자산관리 판단을 내리도록 보조합니다.

AI는 분석 참모이며 최종 판단자나 자동 주문자가 아닙니다. 외부 행동과 자산 변경은 사람이 확인하고 승인합니다.

핵심 목적은 네 가지입니다.

1. 순자산과 경제적 자유 목표의 현재 상태를 정확히 추적한다.
2. 중요한 경제·시장·정책 변화를 놓치지 않고 내 포트폴리오에 미치는 영향으로 변환한다.
3. 행동 후보에 손익비·비중·손절·무효화 조건을 적용하고 생존 위험을 먼저 검토한다.
4. 추천·사용자 결정·실제 거래·포트폴리오 성과를 분리 기록해 무엇이 목표 달성에 기여했는지 검증한다.

범용 개발팀·법무팀·이메일 비서까지 포함하는 개인 AI 조직 운영체제는 현재 저장소의 직접 범위가 아닙니다. 그 미래 설계는 [`docs/future/AI_AGENT_TEAM_BLUEPRINT.md`](docs/future/AI_AGENT_TEAM_BLUEPRINT.md)에 별도로 보존합니다.

## 주요 기능

- **실시간 뉴스 수집** — Agent Server + Scheduler가 연합뉴스, 매일경제, 한국경제, Bloomberg RSS 피드와 DART 공시를 5분 주기로 수집
- **보수적 속보 필터링** — 키워드/중요도 5점만으로 보내지 않고, 보유 종목(또는 `watchlist.criticalAlerts`)의 치명적 공시와 시장 전체 긴급 사건만 즉시 알림
- **장중 시장 급락 감시** — KOSPI/KOSDAQ이 -3%, -5%, -8%를 하향 돌파하면 단계별 Discord 경보를 하루 한 번씩 전송
- **FinBERT 감성 분석** — 영문 기사는 금융 특화 ML 모델로 호재/악재 판단 (로컬, 무료)
- **감성 강도 표시** — 강한 호재/호재/약한 호재/중립/약한 악재/악재/강한 악재 7단계
- **섹터 자동 분류** — 반도체, 에너지·원자재, 금융·통화, 부동산, 거시경제, 테크, 무역·지정학, 공시·기업이벤트
- **DART 공시 수집** — 주요 공시를 뉴스와 함께 스코어링하여 기업 이벤트 반영
- **정책·자산 레이더** — 재정경제부·금융위원회·국토교통부 공식 발표를 세금·부동산·대출·연금·자본시장으로 분류하고 정부안/정정/입법예고/시행 상태와 행동 주의를 Discord 분야별 채널로 전달
- **부동산 매수 검토 레이더** — 서울·경기 5.8억~9.5억원 아파트의 국토교통부 매매·전월세를 매일 재수집하고 거래량·중위가격·전세가율·계약해제를 분리해 저점에 가까운 검토 구간을 탐색
- **부동산 장기 기준선** — 한국부동산원 월간 아파트 매매가격지수의 서울·경기 1·3·12개월 변화와 24개월 고점 대비 낙폭을 실거래와 별도 저장
- **Discord 리포트·대화 인프라** — 분야별 Webhook 리포트, 서명 검증 비공개 Slash 조회, 허용 채널의 봇 멘션 자연어 조회와 거래 초안·승인 버튼 지원
- **경제 도메인 전문가 팀** — 하나의 `@Economic Agent` 뒤에서 투자·부동산·세금/연금·포트폴리오·리스크·데이터 검증 담당을 역할별 SSoT와 독립 AI 컨텍스트로 라우팅하고, 의사결정 질문만 제한적으로 `to/cc` 교차검토
- **프리마켓 스냅샷** — 개장 전/미국장 오픈 브리핑에 관심 지수·종목·원자재 가격 반영
- **시장 레짐 추세 점수** — KOSPI/KOSDAQ/S&P/Nasdaq/반도체 5일·20일 흐름으로 RISK_ON/OFF 보강
- **글로벌 ETF 자금이동 프록시** — 주식·지역·섹터·채권·금·달러 ETF 19개의 가격·거래량·상대강도로 위험선호/회피를 교차점검
- **고정 자금 흐름 브리핑** — Discord 다이제스트에 KOSPI 외국인·기관 당일/5일 순매수를 항상 표시하고, 장 마감 리포트에는 글로벌 ETF 프록시를 별도로 표시
- **하루 5회 AI 다이제스트** — 시장 이벤트 시간대에 맞춘 뉴스 요약 브리핑
- **장 마감 종목 분석** — AI 기반 섹터/종목 인사이트 리포트
- **추천 성과 추적** — 종목 신호를 저장하고 1일/5일/20일 후 수익률 평가
- **Shadow 후보 평가** — 실제 매매 기준은 유지하면서 스키마를 통과한 리스크 차단 후보를 별도 연구 코호트로 1일/5일/20일 평가
- **추천 리스크 평가** — 추천 후 최대상승률, 최대하락률, 손절선/목표구간 터치 여부 추적
- **기업가치평가 필터** — PER/PSR/FCF 수익률과 성장/현금흐름을 함께 봐 고평가 추격 후보를 관찰로 낮춤
- **일일 행동 리포트** — 신규 매수/관찰/보유/축소/매도 후보를 포트폴리오 기준으로 분리
- **경제적 자유 추적** — 목표 순자산, 현재 달성률, 예상 달성 시점 계산
- **현금흐름 조정 계좌 성과** — 입출금 원장을 일자 가중한 linked Modified Dietz 수익률·연환산 MWR로 계산하고 같은 구간 KOSPI와 비교
- **히스토리 영구 저장** — 홈 서버 PostgreSQL에 기사, 리포트, 추천, 성과, 시장 스냅샷 저장
- **로컬 분석 미러** — PostgreSQL 데이터를 JSON과 SQLite로 내려받아 로컬 파일시스템에서 직접 질의
- **AI 토큰 예산 관리** — 중요도 상위 기사와 핵심 가격 스냅샷만 AI 프롬프트에 투입

## 아키텍처

```
5분마다 ─ Agent Server 뉴스 수집 파이프라인 (무료)
  KOSPI/KOSDAQ 장중 낙폭 확인 → -3%/-5%/-8% 단계별 중복 없는 시장 경보
  RSS 피드 (연합뉴스, 매경, 한경, Bloomberg) + DART 공시
      ↓
  1단계: 키워드 필터
      ↓
  2단계: 스코어링 (키워드 가중치 + FinBERT 감성 + 섹터 분류)
      ↓
  Supabase articles + 일별 기사 아카이브 저장
      ↓
  score 5 → 속보 정책(중요도 5 + 긴급도 4.5 + 개인/시장 영향) 통과 시 즉시 알림
          → 거래정지 해제·불성실공시 예고 등 나머지는 다이제스트 버퍼
  score 4 → 다이제스트 버퍼

평일 하루 5회 ─ AI 다이제스트
  버퍼 기사 수집 → AI 요약 → Discord 발송 성공 후 버퍼 비움

평일 10:10·18:10 ─ 정책·자산 레이더 (AI 비용 없음)
  정부 공식 RSS/보도자료 → 정책 분야·법적 단계 분류 → 변경 이력 저장
  → 정부안은 행동 보류, 공포·시행은 적용일 점검 → Discord 정책 채널

매일 03:20 ─ 부동산 공식 데이터 (설정 시, AI 비용 없음)
  국토교통부 아파트 매매·전월세 최근 2개월 재조회
  → 목표 가격대 실거래 + 전세 하방 + 지역월 거래량/중위가격 저장
  → 바닥 확정이 아닌 매수 검토 단계 분류

매일 03:50 ─ 호가 스냅샷 (허가받은 feed 설정 시에만)
  외부 호가 JSON feed → 출처·검증 상태를 보존해 실거래와 별도 저장

월요일 04:10 ─ 한국부동산원 지수 (R-ONE 키 설정 시)
  월간 아파트 매매가격지수 24개월 → 1·3·12개월 변화와 24개월 고점 대비 낙폭

하루 1회 ─ 종목 분석 (AI 1회/일)
  일별 기사 + 글로벌 ETF 가격·거래량 자금이동 프록시 → AI 섹터/종목 분석 → Discord 발송
      ↓
  승인 후보만 추천 로그 저장 → 같은 거래일 KOSPI 종가 대비 1/5/20 거래일 성과 평가

상시 ─ 히스토리 저장
  기사/요약/리포트/추천/성과/시장 스냅샷(5일/20일 추세 포함) → 로컬 JSON + Supabase 병행 저장
  npm run db:pull → data/supabase/*.json + data/economic-agent.db 로컬 미러 생성
```

## 다이제스트 스케줄

| 시간 (KST) | 세션 | 의미 |
|:---:|------|------|
| 🌅 08:20 | 개장 전 브리핑 | KRX 호가 접수 전, 미국장 마감 + 국내 개장 체크 |
| ☀️ 11:50 | 오전장 점검 | 오전장 흐름 + 오후장 체크 |
| 🔔 15:45 | 장 마감 브리핑 | KRX 정규장 마감 직후 |
| 🌆 17:10 | 유럽장 체크 | 유럽장 초반 + 국내 시간외/미국 프리마켓 |
| 🇺🇸 22:40 | 미국장 오픈 브리핑 | 미국 주요 지표/정규장 오픈 + 다음날 국내 영향 |

정기 다이제스트 5개와 하루 단위 장 마감·행동·성과 리포트는 그대로 유지합니다. 실시간으로 반복될 수 있는 속보·선행신호·타이밍 알림만 엄격하게 제한합니다.

부동산 레이더의 설정·판단 단계·데이터 지연과 호가 출처 원칙은 [`docs/REAL_ESTATE_STRATEGY.md`](docs/REAL_ESTATE_STRATEGY.md)를 따릅니다. 최초 실행에는 공공데이터포털의 아파트 매매·전월세 API 활용신청과 `PUBLIC_DATA_API_KEY` 설정이 필요합니다.

스케줄은 KRX 정규장 09:00~15:30과 호가 접수 08:30, 미국 정규장 09:30~16:00 ET, 미국 주요 지표의 08:30/10:00 ET 발표 시간, 유럽장 초반 흐름을 기준으로 맞췄습니다.

GitHub Actions 지연으로 개장 전 브리핑이 09:00 이후 도착하면 실제 KST 시각에 맞춰 오전장 점검으로 자동 전환합니다. 시장 스냅샷에는 가격 기준 시각과 신선도(`fresh`, `previous-close`, `stale`)를 함께 넣고, 장중의 오래된 국내 지수는 현재 시장 분위기 판정에서 제외합니다. 신선한 지수·반도체·VIX 가격 흐름이 AI의 `market_mood`와 강하게 충돌하면 규칙 기반 검증기가 분위기를 교정하며, Discord에는 `단기 가격판정`, `중기 추세`, 제외한 오래된 시세와 AI 초안 보정 여부를 따로 표시합니다.

## 프로젝트 구조

```
src/
├── check-news.js              # 뉴스 수집 CLI entrypoint
├── jobs/run-news-collector.js # Agent Server/CLI 공용 뉴스 수집 job
├── server/index.js            # Cloud Run Agent Server + Discord Interaction + collector endpoint
├── digest.js                  # AI 다이제스트 생성 + 발송 (하루 5회)
├── stock-report.js            # 장 마감 종목 분석 (하루 1회)
├── evaluate-recommendations.js # 추천 성과 평가
├── sources/
│   ├── rss-fetcher.js         # RSS 수집 (4개 소스)
│   ├── dart-api.js            # DART 공시 수집
│   ├── bok-api.js             # 한국은행 기준금리 API
│   ├── fred-api.js            # FRED 미국 경제지표 API
│   ├── price-provider.js      # 가격 소스 우선순위 라우터
│   ├── kis-api.js             # 한국투자증권 Open API REST 가격 조회
│   ├── krx-openapi.js         # KRX Open API 공식 일별매매정보
│   ├── alpaca-api.js          # 미국 주식 실시간/히스토리 provider 후보
│   ├── fmp-api.js             # 해외 주식 가격/재무/실적 provider 후보
│   ├── alpha-vantage-api.js   # 해외 주식 fallback 가격 provider
│   ├── tiingo-api.js          # 해외 EOD/조정주가 fallback provider
│   ├── naver-finance.js       # 국내 종목 현재가 fallback
│   └── yahoo-finance.js       # 해외 종목/글로벌 fallback 가격 조회
├── filters/
│   ├── keyword-filter.js      # 1단계: 키워드 필터
│   ├── local-scorer.js        # 2단계: 로컬 스코어링 (FinBERT + 키워드)
│   ├── finbert.js             # FinBERT 금융 감성 분석 (영문)
│   ├── sentiment-dictionary.js # 한국어/공시 감성 사전
│   └── relevance-matcher.js   # 3단계: 개인 관련성 매칭
├── analysis/
│   ├── digest.js              # AI 다이제스트 프롬프트
│   └── stock-analyzer.js      # AI 종목/섹터 분석 프롬프트
├── notify/
│   ├── reports.js             # 공용 리포트 포맷과 Discord 전달
│   ├── policy-report.js       # 정책 레이더 포맷과 채널 분기
│   ├── discord-reports.js     # Discord 리포트 활성화·전송 계약
│   └── discord.js             # Webhook, Markdown, Embed, 메시지 분할
├── config/
│   ├── keywords.js            # 목적별 키워드 설정 통합 facade
│   ├── market-keywords.js     # 시장 국면/거시 키워드
│   ├── stock-keywords.js      # 종목/섹터 키워드
│   ├── disclosure-keywords.js # DART/공시 이벤트 키워드
│   ├── interests.js           # 개인 관심사
│   ├── watchlist.js           # 프리마켓/시장 스냅샷 관심 종목
│   ├── capital-flow-etfs.js   # 글로벌 자금이동 프록시 ETF 바스켓
│   ├── portfolio.js           # 포트폴리오/리스크 제약
│   ├── price-source-policy.js # KIS/Naver/Yahoo 가격 소스 우선순위
│   └── ai-budget.js           # AI 프롬프트 토큰 예산
└── utils/
    ├── ai-client.js           # AI 제공자 추상화 (멀티 프로바이더)
    ├── ai-budget.js           # AI 입력 데이터 선별/축약
    ├── article-identity.js    # 기사 중복 제거용 id/URL/제목 정규화
    ├── article-archive.js     # 점수화 기사 일별 아카이브
    ├── article-buffer.js      # 기사 버퍼 관리
    ├── config.js              # 공통 설정
    ├── recommendation-log.js  # 추천 저장 및 성과 평가
    ├── action-report.js       # 신규 매수/관찰/보유/축소/매도 후보 분리
    ├── freedom-engine.js      # 경제적 자유 목표/달성률/예상 달성 시점 계산
    ├── position-sizer.js      # 손실 허용액/현금/종목/섹터/레짐 기준 매수금액 계산
    ├── risk-reviewer.js       # 추천 전 리스크 관리자/factor 검토
    ├── market-snapshot.js     # 프리마켓/글로벌 가격 스냅샷
    ├── market-stress-monitor.js # KOSPI/KOSDAQ 장중 단계별 급락 감시
    ├── capital-flow-radar.js  # ETF 가격·거래량 기반 자금이동 프록시
    ├── decision-engine.js     # 시장 레짐/행동 가드레일
    ├── portfolio.js           # 로컬 포트폴리오 파일 로딩
    ├── persistence.js         # Supabase 히스토리 저장
    ├── seen-articles.js       # 중복 기사 관리
    ├── indicators.js          # 경제지표/투자자 수급 수집
    └── daily-summary.js       # 일일 요약 저장
```

Cloud Run 자동 배포는 루트의 `cloudbuild.yaml`을 사용합니다. 배포 이미지 태그, revision label, 런타임 `COMMIT_SHA`를 같은 Git 커밋으로 맞춰 `/version`과 배포 최신성 점검이 실제 실행 코드를 정확히 가리키게 합니다.

## Codex 작업 지침

Codex에서 작업할 때는 저장소 루트의 `AGENTS.md`를 기준으로 프로젝트 구조, 실행 명령, 환경 변수, 변경 기록 규칙을 따릅니다.

장시간 이어지는 작업, 여러 파일을 건드리는 변경, sub-agent를 쓰는 작업은 `docs/AGENT_HARNESS.md`의 작업 계약과 검증 루프를 따릅니다. 문서 맵을 바꾼 뒤에는 아래 점검을 실행합니다.

```bash
npm run agent:harness-check
```

## 로드맵

개인 AI 경제 사무실로서 시장 파악, 자산 영향 분석, 포트폴리오 행동, 리스크 관리, 성과 검증을 강화하는 장기 계획은 `ROADMAP.md`에 정리되어 있습니다.

향후 별도 프로젝트에서 사용할 개인 AI 조직 운영체제와 다중 에이전트 팀 설계는 `docs/future/AI_AGENT_TEAM_BLUEPRINT.md`에 정리되어 있습니다. 현재 저장소에는 경제적 자유 목표에 직접 필요한 도메인 기능만 구현합니다.

개발 진행 상황과 현재 운영 컨텍스트는 `docs/PROGRESS.md`에 기록합니다.

홈 PC worker의 72시간 전환 판정은 `npm run worker:shadow-audit`으로 기대 스케줄, 실제 shadow 기록, 누락·지연과 Gateway heartbeat를 함께 확인합니다.

대화형 Agent 실행 플랫폼은 `docs/AGENT_PLATFORM.md`에 정리되어 있습니다. Discord가 분야별 리포트·비공개 Slash 조회·멘션 초안과 승인·경제 도메인 전문가 `to/cc`를 담당합니다. 목표 운영은 항상 켜진 Node.js PC worker가 즉시 요청과 정기 작업을 맡고, 홈 서버 PostgreSQL을 기준 저장소로 쓰는 구조입니다. 구축·전환·백업은 `docs/HOME_SERVER.md`를 따릅니다.

PC scheduler는 기본 `shadow` 모드에서 예정 작업과 heartbeat만 기록하며 실제 정기 작업을 실행하지 않습니다. 72시간 비교 검증 후에만 `PC_WORKER_SCHEDULER_MODE=active`로 전환합니다. 평일 08:05 KST에는 최근 24시간 worker 상태를 Discord 운영 채널에 보고합니다.

## 운영 모드

현재 기본 운영 모드는 `Assist Mode`입니다. 자동 주문은 하지 않습니다.

| 모드 | 의미 |
|------|------|
| Observe Mode | 뉴스 수집/요약만 수행 |
| Paper Mode | 추천을 생성하고 가상 성과만 평가 |
| Assist Mode | 추천, 리스크 리뷰, 제안 매수금액을 제공하고 매매는 사람이 결정 |
| Trade Log Mode | 사람이 실제 매수/매도한 결과를 기록하고 복기 |

추천 성과, 실제 거래 성과, 계좌 성과는 서로 다른 문제로 보고 분리해서 저장합니다.

## 데이터 보존

- `data/article-buffer.json`: 다음 다이제스트에서 처리할 score 4 기사
- `data/daily-articles/YYYY-MM-DD.json`: 수집 중 점수화된 당일 기사 누적 아카이브
- `data/daily-summary/YYYY-MM-DD.json`: 다이제스트/종목 리포트 요약
- `data/recommendations/recommendations.json`: 추천/성과 평가 로컬 미러. 기준 저장소는 Supabase `recommendations`, `recommendation_evaluations`
- `data/research-candidates/research-candidates.json`: 실제 매매 대상이 아닌 리스크 차단 후보의 shadow 평가 로컬 미러
- `data/trades/trade-executions.json`: 실제 매수/매도 기록 로컬 미러. 추천과 실제 실행은 분리합니다.
- `data/trades/trade-plans.json`: 아직 체결되지 않은 예정 매매 로컬 체크리스트
- `data/portfolio-cash-flows/portfolio-cash-flows.json`: 입금·출금·배당·이자·수수료·세금 원장 로컬 미러
- `data/portfolio-snapshots/YYYY-MM-DD.json`: 보유 종목 현재가/평가손익 스냅샷
- `data/action-reports/YYYY-MM-DD.json`: 신규 매수/관찰/보유/축소/매도 후보 일일 행동 리포트
- `data/freedom/freedom-status.json`: 경제적 자유 목표와 현재 달성률
- `data/policy-radar-state.json`: Supabase 미설정 시 공식 정책 문서와 마지막 Discord 통지 해시를 보존하는 로컬 fallback
- Supabase tables: `articles`, `daily_summaries`, `stock_reports`, `recommendations`, `recommendation_evaluations`, `research_candidates`, `research_candidate_evaluations`, `market_anomaly_signals`, `trade_executions`, `portfolio_cash_flows`, `portfolio_snapshots`, `market_snapshots`, `price_snapshots`, `investor_flows`, `decision_contexts`, `policy_events`, `policy_event_versions`
- Agent/Supabase tables: `financial_freedom_goals`, `portfolio_accounts`, `positions`, `risk_policy`, `conversation_messages`, `pending_actions`
- `data/supabase/*.json`: Supabase 데이터를 내려받은 로컬 JSON 미러
- `data/economic-agent.db`: Supabase 데이터를 내려받은 로컬 SQLite 미러

다이제스트는 AI 생성과 활성화된 알림 채널 중 하나의 전송이 성공한 뒤에만 버퍼를 비웁니다. 현재 운영 채널은 Discord입니다. 생성된 다이제스트의 AI 초안 분위기, 최종 분위기, 가격 신호, 자금 흐름 스냅샷, 보정 사유와 세션 조정 내역은 `daily-summary` payload의 `digests`에 세션별로 남겨 사후 검증할 수 있습니다. 장 마감 종목 분석은 `daily-articles` 아카이브를 우선 사용하므로, 5분 수집기가 이미 seen 처리한 기사와 DART 공시도 하루 단위 분석에 포함됩니다. 외국인/기관 수급은 네이버 금융의 일자별 순매수 표를 보조 소스로 사용하고, 단위는 억원입니다. 자금 흐름 섹션은 AI 문장과 별개로 생성되므로 데이터가 있으면 당일·5일 누적 수치가 생략되지 않으며, 조회 실패는 0원이 아니라 `조회 불가`로 표시합니다.

## 영구 저장소

목표 기준 저장소는 홈 서버 PostgreSQL이고 PostgREST는 기존 Node.js 저장 코드가 사용하는 localhost 전용 호환 API입니다. `data/`는 실행 fallback과 로컬 분석용 보조 저장소입니다. Supabase는 데이터 이관과 72시간 shadow 검증이 끝날 때까지만 안전망으로 유지합니다.

```bash
# 홈 PostgreSQL/PostgREST 시작 및 스키마 적용
npm run home:up
npm run home:db:schema
npm run home:check

# 기준 DB 데이터를 로컬 파일시스템으로 내려받기
npm run db:pull

# 기존 data/*.json 히스토리를 설정된 기준 DB로 업로드
npm run db:import-local

# PostgreSQL 백업
npm run home:db:backup

# SQLite 질의 예시
sqlite3 data/economic-agent.db "select count(*) from articles;"
```

`HOME_DB_OFFSITE_BACKUP_DIR`를 별도 디스크나 동기화 폴더로 설정하면 로컬 백업과 같은 암호화 `.aes` 파일을 추가 복제합니다. 외부 복제는 `HOME_DB_BACKUP_KEY_BASE64`가 없으면 시작 전에 실패하며 평문 백업은 외부 경로에 쓰지 않습니다.

`db:pull`은 Supabase REST 응답을 페이지 단위로 모두 내려받아 `data/supabase/*.json`과 SQLite 미러를 갱신합니다. 공통 persistence는 `SUPABASE_REQUEST_TIMEOUT_MS` 안에 응답이 없으면 요청을 중단하고, PostgREST 408/429/5xx 오류는 `SUPABASE_RETRY_COUNT`, `SUPABASE_RETRY_DELAY_MS`, `SUPABASE_RETRY_MAX_DELAY_MS` 기준으로 제한된 재시도를 수행합니다. 429의 `Retry-After`를 우선하며, 반복 장애 중에는 circuit breaker가 후속 요청을 빠르게 건너뜁니다. `db:pull` 페이지 크기는 `SUPABASE_PULL_PAGE_SIZE`로 조정할 수 있습니다.

Supabase 내부 로그가 `localhost:5432 connection refused`, `PGRST000/PGRST002`, Auth/REST health 503을 함께 보이면 SQL이나 Exposed Schemas보다 관리형 PostgreSQL 프로세스 장애를 먼저 의심합니다. 이때 `Settings → General → Project availability → Restart project`를 한 번 실행하고, 재발하거나 Compute and Disk의 `System` 사용량이 비정상적이면 지원 티켓으로 관리형 compute/disk 조사를 요청합니다. `collector:ops-report` 장애 메시지는 해당 프로젝트의 재시작 화면 링크를 포함합니다.

추천 리포트를 보고 실제로 매수/매도했다면 별도 거래 기록으로 남깁니다. 이 기록은 추천 성과와 실제 계좌 성과를 분리해서 검증하기 위한 데이터입니다.

```bash
npm run trade:plan -- --side sell --ticker DRAM --name "DRAM ETF" --quantity 30 --plannedDate 2026-05-11 --targetRemainingQuantity 170
npm run trade:record -- --side buy --ticker 005930 --name 삼성전자 --quantity 3 --price 266000 --notes "1차 분할 진입"
npm run trade:record -- --side sell --ticker MU --name Micron --quantity 1 --price 125 --currency USD --fxRate 1390 --reason "목표가 도달"
npm run cashflow:record -- --type deposit --amount 1000000 --occurred-at 2026-08-01T09:00:00+09:00 --notes "추가 납입"
npm run recommendations:list
npm run action:report
npm run freedom:report
npm run portfolio:seed-store
npm run trade:performance
npm run review:weekly
npm run review:monthly
npm run agent:harness-check
npm run security:audit
npm run policy:radar -- --dry-run
```

`action:report`의 신규/관찰 후보는 추천 당시 기준가와 최신 현재가를 함께 표시합니다. 현재가는 리포트 생성 시점에 다시 조회하되, 조회 실패 시에도 추천 당시 기준가와 손절 기준으로 리포트 생성을 계속합니다. 최근 뉴스 기반 추천이 없더라도 `watchlist.domesticMomentum`/`watchlist.globalMomentum` 대표주에서 20일 고점 근접, 거래량 증가, 상대강도 개선, 당일 급등이 포착되면 `가격 모멘텀 관찰` 섹션에 별도 표시합니다. 이미 보유 중인 급등 종목은 신규 추천에서 숨기지 않고 `추가매수/수익보호 점검`으로 분리해 눌림 대기, 추가매수 한도, 일부 이익 잠금 여부를 보여줍니다.

일일 행동 리포트는 Supabase 포트폴리오 원본을 최신 가격으로 재평가한 뒤 그 평가액을 다시 원본에 동기화합니다. Discord에는 평가 기준 KST 시각, 가격이 갱신된 보유 종목 수, KIS/Alpaca/Yahoo 등 가격 출처, 직전 저장 평가액과 현재 평가액의 차이를 표시하므로 `/portfolio`의 저장 평가액과 행동 리포트가 서로 다른 시점을 가리키는 문제를 줄입니다. 고정폭 표 대신 모바일에서도 줄바꿈이 안정적인 문장형 요약을 사용합니다.

장마감 종목 분석은 시장 스냅샷과 기사에서 `AI_SEMICONDUCTOR_CYCLE`, `GROWTH_CONCENTRATION` 같은 경제/시장 테마를 감지합니다. 예를 들어 AI 데이터센터 투자, HBM/DRAM 수요, SOXX/NVDA/MU/TSM/AMD 상대강도가 동시에 강하면 AI/반도체 사이클을 추천 프롬프트와 리스크 가드레일에 넣고, 급등일 추격보다 눌림·분할 진입과 수익보호를 우선하도록 안내합니다.

주간/월간 성과 리뷰는 단순 점검 메모와 별도로 `다음 개선 액션`을 생성합니다. 실제 매수한 추천보다 놓친 추천의 성과가 좋았는지, 손익비 부족 실패가 반복되는지, 손절 기준 없는 bullish 추천이 있었는지, 수집기 공백이나 가격 provider 경고가 있었는지를 행동 항목으로 분리해 Discord에 표시합니다.

월간 리뷰는 `자산 성과 → AI 추천 파이프라인 → 이번 달 AI 추천 성과 → 내 매매 실행 → 운영 상태 → 다음 달 개선`의 6개 섹션으로 구성합니다. 최신 포트폴리오의 현재 총자산과 평가손익, 순자산 증감, 외부 입출금, 일자 가중 linked Modified Dietz 수익률, 현금 투입 시점을 반영한 연환산 MWR(XIRR), 같은 구간 KOSPI 대비 초과수익을 먼저 표시합니다. 외부 현금흐름이 있는 구간은 일중 정확한 평가값이 없으므로 일자 가중 추정치로 표시합니다. 현금흐름 원장을 읽지 못하면 입출금을 0으로 간주하지 않고 성과 판단을 보류합니다. 포트폴리오를 읽지 못하면 0원으로 계산하지 않고 경제적 자유 계산도 생략합니다. 추천은 장마감 리포트 일수, 분석 후보, 강세 후보, 관찰/차단, 승인으로 이어지는 퍼널과 누적 1/5/20거래일 평가 상태를 함께 보여줍니다.

`cashflow:record`의 `deposit`/`withdrawal`만 기본 외부 현금흐름입니다. `dividend`, `interest`, `fee`, `tax`는 운용 수익/비용이므로 TWR에서 제거하지 않습니다. 원장은 성과 보정용이며 포트폴리오 현금 잔액을 자동 변경하지 않으므로 `/cash` 또는 포트폴리오 원본을 별도로 확인합니다.

성과 리뷰의 일부 개선 액션은 다음 장마감 종목 추천에 직접 환류됩니다. 단, 리스크 승인을 받은 후보의 20거래일 평가가 기본 30건 쌓이고 AI 메타데이터 커버리지가 80% 이상일 때만 규칙을 자동 조정합니다. 그 전에는 `low_risk_reward` 같은 소수 실패가 있어도 최소 손익비를 바꾸지 않고 표본 부족으로 표시합니다.

추천 평가 workflow는 신규 승인 추천이 없으면 정상적으로 `신규 평가 0건`으로 끝납니다. 추천 또는 평가 결과의 Supabase 저장이 실패하면 더 이상 성공으로 처리하지 않고 workflow를 실패시켜 Discord `#시스템-점검` 장애 알림으로 연결합니다.

ETF 레이더의 `inflow_proxy`/`outflow_proxy`는 실제 ETF 순설정·순환매 금액이 아닙니다. 가격 5일·20일 상대강도와 20일 평균 대비 거래량으로 “어디가 강하고 약한지”를 추정하며, Discord에서도 `가격·거래량 프록시`라고 고정 표기합니다. 실제 자금 유입은 발행주식수·AUM·creation/redemption 데이터가 확보된 경우에만 별도 수치로 해석해야 합니다.

리뷰 명령을 운영 저장 없이 점검하려면 `--dry-run`을 붙입니다. `--no-report`는 Discord 전송만 생략하고 로컬/Supabase 저장은 수행합니다.

```bash
npm run review:weekly -- --dry-run
```

`trade:plan`은 아직 체결되지 않은 매수/매도 예정 작업을 `data/trades/trade-plans.json`과 포트폴리오 payload에 남깁니다. 일일 행동 리포트는 오늘까지 확인해야 할 열린 계획을 별도 섹션에 표시하고, 이후 `trade:record`가 같은 방향/종목/수량으로 기록되면 해당 계획을 자동으로 실행 완료 처리합니다. GitHub Actions에서도 보려면 계획 등록 후 `portfolio:sync-secret` 또는 `portfolio:seed-store`로 비공개 포트폴리오 원본을 동기화합니다.

`trade:record`는 기본적으로 `data/portfolio.json`의 현금, 보유수량, 평균단가를 함께 갱신합니다. 거래만 기록하고 포트폴리오를 건드리지 않으려면 `--noPortfolio`를 붙입니다. 해외 가격은 원화 현금에 반영할 `--fxRate`가 필요합니다. Discord 거래 초안은 추천·매매계획 자동 연결, 원화 환산, 매도 실현손익·사유 기록을 수행하며 동일 거래 ID 재승인 시 포트폴리오를 중복 변경하지 않습니다.

대화형 Agent 배포 후에는 `portfolio:seed-store`로 현재 로컬 포트폴리오를 Supabase `portfolio_accounts`, `positions`에 올립니다. 이후 Discord `/portfolio`는 Supabase 원본을 우선 읽고, 자연어 `/cash`, `/buy`, `/sell` 초안 승인도 Supabase 포트폴리오를 갱신합니다. `PORTFOLIO_JSON_BASE64`는 bootstrap/fallback 용도입니다. `portfolio:snapshot`은 Supabase 원본을 우선 읽어 현재가·환율로 평가한 뒤 `portfolio_snapshots`와 `portfolio_accounts`/`positions`를 함께 갱신합니다. 최근 30일 안에 같은 종목의 리스크 승인 추천이 있으면 `/buy`가 가장 최근 추천을 자동 연결하며, 필요하면 `rec=추천ID`로 명시할 수 있습니다. 명시한 추천 ID가 없거나 종목이 다르면 초안 생성을 거부합니다. 손익비가 낮거나 리스크 리뷰를 통과하지 못한 종목은 자동 연결 대상이 아니며, 필요할 때만 `/recommendations blocked`로 참고합니다.

## 추천 생성 원칙

종목 추천은 단순 `매수/관찰` 문구가 아니라 검증 가능한 구조를 포함해야 합니다. AI 출력은 JSON으로 제한하고, 저장 전 로컬 리스크 리뷰를 통과합니다.

모든 추천 후보는 가능한 경우 아래 값을 포함합니다.

- 진입 근거와 관련 기사/공시 ID
- 기준 가격과 가격 시각
- 손절 기준과 무효화 조건
- 기대 상승폭과 예상 손실폭
- 손익비
- 제안 매수금액과 계좌 비중
- 리스크 리뷰 통과 여부와 차단 사유
- DART/공식 가격명에 근거한 종목 식별 상태와 데이터 품질 상태

## 리스크 가드레일

장 마감 리포트는 가능한 경우 `손익비`, `손절폭`, `무효화 조건`, `제안 매수금액`, `계좌 비중`, `20일 상대강도`, `20일 평균 대비 거래량`, `20일 고점 근접/돌파 여부`를 함께 표시합니다.

2,000만원 계좌의 기본 포지션 사이징은 손실 허용액 기준으로 계산합니다.

```text
risk_amount = total_asset_value * risk_per_trade_ratio
position_by_risk = risk_amount / abs(stop_loss_pct)
position_by_cap = total_asset_value * max_new_buy_ratio
suggested_buy_amount = min(position_by_risk, position_by_cap, available_cash)
```

예를 들어 2,000만원 계좌에서 거래당 손실 허용률이 1%, 손절폭이 8%면 손실 기준 매수 가능 금액은 250만원입니다. 다만 기본 신규 매수 상한이 100만원이면 최종 제안 금액은 100만원으로 제한됩니다.

추천은 저장 전에 리스크 관리자 레이어를 통과합니다. `risk_review`는 시장 레짐, 손익비, 손절폭, 유동성, 상대강도, 모멘텀, 포지션 크기 factor를 검토하고 차단 사유를 기록합니다.

신규 매수 후보는 기본적으로 손익비 1:2 미만, 손절폭 과다, 유동성 기준 미달, 시장 대비 상대강도 약세, RISK_OFF 레짐에서는 차단 또는 강등됩니다.

`recommendation-identity.js`는 가격 조회 전에 관련 DART 공시의 회사명/종목코드 또는 고정 관찰목록으로 국내 종목을 결정합니다. 이후 공식 가격 응답의 회사명도 재검증하며, 근거가 충돌하면 임의 교정하지 않고 차단합니다.

`recommendation-schema.js`는 추천 저장 전 최소 계약과 데이터 품질을 검증합니다. 근거 기사, 기준 가격, 손절 기준, 손익비, 제안 비중/금액, 무효화 조건뿐 아니라 검증된 국내 종목 식별자, 가격 출처/시점, 20일 상대강도·평균 거래대금·진입 타이밍, 펀더멘털 출처/시점이 없으면 `schema_validation.passed=false`로 표시하고 `risk_review`를 `watch_only`로 강등합니다. 국내 기본 펀더멘털 스냅샷은 공식 가격 응답 시점의 시가총액·ISIN·거래소를 기록합니다. 이런 후보는 Discord 리포트에는 차단 사유로 보이지만 추천 성과 로그에는 저장하지 않습니다.

## 성과 평가 기준

추천은 단순 수익률만 보지 않습니다. `recommendation_evaluations`에는 1일/5일/20일 단위로 아래 값을 저장합니다.

실제 승인 추천은 기존 `recommendations`에만 저장합니다. 스키마를 통과했지만 시장 레짐·손익비·진입 타이밍 등으로 차단된 방향성 후보는 `research_candidates`에 `researchOnly=true`, `tradeEligible=false`로 분리하고 같은 EOD 기준으로 평가합니다. Shadow 성과는 차단 규칙 연구용이며 실제 추천 성과나 자동 규칙 조정 표본에 섞지 않습니다.
기존 장마감 리포트에서 shadow 후보를 복원하려면 `npm run db:pull` 후 `npm run research:backfill`을 한 번 실행합니다. 역사 리포트에 벤치마크 기준가가 없으면 현재가로 대체하지 않고 초과수익만 미집계합니다.

- 추천 후 수익률과 KOSPI 벤치마크 대비 초과수익
- 추천 후 최대상승률(MFE)
- 추천 후 최대하락률/최대역행폭(MAE)
- 최대낙폭
- 손절선 터치 여부
- 목표 수익구간 터치 여부
- 결과 라벨: `target_touched`, `stop_touched`, `beat_benchmark` 등

주간/월간 리뷰는 `performance-lab.js`와 `behavior-reviewer.js`를 통해 추천 품질과 실제 행동을 분리해서 봅니다.

- 전체 추천, 실제 매수로 연결된 추천, 매수하지 않은 추천의 성과를 따로 비교
- 손익비 구간, 신뢰도, 신호 방향별 성과 분해
- 추천과 연결되지 않은 매수, 관찰/차단 후보 매수, 최소 손익비 미달 매수 경고
- 손절 기준이나 근거 기사 없이 생성된 호재 후보 점검

프롬프트/모델별 성과는 최소 표본이 쌓인 뒤 판단합니다. Supabase 미러를 최신화한 뒤 아래 명령으로 모델, 프롬프트, 프롬프트+모델 설정(reasoning/verbosity) 조합별 평가 건수와 평균 추천 수익률, 메타데이터 누락 여부를 확인합니다.

```bash
npm run db:pull
npm run research:backfill
npm run model:performance
```

2026-08-02 미러 기준 엄격한 승인 계약과 20거래일 평가를 모두 통과한 추천은 1건이고, 이 표본은 구형이라 모델·프롬프트 메타데이터가 없습니다. `model:performance`는 고정 20거래일의 승인 코호트와 shadow 연구 코호트를 분리해 표시합니다.

보유 종목의 현재가와 평가손익은 장 마감 리포트 생성 시 자동 계산되며, 필요하면 별도로 스냅샷을 만들 수 있습니다.

```bash
npm run portfolio:snapshot
```

로컬 대시보드는 Supabase 미러를 내려받은 뒤 HTML로 생성합니다.

```bash
npm run db:pull
npm run dashboard
```

Cloud Run Agent Server에서는 Supabase를 직접 조회하는 인증 대시보드를 제공합니다. 브라우저에서 볼 때는 별도 `DASHBOARD_SECRET`을 설정하는 것이 가장 좋고, 없으면 `JOB_SECRET`을 대체 인증값으로 사용합니다.

```text
https://<cloud-run-url>/dashboard?token=<DASHBOARD_SECRET>
```

이 화면은 경제적 자유 진행률, 포트폴리오 요약, 추천 평가, 수집기 상태, 최근 추천의 진입가/손절가를 빠르게 확인하는 운영 화면입니다.

`db:push`에는 `SUPABASE_PROJECT_URL`과 `SUPABASE_DB_PASSWORD`가 필요합니다. 네트워크가 Supabase direct DB의 IPv6 연결을 지원하지 않으면 Supabase 대시보드의 pooler 연결 문자열을 `SUPABASE_DB_URL`로 넣어 우회합니다. 런타임 저장과 `db:pull`에는 `SUPABASE_PROJECT_URL`과 `SUPABASE_PUBLISHABLE_KEY` 또는 service role key를 사용합니다.

## 대화형 Agent 서버

Agent Server는 Discord Interaction과 뉴스 수집 endpoint를 실행합니다. 일반 멘션은 별도의 상시 Gateway worker가 받습니다.

```bash
npm run agent:server
npm run discord:sync-commands
npm run discord:agent-worker
```

현재 endpoint:

```text
GET  /health
GET  /version
GET  /dashboard
POST /discord/interactions
POST /jobs/news-collector
```

현재 지원 명령:

```text
/portfolio
/goal
/risk
/trades
/trade-performance
```

포트폴리오와 경제적 자유 상태를 다루므로 `DISCORD_GUILD_ID`, `DISCORD_ALLOWED_USER_IDS`, 선택적 `DISCORD_ALLOWED_CHANNEL_IDS`를 모두 검사합니다. 사용자 목록이 비어 있으면 모두 거부합니다. 다른 사람을 Discord 서버에 초대해도 그 사람의 사용자 ID를 허용 목록에 추가하기 전에는 봇을 사용할 수 없습니다.

`/buy`, `/sell`, `/cash`는 Slash 명령으로 노출하지 않습니다. 허용된 개인 채널에서 봇을 멘션해 자연어 초안을 만든 뒤 Discord `기록하기`/`취소` 버튼으로 승인합니다. 매수 초안은 같은 종목의 최근 30일 리스크 승인 추천과 열린 매매계획을 자동 연결하고 종목·수량·현금 잔액을 승인 전에 검증합니다. 매도 초안은 보유 수량, 평균단가, 환율을 기준으로 예상 실현손익을 보여주고 `reason=` 값을 거래 기록에 보존합니다. 해외 거래는 저장된 환율 또는 현재 USD/KRW를 사용하며 둘 다 없으면 `fx=` 입력을 요구합니다.

`/trades`는 최근 승인 체결 10건의 원화 반영액, 추천·계획 연결, 매도 실현손익과 사유를 보여줍니다. `/trade-performance`는 기록된 매수·매도 원장을 상계해 열린 수량의 미실현 성과와 매도 실현손익을 분리합니다. 둘 다 증권사 계좌 전체가 아니라 에이전트에 입력한 체결만 대상으로 하며, Supabase 조회 실패를 거래 0건으로 표시하지 않습니다.

## 설치 및 실행

### 요구 사항

- Node.js 22+
- Discord Application/Bot과 리포트 채널 Webhook
- AI API Key (다이제스트/종목분석용, 아래 지원 목록 참조)

### 설치

```bash
git clone https://github.com/<your-username>/economic-agent.git
cd economic-agent
npm install
```

### 환경 변수 설정

```bash
cp .env.example .env
```

```env
# AI 설정 (다이제스트 + 종목분석에 사용)
AI_PROVIDER=openai             # openai | anthropic | groq | ollama | qwen | deepseek | custom
AI_MODEL=gpt-5.6-terra         # 품질/비용 균형 기본값
# AI_DIGEST_MODEL=gpt-5.6-terra
# AI_STOCK_MODEL=gpt-5.6-sol   # 최고 품질이 필요할 때 명시적 Sol 사용
AI_DIGEST_REASONING_EFFORT=low
AI_STOCK_REASONING_EFFORT=medium
AI_DIGEST_VERBOSITY=low
AI_STOCK_VERBOSITY=medium
# AI_DIGEST_THINKING_MODE=disabled # Qwen/DeepSeek
# AI_STOCK_THINKING_MODE=disabled
# OPENAI_SAFETY_IDENTIFIER=privacy-safe-stable-hash
# AI_BASE_URL=                 # 커스텀 엔드포인트 (선택)
# LOCAL_RESEARCH_WORKER_ENABLED=false # 월간 리뷰에서 로컬 Python 리서치 worker 사용 여부

# 사용하는 제공자의 키만 설정
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GROQ_API_KEY=gsk_...
# DASHSCOPE_API_KEY=...        # Qwen 국제 리전
# DEEPSEEK_API_KEY=...

# Discord
DISCORD_REPORTS_ENABLED=true
DISCORD_GUILD_ID=...
DISCORD_ALLOWED_USER_IDS=...
# DISCORD_ALLOWED_CHANNEL_IDS=...
# DISCORD_AGENT_ROLE_IDS=... # 선택: 봇과 같은 이름의 역할 멘션도 허용
# DISCORD_WEBHOOKS_JSON_BASE64=...

# 경제지표 (선택)
BOK_API_KEY=...
FRED_API_KEY=...
DART_API_KEY=...

# Supabase 히스토리 저장소 (선택)
SUPABASE_PROJECT_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... # 선택: KIS 토큰 공유 캐시와 서버 전용 작업에 사용
SUPABASE_DB_PASSWORD=...
# SUPABASE_DB_URL=postgresql://postgres.your-project-ref:password@aws-0-region.pooler.supabase.com:6543/postgres
# SUPABASE_DNS_RESOLVER=https

# 로컬 포트폴리오 파일 (선택, 커밋 금지)
# PORTFOLIO_FILE=data/portfolio.json

# 장중 시장 급락 경보 (선택)
# MARKET_STRESS_ALERTS_ENABLED=true
# MARKET_STRESS_WARNING_PCT=-3
# MARKET_STRESS_SEVERE_PCT=-5
# MARKET_STRESS_CIRCUIT_BREAKER_PCT=-8
# PRE_NEWS_EVIDENCE_LOOKBACK_HOURS=12
# PRE_NEWS_FOLLOW_UP_HOURS=24
# POLICY_RADAR_BOOTSTRAP_HOURS=72
# POLICY_RADAR_MAX_EVENTS=10
# DISCORD_BOT_TOKEN=...            # 자동 채널/Webhook 구축용, 커밋 금지
# DISCORD_APPLICATION_ID=...       # Discord Application ID
# DISCORD_GUILD_ID=...             # Discord 서버 ID
# DISCORD_PUBLIC_KEY=...           # Interaction 요청 서명 검증용 Public Key
# DISCORD_ALLOWED_USER_IDS=...     # 개인 자산 Slash 조회 허용 사용자 ID, 쉼표 구분
# DISCORD_ALLOWED_CHANNEL_IDS=...  # 선택: Slash 조회 허용 채널 ID, 쉼표 구분
# DISCORD_MENTION_ACTIONS_ENABLED=true # 선택: 자연어 거래·현금 초안 활성화, 기본 false
# DISCORD_EXPERT_RESPONSES_ENABLED=true # 선택: 경제 전문가 AI 응답 활성화, 기본 false
# DISCORD_EXPERT_MAX_REVIEWERS=1   # 검토자 0~2명, 기본 1
# DISCORD_EXPERT_CONTEXT_MAX_CHARS=9000 # 역할별 SSoT 입력 상한
# DISCORD_EXPERT_TIMEOUT_MS=45000   # 전문가 AI 호출별 제한 시간, 5~120초
# AI_EXPERT_MAX_TOKENS=700         # 주 담당 출력 토큰 상한
# AI_EXPERT_REVIEW_MAX_TOKENS=300  # 검토자별 출력 토큰 상한
# DISCORD_REPORTS_ENABLED=true     # 정기 리포트 Discord 전송
# DISCORD_USE_EMBEDS=false         # 선택: 채널별 Embed 카드 대신 일반 텍스트 사용
# DISCORD_WEBHOOKS_JSON_BASE64=... # 채널별 Webhook JSON의 base64, docs/DISCORD_SETUP.md 참고
# DISCORD_REQUEST_TIMEOUT_MS=10000
# STRATEGY_MIN_EVALUATED=30
# STRATEGY_MIN_LINKED_TRADES=10
```

Discord 정기 리포트는 기본적으로 채널별 색상 Embed를 사용합니다. 첫 제목은 Embed 제목으로, 운영 상태·워크플로우·커밋 같은 메타데이터는 필드로 분리되며, 본문의 독립 제목·목록·주의문은 Discord의 heading·bullet·blockquote 문법으로 정리됩니다. 긴 메시지는 페이지 번호를 붙여 안전하게 나누고, 모든 전송은 의도하지 않은 사용자·역할 멘션을 차단합니다. 멘션 기반 대화와 Slash 응답에도 같은 Markdown 정리 규칙을 적용합니다.

### 실행

```bash
# 뉴스 수집 (수동 실행, 운영에서는 Agent Server/Scheduler가 5분 주기로 호출)
npm start

# AI 다이제스트 발송 (시간대 자동 감지)
npm run digest

# 특정 세션 지정 (preopen/midday/close/europe/usopen)
npm run digest -- preopen

# 장 마감 종목 분석
npm run report

# 추천 성과 평가
npm run evaluate

# 저장된 가격·거래량 이상징후만 수동 재평가 (공식 EOD 1·5거래일)
npm run anomaly:evaluate

# 공식 세금·부동산·금융정책 수집 및 Discord 정책 채널 전송
npm run policy:radar

# 저장·전송 없이 공식 정책 수집/분류 결과 미리보기
npm run policy:radar -- --dry-run

# Discord 채널 설정 확인 / #시스템-점검 실제 smoke
npm run discord:check
npm run discord:smoke -- --channel=ops

# Bot API 구조 확인 / 목적별 카테고리·누락 채널·Webhook 실제 반영
npm run discord:provision
npm run discord:provision -- --apply

# ignored data/discord-webhooks.json을 GitHub Actions Secret으로 동기화
npm run discord:sync-secret

# 현재 서버에 읽기 전용 guild Slash 명령 동기화
npm run discord:sync-commands

# Windows/macOS/Linux 공통 런타임 확인 후, 항상 켜진 PC/VM에서 worker 실행
npm run discord:agent-worker:check
npm run discord:agent-worker

# Supabase 스키마 적용 / 로컬 미러 동기화
npm run db:push
npm run db:import-local
npm run db:pull
```

정책 레이더는 공식 소스를 병렬로 확인하며, 한 기관의 RSS가 일시적으로 실패해도 다른 기관 결과는 계속 처리합니다. 소스별 기본 20초 제한과 2회 재시도를 적용하고 국토교통부 RSS의 자체 307/WAF 쿠키 절차도 처리합니다. 모든 공식 소스가 동시에 실패한 경우에만 기본 15초 후 전체 배치를 한 번 더 재시도하며, 중첩된 DNS·연결 오류 코드도 운영 로그에 남깁니다. 그래도 실패하면 `정책 미확정`이 아니라 `이번 실행 수집 공백`으로 기관명과 문서 종류를 표시하며 다음 실행에서 재시도합니다. 알림은 `상세 요약 → 개인 영향 → 지금 할 일 → 반드시 확인할 조건 → 공식 근거` 순서로 제공하며, RSS가 제목만 제공하는 경우 알림 후보에 한해 안정적으로 읽을 수 있는 공식 상세 페이지 본문을 추가 조회합니다. 공식 본문을 읽을 수 없으면 내용을 추정하지 않고 원문 확인 필요를 명시합니다. 정부안·추진안은 확정 법률처럼 행동 신호로 승격하지 않습니다. `POLICY_SOURCE_TIMEOUT_MS`, `POLICY_SOURCE_RETRY_COUNT`, `POLICY_SOURCE_RETRY_DELAY_MS`, `POLICY_ALL_SOURCES_RETRY_COUNT`, `POLICY_ALL_SOURCES_RETRY_DELAY_MS`, `POLICY_DETAIL_TIMEOUT_MS`, `POLICY_DETAIL_MAX_EVENTS`로 수집 복원력과 보강 범위를 조정할 수 있습니다.

`OPEN_ASSEMBLY_API_KEY`를 설정하면 열린국회정보의 현행 대체 API인 `법률안 심사 및 처리(의안검색)`을 함께 조회합니다. 조세특례제한법·소득세법·상증세법·종부세법·주택법·주택임대차보호법·자본시장법·국민연금법의 제안, 위원회 처리, 본회의 결과를 추적하며 의안번호와 소관위원회를 정책 메시지에 표시합니다. 알림 소음을 막기 위해 정부 제출안은 제안 단계부터, 의원·위원장 안은 본회의 통과 이후만 정책 이벤트로 편입합니다. 키가 없으면 국회 수집만 조용히 비활성화되고 기존 공식 RSS 레이더는 그대로 동작합니다. 법제처 국가법령정보 공동활용은 별도의 `OC` 승인값이 필요하므로 승인 전에는 공포·시행 상태를 추정하지 않습니다.

법제처 승인 후 `LAW_OPEN_DATA_OC`를 설정하면 같은 8개 법률의 현행 법령 메타데이터를 추가 조회해 공포일·공포번호·시행일·제개정 구분을 교차검증합니다. 국회 개정안과 법제처 현행법령은 출처별 기록 ID를 유지하면서 기본 법률명 기준의 동일 `eventKey`로 묶입니다. 시행일이 현재보다 미래이면 `공포`, 도래했으면 `시행`으로 표시하며, 승인값이 없으면 이 소스만 조용히 건너뜁니다.

## AI 제공자 지원

| 제공자 | 설정값 | 모델 예시 | 비용 |
|--------|--------|-----------|------|
| **Groq** | `groq` | llama-3.3-70b-versatile | 무료 티어 |
| **Ollama** | `ollama` | llama3 | 완전 무료 (로컬) |
| **OpenAI** | `openai` | gpt-5.6-terra (기본), gpt-5.6-sol | 사용량 의존 |
| **Anthropic** | `anthropic` | claude-sonnet-5 | 사용량 의존 |
| **Qwen** | `qwen` | qwen3.7-flash | 저비용, 국제 리전 |
| **DeepSeek** | `deepseek` | deepseek-v4-flash | 최저비용 우선 |
| **Custom** | `custom` | - | AI_BASE_URL 설정 |

OpenAI는 GPT-5.6 Responses API와 Structured Outputs를 사용합니다. 다이제스트는 reasoning/verbosity `low`, 종목 분석은 `medium`을 기본으로 합니다. 실제 응답 모델, reasoning 설정, 입력/캐시 읽기/캐시 쓰기/출력/reasoning 토큰, 지연, 종료·미완료 사유를 `aiMetadata`에 기록해 비용과 품질을 비교할 수 있습니다. `gpt-5.6-terra`는 비용과 분석 품질의 균형용이고, 최고 품질이 필요하면 명시적 `gpt-5.6-sol`을 작업별 override로 사용합니다.

개별 사용자가 모델과 상호작용하는 배포에서는 `OPENAI_SAFETY_IDENTIFIER`에 이메일·Discord ID 원문이 아닌 안정적인 해시나 불투명 ID를 선택적으로 설정할 수 있습니다. 이 값은 OpenAI 요청에만 포함하며 로그나 `aiMetadata`에는 저장하지 않습니다.

저비용 중국 모델은 `qwen`과 `deepseek`를 OpenAI 호환 Chat Completions 경로로 지원합니다. JSON 응답이 필요한 다이제스트/종목 분석에는 `response_format=json_object`를 보내고, `AI_*_THINKING_MODE`는 기본 `disabled`로 명시해 reasoning 출력 비용을 통제합니다. thinking 설정도 `aiMetadata`와 성과 그룹 키에 남습니다. 개인정보·정확한 계좌/포트폴리오 데이터까지 외부 모델에 보낼 때는 서비스 약관과 데이터 처리 리전을 먼저 확인하고, 운영 전 실제 한국어 기사 30~50건으로 숫자·고유명사·JSON 준수율·비용을 A/B 평가합니다.

AI 비용을 줄이기 위해 전체 히스토리를 매번 프롬프트에 넣지 않습니다. 다이제스트는 상위 기사 16건, 종목 리포트는 상위 기사 32건과 핵심 시장 스냅샷만 잘라 넣습니다. 스냅샷 예산 안에서는 KOSPI/KOSDAQ, 원·달러, 국내 반도체 대표주, SPY/QQQ/SOXX, VIX를 우선해 단기 위험선호 전환을 놓치지 않으며, 장기 히스토리는 Supabase/SQLite에 저장해 필요할 때만 조회합니다.

## 감성 분석

뉴스 스코어링은 AI API 없이 **로컬에서 무료**로 동작합니다:

| 기사 언어 | 분석 방법 | 정확도 |
|-----------|-----------|--------|
| **영문** (Bloomberg 등) | FinBERT ML 모델 (로컬 CPU) | 높음 (문맥 이해) |
| **한국어/공시** | 가중 키워드 감성 사전 | 보통+ (강한 투자 신호 가중) |

감성 강도는 confidence 기반 7단계로 표시됩니다:

| confidence | 호재 | 악재 |
|:---:|------|------|
| >= 85% | 🔴 강한 호재 | 🔵 강한 악재 |
| 60~85% | 🔴 호재 | 🔵 악재 |
| < 60% | 🟠 약한 호재 | 🟣 약한 악재 |
| - | ⚪ 중립 | |

## GitHub Actions 배포

| 워크플로우 | 스케줄 | 설명 |
|-----------|--------|------|
| `news-alert.yml` | 평일 07:00~23:00 KST, 15분 간격 | 메인 수집 장애 대비 뉴스 백업 수집 |
| `digest-morning.yml` | 평일 08:20 KST | 개장 전 브리핑 |
| `digest-lunch.yml` | 평일 11:50 KST | 오전장 점검 |
| `digest-close.yml` | 평일 15:45 KST | 장 마감 브리핑 |
| `digest-evening.yml` | 평일 17:10 KST | 유럽장 체크 |
| `digest-night.yml` | 평일 22:40 KST | 미국장 오픈 브리핑 |
| `stock-report.yml` | 평일 16:00 KST | 장 마감 종목 분석 |
| `portfolio-snapshot.yml` | 평일 16:10 KST | 보유 포트폴리오 평가손익 스냅샷 |
| `freedom-report.yml` | 금요일 16:20 KST | 경제적 자유 목표 달성률과 목표 속도 점검 |
| `action-report.yml` | 평일 16:25 KST | 신규 매수/관찰/보유/축소/매도 후보 분리 |
| `pre-news-signal.yml` | 평일 09:05~15:20 KST, 15분 간격 | 가격·거래량 이상징후 감지와 기사·공시 선후관계 기록 |
| `policy-radar.yml` | 평일 10:10, 18:10 KST | 공식 세금·부동산·대출·연금·자본시장 정책의 신규/변경 상태를 Discord 분야별 채널로 전달 |
| `evaluate-recommendations.yml` | 평일 17:30 KST | 추천 성과 평가 |
| `trade-performance.yml` | 금요일 17:40 KST | 실제 거래 성과 평가 |
| `performance-review-weekly.yml` | 금요일 18:10 KST | 주간 성과 리뷰 |
| `performance-review-monthly.yml` | 매월 1일 18:20 KST | 월간 성과 리뷰 |
| `discord-smoke.yml` | 평일 08:10 KST + 수동 | 장전 9개 Webhook 설정 검증, `#시스템-점검` health 카드 또는 지정 채널 smoke 전송 |
| `collector-ops-report.yml` | 평일 12:05, 23:50 KST | 수집기 운영 상태 점검. 마지막 성공 시각이 오래되면 수집 공백으로 경고 |
| `price-provider-ops-report.yml` | 평일 23:55 KST | 가격 provider 품질 점검. GitHub Actions가 크게 지연되면 알림 전송은 건너뜀 |
| `deploy-freshness.yml` | 평일 09:20 KST | 서버 `/version`의 배포 커밋과 GitHub 최신 커밋 비교 |
| `security-audit.yml` | 매주 월요일 09:10 KST | 의존성 취약점 점검 |
| `quality-gate.yml` | main push/PR/manual | 테스트와 agent harness 문서 점검 |

메인 5분 수집은 Cloud Run Agent Server의 `POST /jobs/news-collector`를 Scheduler가 호출합니다. `news-alert.yml`에는 workflow concurrency를 설정해 15분 백업 수집 작업이 겹치더라도 같은 버퍼/캐시 상태를 동시에 건드릴 가능성을 줄입니다. 기사는 deterministic article id, 정규화 URL, 정규화 제목 기준으로 중복을 제거하고, 낮은 점수로 다이제스트에 들어가지 않는 원문도 Supabase `articles`에 저장해 Cloud Run의 휘발 로컬 캐시 때문에 같은 기사가 반복 신규 처리되지 않게 합니다.

가격·거래량 선행 이상징후는 보유·최근 추천 종목의 강한 복합 신호 또는 관심 종목의 ±10%급 극단 움직임만 전송합니다. 감지 시점과 직전 기본 12시간의 저장 기사·DART 공시를 대조해 `관련 정보 확인`, `당일 시각 미확인`, `감지 당시 원인 미확인`, `저장소 조회 불가`를 구분하고, 이후 기본 24시간 안에 처음 확인된 관련 기사 시각도 `market_anomaly_signals`에 남깁니다. 감지 당시 KOSPI 외국인·기관 순매수와 같은 거래일 후속 변화도 payload에 보존하지만, 이는 시장 전체 배경이지 해당 종목의 주체별 수급이나 급등락 원인이 아닙니다. 전 거래일 수급은 당일 동행으로 판정하지 않고, 해외 종목에는 KOSPI 수급 방향 일치 판정을 적용하지 않습니다. 날짜만 제공하는 DART 공시는 선후관계를 확정하지 않으며, 저장소 장애는 “뉴스 없음”이 아니라 판단 보류입니다. 추천 평가 workflow와 `npm run anomaly:evaluate`는 감지 가격 대비 공식 EOD 1·5거래일 방향 성과를 payload에 누적합니다. 주간·월간 리뷰는 기사→신호/신호→후속기사 시차, 가격 지속성, 요인 조합을 연구 전용으로 보여주며 5일 평가 30건 전에는 규칙 반영을 보류합니다. 이 기록은 추천이나 자동 매매로 승격되지 않습니다.

GitHub 저장소의 **Settings > Secrets and variables > Actions**에 환경 변수를 등록하세요. DART 공시 수집을 쓰려면 `DART_API_KEY`도 Secret에 추가합니다.

Discord 채널·Interaction·Gateway 설정은 [`docs/DISCORD_SETUP.md`](docs/DISCORD_SETUP.md)를 따릅니다. 정기 리포트와 비공개 Slash 조회 외에 허용한 개인 채널에서 봇을 멘션해 자연어로 조회하거나 거래·현금 기록 초안을 만들 수 있습니다. 전문가 응답을 활성화하면 `to: 투자 전문가 cc: 리스크 관리자 ...`처럼 역할을 명시하거나 질문 내용으로 자동 배정할 수 있습니다. 자연어 초안도 `기록하기` 버튼 없이는 반영되지 않으며 실제 증권사 주문은 수행하지 않습니다.

Supabase 저장을 GitHub Actions에서도 활성화하려면 `SUPABASE_PROJECT_URL`, `SUPABASE_PUBLISHABLE_KEY`를 Secret에 추가합니다. `SUPABASE_DB_PASSWORD`는 로컬에서 `npm run db:push`를 실행할 때만 필요합니다.

## 커스터마이징

### 키워드 / 가중치 / 감성 사전 / 섹터

필터링 규칙은 목적별 파일로 나뉘며, 기존 호환성을 위해 `src/config/keywords.js`가 이를 통합합니다.

- `src/config/market-keywords.js`: 금리, 환율, 지수, 유가, 지정학 등 시장 국면
- `src/config/stock-keywords.js`: 반도체, AI 인프라, 조선, 방산, 2차전지, 바이오, 금융 등 종목 후보
- `src/config/disclosure-keywords.js`: 실적, 공급계약, 자사주, 유상증자, 전환사채, 거래정지 등 공시
- `src/config/keywords.js`: 위 설정을 합쳐 기존 필터/스코어러에 제공

한국어 감성 분석은 `src/filters/sentiment-dictionary.js`에서 처리합니다. 단순 키워드 개수 비교가 아니라 `자사주 소각`, `주주환원`, `유상증자`, `전환사채`, `거래정지` 같은 강한 투자 신호에 추가 가중치를 줍니다.

### 투자 정책 / 포지션 사이징

투자 헌법과 기본 리스크 한도는 `src/config/strategy-policy.js`에 둡니다. 추천 매수금액은 `src/utils/position-sizer.js`가 아래 한도 중 가장 작은 값을 사용합니다.

```text
손실 기준 금액
신규 매수 상한
종목별 최대 비중 잔여 한도
섹터별 최대 비중 잔여 한도
가용 현금
시장 레짐별 신규 매수 한도
```

### 관심사

`src/config/interests.js`에서 개인 관심사를 수정합니다:

```javascript
module.exports = {
  portfolio: ['ETF', '반도체', ...],
  macro: ['금리', '환율', '인플레이션'],
  career: ['프론트엔드', '금융IT', ...],
};
```

### 가격 데이터

가격 조회는 `src/sources/price-provider.js`를 통해 호출합니다. 국내 6자리 종목코드는 장중/현재가에서는 한국투자증권 Open API REST를 우선 사용하고, 실패하면 Naver Finance, 마지막으로 Yahoo Finance fallback을 사용합니다. KIS 접근토큰은 24시간/1일 1회 발급 원칙을 전제로 운용하므로, 같은 토큰을 재사용하기 위해 로컬 파일 캐시와 Supabase service role 전용 원격 캐시를 함께 사용합니다. 국내 현재가가 KIS 또는 Naver에서 확인된 경우 Yahoo의 국내 history 기반 5일/20일 수익률은 사용하지 않습니다.

가격 Provider 점검 메시지는 `빈 응답`을 API 장애나 최종 가격 누락과 구분합니다. 빈 응답은 해당 제공처에서 값이 없어 다음 우선순위 경로를 조회한 횟수이고, 실제 오류는 별도로 표시합니다. 해외 Yahoo 의존도가 높더라도 최종 가격이 확보되고 실패율이 낮으면 `즉시 장애 아님`으로 안내하며, 국내 공식 종가·국내 대체 가격·해외 대체 가격의 비중과 필요한 다음 조치를 먼저 보여줍니다.

추천 성과 평가와 백테스트용 일별 종가는 현재가와 분리합니다. 국내 EOD 가격은 KRX Open API 공식 일별매매정보(`krx-openapi`)를 우선 사용하고, 없으면 공공데이터포털 주식시세정보(`data-go-kr`), KIS 일봉 순서로 fallback합니다. 해외 EOD 가격은 FMP historical EOD를 우선 사용하고, Tiingo/Alpha/Yahoo fallback을 사용합니다. 추천 1일/5일/20일 평가는 가능한 경우 평가 대상일의 EOD 가격과 EOD high/low history로 수익률, MFE/MAE, 손절/목표 터치 여부를 계산합니다.

해외 주식은 Alpaca Market Data, FMP, Alpha Vantage, Tiingo EOD, Yahoo fallback 순서로 조회합니다. 키가 없는 provider는 `skipped`로 기록하고 빈 응답률 계산에서는 제외하므로, 초기에는 Yahoo fallback으로 계속 동작합니다. `FMP_API_KEY`를 넣으면 미국 기업 재무/실적 분석까지 확장할 수 있습니다. 가격 provider 운영 점검은 국내 fallback과 해외 Yahoo 현재가 사용을 분리해 판단합니다. 해외 Yahoo 현재가 비중만 높은 경우는 장애가 아니라 `해외 실시간 가격 API는 필요 시 보강`으로 모니터링하며, 미국 장중 실시간 알림이 중요해지면 Alpaca WebSocket 또는 Massive를 별도 실시간 계층으로 추가합니다.

FMP profile, 재무제표 요약, earnings calendar는 해외 종목 후보의 `fundamental_profile`로 저장합니다. 리스크 리뷰는 `isActivelyTrading=false` 종목을 차단하고, 고베타, ADR, 미국 소형주, ETF, 매출/순이익 역성장, 음수 FCF 마진, 높은 D/E, 실적발표 임박, 직전 EPS 쇼크를 경고로 표시합니다.

포트폴리오에 미국 주식과 한국 주식이 섞여 있으면 USD 종목은 USD/KRW로 KRW 환산해 총자산을 계산합니다.

사용한 가격은 Supabase `price_snapshots`에 `ticker`, `source`, `price_type`, `as_of`와 함께 저장합니다. provider 호출 시도는 `price_provider_attempts`에 저장하며, `npm run db:pull`은 두 테이블을 모두 로컬 미러로 가져옵니다. 가격 provider 운영 점검은 전체 실패율/빈 응답률뿐 아니라 provider별 빈 응답률도 표시해, 특정 유료/공식 provider가 계속 빈 응답만 내는지 분리해서 볼 수 있습니다. 추천 성과와 포트폴리오 스냅샷은 나중에 어떤 가격 소스를 기준으로 계산됐는지 추적할 수 있어야 합니다.

한국투자증권 Open API를 쓰려면 아래 환경 변수를 설정합니다.

```bash
KIS_APP_KEY=...
KIS_APP_SECRET=...
# 선택: 기본값은 실전 REST URL
KIS_BASE_URL=https://openapi.koreainvestment.com:9443
KIS_MIN_REQUEST_INTERVAL_MS=1100

# 해외 주식 선택 provider
ALPACA_API_KEY_ID=...
ALPACA_API_SECRET_KEY=...
ALPACA_DATA_FEED=iex
FMP_API_KEY=...
ALPHA_VANTAGE_API_KEY=...
TIINGO_API_TOKEN=...

# 국내 EOD 백필 선택 provider
KRX_OPENAPI_KEY=...
# 선택: 기본값은 KRX Open API endpoint
KRX_OPENAPI_BASE_URL=https://data-dbg.krx.co.kr/svc/apis
DATA_GO_KR_API_KEY=...
```

KRX Open API는 키 발급 외에 사용할 API 서비스별 이용 권한이 필요할 수 있습니다. `401 Unauthorized API Call`이 나오면 KRX 포털에서 유가증권 일별매매정보와 코스닥 일별매매정보 이용신청/승인 상태를 확인하세요. KRX가 실패해도 시스템은 Data.go.kr, KIS 순서로 자동 fallback합니다.

KIS 접근토큰은 발급 제한이 있으므로 런타임에서 `data/kis-token.json`에 캐시합니다. `SUPABASE_SERVICE_ROLE_KEY`가 설정되어 있으면 `api_token_cache` 테이블에도 저장해 Cloud Run, GitHub Actions, 로컬 실행이 같은 토큰을 재사용합니다. 이 테이블은 RLS가 활성화되어 있고 일반 publishable key로 접근하지 않습니다. 현재가 조회는 기본 1.1초 간격으로 직렬화합니다.
KIS 접근토큰은 원칙적으로 24시간 유효하고 1일 1회 발급을 전제로 운용합니다. service role 기반 원격 캐시가 없으면 GitHub Actions처럼 실행 환경이 매번 새로 만들어지는 곳에서는 캐시가 사라져 토큰 발급 알림이 더 자주 올 수 있습니다. 추천 성과 평가/EOD는 KRX를 우선 사용해 불필요한 KIS 일봉 호출을 줄입니다.

국내 일별 종가를 Supabase `price_snapshots`에 백필하려면:

```bash
npm run prices:backfill-eod -- 005930,000660 2026-05-01 2026-05-07
```

로컬 백테스트/리서치용으로는 선택형 Python worker를 분리해 둡니다. 운영 수집은 공식 API 경로를 쓰고, 이 worker는 로컬에 `pykrx` 또는 `FinanceDataReader`가 설치되어 있을 때만 사용합니다.

```bash
npm run backtest:worker -- providers
npm run backtest:worker -- ohlcv --ticker 005930 --from 2026-01-01 --to 2026-05-08 --provider pykrx
```

월간 성과 리뷰에 로컬 리서치 섹션을 붙이려면 명시적으로 켭니다. 기본값은 비활성이라 GitHub Actions/Cloud Run 리뷰는 Python 의존성 없이 계속 실행됩니다.

```bash
LOCAL_RESEARCH_WORKER_ENABLED=true npm run review:monthly
```

이 옵션은 월간 리뷰에서 최근 국내 추천 후보를 최대 3개 골라 `scripts/local-backtest-worker.py ohlcv`를 호출하고, 기간 수익률/최대낙폭/거래일 수를 sidecar 연구 결과로 저장합니다. Provider는 `LOCAL_RESEARCH_WORKER_PROVIDER=auto|pykrx|finance-data-reader`, 대상 수는 `LOCAL_RESEARCH_MAX_TICKERS`로 조정할 수 있습니다.

KIS WebSocket은 장중 실시간 체결/호가 알림용입니다. 현재 운영은 REST 현재가/일봉을 우선 사용하고, WebSocket은 항상 켜진 Agent Server가 생긴 뒤 별도 모듈로 붙입니다.

### 실제 포트폴리오

실제 보유 종목과 현금 비중은 커밋하지 않는 로컬 파일 `data/portfolio.json`에 둡니다. 형식은 `docs/portfolio.example.json`을 복사해 맞추면 됩니다.

```bash
cp docs/portfolio.example.json data/portfolio.json
```

GitHub Actions에서도 실제 포트폴리오를 평가하려면 같은 JSON을 secret으로 넣습니다. 권장 방식은 base64입니다.

```bash
base64 < data/portfolio.json | gh secret set PORTFOLIO_JSON_BASE64
```

로컬 포트폴리오가 바뀐 뒤 Actions secret까지 갱신하려면:

```bash
npm run portfolio:sync-secret
```

`cashAmount`와 `totalAssetValue`를 넣으면 현금 비중이 자동 계산됩니다. 종목별 `weight`를 넣으면 장 마감 리포트의 행동 가드레일에서 종목/섹터 쏠림을 점검합니다.

스크린샷에서 옮긴 `currentPrice`와 `marketValue`는 다음 평가 때 최신 시세가 있으면 갱신됩니다. 특정 평가액을 의도적으로 고정해야 하는 포지션만 `valuationLocked: true`를 사용합니다. 상세 구성이 아직 확인되지 않은 자산은 `unclassifiedAssetAmount`에 둘 수 있으며 총자산에는 포함되지만 현금·매수 가능 금액으로 취급하지 않습니다.

### 경제적 자유 목표

`src/config/freedom.js`에서 월 생활비, 월 투자 가능 금액, 목표 순자산, 목표 인출률, 목표일, 기준 계획 수익률, 공격 운용 목표를 수정합니다.

```bash
npm run freedom:report
```

`targetNetWorth`가 없으면 목표 순자산은 `월 생활비 * 12 / 목표 인출률`로 계산합니다. 현재 순자산은 로컬 포트폴리오의 `totalAssetValue`를 우선 사용합니다.
현재 기준 계획 수익률은 연 12%, 공격 운용 목표는 연 15%입니다. 목표일까지 필요한 수익률은 리포트에서 별도로 역산합니다.

초기에는 `maxNewBuyRatio=0.05`와 `maxNewBuyAmount=1000000` 중 더 작은 값을 1회 신규 매수 상한으로 씁니다. 예를 들어 총자산이 커져 5%가 300만원이어도 기본 제안금액은 1회 100만원을 넘지 않습니다. `/recommendations`는 리스크 기준을 통과한 매수 검토 후보만 보여주고, 제안금액 옆에 `손실한도`, `1회 신규매수 상한`, `현금`처럼 어떤 한도가 실제 금액을 제한했는지 표시합니다. 차단/관찰 후보는 `/recommendations blocked`에서만 참고용으로 확인합니다.

## 월간 비용 (추정)

| 구성 | 비용 |
|------|------|
| 수집 + 스코어링 (FinBERT + 키워드) | **무료** |
| 다이제스트 + 종목분석 (Groq) | **$0/월** |
| 다이제스트 + 종목분석 (Claude Haiku) | **~$5.4/월** |
| 다이제스트 + 종목분석 (Claude Sonnet, 현재 호출량 기준) | **대략 $6~25/월** |
| 다이제스트 + 종목분석 (GPT-5.6 Terra) | 사용량 기반 (입력 $2.50 / 출력 $15.00 per 1M tokens) |
| GitHub Actions (Public) | 무료 |
| Discord / BOK / FRED / DART API | 무료 |
| Supabase | 무료 티어로 시작 가능 |

## 수집 신뢰도

뉴스/DART 수집은 두 계층으로 운영합니다.

```text
Agent Server + Scheduler
= 5분 메인 수집, POST /jobs/news-collector

GitHub Actions
= 15분 백업 수집, 브리핑/리포트/평가
```

GitHub Actions schedule은 지연/누락 가능성이 있으므로 실시간성 수집의 단일 기준으로 쓰지 않습니다. 수집기는 마지막 성공 시각 이후를 겹쳐 조회하고, 오래된 긴급 기사는 즉시 알림 폭탄이 아니라 다이제스트/캐치업으로 넘깁니다. 즉시 알림은 기본 실행당 1건·KST 하루 2건이며, 보유 종목 또는 별도 `watchlist.criticalAlerts` 종목의 감사의견 거절·횡령/배임·파산/상장폐지 같은 치명 공시와 기준금리 결정·서킷브레이커·침공 같은 시장 전체 사건만 허용합니다. 같은 사건의 후속 기사는 24시간 동안 한 건으로 묶고, 상한을 넘거나 중복된 기사는 다음 정기 다이제스트로 보냅니다. 단순 관심 키워드, 전망·가능성 기사, 가격 관찰 watchlist 일치는 속보 사유가 아닙니다.

## 라이선스

MIT
