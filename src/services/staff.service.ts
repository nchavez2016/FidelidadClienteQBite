/**
 * Staff domain service.
 * Handles staff CRUD, session, and active branch persistence.
 *
 * Passwords no longer live on the staff row — they go through
 * `credentials.service`. Persistence routes through `dbAdapter`.
 *
 * TODO(Supabase): replace local reads/writes with `supabase.from('staff_profiles')`,
 * and replace `verifyCredential` with `supabase.auth.signInWithPassword`.
 */
import { StaffUser } from '@/lib/types';
import { db, TABLES } from './dbAdapter';
import {
  setCredential,
  verifyCredential,
  deleteCredential,
  updateCredentialIdentifier,
} from './credentials.service';
import { logAudit } from './audit.service';

function normalize(s: any): StaffUser {
  return { ...s, active: s.active !== false };
}

export function getStaff(): StaffUser[] {
  return db.readSync<any>(TABLES.staff).map(normalize);
}

export function loginStaff(username: string, password: string): StaffUser | null {
  const userId = verifyCredential('username', username, password);
  if (!userId) return null;
  const s = getStaff().find(u => u.id === userId && u.active !== false);
  if (!s) return null;
  db.writeValueSync(TABLES.sessionStaff, s);
  logAudit({ action: 'staff_login', actorId: s.id, actorRole: s.role, targetUserId: s.id });
  return s;
}

export function getCurrentStaff(): StaffUser | null {
  return db.readValueSync<StaffUser | null>(TABLES.sessionStaff, null);
}

export function logoutStaff(): void {
  db.removeSync(TABLES.sessionStaff);
}

/** Persist the active branch/campaign for a staff member. */
export function setStaffBranch(staffId: string, campaignId: string): void {
  const all = getStaff().map(s =>
    s.id === staffId ? { ...s, branchCampaignId: campaignId } : s,
  );
  db.writeSync(TABLES.staff, all);
  const current = getCurrentStaff();
  if (current && current.id === staffId) {
    db.writeValueSync(TABLES.sessionStaff, { ...current, branchCampaignId: campaignId });
  }
}

// ===== Admin: gestión de usuarios del staff =====

export interface StaffUpsertInput {
  username: string;
  name: string;
  role: 'admin' | 'cashier';
  password?: string;
  branchCampaignId?: string;
  active?: boolean;
}

function assertUniqueUsername(username: string, ignoreId?: string) {
  const exists = getStaff().some(
    s => s.username.toLowerCase() === username.toLowerCase() && s.id !== ignoreId,
  );
  if (exists) throw new Error('Ya existe un usuario con ese nombre de usuario');
}

function assertNotLastActiveAdmin(targetId: string) {
  const admins = getStaff().filter(s => s.role === 'admin' && s.active !== false);
  if (admins.length <= 1 && admins.some(a => a.id === targetId)) {
    throw new Error('Debe quedar al menos un administrador activo');
  }
}

function assertNotSelf(targetId: string) {
  const current = getCurrentStaff();
  if (current && current.id === targetId) {
    throw new Error('No puedes realizar esta acción sobre tu propio usuario');
  }
}

export function createStaff(input: StaffUpsertInput): StaffUser {
  if (!input.password || input.password.length < 4) {
    throw new Error('La contraseña debe tener al menos 4 caracteres');
  }
  if (input.role === 'cashier' && !input.branchCampaignId) {
    throw new Error('Los cajeros deben tener una sucursal asignada');
  }
  assertUniqueUsername(input.username);
  const newStaff: StaffUser = {
    id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    username: input.username.trim(),
    name: input.name.trim(),
    role: input.role,
    branchCampaignId: input.branchCampaignId,
    active: input.active !== false,
  };
  setCredential(newStaff.id, 'username', newStaff.username, input.password);
  db.writeSync(TABLES.staff, [...getStaff(), newStaff]);
  return newStaff;
}

export function updateStaff(id: string, patch: Partial<StaffUpsertInput>): StaffUser {
  const all = getStaff();
  const idx = all.findIndex(s => s.id === id);
  if (idx < 0) throw new Error('Usuario no encontrado');
  const current = all[idx];

  const nextRole = patch.role ?? current.role;
  const nextBranch = patch.branchCampaignId ?? current.branchCampaignId;
  const nextActive = patch.active ?? current.active ?? true;

  if (nextRole === 'cashier' && !nextBranch) {
    throw new Error('Los cajeros deben tener una sucursal asignada');
  }
  if (patch.username && patch.username !== current.username) {
    assertUniqueUsername(patch.username, id);
  }
  const wasActiveAdmin = current.role === 'admin' && current.active !== false;
  const stillActiveAdmin = nextRole === 'admin' && nextActive !== false;
  if (wasActiveAdmin && !stillActiveAdmin) {
    assertNotLastActiveAdmin(id);
  }
  if (current.active !== false && nextActive === false) {
    assertNotSelf(id);
  }

  const updated: StaffUser = {
    ...current,
    username: patch.username?.trim() ?? current.username,
    name: patch.name?.trim() ?? current.name,
    role: nextRole,
    branchCampaignId: nextRole === 'admin' ? patch.branchCampaignId ?? current.branchCampaignId : nextBranch,
    active: nextActive,
  };
  all[idx] = updated;
  db.writeSync(TABLES.staff, all);
  if (patch.username && patch.username !== current.username) {
    updateCredentialIdentifier(id, updated.username);
  }
  if (patch.password && patch.password.length >= 4) {
    setCredential(id, 'username', updated.username, patch.password);
  }
  const session = getCurrentStaff();
  if (session && session.id === id) {
    db.writeValueSync(TABLES.sessionStaff, updated);
  }
  return updated;
}

export function changeStaffPassword(id: string, newPassword: string): void {
  if (!newPassword || newPassword.length < 4) {
    throw new Error('La contraseña debe tener al menos 4 caracteres');
  }
  const target = getStaff().find(s => s.id === id);
  if (!target) throw new Error('Usuario no encontrado');
  setCredential(id, 'username', target.username, newPassword);
}

export function setStaffActive(id: string, active: boolean): void {
  if (!active) {
    assertNotSelf(id);
    const target = getStaff().find(s => s.id === id);
    if (target?.role === 'admin') assertNotLastActiveAdmin(id);
  }
  const all = getStaff().map(s => (s.id === id ? { ...s, active } : s));
  db.writeSync(TABLES.staff, all);
}

export function deleteStaff(id: string): void {
  assertNotSelf(id);
  const target = getStaff().find(s => s.id === id);
  if (!target) return;
  if (target.role === 'admin') assertNotLastActiveAdmin(id);
  db.writeSync(TABLES.staff, getStaff().filter(s => s.id !== id));
  deleteCredential(id);
}
