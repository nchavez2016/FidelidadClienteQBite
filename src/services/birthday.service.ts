/**
 * Birthday reward module — thin client wrapper over the Supabase RPCs
 * (get_birthday_status, grant_birthday_reward, get_birthday_grants_this_year)
 * and the `birthday_config` table (public SELECT, admin-only UPDATE via RLS —
 * see supabase/migrations/qbites_birthday_module.sql).
 */
import { supabase } from '@/integrations/supabase/client';
import { supabaseDriver } from './drivers/SupabaseDriver';
import { createLogger } from '@/lib/logger';

const log = createLogger('birthday');

// ===== get_birthday_status =====

export interface BirthdayStatus {
  isProgramActive: boolean;
  isBirthdayMonth: boolean;
  isBirthdayToday: boolean;
  rewardDescription: string;
  alreadyGranted: boolean;
  grantedAt: string | null;
}

interface BirthdayStatusRow {
  is_program_active: boolean;
  is_birthday_month: boolean;
  is_birthday_today: boolean;
  reward_description: string;
  already_granted: boolean;
  granted_at: string | null;
}

function fromStatusRow(r: BirthdayStatusRow): BirthdayStatus {
  return {
    isProgramActive: r.is_program_active,
    isBirthdayMonth: r.is_birthday_month,
    isBirthdayToday: r.is_birthday_today,
    rewardDescription: r.reward_description,
    alreadyGranted: r.already_granted,
    grantedAt: r.granted_at,
  };
}

/** Callable by the customer about themselves, or by staff about anyone. */
export async function getBirthdayStatus(customerId: string): Promise<BirthdayStatus | null> {
  const { data, error } = await supabase.rpc('get_birthday_status', {
    p_customer_id: customerId,
  } as never);
  if (error) {
    log.error('getBirthdayStatus failed', { error, customerId });
    throw error;
  }
  const row = Array.isArray(data) ? (data[0] as BirthdayStatusRow | undefined) : (data as BirthdayStatusRow | undefined);
  return row ? fromStatusRow(row) : null;
}

// ===== grant_birthday_reward =====

export interface BirthdayGrant {
  id: string;
  user_id: string;
  birthday_year: number;
  branch_id: string | null;
  granted_by: string;
  notes: string | null;
  created_at: string;
}

/** Staff-only (admin/cashier) — enforced server-side. */
export async function grantBirthdayReward(customerId: string, notes?: string): Promise<BirthdayGrant> {
  const { data, error } = await supabase.rpc('grant_birthday_reward', {
    p_customer_id: customerId,
    p_notes: notes ?? null,
  } as never);
  if (error) {
    log.error('grantBirthdayReward failed', { error, customerId });
    throw error;
  }
  return data as unknown as BirthdayGrant;
}

// ===== get_birthday_grants_this_year =====

export interface BirthdayGrantThisYear {
  userId: string;
  grantedAt: string;
}

/** Staff-only — enforced server-side. */
export async function getBirthdayGrantsThisYear(): Promise<BirthdayGrantThisYear[]> {
  const { data, error } = await supabase.rpc('get_birthday_grants_this_year' as never);
  if (error) {
    log.error('getBirthdayGrantsThisYear failed', { error });
    throw error;
  }
  const rows = (data ?? []) as unknown as { user_id: string; granted_at: string }[];
  return rows.map(r => ({ userId: r.user_id, grantedAt: r.granted_at }));
}

// ===== birthday_config (direct table access — RLS: SELECT all, UPDATE admin) =====

export interface BirthdayConfig {
  isActive: boolean;
  rewardDescription: string;
  rewardMessage: string;
  updatedAt: string;
}

interface BirthdayConfigRow {
  id: boolean;
  is_active: boolean;
  reward_description: string;
  reward_message: string;
  updated_at: string;
}

function fromConfigRow(r: BirthdayConfigRow): BirthdayConfig {
  return {
    isActive: r.is_active,
    rewardDescription: r.reward_description,
    rewardMessage: r.reward_message,
    updatedAt: r.updated_at,
  };
}

export async function getBirthdayConfig(): Promise<BirthdayConfig> {
  const row = await supabaseDriver.getById<BirthdayConfigRow>('birthday_config', 'true');
  if (!row) {
    log.error('getBirthdayConfig: no config row found (seed missing?)');
    throw new Error('birthday_config_not_found');
  }
  return fromConfigRow(row);
}

export interface BirthdayConfigPatch {
  isActive?: boolean;
  rewardDescription?: string;
  rewardMessage?: string;
}

/** Admin-only — enforced by RLS (birthday_config_admin_update policy). */
export async function updateBirthdayConfig(patch: BirthdayConfigPatch): Promise<BirthdayConfig> {
  const dbPatch: Partial<BirthdayConfigRow> = {};
  if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;
  if (patch.rewardDescription !== undefined) dbPatch.reward_description = patch.rewardDescription;
  if (patch.rewardMessage !== undefined) dbPatch.reward_message = patch.rewardMessage;

  const row = await supabaseDriver.update<BirthdayConfigRow>('birthday_config', 'true', dbPatch);
  if (!row) {
    log.error('updateBirthdayConfig: update returned no row', { patch });
    throw new Error('birthday_config_update_failed');
  }
  return fromConfigRow(row);
}
