# Economic Agent - Codex Guide

## Project Summary
- Personal economic news agent written in Node.js CommonJS.
- Collector runs every 5 minutes, scores economic news locally, sends urgent items to Telegram, and stores non-urgent score 4 items for scheduled digests.
- Scheduled digests and stock reports use the provider-agnostic AI client in `src/utils/ai-client.js`.
- Runtime target: Node.js 22+.

## Core Flow
```
RSS feeds
  + DART disclosures
  + KOSPI/KOSDAQ intraday stress thresholds
  -> seen-articles duplicate filter
  -> keyword filter
  -> local scorer (keyword weights + FinBERT for English sentiment)
  -> daily scored article archive
  -> score 5 urgent articles: strict immediate policy (systemic event or fatal holding/explicit critical-alert disclosure)
  -> other score 5 articles: digest buffer
  -> score 4 articles: article buffer
  -> scheduled AI digest/report + Telegram
```

## Important Commands
- Install dependencies: `npm install` or `npm ci`
- Collect news once: `npm start`
- Send digest: `npm run digest`
- Send digest for a session: `npm run digest -- preopen`
- Send stock report: `npm run report`
- Evaluate recommendation performance: `npm run evaluate`
- List recent recommendations and IDs: `npm run recommendations:list`
- Record an actual manual trade execution: `npm run trade:record -- --side buy --ticker 005930 --quantity 3 --price 266000`; add `--currency USD --fxRate 1390` for USD trades and `--reason` for sells
- Record a portfolio cash flow: `npm run cashflow:record -- --type deposit --amount 1000000 --occurred-at 2026-08-01T09:00:00+09:00`
- Review actual trade performance: `npm run trade:performance`
- Send premarket/intraday timing alerts: `npm run timing:alert -- premarket`, `npm run timing:alert -- intraday`
- Detect low-cost pre-news signals: `npm run pre-news:signal`
- Evaluate stored market anomalies after 1/5 trading sessions: `npm run anomaly:evaluate`
- Build weekly/monthly performance reviews: `npm run review:weekly`, `npm run review:monthly`
- Check model/prompt performance sample readiness: `npm run model:performance` after `npm run db:pull`
- Backfill research-only shadow candidates from pulled historical stock reports: `npm run research:backfill`
- Build local HTML dashboard from pulled Supabase mirrors: `npm run dashboard`
- Create a current portfolio valuation snapshot: `npm run portfolio:snapshot`
- Sync ignored local portfolio to GitHub Actions secret: `npm run portfolio:sync-secret`
- Push Supabase schema: `npm run db:push`
- Import existing local `data/*.json` history into Supabase: `npm run db:import-local`
- Pull Supabase history to local JSON/SQLite: `npm run db:pull`
- Check deployed Agent Server commit freshness: `npm run deploy:freshness`
- Check dependency vulnerabilities: `npm run security:audit`
- Test: `npm test`

Most operational npm scripts read `.env` through Node's `--env-file-if-exists=.env` flag, so GitHub Actions can rely on injected secrets without a checked-in `.env`. `npm start` remains the local one-shot collector entrypoint with `--env-file=.env`. Networked commands such as `npm run digest`, `npm run report`, `npm run evaluate`, `npm run db:push`, `npm run db:import-local`, `npm run db:pull`, and `npm run security:audit` may call RSS/API/Telegram/AI/Supabase/npm registry services. Use them intentionally.

## Environment
- Required for Telegram delivery: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- AI digest/report provider: `AI_PROVIDER`, optional `AI_MODEL`, task overrides `AI_DIGEST_MODEL`/`AI_STOCK_MODEL`, `AI_DIGEST_REASONING_EFFORT`/`AI_STOCK_REASONING_EFFORT`, `AI_DIGEST_VERBOSITY`/`AI_STOCK_VERBOSITY`, Qwen/DeepSeek `AI_DIGEST_THINKING_MODE`/`AI_STOCK_THINKING_MODE`, optional `AI_TEMPERATURE`, privacy-safe `OPENAI_SAFETY_IDENTIFIER`, `AI_BASE_URL`, and provider key such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `DASHSCOPE_API_KEY`, `DEEPSEEK_API_KEY`, or generic fallback `AI_API_KEY`. The Anthropic fallback default is `claude-sonnet-5`.
- Optional indicators/data: `BOK_API_KEY`, `FRED_API_KEY`, `DART_API_KEY`
- Optional history store: `SUPABASE_PROJECT_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DB_PASSWORD` or `SUPABASE_DB_URL` for schema pushes
- Optional deploy freshness check: `AGENT_SERVER_URL` or `CLOUD_RUN_SERVICE_URL`, with `EXPECTED_DEPLOY_SHA` when running outside GitHub Actions
- Optional Supabase resilience tuning: `SUPABASE_REQUEST_TIMEOUT_MS`, `SUPABASE_RETRY_COUNT`, `SUPABASE_RETRY_DELAY_MS`, `SUPABASE_RETRY_MAX_DELAY_MS`, `SUPABASE_CIRCUIT_BREAKER_MS`
- Optional Telegram network timeout: `TELEGRAM_REQUEST_TIMEOUT_MS`
- Optional public EOD timeouts: `KRX_REQUEST_TIMEOUT_MS`, `KRX_CIRCUIT_BREAKER_MS`, `DATA_GO_KR_REQUEST_TIMEOUT_MS`
- Optional private portfolio file: `PORTFOLIO_FILE`, defaulting to ignored `data/portfolio.json`
- Optional private portfolio env for GitHub Actions: `PORTFOLIO_JSON_BASE64` or `PORTFOLIO_JSON`
- Optional urgent-alert tuning: `MAX_URGENT_ALERTS_PER_RUN`, `MAX_URGENT_ALERTS_PER_DAY`, `URGENT_EVENT_DEDUP_HOURS`, `IMMEDIATE_ALERT_MIN_IMPORTANCE`, `IMMEDIATE_ALERT_MIN_URGENCY`
- Optional market-stress tuning: `MARKET_STRESS_ALERTS_ENABLED`, `MARKET_STRESS_WARNING_PCT`, `MARKET_STRESS_SEVERE_PCT`, `MARKET_STRESS_CIRCUIT_BREAKER_PCT`
- Optional anomaly/news timing validation: `PRE_NEWS_EVIDENCE_LOOKBACK_HOURS` (default 12), `PRE_NEWS_FOLLOW_UP_HOURS` (default 24)
- Optional evidence gates: `STRATEGY_MIN_EVALUATED`, `STRATEGY_MIN_LINKED_TRADES`; `EVALUATION_ALLOW_CURRENT_FALLBACK` should remain false in normal operation.
- Optional local research worker: `LOCAL_RESEARCH_WORKER_ENABLED=true` enables the monthly review sidecar that calls `scripts/local-backtest-worker.py`; `LOCAL_RESEARCH_WORKER_PROVIDER` and `LOCAL_RESEARCH_MAX_TICKERS` tune provider and ticker count.
- `.env` is private and must not be committed.

## File Map
- `src/check-news.js`: news collection, filtering, urgent alert, buffer write
- `src/digest.js`: buffer read, AI digest generation, Telegram delivery, buffer clear after success
- `src/stock-report.js`: market close stock/sector analysis from the daily scored article archive
- `src/evaluate-recommendations.js`: evaluates logged stock signals after 1/5/20 days
- `scripts/record-trade.js`: records a manual buy/sell execution separately from AI recommendations
- `scripts/trade-performance.js`: evaluates actual trade executions with current quotes and sends a Telegram report when trades exist
- `scripts/performance-review.js`: writes weekly/monthly recommendation-vs-trade performance reviews
- `scripts/model-performance-readiness.js`: reads Supabase mirrors and reports model/prompt sample readiness for recommendation performance
- `scripts/dashboard.js`: generates ignored local HTML dashboard from `data/supabase/*.json`
- `watchlist.domesticMomentum`: domestic leaders monitored for price/volume momentum even when same-day news recommendations are absent
- `src/sources/`: RSS, DART, BOK, FRED integrations
- `src/sources/dart-api.js`: OpenDART disclosure fetcher, optional `DART_API_KEY`
- `src/sources/yahoo-finance.js`: Yahoo chart quote fetcher for recommendation performance tracking and 5/20 day trend fields
- `src/sources/naver-investor.js`: Naver Finance KOSPI investor net-buy flow parser
- `src/filters/keyword-filter.js`: first-pass keyword gate
- `src/filters/local-scorer.js`: local scoring, sentiment, sector tagging
- `src/filters/finbert.js`: English FinBERT sentiment model, cached under `.cache/`
- `src/filters/sentiment-dictionary.js`: weighted Korean/disclosure sentiment dictionary
- `src/filters/relevance-matcher.js`: personal relevance matching
- `src/analysis/`: AI prompt builders for digest/report
- `src/notify/telegram.js`: Telegram formatting and sending
- `src/utils/`: config, AI client, buffers, seen-article cache, indicators, daily summaries
- `src/utils/ai-budget.js`: trims AI prompt inputs to control token use
- `src/utils/urgent-alert-policy.js`: allows immediate alerts only for systemic events or fatal disclosures tied to holdings/`watchlist.criticalAlerts`
- `src/utils/urgent-alert-state.js`: local fallback for 24-hour event deduplication and KST daily immediate-alert caps when shared persistence is unavailable
- `src/utils/market-stress-monitor.js`: KST regular-session KOSPI/KOSDAQ -3/-5/-8% staged alerts, deduplicated locally and in Supabase
- `src/utils/capital-flow-radar.js`: daily 19-ETF price/volume relative-strength proxy; never describe it as actual ETF creations/redemptions
- `src/utils/capital-flow-report.js`: deterministic Telegram snapshot that separates KOSPI investor net-buy data from the global ETF price/volume proxy and preserves unavailable data as unavailable
- `src/utils/article-archive.js`: daily scored article archive used by stock reports and later performance review
- `src/utils/article-identity.js`: normalized article identity keys for duplicate suppression across RSS/DART, URLs, and titles
- `src/utils/recommendation-log.js`: stores stock signals and evaluates returns against KOSPI benchmark when available
- `src/utils/recommendation-identity.js`: resolves Korean company names/tickers from directly related DART disclosures or fixed watchlists before quote lookup and verifies official quote names
- `src/utils/research-candidate-log.js`: stores schema-valid but risk-blocked directional candidates in a research-only shadow cohort and evaluates them separately from live recommendations
- `src/utils/risk-reviewer.js`: rule-based risk manager for recommendation factor pass/fail and blockers
- `src/utils/valuation-profile.js`: PER/PSR/FCF yield plus growth/quality valuation overlay used by risk review
- `src/utils/timing-alert.js`: builds KOSPI/KOSDAQ premarket watchlists and intraday entry alerts from recent recommendations and moving-average timing data
- `src/utils/pre-news-signal.js`: low-cost price/volume anomaly detector for holdings, recent recommendations, and domestic/global watchlist leaders; classifies point-in-time article/DART evidence and KOSPI-wide investor-flow context without treating market flow as stock-specific or promoting anomalies to recommendations
- `src/utils/anomaly-performance.js`: research-only 1/5-trading-session evaluator and article-timing/factor-combination summary for stored market anomalies; never feeds live recommendation rules before readiness
- `src/utils/performance-review.js`: summarizes recommendation and trade performance over weekly/monthly windows
- `src/utils/local-research-worker.js`: optional monthly review sidecar for local Python OHLCV research; disabled unless `LOCAL_RESEARCH_WORKER_ENABLED=true`
- `src/utils/trade-log.js`: stores actual manual trade executions in ignored local data and Supabase, including KRW settlement amount, recommendation/plan linkage, and sell realization metadata
- `src/utils/portfolio-cash-flow.js`: stores signed deposit/withdrawal/dividend/interest/fee/tax events separately from trades
- `src/utils/portfolio-return.js`: calculates daily-snapshot TWR, annualized MWR/XIRR, and same-window KOSPI excess return
- `src/utils/decision-engine.js`: rule-based market regime, index trend scoring, and action guardrails
- `src/utils/digest-market.js`: resolves delayed digest sessions, labels snapshot freshness, builds deterministic short-term price mood, and reconciles contradictory AI digest mood
- Market regime can include tags such as `OVERHEATED`, `CONCENTRATED_LEADERSHIP`, `SEMICONDUCTOR_LEADERSHIP`, `AI_SEMICONDUCTOR_CYCLE`, `GROWTH_CONCENTRATION`, and `MOMENTUM_ALLOWED`. Treat these as risk controls, not pure buy signals.
- Macro overlays include `STAGFLATION_RISK`, `KOREA_TIGHTENING_RISK`, `EXPORT_CONCENTRATION`, `CHINA_DEMAND_RISK`, and `OIL_GEOPOLITICAL_TAIL_RISK`. They are derived from current indicators/news, not a permanently hardcoded market view.
- Stock recommendations should be framed as expected-value trades. Prefer risk/reward, stop-loss width, invalidation, suggested amount, and account weight over plain buy/sell wording.
- `action:report` should also surface strong domestic/global price movers from `watchlist.domesticMomentum` and `watchlist.globalMomentum` as `가격 모멘텀 관찰`, even when they are not fresh AI/news recommendations. Treat these as watch candidates unless risk/timing rules approve a proper recommendation.
- For existing holdings, sharp price momentum should be routed to add/trim review rather than hidden because the ticker is already held. High-profit 급등 holdings should prioritize trailing stop and partial profit lock; smaller profitable holdings can become conditional add or pullback-wait candidates.
- Recommended stocks can include `market_profile` with relative strength, volume ratio, and average turnover. Liquidity and relative strength filters should reduce tradeability, not just decorate the report.
- Recent performance review learning can tighten recommendation rules only after the approved-candidate 20-trading-session cohort passes `strategyReadiness`. Before then, failures are reported but must not tune live rules.
- `market_profile` also tracks 20d/60d highs and distance from the 20d high. For momentum candidates, being far below the 20d high should reduce tradeability.
- `market_profile.entryTiming` tracks 5d/20d moving-average alignment, 20d moving-average distance/slope, breakout/pullback status, and should block chase entries even when AI text is bullish.
- Recommendations should include `risk_review` before persistence. Treat blockers as a reason to mark a stock watch-only even when AI text sounds bullish.
- Domestic recommendations must have verified identity plus point-in-time price/technical/basic-fundamental quality before approval. Never substitute same-day accumulated trading value for 20-day average turnover.
- `src/utils/portfolio.js`: loads ignored local portfolio data and derives cash/position risk inputs
- Manual portfolio prices are capture-time values and fresh quotes should replace them unless `valuationLocked=true`. `unclassifiedAssetAmount` contributes to net worth but never to cash/buying power.
- Portfolio valuation snapshots are saved under ignored `data/portfolio-snapshots/` and persisted to Supabase `portfolio_snapshots` when configured.
- Monthly reviews are portfolio-first and must distinguish the stock-report candidate funnel from approved recommendation logs. Missing portfolio data must not be rendered as zero net worth.
- Portfolio performance must not treat deposits or withdrawals as investment return. If the cash-flow ledger is unavailable, report adjusted TWR/MWR as unavailable rather than assuming zero flows.
- Monthly recommendation reporting must distinguish evaluator history, newly approved inputs, and the strict verified cohort. A successful evaluation workflow with no new approved recommendations is not an evaluator outage; persistence errors must fail the workflow.
- `src/utils/persistence.js`: optional Supabase REST persistence for articles, summaries, reports, recommendations, snapshots, investor flows, decisions
- `src/config/keywords.js`: compatibility facade merging purpose-specific keyword configs
- `src/config/market-keywords.js`: macro/market-regime keywords
- `src/config/stock-keywords.js`: stock/sector keywords
- `src/config/disclosure-keywords.js`: DART/disclosure event keywords
- `src/config/interests.js`: user interests
- `src/config/watchlist.js`: symbols used for pre-market and global market snapshots
- `src/config/portfolio.js`: local portfolio/risk constraints used by the decision engine
- `src/config/ai-budget.js`: max article/snapshot counts and clipping lengths for AI prompts
- `supabase/migrations/`: Postgres schema migrations for long-term history
- `scripts/push-supabase.js`, `scripts/pull-supabase.js`: Supabase CLI push and local history mirror scripts
- `scripts/import-local-history.js`: uploads existing ignored `data/*.json` history into Supabase after schema creation
- `cloudbuild.yaml`: builds and deploys the Cloud Run service while keeping the image tag, revision label, and runtime `COMMIT_SHA` aligned
- `.github/workflows/`: collector, five scheduled digest workflows, stock report, timing alert, pre-news signal, portfolio snapshot, recommendation evaluation, collector/price ops checks, and trade performance schedules. Collector ops runs at 12:05 and 23:50 KST to catch daytime collection gaps.
- `docs/README.md`: docs index and folder roles
- `docs/AGENT_HARNESS.md`: Codex/sub-agent long-running task contract, verification loop, and documentation cleanup rules
- `docs/PROGRESS.md`: human-readable development progress and current operating context
- `docs/portfolio.example.json`: private `data/portfolio.json` template
- `docs/trade-executions.example.json`: private `data/trades/trade-executions.json` template
- `ROADMAP.md`: long-term product and investing-system roadmap

## Data And Generated Files
- `data/` stores runtime state such as seen articles, article buffer, and daily summaries. It is ignored by Git.
- `data/daily-articles/YYYY-MM-DD.json` stores scored articles for the day. Use this for daily stock reports instead of relying only on currently new RSS items.
- `data/article-buffer.json` must only be cleared after digest generation and Telegram delivery both succeed.
- `data/recommendations/recommendations.json` is a local mirror/fallback for stock signals and evaluations. Supabase is the primary recommendation history store when configured.
- `data/trades/trade-executions.json` is a local mirror for actual manual trade executions. Keep it separate from recommendations.
- `data/portfolio-snapshots/YYYY-MM-DD.json` stores current-price portfolio valuation snapshots.
- Supabase stores the same long-term history in Postgres when configured, including `investor_flows` for daily foreign/institution KOSPI net-buy data and `market_anomaly_signals` for anomaly/article timing plus market-wide flow-context validation.
- `research_candidates` and `research_candidate_evaluations` store shadow research outcomes only; never treat them as approved recommendations or tradeable signals.
- `data/supabase/*.json` and `data/economic-agent.db` are generated by `npm run db:pull` for local filesystem queries.
- `.cache/` stores downloaded FinBERT model files. It is ignored by Git.
- Do not commit `node_modules/`, `.env`, `data/`, or `.cache/`.

## Working Rules
- Prefer existing CommonJS style: `require`, `module.exports`, async functions, and small utility modules.
- Keep changes focused. Avoid broad refactors unless the task needs them.
- For simple, independent Codex subtasks that can be delegated, prefer `gpt-5.6-terra` with low reasoning for file lookup, narrow analysis, or simple code/test assistance. Keep complex design, risky edits, and final integration in the main session.
- For long-running or multi-file agent work, follow `docs/AGENT_HARNESS.md`: define goal/scope/safety/verification/handoff, keep generated state inspectable, and run `npm run agent:harness-check` after changing the doc map.
- When MCP resources are available, prefer them over ad-hoc scripts or web search for matching tasks: Supabase MCP for database/log context, GitHub MCP for Actions/PR/repository context, and Playwright MCP for dashboard/browser verification.
- When changing behavior, update `README.md` if user-facing usage, architecture, schedules, or environment variables change.
- Keep `docs/PROGRESS.md` current when milestones, storage strategy, operating checklist, or next priorities change.
- Keep `README.md`, `AGENTS.md`, `ROADMAP.md`, and docs aligned when architecture, schedules, commands, or environment variables change.
- Do not push to remote unless the user explicitly asks for it.

## Verification Notes
- Use `npm test` for the baseline check. The current project may have no test files, so also consider syntax/loading checks for changed modules when practical.
- Avoid running networked commands unless needed for the task. FinBERT may download a model on first execution.
- For GitHub Actions changes, check each workflow's schedule in UTC against KST.
