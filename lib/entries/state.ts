import { conflict, forbidden } from '@/lib/api/errors';
import { EntryStatus } from '@/lib/types';

const transitions: Record<EntryStatus, EntryStatus[]> = {
  DRAFT_FR: ['DRAFT_FR', 'JP_AUTO_READY'],
  JP_AUTO_READY: ['JP_AUTO_READY', 'JP_INTENT_LOCKED'],
  JP_INTENT_LOCKED: ['JP_INTENT_LOCKED', 'FINAL_FR_READY'],
  FINAL_FR_READY: ['FINAL_FR_READY', 'EXPORTED'],
  EXPORTED: ['EXPORTED']
};

export function assertTransition(
  current: EntryStatus,
  next: EntryStatus
): void {
  if (!transitions[current].includes(next)) {
    conflict('INVALID_STATUS_TRANSITION', 'Invalid status transition');
  }
}

export function canEditDraft(status: EntryStatus): boolean {
  return status === 'DRAFT_FR' || status === 'JP_AUTO_READY';
}

export function assertDraftMutable(status: EntryStatus): void {
  if (!canEditDraft(status)) {
    forbidden('ENTRY_LOCKED', 'Draft fields are locked for this entry');
  }
}

export function assertIntentLockable(status: EntryStatus): void {
  if (status !== 'JP_AUTO_READY') {
    conflict('STATUS_INVALID', 'Intent can only be locked from JP_AUTO_READY');
  }
}

export function assertRewritable(status: EntryStatus): void {
  if (status !== 'JP_INTENT_LOCKED') {
    conflict('STATUS_INVALID', 'Rewrite requires JP_INTENT_LOCKED status');
  }
}
