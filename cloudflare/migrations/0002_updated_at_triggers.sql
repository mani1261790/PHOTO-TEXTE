CREATE TRIGGER IF NOT EXISTS trg_user_profiles_updated
AFTER UPDATE ON user_profiles
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE user_profiles
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_entries_updated
AFTER UPDATE ON entries
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE entries
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_entry_photos_updated
AFTER UPDATE ON entry_photos
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE entry_photos
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;
