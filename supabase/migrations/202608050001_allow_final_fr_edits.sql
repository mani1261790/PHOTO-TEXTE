-- Allow a learner to edit only the final French text before export.
-- All source/photo/Japanese fields remain immutable after finalization.

create or replace function public.enforce_entry_photo_state()
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

  if old.jp_intent is not null and new.jp_intent is distinct from old.jp_intent then
    raise exception 'jp_intent is immutable after first lock';
  end if;

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

  if old.status = 'FINAL_FR_READY' then
    if new.entry_id is distinct from old.entry_id
      or new.user_id is distinct from old.user_id
      or new.position is distinct from old.position
      or new.photo_asset_id is distinct from old.photo_asset_id
      or new.draft_fr is distinct from old.draft_fr
      or new.jp_auto is distinct from old.jp_auto
      or new.jp_intent is distinct from old.jp_intent then
      raise exception 'source fields are immutable after FINAL_FR_READY';
    end if;
  end if;

  if old.status = 'EXPORTED' then
    if new.entry_id is distinct from old.entry_id
      or new.user_id is distinct from old.user_id
      or new.position is distinct from old.position
      or new.photo_asset_id is distinct from old.photo_asset_id
      or new.draft_fr is distinct from old.draft_fr
      or new.jp_auto is distinct from old.jp_auto
      or new.jp_intent is distinct from old.jp_intent
      or new.final_fr is distinct from old.final_fr then
      raise exception 'text and photo fields are immutable after EXPORTED';
    end if;
  end if;

  return new;
end;
$$;
