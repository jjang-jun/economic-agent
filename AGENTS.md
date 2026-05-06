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
  -> seen-articles duplicate filter
  -> keyword filter
  -> local scorer (keyword weights + FinBERT for English sentiment)
  -> daily scored article archive
  -> score 5 urgent articles: relevance filter + Telegram immediate alert
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
- Record an actual manual trade execution: `npm run trade:record -- --side buy --ticker 005930 --quantity 3 --price 266000`
- Review actual trade performance: `npm run trade:performance`
- Create a current portfolio valuation snapshot: `npm run portfolio:snapshot`
- Push Supabase schema: `npm run db:push`
- Import existing local `data/*.json` history into Supabase: `npm run db:import-local`
- Pull Supabase history to local JSON/SQLite: `npm run db:pull`
- Test: `npm test`

`npm start`, `npm run digest`, `npm run report`, `npm run evaluate`, `npm run db:push`, `npm run db:import-local`, and `npm run db:pull` read `.env` through Node's `--env-file=.env` flag. They may call RSS/API/Telegram/AI/Supabase services. Use them intentionally.

## Environment
- Required for Telegram delivery: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- AI digest/report provider: `AI_PROVIDER`, optional `AI_MODEL`, `AI_BASE_URL`, and provider key such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, or generic `AI_API_KEY`
- Optional indicators/data: `BOK_API_KEY`, `FRED_API_KEY`, `DART_API_KEY`
- Optional history store: `SUPABASE_PROJECT_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DB_PASSWORD` or `SUPABASE_DB_URL` for schema pushes
- Optional private portfolio file: `PORTFOLIO_FILE`, defaulting to ignored `data/portfolio.json`
- Optional private portfolio env for GitHub Actions: `PORTFOLIO_JSON_BASE64` or `PORTFOLIO_JSON`
- `.env` is private and must not be committed.

## File Map
- `src/check-news.js`: news collection, filtering, urgent alert, buffer write
- `src/digest.js`: buffer read, AI digest generation, Telegram delivery, buffer clear after success
- `src/stock-report.js`: market close stock/sector analysis from the daily scored article archive
- `src/evaluate-recommendations.js`: evaluates logged stock signals after 1/5/20 days
- `scripts/record-trade.js`: records a manual buy/sell execution separately from AI recommendations
- `scripts/trade-performance.js`: evaluates actual trade executions with current quotes and sends a Telegram report when trades exist
- `src/sources/`: RSS, DART, BOK, FRED integrations
- `src/sources/dart-api.js`: OpenDART disclosure fetcher, optional `DART_API_KEY`
- `src/sources/yahoo-finance.js`: Yahoo chart quote fetcher for recommendation performance tracking and 5/20 day trend fields
- `src/sources/naver-investor.js`: Naver Finance KOSPI investor net-buy flow parser
- `src/filters/keyword-filter.js`: first-pass keyword gate
- `src/filters/local-scorer.js`: local scoring, sentiment, sector tagging
- `src/filters/finbert.js`: English FinBERT sentiment model, cached under `.cache/`
- `src/filters/relevance-matcher.js`: personal relevance matching
- `src/analysis/`: AI prompt builders for digest/report
- `src/notify/telegram.js`: Telegram formatting and sending
- `src/utils/`: config, AI client, buffers, seen-article cache, indicators, daily summaries
- `src/utils/ai-budget.js`: trims AI prompt inputs to control token use
- `src/utils/article-archive.js`: daily scored article archive used by stock reports and later performance review
- `src/utils/recommendation-log.js`: stores stock signals and evaluates returns against KOSPI benchmark when available
- `src/utils/trade-log.js`: stores actual manual trade executions in ignored local data and Supabase
- `src/utils/decision-engine.js`: rule-based market regime, index trend scoring, and action guardrails
- Market regime can include tags such as `OVERHEATED`, `CONCENTRATED_LEADERSHIP`, `SEMICONDUCTOR_LEADERSHIP`, and `MOMENTUM_ALLOWED`. Treat these as risk controls, not pure buy signals.
- Stock recommendations should be framed as expected-value trades. Prefer risk/reward, stop-loss width, invalidation, suggested amount, and account weight over plain buy/sell wording.
- Recommended stocks can include `market_profile` with relative strength, volume ratio, and average turnover. Liquidity and relative strength filters should reduce tradeability, not just decorate the report.
- `market_profile` also tracks 20d/60d highs and distance from the 20d high. For momentum candidates, being far below the 20d high should reduce tradeability.
- `src/utils/portfolio.js`: loads ignored local portfolio data and derives cash/position risk inputs
- Portfolio valuation snapshots are saved under ignored `data/portfolio-snapshots/` and persisted to Supabase `portfolio_snapshots` when configured.
- `src/utils/persistence.js`: optional Supabase REST persistence for articles, summaries, reports, recommendations, snapshots, investor flows, decisions
- `src/config/keywords.js`: keyword weights, sentiment dictionary, sectors
- `src/config/interests.js`: user interests
- `src/config/watchlist.js`: symbols used for pre-market and global market snapshots
- `src/config/portfolio.js`: local portfolio/risk constraints used by the decision engine
- `src/config/ai-budget.js`: max article/snapshot counts and clipping lengths for AI prompts
- `supabase/migrations/`: Postgres schema migrations for long-term history
- `scripts/push-supabase.js`, `scripts/pull-supabase.js`: Supabase CLI push and local history mirror scripts
- `scripts/import-local-history.js`: uploads existing ignored `data/*.json` history into Supabase after schema creation
- `.github/workflows/`: collector, five digest schedules, stock report, portfolio snapshot, recommendation evaluation, and trade performance schedules
- `docs/README.md`: docs index and folder roles
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
- Supabase stores the same long-term history in Postgres when configured, including `investor_flows` for daily foreign/institution KOSPI net-buy data.
- `data/supabase/*.json` and `data/economic-agent.db` are generated by `npm run db:pull` for local filesystem queries.
- `.cache/` stores downloaded FinBERT model files. It is ignored by Git.
- Do not commit `node_modules/`, `.env`, `data/`, or `.cache/`.

## Working Rules
- Prefer existing CommonJS style: `require`, `module.exports`, async functions, and small utility modules.
- Keep changes focused. Avoid broad refactors unless the task needs them.
- When changing behavior, update `README.md` if user-facing usage, architecture, schedules, or environment variables change.
- Keep `docs/PROGRESS.md` current when milestones, storage strategy, operating checklist, or next priorities change.
- Keep `README.md`, `AGENTS.md`, `ROADMAP.md`, and docs aligned when architecture, schedules, commands, or environment variables change.
- Do not push to remote unless the user explicitly asks for it.

## Verification Notes
- Use `npm test` for the baseline check. The current project may have no test files, so also consider syntax/loading checks for changed modules when practical.
- Avoid running networked commands unless needed for the task. FinBERT may download a model on first execution.
- For GitHub Actions changes, check each workflow's schedule in UTC against KST.
