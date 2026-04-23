/**
 * Staff domain service.
 * Handles staff CRUD, session, and active branch persistence.
 */
import { StaffUser } from '@/lib/types';
import { storage } from './storage/localAdapter';
import { STORAGE_KEYS } from './storage/keys';

export function getStaff(): StaffUser[] {
  return storage.get<StaffUser[]>(STORAGE_KEYS.staff, []);
}

export function loginStaff(username: string, password: string): StaffUser | null {
  const s = getStaff().find(u => u.username === username && u.password === password);
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
