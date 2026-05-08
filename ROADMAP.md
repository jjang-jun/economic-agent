# Economic Agent Roadmap

## North Star
Economic Agent의 최종 목적은 오늘 살 종목을 찍는 것이 아니라, 내 순자산이 경제적 자유 목표에 도달할 확률을 높이는 투자 운영체제가 되는 것이다.

```
경제적 자유 목표
  -> 시장/공시/가격/수급 데이터 수집
  -> 시장 레짐과 행동 가능 범위 판단
  -> 종목 후보와 손익비/리스크 도출
  -> 내 포트폴리오 기준 포지션 사이징 적용
  -> 추천/실행/성과/행동 위반 기록
  -> 매주 복기, 매월 목표 달성률 갱신
```

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

## 4개 엔진 구조

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

## 운영 모드

자동매매는 목표가 아니라 선택 가능한 마지막 수단이다. 기본 운영은 `Assist Mode`다.

1. Observe Mode: 뉴스 수집과 요약만 수행
2. Paper Mode: 추천은 만들지만 실제 매매하지 않고 성과만 평가
3. Assist Mode: 제안 비중, 손절선, 무효화 조건까지 제공하고 사람에게 판단을 남김
4. Trade Log Mode: 실제 매매를 기록하고 복기
5. Semi-Auto Mode: 검증된 조건에서만 주문 후보 생성
6. Auto Mode: 충분히 검증된 전략만 제한적으로 자동 실행, 기본 비활성

## 실행 플랫폼 방향

대화 매개체는 Telegram을 유지한다. 다만 실시간 질의응답과 포트폴리오 변경 승인을 처리하려면 GitHub Actions가 아니라 항상 요청을 받을 수 있는 Node.js Agent Server가 필요하다.

```text
Telegram Bot
  -> Node.js Agent API Server
  -> Supabase/Postgres
```

역할 분리:
- GitHub Actions: 뉴스 수집, 다이제스트, 장마감 리포트, 성과평가, 주간/월간 리뷰
- Agent Server: Telegram webhook, 포트폴리오 조회, 매수/매도 기록 초안, 승인 버튼, 리스크 질의
- Supabase: 기사, 추천, 실제 거래, 포트폴리오, 경제적 자유 목표, 대화 로그, pending action 기준 저장소
- 로컬 JSON/SQLite: 분석 캐시와 백업

권장 배포:
1. Cloud Run
2. Fly.io 또는 Render
3. 개인 미니PC/NAS + Docker

상세 설계는 `docs/AGENT_PLATFORM.md`를 기준으로 한다.

## Phase 1: 의사결정 구조화
- [x] RSS/DART/가격/지표 수집
- [x] 일별 중요 기사 아카이브
- [x] 추천 성과 평가
- [x] KOSPI 벤치마크 대비 초과수익률
- [x] 다이제스트 시간 최적화
- [x] 프리마켓/시장 스냅샷
- [x] 시장 레짐 초안: `RISK_ON`, `NEUTRAL`, `RISK_OFF`
- [x] 강세장 세부 태그: `OVERHEATED`, `CONCENTRATED_LEADERSHIP`, `SEMICONDUCTOR_LEADERSHIP`, `MOMENTUM_ALLOWED`
- [x] 포트폴리오 설정 초안
- [x] 종목 리포트에 행동 가드레일 추가

## Phase 2: 히스토리 저장소
- [x] Supabase/Postgres 도입
- [x] 현재 `data/*.json` 저장과 DB 저장 병행
- [x] 로컬 파일시스템 질의를 위한 JSON/SQLite 미러 추가
- [x] 기존 JSON 데이터 마이그레이션
- [x] 추천/성과 평가를 DB 기준으로 변경
- [x] 가격 사용 이력 `price_snapshots` 저장
- [ ] 브리핑/리포트 입력 데이터도 DB에서 조회 가능하게 변경

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
- [ ] Massive는 미국 주식 고품질 히스토리/실시간이 필요해질 때 유료 계층으로 추가
- [ ] pykrx/FinanceDataReader는 로컬 백테스트 worker로 분리
- [x] 가격 source별 품질/오류율 모니터링

## Phase 3: 포트폴리오 기반 의사결정
- [x] 비공개 포트폴리오 파일/Secret 로딩 구조
- [x] 실제 매매 실행 기록이 포트폴리오 현금/수량/평단을 갱신
- [x] 실제 첫 보유 종목 입력 후 운영 데이터 축적
- [x] 종목별 현재가와 평가손익 자동 계산
- [x] 매수 후보, 관찰 후보, 보유, 축소, 매도 후보 분리
- [x] 2,000만원 계좌 기준 신규 매수 상한/1회 손실 한도 계산
- [x] 추천 전 포지션 크기, 유동성, 상대강도, 모멘텀 리스크 검토
- [ ] 종목/섹터 최대 비중 제한을 실제 보유 포트폴리오에 강제 적용
- [ ] 손절/익절/리밸런싱 규칙을 보유 종목 행동 후보에 적용
- [x] 추천 신호와 실제 매수/매도 실행 기록 분리
- [x] `position-sizer.js`로 포지션 사이징 공식을 독립 모듈화
- [x] `strategy-policy.js`로 투자 헌법/레버리지/비중 제한을 코드화

## Phase 4: 시장 레짐 고도화
- [x] KOSPI/KOSDAQ/S&P/Nasdaq/반도체 5일·20일 추세 지표
- [x] 급등장 과열/쏠림 감지와 분할진입 가드레일
- [x] VIX, 달러, 환율, 금리 기반 위험 점수 초안
- [ ] 유가/원자재와 가격 반응까지 포함한 위험 점수 고도화
- [x] 외국인/기관 수급 데이터 추가
- [ ] 뉴스/공시 악재 비율과 가격 반응 결합
- [x] RISK_OFF 시 신규 매수 제한 자동 적용
- [x] `STRONG_RISK_ON`, `FRAGILE_RISK_ON`, `PANIC` 세부 레짐 추가
- [x] 레짐별 `maxEquityExposure`, `maxNewBuyRatio`, `minRiskReward` 정책 도입

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
- [ ] 모델별 승률 리포트
- [ ] 프롬프트 버전별 성과 비교
- [ ] 추천했지만 매수하지 않은 종목과 실제 매수 종목의 성과 차이 분석

## Phase 6: 실전 운영
- [x] 일일 행동 리포트: 신규 매수/관찰/보유/축소/매도 후보
- [x] 주간 성과 리뷰
- [x] 월간 전략 리뷰
- [x] Telegram 명령어 또는 간단한 대시보드
- [x] 수동 매매 실행 기록 입력
- [x] 실제 거래 현재가 기준 성과 리포트
- [x] 5분 뉴스 수집 workflow concurrency 적용
- [x] `performance-lab.js`로 추천/실거래/미실행 추천 성과를 분리 분석
- [x] `behavior-reviewer.js`로 원칙 위반 거래와 반복 행동 패턴을 경고

## Phase 7: 경제적 자유 엔진
- [x] `freedom-engine.js` 추가
- [x] 월 생활비, 월 저축액, 목표 인출률, 목표 순자산 설정
- [x] 현재 순자산과 목표 달성률 계산
- [x] 예상 달성 시점 계산
- [x] 최대낙폭 발생 시 목표 지연 기간 추정
- [x] 월간 리뷰에 경제적 자유 목표 달성률 포함
- [x] 대시보드 첫 탭을 Freedom 중심으로 재구성

## Phase 8: 대화형 Agent 플랫폼
- [x] Telegram을 대화 UI로 유지하고 Agent Server를 별도 런타임으로 분리하는 방향 결정
- [x] `docs/AGENT_PLATFORM.md` 작성
- [x] 공유방/비공개방 Telegram 라우팅 분리: `TELEGRAM_CHAT_ID`, `TELEGRAM_PRIVATE_CHAT_ID`
- [x] Supabase 원본 포트폴리오 테이블 추가: `portfolio_accounts`, `positions`, `risk_policy`
- [x] 대화/승인 테이블 추가: `conversation_messages`, `pending_actions`
- [x] `src/server/telegram-webhook.js` 추가
- [x] `src/agent/agent-router.js`와 기본 명령어 라우팅 추가
- [x] `/portfolio`, `/goal`, `/risk` 조회 명령 구현
- [x] `/buy`, `/sell`, `/cash`를 pending action + 버튼 승인 방식으로 구현
- [x] Telegram `chat_id` allowlist와 webhook secret 검증
- [x] Cloud Run 또는 Fly.io/Render 배포 문서 추가
- [x] Render Blueprint와 5분 cron guard 추가
- [x] 뉴스 수집 endpoint 수동 검증 스크립트 추가
- [x] Telegram 승인 흐름 smoke script와 정기 점검 workflow 추가

## 현재 가장 중요한 다음 작업
1. Action Report workflow 수동 실행으로 GitHub Actions 운영 경로를 검증한다.
2. Telegram smoke workflow 실패 알림이 실제 실패 상황에서 private 채팅으로 도착하는지 확인한다.
3. 가격 provider 실패율 알림이 실제 실패율 초과 상황에서 private 채팅으로 도착하는지 확인한다.
4. 추천 성과를 프롬프트/모델 버전별로 충분히 누적한 뒤 Claude Sonnet 전환 효과를 평가한다.
5. 대시보드를 Agent Server의 인증된 `/dashboard` 화면으로 승격할지는 실제 사용 빈도를 더 본 뒤 결정한다.

## 운영 루프

실전 운용은 아래 순서를 기준으로 한다.

### 매일
1. 개장 전/장중/장마감/미국장 다이제스트로 시장 상태 확인
2. 추천 후보 확인: `npm run recommendations:list`
3. 일일 행동 후보 확인: `npm run action:report`
4. 경제적 자유 상태 확인: `npm run freedom:report`
5. 실제 매매 기록: `npm run trade:record -- --side buy --symbol 005930 --name 삼성전자 --qty 1 --price 70000`
6. GitHub Actions 포트폴리오 동기화: `npm run portfolio:sync-secret`
7. 평가손익 스냅샷: `npm run portfolio:snapshot`

### 매주
1. 실제 거래 성과 확인: `npm run trade:performance`
2. 주간 추천/거래 리뷰: `npm run review:weekly`
3. 원칙 위반 거래와 다음 주 현금 비중 점검

### 매월
1. 월간 전략 리뷰: `npm run review:monthly`
2. 순자산, 월 저축액, 경제적 자유 달성률 업데이트
3. AI 추천 전략의 기여도와 지수투자 대비 초과성과 점검
