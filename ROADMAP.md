# Economic Agent Roadmap

## North Star
Economic Agent의 최종 목적은 오늘 살 종목을 찍는 것이 아니라, 내 순자산이 경제적 자유 목표에 도달할 확률을 높이는 **개인 AI 경제 사무실**이 되는 것이다.

```
경제적 자유 목표
  -> 시장/공시/가격/수급 데이터 수집
  -> 세금/부동산/연금/자본시장 정책 변화 추적
  -> 시장 레짐과 행동 가능 범위 판단
  -> 내 자산과 종목 후보의 기대효과/손익비/리스크 도출
  -> 내 포트폴리오 기준 포지션 사이징 적용
  -> 사용자 확인과 승인
  -> 추천/결정/실행/성과/행동 위반 기록
  -> 매주 복기, 매월 목표 달성률 갱신
```

실거주 주택 목표의 North Star는 **서울·경기 아파트를 저점에 가까운 매수 검토 구간에서 감당 가능한 합리적 가격으로 매수하는 것**이다. 정확한 바닥을 예언하지 않고 실거래·거래량·전세·호가·대출여력·입지를 별도 근거로 검증한다. 상세 기준은 `docs/REAL_ESTATE_STRATEGY.md`를 따른다.

## 현재 범위와 미래 범위

현재 저장소는 경제·투자·자산관리 도메인에 집중한다.

- 포함: 경제 정보 수집, 정책 변화, 시장 판단, 포트폴리오 행동, 리스크, 거래 기록, 성과 검증, 경제적 자유 추적, 비공개 대화·승인
- 제외: 범용 개발 조직, 개인 이메일·일정 전체 접근, 여러 프로젝트의 독립 에이전트 팀, 다수 봇 간 자유 대화, 일반 목적 자체 개선 플랫폼
- 원칙: 새 기능은 경제적 자유 목표의 상태 파악·의사결정·실행·검증 중 하나를 실질적으로 개선해야 한다.

범용 개인 AI 조직 운영체제는 별도 미래 프로젝트로 다루며 `docs/future/AI_AGENT_TEAM_BLUEPRINT.md`를 설계 기준으로 사용한다. `economic-agent`는 그 운영체제의 첫 실전 도메인이자 검증된 도구 집합이 될 수 있지만, 현재 저장소 안에서 범용 플랫폼으로 확장하지 않는다.

## Economic Agent 헌법

1. 최종 목표는 단기 수익률이 아니라 경제적 자유 달성 확률이다.
2. 생존이 수익보다 먼저다.
3. AI는 최종 판단자가 아니라 분석 참모다.
4. 모든 추천은 손익비, 손절선, 무효화 조건, 제안 비중을 포함해야 한다.
5. 비중 없는 추천은 추천이 아니다.
6. 근거 데이터와 추천 시점 가격이 없는 추천은 저장하지 않는다.
7. 추천 성과와 실제 매매 성과는 반드시 분리해서 평가한다.
8. 시장 레짐이 나쁘면 좋은 종목도 비중을 줄인다.
9. 물타기는 금지하고, 검증된 추세에서만 피라미딩을 허용한다.
10. 레버리지는 실전 성과가 충분히 검증되기 전까지 금지한다.
11. 매주 원칙 위반 거래를 복기한다.
12. 매월 경제적 자유 목표 달성률을 업데이트한다.
13. 외부 행동과 자산 변경은 사용자가 확인하고 승인한다.
14. Discord와 AI 대화는 인터페이스이며, 구조화 데이터와 결정의 기준 저장소를 대신하지 않는다.

## 4개 엔진 구조

## 런타임 언어 원칙

Node.js를 운영 런타임의 중심으로 둔다. Discord Interaction/Gateway, PC scheduler, PostgreSQL REST 어댑터, 뉴스/공시/가격 API 호출은 대부분 I/O 중심이므로 Node.js가 적합하다.

Python은 별도 서버가 아니라 데이터 분석 worker로 둔다. pykrx/FinanceDataReader, 백테스트, 대량 OHLCV 처리, 통계/퀀트 리서치처럼 Python 생태계가 유리한 작업만 Python 스크립트로 분리하고, Node.js가 필요 시 호출하거나 로컬/배치에서 실행한다.

서버 분리 기준:
- 기본 운영: 항상 켜진 개인 PC의 Node.js worker 1대 + 로컬 PostgreSQL/PostgREST
- Python worker: 로컬/배치/수동 리서치용. 상시 서버 불필요
- 별도 Python 서비스: 백테스트가 장시간 실행되거나, 대량 데이터 분석을 API로 자주 호출해야 할 때만 검토
- 자동매매/실시간 WebSocket: 검증 전까지 별도 상시 서비스로 분리하지 않음

즉 현재 목표 구조는 `OS 공통 Node.js PC worker 1대 + PostgreSQL DBMS + 선택형 Python worker`다.

### 1. Information Engine
뉴스, 공시, 가격, 금리, 환율, 수급, 시장 스냅샷을 수집한다.

현재 기반:
- RSS/DART 기사 수집
- 시장 스냅샷과 주요 지표 수집
- 투자자 수급 수집
- 가격 provider 계층: KIS REST -> Naver Finance -> Yahoo fallback
- 가격 사용 이력 `price_snapshots` 저장
- Supabase/SQLite 히스토리 저장

### 2. Decision Engine
시장 레짐, 종목 후보, 손익비, 행동 가드레일을 판단한다.

현재 기반:
- `decision-engine.js`
- `risk-reviewer.js`
- AI 종목 분석 JSON 출력
- 추천 전 리스크 factor pass/fail

### 3. Portfolio Engine
보유 비중, 현금, 손절/익절, 리밸런싱, 포지션 사이징을 관리한다.

현재 기반:
- `data/portfolio.json`
- `trade:record`
- `portfolio:snapshot`
- `action:report`

### 4. Freedom Engine
경제적 자유 목표, 순자산 성장률, 목표 달성률, 예상 달성 시점을 추적한다.

현재 기반:
- `freedom-engine.js`
- `data/freedom/freedom-status.json`
- Supabase `financial_freedom_goals`
- 월간 리뷰와 로컬 대시보드 연결

초기 입력값:

```javascript
freedomGoal: {
  monthlyLivingCost: 3000000,
  targetWithdrawalRate: 0.035,
  targetNetWorth: 1028571429,
  currentNetWorth: 20000000,
  monthlySavingAmount: 3000000,
  targetDate: "2036-12-31"
}
```

초기 계산:

```text
목표 순자산 = 월 생활비 * 12 / 목표 인출률
목표 달성률 = 현재 순자산 / 목표 순자산
```

## 대시보드 방향

첫 화면은 종목 추천이 아니라 경제적 자유 진행률과 위험 상태를 보여야 한다.

1. Freedom: 목표 자산, 현재 순자산, 달성률, 월 저축액, 예상 달성 시점
2. Market: 시장 레짐, 금리, 환율, 수급, 위험 신호
3. Ideas: 추천 후보, 손익비, 근거 뉴스, 리스크 리뷰
4. Review: 추천 성과, 실제 거래 성과, 원칙 위반, 주간/월간 복기

현재는 두 가지 경로를 둔다.

- 로컬: `npm run db:pull && npm run dashboard`로 `data/dashboard/index.html` 생성
- 서버: Cloud Run Agent Server의 인증된 `/dashboard`가 Supabase를 직접 조회해 운영 요약 제공

## 운영 모드

자동매매는 목표가 아니라 선택 가능한 마지막 수단이다. 기본 운영은 `Assist Mode`다.

1. Observe Mode: 뉴스 수집과 요약만 수행
2. Paper Mode: 추천은 만들지만 실제 매매하지 않고 성과만 평가
3. Assist Mode: 제안 비중, 손절선, 무효화 조건까지 제공하고 사람에게 판단을 남김
4. Trade Log Mode: 실제 매매를 기록하고 복기
5. Semi-Auto Mode: 검증된 조건에서만 주문 후보 생성
6. Auto Mode: 충분히 검증된 전략만 제한적으로 자동 실행, 기본 비활성

## 실행 플랫폼 방향

리포트, 긴급 알림, 매매 기록 초안과 승인은 Discord로 통합한다. Discord 자연어 초안·승인은 `pending_actions` 엔진을 사용한다. 실시간 질의응답과 포트폴리오 변경 승인은 GitHub Actions가 아니라 항상 요청을 받을 수 있는 Node.js Agent Server와 Gateway worker가 담당한다.

```text
Discord report channels <- PC worker scheduler
Discord mention + Slash + approval -> PC Gateway worker -> local PostgreSQL
```

역할 분리:
- PC worker scheduler: 뉴스 수집, 다이제스트, 장마감 리포트, 성과평가, 주간/월간 리뷰
- PC Gateway worker: Discord Interaction, 포트폴리오 조회, 매수/매도 기록 초안, 승인 버튼, 리스크 질의
- Discord Webhooks: 긴급·정책·행동·포트폴리오·선행신호·성과·운영 리포트의 채널별 전달
- Python worker: 로컬 백테스트, pykrx/FinanceDataReader 기반 OHLCV 조회, 대량 데이터 분석
- PostgreSQL: 기사, 추천, 실제 거래, 포트폴리오, 경제적 자유 목표, 대화 로그, pending action, worker 상태의 기준 저장소
- PostgREST: loopback 전용 내부 호환 API
- 로컬 JSON/SQLite: 분석 캐시와 백업

Codex 작업 위임 원칙:
- 단순 파일 탐색, 좁은 분석, 간단한 코드/테스트 보조처럼 독립적인 작업은 경량 sub-agent 모델을 우선 사용해 토큰과 컨텍스트 비용을 줄인다.
- 복잡한 설계, 투자 로직 변경, 위험한 수정, 최종 통합 판단은 메인 세션에서 처리한다.
- 장시간 또는 다중 파일 작업은 `docs/AGENT_HARNESS.md`의 작업 계약과 검증 루프를 따른다. 문서 맵을 바꾸면 `npm run agent:harness-check`로 드리프트를 점검한다.

권장 배포:
1. 개인 PC·미니PC·NAS + Node.js 22 + Docker PostgreSQL
2. 장애 복구용 암호화 외부 백업
3. Cloud Run/Supabase는 전환 검증 기간의 임시 안전망

상세 설계는 `docs/AGENT_PLATFORM.md`를 기준으로 한다.

## Phase 1: 의사결정 구조화
- [x] RSS/DART/가격/지표 수집
- [x] 일별 중요 기사 아카이브
- [x] 추천 성과 평가
- [x] KOSPI 벤치마크 대비 초과수익률
- [x] 다이제스트 시간 최적화
- [x] 프리마켓/시장 스냅샷
- [x] 다이제스트 지연 세션 보정, 가격 신선도 표시, AI 시장 분위기 교차검증
- [x] 시장 레짐 초안: `RISK_ON`, `NEUTRAL`, `RISK_OFF`
- [x] 강세장 세부 태그: `OVERHEATED`, `CONCENTRATED_LEADERSHIP`, `SEMICONDUCTOR_LEADERSHIP`, `MOMENTUM_ALLOWED`
- [x] 포트폴리오 설정 초안
- [x] 종목 리포트에 행동 가드레일 추가
- [x] 가격·거래량 이상징후의 감지시각과 기사·DART 선후관계 저장. 저장소 장애·날짜 단위 공시는 판단 보류하고 추천으로 자동 승격하지 않음
- [x] Discord 다이제스트·장 마감 리포트에 결정론적 자금 흐름 섹션 추가. KOSPI 투자자 순매수와 ETF 가격·거래량 프록시를 분리 표시
- [x] 가격·거래량 이상징후에 감지 시점과 같은 거래일 후속 KOSPI 수급 스냅샷 연결. 전 거래일·해외 종목·시장 전체 수급의 한계를 명시
- [x] 가격·거래량 이상징후의 공식 EOD 1·5거래일 지속성, 기사 선후 시차, 요인 조합을 연구 전용으로 평가. 5일 표본 30건 전에는 추천 규칙 반영 보류
- [x] 재정경제부·금융위원회·국토교통부 공식 문서를 투자 뉴스와 분리한 정책·자산 레이더 MVP. 세금·부동산·대출·연금·자본시장 분류와 정부안/정정/입법예고/시행 상태를 기록
- [ ] 국가법령정보·국회 의안정보를 연결해 정부안 → 국회 제출 → 통과 → 공포 → 시행을 동일 정책 사건으로 추적
  - 열린국회정보의 2026년 대체 API `TVBPMBILL11` 수집·의안번호·위원회·본회의 단계 표시와 전체 페이지 순회 구현 완료. 전용 인증키·GitHub Secret 등록 및 실데이터 smoke 완료
  - 국가법령정보 공동활용의 공포일·공포번호·시행일 수집과 기본 법률명 사건 연결 골격 구현 완료. 별도 `OC` 승인 후 실데이터 smoke와 GitHub Secret 등록 필요
  - 정부안/RSS 문서까지 동일 사건의 단계 타임라인으로 합치는 UI·저장 조회는 후속 작업
- [x] 서울·경기 5.8억~9.5억원 국토교통부 아파트 매매·전월세 일일 수집, 최근월 재조회, 계약해제·지역월 거래량·중위가격·전세가율 저장 골격
- [x] 8.5억~9.5억원 목표와 6억원 희망대출을 분리한 LTV·DSR 시나리오 및 부동산 전문가 컨텍스트 추가
- [x] 지역별 체크포인트로 중단 후 재개 가능한 24개월 실거래 초기 백필 명령과 1·3·12개월 변화·24개월 고점 대비 낙폭 계산
- [x] R-ONE 월간 아파트 매매가격지수 24개월 수집기와 서울·경기 장기 기준선 저장 골격
- [ ] 실제 인증키로 실거래 백필·R-ONE smoke를 수행하고 거래 통계까지 결합해 회복 신뢰도 계산
- [ ] 허가받은 호가 feed 또는 Discord 수동 입력을 연결해 유효 최저호가·실거래 괴리·매물 소진 속도 계산
- [ ] 교통·공급·학군·생활권·정비사업을 포함한 후보 단지 shortlist와 현장 조사 워크플로우

## Phase 2: 히스토리 저장소
- [x] Supabase/Postgres 도입
- [x] 현재 `data/*.json` 저장과 DB 저장 병행
- [x] 로컬 파일시스템 질의를 위한 JSON/SQLite 미러 추가
- [x] 기존 JSON 데이터 마이그레이션
- [x] 추천/성과 평가를 DB 기준으로 변경
- [x] 가격 사용 이력 `price_snapshots` 저장
- [x] 브리핑/리포트 입력 데이터도 DB에서 조회 가능하게 변경
- [x] `market_anomaly_signals`에 감지 당시 근거 상태와 후속 첫 관련 기사 시각 저장
- [x] `policy_events`, `policy_event_versions`에 공식 정책 원문과 변경 해시·알림 완료 상태 저장

## Phase 2.5: 가격 데이터 엔진
- [x] 한국 주식 Yahoo 의존 축소
- [x] Naver Finance 국내 현재가 fallback 추가
- [x] `price-provider.js`로 가격 소스 우선순위 분리
- [x] 한국투자증권 Open API REST provider 골격 추가
- [x] 국내 현재가 우선순위: KIS REST -> Naver Finance -> Yahoo fallback
- [x] 해외 현재가 우선순위: Alpaca -> FMP -> Alpha Vantage -> Tiingo EOD -> Yahoo fallback
- [x] FMP provider 골격 추가: 미국 기업 profile/fundamental 확장 준비
- [x] 사용 가격의 source/as_of/price_type 저장
- [x] KIS 계정 키 설정 후 국내 현재가 실호출 검증
- [x] FMP API key 설정 후 보유 미국 주식 quote/profile 실호출 검증
- [x] Alpaca API key 설정 후 미국 보유 종목 현재가 검증
- [x] KIS 일봉 데이터를 추천 성과 평가 fallback에 연결
- [x] KRX Open API 또는 공공데이터포털로 공식 일별 종가 백필
- [ ] Massive는 미국 주식 고품질 히스토리/실시간이 필요해질 때 유료 계층으로 추가 (현재는 과금 이르므로 보류)
- [x] pykrx/FinanceDataReader는 로컬 백테스트 worker로 분리
- [x] Python worker를 월간 리서치 리포트에 선택적으로 연결
- [x] 가격 source별 품질/오류율 모니터링

## Phase 3: 포트폴리오 기반 의사결정
- [x] 비공개 포트폴리오 파일/Secret 로딩 구조
- [x] 실제 매매 실행 기록이 포트폴리오 현금/수량/평단을 갱신
- [x] Discord 거래 초안의 추천·매매계획 자동 연결, 국내/해외 원화 환산, 매도 실현손익·사유 기록, 중복 승인 방지
- [x] Discord 최근 체결·실제 거래 성과 조회와 승인 완료 후 현금·잔여수량 영수증
- [x] 실제 첫 보유 종목 입력 후 운영 데이터 축적
- [x] 종목별 현재가와 평가손익 자동 계산
- [x] 매수 후보, 관찰 후보, 보유, 축소, 매도 후보 분리
- [x] 2,000만원 계좌 기준 신규 매수 상한/1회 손실 한도 계산
- [x] 추천 전 포지션 크기, 유동성, 상대강도, 모멘텀 리스크 검토
- [x] 종목/섹터 최대 비중 제한을 실제 보유 포트폴리오에 강제 적용
- [x] 손절/익절/리밸런싱 규칙을 보유 종목 행동 후보에 적용
- [x] 추천 신호와 실제 매수/매도 실행 기록 분리
- [x] `position-sizer.js`로 포지션 사이징 공식을 독립 모듈화
- [x] `strategy-policy.js`로 투자 헌법/레버리지/비중 제한을 코드화

## Phase 4: 시장 레짐 고도화
- [x] KOSPI/KOSDAQ/S&P/Nasdaq/반도체 5일·20일 추세 지표
- [x] 급등장 과열/쏠림 감지와 분할진입 가드레일
- [x] VIX, 달러, 환율, 금리 기반 위험 점수 초안
- [x] 유가/원자재와 가격 반응까지 포함한 위험 점수 고도화
- [x] 외국인/기관 수급 데이터 추가
- [x] 뉴스/공시 악재 비율과 가격 반응 결합
- [x] RISK_OFF 시 신규 매수 제한 자동 적용
- [x] `STRONG_RISK_ON`, `FRAGILE_RISK_ON`, `PANIC` 세부 레짐 추가
- [x] 레짐별 `maxEquityExposure`, `maxNewBuyRatio`, `minRiskReward` 정책 도입
- [x] KOSPI/KOSDAQ -3%/-5%/-8% 장중 단계별 급락 경보와 일일 중복 억제
- [x] 글로벌 ETF 19개 가격·거래량 자금이동 프록시를 레짐 교차확인에 연결
- [ ] ETF 발행주식수/AUM 시계열을 확보한 뒤 실제 순설정·순환매와 가격 프록시를 분리 검증

## Phase 5: 추천 품질 개선
- [x] AI 추천과 룰 기반 리스크 필터 분리
- [x] 추천마다 손익비, 손절폭, 무효화 조건, 제안 비중 저장
- [x] 추천마다 상대강도/거래량/유동성 프로필 저장
- [x] 추천마다 전고점/신고가 근접 여부 저장
- [x] 추천 전 리스크 관리자/factor pass-fail 레이어 추가
- [x] 추천마다 thesis, target horizon 저장
- [x] 추천 실패 원인 기록 필드 추가
- [x] 추천 평가에 MFE/MAE, 손절선/목표구간 터치 여부 저장
- [x] AI 종목 분석 프롬프트에 외부 기사 데이터 prompt injection 방어 문구 추가
- [x] 추천 JSON schema를 계약처럼 검증하고 필수 필드 누락 시 저장 차단
- [x] 추천 실패 원인 사후 분류 자동화
- [x] 섹터별/리스크팩터별 승률 리포트
- [x] 모델별 승률 리포트
- [x] 프롬프트 버전별 성과 비교
- [x] 추천했지만 매수하지 않은 종목과 실제 매수 종목의 성과 차이 분석
- [x] 추천 성과의 1/5/20일을 달력일이 아닌 거래 세션으로 평가
- [x] 종목과 KOSPI 벤치마크를 동일 평가일 EOD로 비교
- [x] 승인 후보 20거래일 평가 30건 전에는 성과 기반 규칙 자동 조정 금지
- [x] 리스크 차단 후보를 실제 추천과 분리한 shadow 코호트로 저장하고 1/5/20거래일 평가
- [x] 과거 장마감 리포트 시점 스냅샷으로 shadow 코호트 백필·모델별 분리 성과 집계
- [x] 추천 목표기간과 성과 판정 기간 정렬, bearish 벤치마크 방향 보정
- [x] 관련 DART 공시와 공식 가격명으로 국내 종목 식별자를 결정론적으로 검증/교정
- [x] 가격 출처·시점, 20일 기술 데이터, 기본 펀더멘털 스냅샷이 없는 추천 승인 차단

## Phase 6: 실전 운영
- [x] 일일 행동 리포트: 신규 매수/관찰/보유/축소/매도 후보
- [x] 주간 성과 리뷰
- [x] 월간 전략 리뷰
- [x] 월간 리뷰 포트폴리오 우선 표시와 추천 후보→관찰/차단→승인 퍼널
- [x] 입출금/배당/비용 현금흐름 원장과 linked Modified Dietz·MWR·KOSPI 비교 성과
- [x] 주말 수집 공백, 누적 버퍼, 과거 가격 스냅샷으로 인한 운영 오탐 제거
- [x] Discord 명령어와 간단한 대시보드
- [x] 수동 매매 실행 기록 입력
- [x] 실제 거래 현재가 기준 성과 리포트
- [x] 평일 장마감 후 경제적 자유 상태 Discord 리포트
- [x] 5분 뉴스 수집 workflow concurrency 적용
- [x] `performance-lab.js`로 추천/실거래/미실행 추천 성과를 분리 분석
- [x] `behavior-reviewer.js`로 원칙 위반 거래와 반복 행동 패턴을 경고
- [x] 주요 GitHub Actions 실패 시 Discord 운영 알림: 뉴스 백업 수집, 다이제스트, Action Report, 성과 리뷰, 운영 점검, 포트폴리오 스냅샷, 장마감 분석, 추천 평가, 실제 거래 성과
- [x] 주간 의존성 취약점 점검 workflow와 실패 시 Discord 운영 알림
- [x] main push 품질 게이트: `npm test`, `npm run agent:harness-check`, 실패 시 Discord 운영 알림

## Phase 7: 경제적 자유 엔진
- [x] `freedom-engine.js` 추가
- [x] 월 생활비, 월 저축액, 목표 인출률, 목표 순자산 설정
- [x] 현재 순자산과 목표 달성률 계산
- [x] 예상 달성 시점 계산
- [x] 최대낙폭 발생 시 목표 지연 기간 추정
- [x] 월간 리뷰에 경제적 자유 목표 달성률 포함
- [x] 대시보드 첫 탭을 Freedom 중심으로 재구성
- [x] `freedom:report -- --discord`와 `freedom-report.yml`로 목표 달성 속도 정기 점검

## Phase 8: 대화형 AI 경제 사무실
- [x] Discord를 단일 대화 UI로 정하고 Agent Server와 Gateway worker를 분리
- [x] `docs/AGENT_PLATFORM.md` 작성
- [x] Supabase 원본 포트폴리오 테이블 추가: `portfolio_accounts`, `positions`, `risk_policy`
- [x] 대화/승인 테이블 추가: `conversation_messages`, `pending_actions`
- [x] `src/agent/agent-router.js`와 기본 명령어 라우팅 추가
- [x] `/portfolio`, `/goal`, `/risk` 조회 명령 구현
- [x] `/buy`, `/sell`, `/cash`를 pending action + 버튼 승인 방식으로 구현
- [x] Discord guild/user/channel allowlist와 Interaction 서명 검증
- [x] Cloud Run 또는 Fly.io/Render 배포 문서 추가
- [x] Render Blueprint와 5분 cron guard 추가
- [x] 뉴스 수집 endpoint 수동 검증 스크립트 추가
- [x] Discord 9개 리포트 채널의 Webhook 전송·비밀값 지도·수동 smoke 인프라 추가
- [x] Bot API 기반 Discord 카테고리·채널·Webhook 멱등 프로비저너 추가. 핵심 신호·자산 관리·정책 인텔리전스·운영 구조로 정렬하며 기본 dry-run, 기존 리소스 삭제 금지
- [x] 긴급·브리핑·행동·포트폴리오·정책·선행신호·성과·운영 리포트의 Discord 전송 적용
- [x] 사용하지 않는 이전 메시징 전송·webhook·smoke 코드를 제거하고 Discord를 필수 전달 경로로 통합
- [x] Discord Slash command와 Ed25519 Interaction 서명 검증, guild/user/channel allowlist, ephemeral 읽기 전용 조회 구현
- [x] Discord 직접 멘션만 받는 최소-intent Gateway worker와 보수적 자연어 조회·매수/매도/현금 초안 파서 구현
- [x] Discord 자연어 변경을 기존 `pending_actions`에 연결하고 요청자 범위의 기록/취소 버튼 및 component 서명 검증 구현
- [x] Gateway worker를 Node.js 22 기반 Windows/macOS/Linux 공통 런타임으로 고정하고 네트워크 없는 호환성 검사 및 3-OS Actions matrix 추가
- [x] 하나의 Discord 봇 뒤에 투자·부동산·세금/연금·포트폴리오·리스크·데이터 검증 역할을 분리하고 결정론적 `to/cc`, 역할별 SSoT·AI 호출·대화 namespace·토큰 상한 구현
- [ ] 항상 켜진 PC/VM에 Gateway worker를 배치하고 개인 채널 실사용 smoke 수행
- [x] OS 공통 PC scheduler, catch-up, 중복 방지 job run, worker heartbeat 기반 추가
- [x] PostgreSQL 17 + localhost PostgREST Compose와 암호화 백업 명령 추가
- [ ] Supabase 데이터를 로컬 PostgreSQL로 이관하고 테이블 행 수·포트폴리오 합계 대조
- [ ] 72시간 shadow 후 PC scheduler active 전환
- [ ] Cloud Run과 scheduled GitHub Actions를 내리고 Supabase 프로젝트 종료

## 현재 가장 중요한 다음 작업
1. [완료] macOS ARM64 장비에 Docker Desktop을 설치하고 PostgreSQL 17/PostgREST를 loopback 포트 5432/3210으로 시작했다.
2. Supabase를 최종 백업한 뒤 빈 로컬 PostgreSQL에 이관하고 테이블 행 수·핵심 포트폴리오 합계를 대조한다.
   - 초기 이관 뒤 양쪽에 데이터가 추가되는 전환 구간을 위해 로컬 전용 행과 최신 포트폴리오를 보존하는 기본 dry-run 증분 동기화 명령을 준비했다. 실제 apply는 72시간 shadow 통과와 원격 writer 정지 후에만 실행한다.
3. Alibaba Cloud 국제 리전 키를 준비해 `AI_PROVIDER=qwen`, `AI_MODEL=qwen3.7-flash`, thinking disabled로 다이제스트 canary를 먼저 실행한다. 공개 뉴스만 넣은 DeepSeek V4 Flash를 최저비용 비교군으로 두고, 정확한 포트폴리오/거래 데이터는 데이터 처리 정책을 승인하기 전 제외한다.
4. 최신 미러 생성 후 `npm run model:performance`로 `stock-analysis-v2.3`의 Qwen/DeepSeek/GPT-5.6 메타데이터를 수집한다. 운영 전환 판단은 승인 후보의 고정 20거래일 평가가 최소 30건 쌓인 뒤 하며, 한국어 고유명사·숫자·JSON 준수율·지연·실제 추천 성과가 확인되기 전에는 전체 workflow를 한 번에 전환하지 않는다.
5. `price_provider_attempts`에서 provider별 빈 응답률을 본다. Alpha Vantage/FMP/Tiingo가 계속 100% empty면 API key/endpoint/rate-limit 설정을 고치거나, 유효하지 않은 provider 호출을 줄여 Yahoo fallback 전에 불필요한 지연과 로그 소음을 낮춘다.
6. 실제 거래 기록과 추천 연결률을 주간 리뷰에서 확인한다. 추천을 보고도 실행하지 않은 후보의 성과가 반복적으로 좋으면 action report의 진입 타이밍/분할 매수 기준을 재조정한다.
7. 월간 로컬 리서치 worker 결과가 실제 월간 리뷰 의사결정에 도움이 되는지 확인한다. 도움이 없으면 기본 비활성 유지, 도움이 있으면 리서치 대상 선정 기준을 보유/추천/워치리스트별로 분리한다.
8. 인증 `/dashboard`의 실제 사용 빈도를 보고 탭 분리, 가격 provider 차트, 추천 성과 모델별 차트 추가 여부를 결정한다.
9. Windows/macOS/Linux 중 선택한 항상 켜진 PC에서 `discord:agent-worker:check`를 통과시키고 72시간 shadow를 수행한다. 그 뒤 Discord endpoint를 Gateway로 전환해 멘션·Slash·기록/취소 버튼→PostgreSQL 반영과 미허용 사용자 차단을 smoke 검증한다. 실제 증권사 주문은 연결하지 않는다.

## 운영 루프

실전 운용은 아래 순서를 기준으로 한다.

### 매일
1. 개장 전/오전장/장마감/유럽장/미국장 정기 다이제스트로 시장 상태 확인
2. 추천 후보 확인: `npm run recommendations:list`
3. 일일 행동 후보 확인: `npm run action:report`
4. 경제적 자유 상태 확인: `npm run freedom:report`
5. 예정 매매 기록: `npm run trade:plan -- --side sell --ticker DRAM --name "DRAM ETF" --quantity 30 --plannedDate 2026-05-11`
6. 실제 매매 기록: `npm run trade:record -- --side buy --symbol 005930 --name 삼성전자 --qty 1 --price 70000`
7. GitHub Actions 포트폴리오 동기화: `npm run portfolio:sync-secret`
8. 평가손익 스냅샷: `npm run portfolio:snapshot`

### 매주
1. 실제 거래 성과 확인: `npm run trade:performance`
2. 주간 추천/거래 리뷰: `npm run review:weekly`
3. 원칙 위반 거래와 다음 주 현금 비중 점검

### 매월
1. 월간 전략 리뷰: `npm run review:monthly`
2. 순자산, 월 저축액, 경제적 자유 달성률 업데이트
3. AI 추천 전략의 기여도와 지수투자 대비 초과성과 점검
