/**
 * Audit log — minimal, append-only.
 *
 * Captures security-relevant events (consent changes, deactivations, logins).
 * TODO(Supabase): map to `public.audit_logs` with RLS that allows INSERT via
 * a SECURITY DEFINER function and SELECT only to admins.
 */
import { db, TABLES } from './dbAdapter';
import type { AuditAction, AuditLogEntry, UserRole } from '@/lib/types';

export interface AuditInput {
  action: AuditAction;
  actorId?: string;
  actorRole?: UserRole;
  targetUserId?: string;
  metadata?: Record<string, unknown>;
}

export function logAudit(input: AuditInput): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  const all = db.readSync<AuditLogEntry>(TABLES.auditLogs);
  db.writeSync(TABLES.auditLogs, [...all, entry]);
  return entry;
}

export function getAuditLogs(): AuditLogEntry[] {
  return db.readSync<AuditLogEntry>(TABLES.auditLogs);
}
