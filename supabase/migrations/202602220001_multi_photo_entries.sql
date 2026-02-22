-- Add per-photo table for multi-photo entries and enforce per-photo state immutability
--
-- This migration introduces:
-- - entries.photo_asset_id becomes optional (legacy single-photo support)
-- - entry_photos table: up to 10 photos per entry, each with its own FR draft, JP auto, JP intent, final FR, and status
-- - triggers to:
--    * enforce per-photo state transitions
--    * enforce immutability rules per photo (mirrors entries logic)
--    * enforce max 10 photos per entry
-- - RLS policy so users can manage their own entry_photos
--
-- NOTE:
-- - Existing "entries" logic remains intact. The application should migrate to using entry_photos.
-- - Existing entries with entries.photo_asset_id remain valid; app can optionally backfill entry_photos.
-- - This migration does NOT backfill data because that would require assumptions about existing text distribution.

begin;

-- 1) Allow entries to exist without a single photo_asset_id (multi-photo will be stored in entry_photos).
alter table public.entries
  alter column photo_asset_id drop not null;

-- 2) Create a per-photo status enum (kept separate to avoid breaking existing entry_status usage).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'entry_photo_status') then
    create type entry_photo_status as enum (
      'DRAFT_FR',
      'JP_AUTO_READY',
      'JP_INTENT_LOCKED',
      'FINAL_FR_READY',
      'EXPORTED'
    );
  end if;
end
$$;

-- 3) Create entry_photos table.
create table if not exists public.entry_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- order within entry (1..10). This also helps deterministic PPTX generation.
  position smallint not null check (position >= 1 and position <= 10),

  photo_asset_id uuid not null references public.assets(id) on delete restrict,

  draft_fr text not null,
  jp_auto text,
  jp_intent text,
  final_fr text,
  status entry_photo_status not null default 'DRAFT_FR',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- prevent duplicate positions within an entry
  constraint entry_photos_entry_position_unique unique (entry_id, position)
);

create index if not exists idx_entry_photos_entry_id_position
  on public.entry_photos(entry_id, position);

create index if not exists idx_entry_photos_user_id_created_at
  on public.entry_photos(user_id, created_at desc);

create index if not exists idx_entry_photos_asset_id
  on public.entry_photos(photo_asset_id);

-- 4) updated_at trigger for entry_photos (reuses existing public.set_updated_at()).
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_entry_photos_updated'
  ) then
    create trigger trg_entry_photos_updated
    before update on public.entry_photos
    for each row execute function public.set_updated_at();
  end if;
end
$$;

-- 5) Enforce max 10 photos per entry.
create or replace function public.enforce_entry_photos_max_10()
returns trigger
language plpgsql
as $$
declare
  current_count integer;
begin
  -- Only check on insert or when moving a row to a different entry.
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.entry_id is distinct from old.entry_id) then
    select count(*)
      into current_count
      from public.entry_photos
     where entry_id = new.entry_id;

    if current_count >= 10 then
      raise exception 'max 10 photos per entry';
    end if;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_entry_photos_max_10'
  ) then
    create trigger trg_entry_photos_max_10
    before insert or update of entry_id on public.entry_photos
    for each row execute function public.enforce_entry_photos_max_10();
  end if;
end
$$;

-- 6) Enforce per-photo state machine transitions + immutability.
--
-- Transition rules mirror public.enforce_entry_state():
--   DRAFT_FR -> JP_AUTO_READY
--   JP_AUTO_READY -> JP_INTENT_LOCKED
--   JP_INTENT_LOCKED -> FINAL_FR_READY
--   FINAL_FR_READY -> EXPORTED
--   EXPORTED -> (no changes)
--
-- Immutability rules:
-- - jp_intent is set once (at lock), then never changed.
-- - While JP_INTENT_LOCKED: only final_fr + status may change.
-- - After FINAL_FR_READY/EXPORTED: all text/photo fields are immutable.
create or replace function public.enforce_entry_photo_state()
returns trigger
language plpgsql
as $$
begin
  -- Status transition rules
  if old.status = 'DRAFT_FR' and new.status not in ('DRAFT_FR', 'JP_AUTO_READY') then
    raise exception 'invalid transition from DRAFT_FR to %', new.status;
  elsif old.status = 'JP_AUTO_READY' and new.status not in ('JP_AUTO_READY', 'JP_INTENT_LOCKED') then
    raise exception 'invalid transition from JP_AUTO_READY to %', new.status;
  elsif old.status = 'JP_INTENT_LOCKED' and new.status not in ('JP_INTENT_LOCKED', 'FINAL_FR_READY') then
    raise exception 'invalid transition from JP_INTENT_LOCKED to %', new.status;
  elsif old.status = 'FINAL_FR_READY' and new.status not in ('FINAL_FR_READY', 'EXPORTED') then
    raise exception 'invalid transition from FINAL_FR_READY to %', new.status;
  elsif old.status = 'EXPORTED' and new.status <> 'EXPORTED' then
    raise exception 'invalid transition from EXPORTED to %', new.status;
  end if;

  -- jp_intent can be set once (at lock), then never changed.
  if old.jp_intent is not null and new.jp_intent is distinct from old.jp_intent then
    raise exception 'jp_intent is immutable after first lock';
  end if;

  -- While locked but before final ready: only final_fr + status may change.
  if old.status = 'JP_INTENT_LOCKED' then
    if new.entry_id is distinct from old.entry_id
      or new.user_id is distinct from old.user_id
      or new.position is distinct from old.position
      or new.photo_asset_id is distinct from old.photo_asset_id
      or new.draft_fr is distinct from old.draft_fr
      or new.jp_auto is distinct from old.jp_auto
      or new.jp_intent is distinct from old.jp_intent then
      raise exception 'text and photo fields are immutable after JP_INTENT_LOCKED';
    end if;
  end if;

  -- After final is ready, all text/photo fields are immutable.
  if old.status in ('FINAL_FR_READY', 'EXPORTED') then
    if new.entry_id is distinct from old.entry_id
      or new.user_id is distinct from old.user_id
      or new.position is distinct from old.position
      or new.photo_asset_id is distinct from old.photo_asset_id
      or new.draft_fr is distinct from old.draft_fr
      or new.jp_auto is distinct from old.jp_auto
      or new.jp_intent is distinct from old.jp_intent
      or new.final_fr is distinct from old.final_fr then
      raise exception 'text and photo fields are immutable after FINAL_FR_READY';
    end if;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_enforce_entry_photo_state'
  ) then
    create trigger trg_enforce_entry_photo_state
    before update on public.entry_photos
    for each row execute function public.enforce_entry_photo_state();
  end if;
end
$$;

-- 7) RLS for entry_photos.
alter table public.entry_photos enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'entry_photos'
      and policyname = 'users manage own entry_photos'
  ) then
    create policy "users manage own entry_photos"
    on public.entry_photos
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end
$$;

commit;
