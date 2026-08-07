-- Recent summaries/reports are read-time prompt context. Older workers nested
-- them into each new daily summary, causing recursive JSON growth.
update daily_summaries
set indicators = coalesce(indicators, '{}'::jsonb)
      - 'recentDailySummaries' - 'recentStockReports'
      - 'recent_daily_summaries' - 'recent_stock_reports',
    payload = jsonb_set(
      coalesce(payload, '{}'::jsonb),
      '{indicators}',
      coalesce(payload->'indicators', '{}'::jsonb)
        - 'recentDailySummaries' - 'recentStockReports'
        - 'recent_daily_summaries' - 'recent_stock_reports',
      true
    )
where coalesce(indicators, '{}'::jsonb) ?| array[
  'recentDailySummaries', 'recentStockReports',
  'recent_daily_summaries', 'recent_stock_reports'
] or coalesce(payload->'indicators', '{}'::jsonb) ?| array[
  'recentDailySummaries', 'recentStockReports',
  'recent_daily_summaries', 'recent_stock_reports'
];
