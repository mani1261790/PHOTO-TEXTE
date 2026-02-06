-- Core types
create type entry_status as enum (
  'DRAFT_FR',
  'JP_AUTO_READY',
  'JP_INTENT_LOCKED',
  'FINAL_FR_READY',
  'EXPORTED'
);

create type memo_type as enum (
  'TEACHER_FEEDBACK',
  'SELF_NOTE'
);

create type grammatical_gender as enum (
  'male',
  'female',
  'neutral',
  'auto'
);

create type cefr_level as enum (
  'A1',
  'A2',
  'B1',
  'B2',
  'C1',
  'C2'
);

-- User profile with field-level encrypted columns.
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email_encrypted text not null,
  wrapped_data_key text not null,
  display_name text,
  grammatical_gender grammatical_gender not null default 'auto',
  cefr_level cefr_level not null default 'A2',
  politeness_pref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  mime text not null,
  size integer not null check (size > 0),
  sha256 text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title_fr text not null,
  draft_fr text not null,
  jp_auto text,
  jp_intent text,
  final_fr text,
  photo_asset_id uuid not null references public.assets(id) on delete restrict,
  status entry_status not null default 'DRAFT_FR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  memo_type memo_type not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  token_hash text not null unique,
  object_path text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_entries_user_id_created_at on public.entries(user_id, created_at desc);
create index if not exists idx_memos_entry_id on public.memos(entry_id);
create index if not exists idx_exports_expires_at on public.exports(expires_at);

-- Timestamp trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_user_profiles_updated
before update on public.user_profiles
for each row execute function public.set_updated_at();

create trigger trg_entries_updated
before update on public.entries
for each row execute function public.set_updated_at();

-- Entry state machine enforcement and immutability after intent lock.
create or replace function public.enforce_entry_state()
returns trigger
language plpgsql
as $$
begin
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

  if old.status in ('JP_INTENT_LOCKED', 'FINAL_FR_READY', 'EXPORTED') then
    if new.title_fr is distinct from old.title_fr
      or new.draft_fr is distinct from old.draft_fr
      or new.jp_auto is distinct from old.jp_auto
      or new.jp_intent is distinct from old.jp_intent
      or new.final_fr is distinct from old.final_fr
      or new.photo_asset_id is distinct from old.photo_asset_id then
      raise exception 'text and photo fields are immutable after JP_INTENT_LOCKED';
    end if;
  end if;

  if old.jp_intent is not null and new.jp_intent is distinct from old.jp_intent then
    raise exception 'jp_intent is immutable after first lock';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_entry_state
before update on public.entries
for each row execute function public.enforce_entry_state();

-- RLS
alter table public.user_profiles enable row level security;
alter table public.assets enable row level security;
alter table public.entries enable row level security;
alter table public.memos enable row level security;
alter table public.exports enable row level security;

create policy "users manage own profile"
on public.user_profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "users manage own assets"
on public.assets
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users manage own entries"
on public.entries
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users manage own memos"
on public.memos
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users manage own exports"
on public.exports
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Storage buckets are private and only owner can manage objects.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

create policy "owners manage photos"
on storage.objects
for all
using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "owners manage exports"
on storage.objects
for all
using (bucket_id = 'exports' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'exports' and auth.uid()::text = (storage.foldername(name))[1]);

-- Delete helper for account cleanup.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.exports where user_id = uid;
  delete from public.memos where user_id = uid;
  delete from public.entries where user_id = uid;
  delete from public.assets where user_id = uid;
  delete from public.user_profiles where id = uid;
end;
$$;
