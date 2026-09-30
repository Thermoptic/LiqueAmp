import { useEffect, useRef } from 'react';
import { useSyncAttention } from '../../stores/accountStore';
import { useUi } from '../../stores/uiStore';

/**
 * Says once, wherever the user is, when saving to the account has stopped and
 * needs them (Settings › Account has the choice); the status bar and the
 * Settings marker keep showing it.
 */
export function SyncAttentionNotice() {
  const attention = useSyncAttention();
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const key = attention ? attention.message : null;
    if (key && key !== shown.current) useUi.getState().toast(attention!.message, 'error');
    shown.current = key;
  }, [attention]);
  return null;
}
