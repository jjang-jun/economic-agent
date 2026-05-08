alter table recommendations
  add column if not exists ai_provider text,
  add column if not exists ai_model text,
  add column if not exists prompt_version text,
  add column if not exists ai_metadata jsonb;

create index if not exists recommendations_prompt_version_idx
on recommendations(prompt_version);

create index if not exists recommendations_ai_model_idx
on recommendations(ai_model);
