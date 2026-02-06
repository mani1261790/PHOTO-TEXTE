-- Intended for Supabase SQL editor test role checks.
-- This script is illustrative and can be adapted into pgTAP.

-- 1) Verify users cannot read other users entries.
-- set local role authenticated;
-- set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
-- select count(*) from public.entries where user_id <> auth.uid(); -- should be 0

-- 2) Verify users cannot mutate text after lock.
-- update public.entries
-- set draft_fr = 'blocked'
-- where id = '<locked-entry-id>';
-- should raise exception from trg_enforce_entry_state.
