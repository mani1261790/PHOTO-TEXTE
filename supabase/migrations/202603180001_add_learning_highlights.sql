begin;

alter table public.entries
  add column if not exists learning_highlights jsonb;

alter table public.entry_photos
  add column if not exists learning_highlights jsonb;

commit;
