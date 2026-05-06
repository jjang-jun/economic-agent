# Economic Agent - Codex Guide

## Project Summary
- Personal economic news agent written in Node.js CommonJS.
- Collector runs every 5 minutes, scores economic news locally, sends urgent items to Telegram, and stores non-urgent score 4 items for scheduled digests.
- Scheduled digests and stock reports use the provider-agnostic AI client in `src/utils/ai-client.js`.
- Runtime target: Node.js 20+.

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
- `.env` is private and must not be committed.

## File Map
- `src/check-news.js`: news collection, filtering, urgent alert, buffer write
- `src/digest.js`: buffer read, AI digest generation, Telegram delivery, buffer clear after success
- `src/stock-report.js`: market close stock/sector analysis from the daily scored article archive
- `src/evaluate-recommendations.js`: evaluates logged stock signals after 1/5/20 days
- `src/sources/`: RSS, DART, BOK, FRED integrations
- `src/sources/dart-api.js`: OpenDART disclosure fetcher, optional `DART_API_KEY`
- `src/sources/yahoo-finance.js`: Yahoo chart quote fetcher for recommendation performance tracking
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
- `src/utils/decision-engine.js`: rule-based market regime and action guardrails
- `src/utils/persistence.js`: optional Supabase REST persistence for articles, summaries, reports, recommendations, snapshots, decisions
- `src/config/keywords.js`: keyword weights, sentiment dictionary, sectors
- `src/config/interests.js`: user interests
- `src/config/watchlist.js`: symbols used for pre-market and global market snapshots
- `src/config/portfolio.js`: local portfolio/risk constraints used by the decision engine
- `src/config/ai-budget.js`: max article/snapshot counts and clipping lengths for AI prompts
- `supabase/migrations/`: Postgres schema migrations for long-term history
- `scripts/push-supabase.js`, `scripts/pull-supabase.js`: Supabase CLI push and local history mirror scripts
- `scripts/import-local-history.js`: uploads existing ignored `data/*.json` history into Supabase after schema creation
- `.github/workflows/`: collector, five digest schedules, stock report schedule
- `docs/README.md`: docs index and folder roles
- `docs/PROGRESS.md`: human-readable development progress and current operating context
- `ROADMAP.md`: long-term product and investing-system roadmap

## Data And Generated Files
- `data/` stores runtime state such as seen articles, article buffer, and daily summaries. It is ignored by Git.
- `data/daily-articles/YYYY-MM-DD.json` stores scored articles for the day. Use this for daily stock reports instead of relying only on currently new RSS items.
- `data/article-buffer.json` must only be cleared after digest generation and Telegram delivery both succeed.
- `data/recommendations/recommendations.json` stores stock signals, entry prices, and 1/5/20 day evaluations.
- Supabase stores the same long-term history in Postgres when configured.
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
