// One message for every attempt to change a Friend Lique (checkpoint 8). The
// stores refuse the change before anything happens (ProfileScopeError); this
// only tells the user why, once, instead of a toast per slider step.
import { ProfileScopeError, READ_ONLY_SCOPE_MESSAGE } from '../storage/scope';
import { useUi } from '../../stores/uiStore';

export const READ_ONLY_MESSAGE = READ_ONLY_SCOPE_MESSAGE;

export function notifyReadOnly(): void {
  const { toasts, toast } = useUi.getState();
  if (toasts.some((t) => t.message === READ_ONLY_MESSAGE)) return;
  toast(READ_ONLY_MESSAGE, 'info');
}

/**
 * Edits started from the UI without their own error handling (theme editor,
 * category and media edits, …) end as unhandled ProfileScopeErrors in a
 * Friend Lique: show the read-only notice for them instead of nothing.
 */
export function startReadOnlyNotices(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('unhandledrejection', (e) => {
    if (e.reason instanceof ProfileScopeError) {
      e.preventDefault();
      notifyReadOnly();
    }
  });
}
