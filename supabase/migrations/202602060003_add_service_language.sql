alter table public.user_profiles
  add column if not exists service_language text not null default 'ja';

alter table public.user_profiles
  add constraint user_profiles_service_language_check
  check (service_language in ('ja', 'fr'));
