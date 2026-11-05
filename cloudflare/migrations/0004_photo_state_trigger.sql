CREATE TRIGGER IF NOT EXISTS trg_enforce_entry_photo_state
BEFORE UPDATE ON entry_photos
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'invalid transition from DRAFT_FR')
  WHERE OLD.status = 'DRAFT_FR' AND NEW.status NOT IN ('DRAFT_FR', 'JP_AUTO_READY');

  SELECT RAISE(ABORT, 'invalid transition from JP_AUTO_READY')
  WHERE OLD.status = 'JP_AUTO_READY' AND NEW.status NOT IN ('JP_AUTO_READY', 'JP_INTENT_LOCKED');

  SELECT RAISE(ABORT, 'invalid transition from JP_INTENT_LOCKED')
  WHERE OLD.status = 'JP_INTENT_LOCKED' AND NEW.status NOT IN ('JP_INTENT_LOCKED', 'FINAL_FR_READY');

  SELECT RAISE(ABORT, 'invalid transition from FINAL_FR_READY')
  WHERE OLD.status = 'FINAL_FR_READY' AND NEW.status NOT IN ('FINAL_FR_READY', 'EXPORTED');

  SELECT RAISE(ABORT, 'invalid transition from EXPORTED')
  WHERE OLD.status = 'EXPORTED' AND NEW.status <> 'EXPORTED';

  SELECT RAISE(ABORT, 'jp_intent is immutable after first lock')
  WHERE OLD.jp_intent IS NOT NULL AND NEW.jp_intent IS NOT OLD.jp_intent;

  SELECT RAISE(ABORT, 'source fields are immutable after JP_INTENT_LOCKED')
  WHERE OLD.status IN ('JP_INTENT_LOCKED', 'FINAL_FR_READY') AND (
    NEW.entry_id IS NOT OLD.entry_id OR
    NEW.user_id IS NOT OLD.user_id OR
    NEW.position IS NOT OLD.position OR
    NEW.photo_asset_id IS NOT OLD.photo_asset_id OR
    NEW.draft_fr IS NOT OLD.draft_fr OR
    NEW.jp_auto IS NOT OLD.jp_auto OR
    NEW.jp_intent IS NOT OLD.jp_intent
  );

  SELECT RAISE(ABORT, 'text and photo fields are immutable after EXPORTED')
  WHERE OLD.status = 'EXPORTED' AND (
    NEW.entry_id IS NOT OLD.entry_id OR
    NEW.user_id IS NOT OLD.user_id OR
    NEW.position IS NOT OLD.position OR
    NEW.photo_asset_id IS NOT OLD.photo_asset_id OR
    NEW.draft_fr IS NOT OLD.draft_fr OR
    NEW.jp_auto IS NOT OLD.jp_auto OR
    NEW.jp_intent IS NOT OLD.jp_intent OR
    NEW.final_fr IS NOT OLD.final_fr
  );
END;
