CREATE TRIGGER IF NOT EXISTS trg_entry_photos_max_10
BEFORE INSERT ON entry_photos
FOR EACH ROW WHEN (SELECT COUNT(*) FROM entry_photos WHERE entry_id = NEW.entry_id) >= 10
BEGIN
  SELECT RAISE(ABORT, 'max 10 photos per entry');
END;
