-- Fix: allow final_fr to be written exactly during JP_INTENT_LOCKED -> FINAL_FR_READY
-- while keeping all other post-lock fields immutable.

create or replace function public.enforce_entry_state()
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
    if new.title_fr is distinct from old.title_fr
      or new.draft_fr is distinct from old.draft_fr
      or new.jp_auto is distinct from old.jp_auto
      or new.jp_intent is distinct from old.jp_intent
      or new.photo_asset_id is distinct from old.photo_asset_id then
      raise exception 'text and photo fields are immutable after JP_INTENT_LOCKED';
    end if;
  end if;

  -- After final is ready, all text/photo fields are immutable.
  if old.status in ('FINAL_FR_READY', 'EXPORTED') then
    if new.title_fr is distinct from old.title_fr
      or new.draft_fr is distinct from old.draft_fr
      or new.jp_auto is distinct from old.jp_auto
      or new.jp_intent is distinct from old.jp_intent
      or new.final_fr is distinct from old.final_fr
      or new.photo_asset_id is distinct from old.photo_asset_id then
      raise exception 'text and photo fields are immutable after FINAL_FR_READY';
    end if;
  end if;

  return new;
end;
$$;
