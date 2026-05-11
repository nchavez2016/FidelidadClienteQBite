/**
 * Phase 4.6 — session policy scaffolding.
 *
 * Idle-timeout enforcement is OFF by default. The hook still mounts and
 * shows the warning modal so QA can validate the UX without users being
 * accidentally logged out (especially cashiers mid-operation).
 *
 * Toggle via `localStorage.setItem('lov.idleTimeout','on')` for QA, or
 * via `VITE_IDLE_TIMEOUT_ENABLED=true` at build time.
 */
import type { AppRole } from '@/contexts/AuthContext';

export const STAFF_IDLE_TIMEOUT_MS = 30 * 60_000;       // 30 min
export const CUSTOMER_IDLE_TIMEOUT_MS = 12 * 60 * 60_000; // 12 h
export const IDLE_WARNING_MS = 60_000;                  // show warning 60s before kick

export function isIdleTimeoutEnabled(): boolean {
  try {
    if (typeof window !== 'undefined') {
      const ls = window.localStorage?.getItem('lov.idleTimeout');
      if (ls === 'on') return true;
      if (ls === 'off') return false;
    }
  } catch { /* ignore storage failure */ }
  const env = (import.meta as { env?: Record<string, string> })?.env?.VITE_IDLE_TIMEOUT_ENABLED;
  return env === 'true' || env === '1';
}

export function getIdleTimeoutMs(role: AppRole | 'staff' | 'customer'): number {
  if (role === 'customer') return CUSTOMER_IDLE_TIMEOUT_MS;
  return STAFF_IDLE_TIMEOUT_MS;
}

export const IDLE_ACTIVITY_EVENTS = [
  'mousemove',
  'keydown',
  'click',
  'scroll',
  'touchstart',
  'focus',
] as const;