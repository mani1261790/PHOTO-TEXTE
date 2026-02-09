export type GrammaticalGender = 'male' | 'female' | 'neutral' | 'auto';
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type EntryStatus =
  | 'DRAFT_FR'
  | 'JP_AUTO_READY'
  | 'JP_INTENT_LOCKED'
  | 'FINAL_FR_READY'
  | 'EXPORTED';

export type MemoType = 'TEACHER_FEEDBACK' | 'SELF_NOTE';

export interface UserProfile {
  id: string;
  display_name: string | null;
  grammatical_gender: GrammaticalGender;
  cefr_level: CEFRLevel;
  politeness_pref: string | null;
  service_language: 'ja' | 'fr';
  email_encrypted: string;
  wrapped_data_key: string;
  created_at: string;
  updated_at: string;
}

export interface Entry {
  id: string;
  user_id: string;
  title_fr: string;
  draft_fr: string;
  jp_auto: string | null;
  jp_intent: string | null;
  final_fr: string | null;
  photo_asset_id: string;
  status: EntryStatus;
  created_at: string;
  updated_at: string;
}

export interface Memo {
  id: string;
  entry_id: string;
  user_id: string;
  memo_type: MemoType;
  content: string;
  created_at: string;
}

export interface Asset {
  id: string;
  user_id: string;
  object_path: string;
  mime: string;
  size: number;
  sha256: string;
  created_at: string;
}

export interface ExportFile {
  id: string;
  user_id: string;
  entry_id: string;
  token_hash: string;
  object_path: string;
  expires_at: string;
  created_at: string;
}
