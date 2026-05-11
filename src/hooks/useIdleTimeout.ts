/**
 * Phase 4.6 — idle-timeout hook.
 *
 * Tracks user activity (mouse/keyboard/scroll/touch/focus). Shows a
 * warning modal `IDLE_WARNING_MS` before expiry. When the feature flag
 * is OFF, the warning still appears for QA but `signOut` is NEVER
 * called automatically — it just logs to console.
 */
import { useEffect, useRef, useState } from 'react';
import {
  IDLE_ACTIVITY_EVENTS,
  IDLE_WARNING_MS,
  getIdleTimeoutMs,
  isIdleTimeoutEnabled,
} from '@/services/security/sessionPolicy';
import type { AppRole } from '@/contexts/AuthContext';

interface IdleState {
  warning: boolean;
  /** Seconds until auto-logout fires (only meaningful while warning=true). */
  remainingSec: number;
}

export interface UseIdleTimeoutOptions {
  enabled: boolean;
  role: AppRole | null;
  onTimeout: () => void;
}

export function useIdleTimeout({ enabled, role, onTimeout }: UseIdleTimeoutOptions): IdleState & {
  dismiss: () => void;
  forceLogout: () => void;
} {
  const [state, setState] = useState<IdleState>({ warning: false, remainingSec: 0 });
  const lastActivity = useRef<number>(Date.now());
  const tickRef = useRef<number | null>(null);
  const flagEnabled = isIdleTimeoutEnabled();

  useEffect(() => {
    if (!enabled || !role) return;
    const idleMs = getIdleTimeoutMs(role);

    const onActivity = () => {
      lastActivity.current = Date.now();
      setState(s => (s.warning ? { warning: false, remainingSec: 0 } : s));
    };
    for (const ev of IDLE_ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    const tick = () => {
      const elapsed = Date.now() - lastActivity.current;
      const remainingMs = idleMs - elapsed;
      if (remainingMs <= 0) {
        if (flagEnabled) {
          console.warn('[idleTimeout] expired → onTimeout');
          onTimeout();
        } else {
          console.warn('[idleTimeout] expired (flag OFF — no auto-logout)');
          // Reset clock so the warning re-arms instead of looping every tick.
          lastActivity.current = Date.now();
          setState({ warning: false, remainingSec: 0 });
        }
        return;
      }
      if (remainingMs <= IDLE_WARNING_MS) {
        setState({ warning: true, remainingSec: Math.ceil(remainingMs / 1000) });
      } else if (state.warning) {
        setState({ warning: false, remainingSec: 0 });
      }
    };

    tickRef.current = window.setInterval(tick, 1000);
    return () => {
      for (const ev of IDLE_ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, role, onTimeout, flagEnabled]);

  return {
    ...state,
    dismiss: () => {
      lastActivity.current = Date.now();
      setState({ warning: false, remainingSec: 0 });
    },
    forceLogout: () => {
      if (flagEnabled) onTimeout();
      else console.info('[idleTimeout] forceLogout requested (flag OFF — calling onTimeout anyway via UI button)');
      onTimeout();
    },
  };
}