/**
 * Phase 4.6 — MFA helpers (stub).
 *
 * Wraps `supabase.auth.mfa.*` so the rest of the app calls a stable
 * surface. Enabling MFA enforcement requires turning it on in the
 * Supabase project settings — this module never assumes that has
 * happened, so all functions degrade gracefully.
 */
import { supabase } from '@/integrations/supabase/client';

export async function isMfaEnrolled(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return false;
    return (data?.totp?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function beginMfaEnrollment(): Promise<{
  factorId: string | null;
  qr: string | null;
  secret: string | null;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error) return { factorId: null, qr: null, secret: null, error: error.message };
    return {
      factorId: data.id,
      qr: data.totp?.qr_code ?? null,
      secret: data.totp?.secret ?? null,
      error: null,
    };
  } catch (err) {
    return { factorId: null, qr: null, secret: null, error: err instanceof Error ? err.message : 'mfa_failed' };
  }
}

export async function verifyMfaChallenge(
  factorId: string,
  code: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const ch = await supabase.auth.mfa.challenge({ factorId });
    if (ch.error) return { ok: false, error: ch.error.message };
    const v = await supabase.auth.mfa.verify({
      factorId,
      challengeId: ch.data.id,
      code,
    });
    if (v.error) return { ok: false, error: v.error.message };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'mfa_failed' };
  }
}