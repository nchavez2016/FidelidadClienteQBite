/**
 * Credentials store — TRANSITIONAL.
 *
 * Holds plain-text passwords in a separate table so the `customer` and
 * `staff_profile` rows stay free of secrets. This is NOT secure storage;
 * it only buys time until Supabase Auth replaces it.
 *
 * TODO(Supabase): delete this file. Replace all calls with:
 *   - supabase.auth.signInWithPassword({ email/phone, password })
 *   - supabase.auth.signUp(...)
 *   - supabase.auth.updateUser({ password })
 * Passwords will then live only in `auth.users` and never in a public table.
 */
import { db, TABLES } from './dbAdapter';

export type CredentialFactor = 'phone' | 'username';

interface CredentialRow {
  id: string; // userId (customer.id or staff.id)
  factor: CredentialFactor;
  identifier: string; // phone or username (denormalized for fast login)
  password: string;
}

function all(): CredentialRow[] {
  return db.readSync<CredentialRow>(TABLES.credentials);
}

export function setCredential(userId: string, factor: CredentialFactor, identifier: string, password: string): void {
  const list = all().filter(c => c.id !== userId);
  list.push({ id: userId, factor, identifier, password });
  db.writeSync(TABLES.credentials, list);
}

export function verifyCredential(factor: CredentialFactor, identifier: string, password: string): string | null {
  const row = all().find(c => c.factor === factor && c.identifier === identifier);
  if (!row || row.password !== password) return null;
  return row.id;
}

export function getCredentialPassword(userId: string): string | undefined {
  return all().find(c => c.id === userId)?.password;
}

export function deleteCredential(userId: string): void {
  db.writeSync(TABLES.credentials, all().filter(c => c.id !== userId));
}

export function updateCredentialIdentifier(userId: string, identifier: string): void {
  const list = all().map(c => (c.id === userId ? { ...c, identifier } : c));
  db.writeSync(TABLES.credentials, list);
}
