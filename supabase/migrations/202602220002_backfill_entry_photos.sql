-- Add migration to backfill legacy single-photo entries into entry_photos for compatibility
--
-- Goal:
-- - For existing entries created before multi-photo support (where entries.photo_asset_id is set),
--   create a corresponding entry_photos row (position=1) if none exists yet.
-- - Also copy per-entry text fields to per-photo fields so the new multi-photo EntryWizard/export work.
--
-- Safety/Idempotency:
-- - Uses NOT EXISTS to avoid inserting duplicates.
-- - Only backfills entries with a non-null photo_asset_id.
-- - Does not overwrite existing entry_photos rows.
-- - Runs in a transaction.
--
-- Notes:
-- - If an entry already has entry_photos (multi-photo), this migration does nothing for it.
-- - If an entry has photo_asset_id but empty draft_fr, we still backfill draft_fr as-is
--   (application-level validators may require draft_fr; DB requires non-null).
-- - jp_intent immutability is enforced by triggers. We only populate jp_intent when it is currently NULL
--   in the target row (but since we insert new rows only, that's satisfied).

begin;

-- 1) Backfill missing entry_photos rows for legacy entries
insert into public.entry_photos (
  entry_id,
  user_id,
  position,
  photo_asset_id,
  draft_fr,
  jp_auto,
  jp_intent,
  final_fr,
  status
)
select
  e.id as entry_id,
  e.user_id as user_id,
  1 as position,
  e.photo_asset_id as photo_asset_id,
  coalesce(e.draft_fr, '') as draft_fr,
  e.jp_auto as jp_auto,
  e.jp_intent as jp_intent,
  e.final_fr as final_fr,
  -- Map legacy entry status directly; enums share the same labels.
  e.status::text::public.entry_photo_status as status
from public.entries e
where
  e.photo_asset_id is not null
  and not exists (
    select 1
    from public.entry_photos ep
    where ep.entry_id = e.id
  );

-- 2) Defensive: ensure position=1 for any backfilled rows if future adjustments inserted position NULL (shouldn't happen)
-- (No-op for current schema due to NOT NULL + CHECK + INSERT explicit position.)

commit;
