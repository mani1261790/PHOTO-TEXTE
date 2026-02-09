import { z } from 'zod';

export const profileUpdateSchema = z.object({
  email: z.string().email().max(320).optional(),
  display_name: z.string().max(80).optional().nullable(),
  grammatical_gender: z.enum(['male', 'female', 'neutral', 'auto']),
  cefr_level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  politeness_pref: z.string().max(32).optional().nullable(),
  service_language: z.enum(['ja', 'fr'])
});

export const createEntrySchema = z.object({
  title_fr: z.string().min(1).max(200),
  draft_fr: z.string().min(1).max(8000),
  photo_asset_id: z.string().uuid()
});

export const updateEntrySchema = z.object({
  title_fr: z.string().min(1).max(200).optional(),
  draft_fr: z.string().min(1).max(8000).optional(),
  photo_asset_id: z.string().uuid().optional()
});

export const lockIntentSchema = z.object({
  jp_intent: z.string().min(1).max(8000)
});

export const createMemoSchema = z.object({
  memo_type: z.enum(['TEACHER_FEEDBACK', 'SELF_NOTE']),
  content: z.string().min(1).max(4000)
});

export const exportSchema = z.object({
  include_memos: z.boolean().optional().default(false)
});

export const signupSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  display_name: z.string().max(80).optional(),
  grammatical_gender: z.enum(['male', 'female', 'neutral', 'auto']).default('auto'),
  cefr_level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).default('A2'),
  politeness_pref: z.string().max(32).optional().nullable(),
  service_language: z.enum(['ja', 'fr']).default('ja')
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});
