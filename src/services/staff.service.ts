/**
 * Staff domain service.
 * Handles staff CRUD, session, and active branch persistence.
 */
import { StaffUser } from '@/lib/types';
import { storage } from './storage/localAdapter';
import { STORAGE_KEYS } from './storage/keys';

export function getStaff(): StaffUser[] {
  const all = storage.get<StaffUser[]>(STORAGE_KEYS.staff, []);
  // Backfill `active` for legacy rows.
  return all.map(s => ({ ...s, active: s.active !== false }));
}

export function loginStaff(username: string, password: string): StaffUser | null {
  const s = getStaff().find(
    u => u.username === username && u.password === password && u.active !== false,
  );
  if (s) {
    storage.set(STORAGE_KEYS.currentStaff, s);
    return s;
  }
  return null;
}

export function getCurrentStaff(): StaffUser | null {
  return storage.get<StaffUser | null>(STORAGE_KEYS.currentStaff, null);
}

export function logoutStaff(): void {
  storage.remove(STORAGE_KEYS.currentStaff);
}

/** Persist the active branch/campaign for a staff member. */
export function setStaffBranch(staffId: string, campaignId: string): void {
  const all = getStaff().map(s =>
    s.id === staffId ? { ...s, branchCampaignId: campaignId } : s,
  );
  storage.set(STORAGE_KEYS.staff, all);
  const current = getCurrentStaff();
  if (current && current.id === staffId) {
    storage.set(STORAGE_KEYS.currentStaff, { ...current, branchCampaignId: campaignId });
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
    password: input.password,
    branchCampaignId: input.branchCampaignId,
    active: input.active !== false,
  };
  const all = getStaff();
  all.push(newStaff);
  storage.set(STORAGE_KEYS.staff, all);
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
  // Si se quiere cambiar de admin a cashier o desactivar, proteger último admin.
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
    password: patch.password && patch.password.length >= 4 ? patch.password : current.password,
  };
  all[idx] = updated;
  storage.set(STORAGE_KEYS.staff, all);
  const session = getCurrentStaff();
  if (session && session.id === id) {
    storage.set(STORAGE_KEYS.currentStaff, updated);
  }
  return updated;
}

export function changeStaffPassword(id: string, newPassword: string): void {
  if (!newPassword || newPassword.length < 4) {
    throw new Error('La contraseña debe tener al menos 4 caracteres');
  }
  const all = getStaff();
  const idx = all.findIndex(s => s.id === id);
  if (idx < 0) throw new Error('Usuario no encontrado');
  all[idx] = { ...all[idx], password: newPassword };
  storage.set(STORAGE_KEYS.staff, all);
  const session = getCurrentStaff();
  if (session && session.id === id) {
    storage.set(STORAGE_KEYS.currentStaff, all[idx]);
  }
}

export function setStaffActive(id: string, active: boolean): void {
  if (!active) {
    assertNotSelf(id);
    const target = getStaff().find(s => s.id === id);
    if (target?.role === 'admin') assertNotLastActiveAdmin(id);
  }
  const all = getStaff().map(s => (s.id === id ? { ...s, active } : s));
  storage.set(STORAGE_KEYS.staff, all);
}

export function deleteStaff(id: string): void {
  assertNotSelf(id);
  const target = getStaff().find(s => s.id === id);
  if (!target) return;
  if (target.role === 'admin') assertNotLastActiveAdmin(id);
  const all = getStaff().filter(s => s.id !== id);
  storage.set(STORAGE_KEYS.staff, all);
}
