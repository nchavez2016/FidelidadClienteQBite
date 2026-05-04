/**
 * Consent service — LOPDP (Ecuador) compliance.
 *
 * Tracks explicit user consent for using their phone number in the loyalty
 * program. Each accept/revoke action is auditable.
 *
 * TODO(Supabase): map to `public.consents` with RLS:
 *   - INSERT/SELECT/UPDATE allowed for the authenticated user on their own rows.
 *   - SELECT also allowed to admins for compliance audits.
 */
import { db, TABLES } from './dbAdapter';
import type { ConsentRecord, ConsentType } from '@/lib/types';
import { logAudit } from './audit.service';

const LEGAL_VERSION = 'v1.0';
const DEFAULT_TYPE: ConsentType = 'fidelity_phone_usage';

function all(): ConsentRecord[] {
  return db.readSync<ConsentRecord>(TABLES.consents);
}

function clientContext(): { ipAddress: string; userAgent: string; channel: 'web' } {
  return {
    ipAddress: '0.0.0.0', // mock — real IP captured server-side once Supabase Edge Function is in place
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
    channel: 'web',
  };
}

export function registerConsent(userId: string, type: ConsentType = DEFAULT_TYPE): ConsentRecord {
  const ctx = clientContext();
  const record: ConsentRecord = {
    id: `consent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    consentType: type,
    accepted: true,
    legalVersion: LEGAL_VERSION,
    acceptedAt: new Date().toISOString(),
    ...ctx,
  };
  db.writeSync(TABLES.consents, [...all(), record]);
  logAudit({
    action: 'consent_accepted',
    actorId: userId,
    actorRole: 'customer',
    targetUserId: userId,
    metadata: { consentType: type, legalVersion: LEGAL_VERSION },
  });
  return record;
}

export function revokeConsent(userId: string, type: ConsentType = DEFAULT_TYPE): ConsentRecord | null {
  const list = all();
  // Revoke the latest accepted record for this user/type.
  const idx = [...list]
    .map((r, i) => ({ r, i }))
    .reverse()
    .find(({ r }) => r.userId === userId && r.consentType === type && !r.revokedAt && r.accepted)?.i;
  if (idx === undefined) return null;
  list[idx] = { ...list[idx], revokedAt: new Date().toISOString() };
  db.writeSync(TABLES.consents, list);
  logAudit({
    action: 'consent_revoked',
    actorId: userId,
    actorRole: 'customer',
    targetUserId: userId,
    metadata: { consentType: type, legalVersion: list[idx].legalVersion },
  });
  return list[idx];
}

export interface ConsentStatus {
  hasActiveConsent: boolean;
  latest?: ConsentRecord;
}

export function getConsentStatus(userId: string, type: ConsentType = DEFAULT_TYPE): ConsentStatus {
  const records = all().filter(r => r.userId === userId && r.consentType === type);
  if (records.length === 0) return { hasActiveConsent: false };
  const latest = records[records.length - 1];
  return { hasActiveConsent: latest.accepted && !latest.revokedAt, latest };
}

export function getConsentHistory(userId: string): ConsentRecord[] {
  return all().filter(r => r.userId === userId);
}

export const CONSENT_LEGAL_VERSION = LEGAL_VERSION;
