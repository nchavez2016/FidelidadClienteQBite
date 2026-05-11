/**
 * Real Supabase-backed staff account service.
 *
 * Reemplaza el sistema legacy basado en localStorage.gaviota_staff. Todas las
 * mutaciones pasan por el edge function `staff-admin`, que valida que el caller
 * sea admin antes de operar con privilegios elevados (service role).
 *
 * Multirol-friendly: si un usuario también es customer, esa fila NO se toca.
 */
import { supabase } from '@/integrations/supabase/client';
import { logAdminAction } from '@/services/security/adminAudit.service';

export type StaffRole = 'admin' | 'cashier';

export interface StaffAccount {
  id: string;
  username: string;
  display_name: string;
  role: StaffRole;
  branch_id: string | null;
  active: boolean;
}

export interface CreateStaffInput {
  username: string;
  password: string;
  display_name: string;
  role: StaffRole;
  branch_id: string | null;
}

export interface UpdateStaffInput {
  user_id: string;
  display_name?: string;
  branch_id?: string | null;
  role?: StaffRole;
  password?: string;
}

export class StaffAdminError extends Error {
  constructor(public code: string, message?: string, public status?: number) {
    super(message ?? code);
    this.name = 'StaffAdminError';
  }
}

/** Mensajes legibles por código de error retornado por el edge function. */
const ERROR_MESSAGES: Record<string, string> = {
  missing_authorization: 'Sesión no válida.',
  invalid_token: 'Sesión no válida o expirada.',
  forbidden_admin_only: 'Solo un administrador puede gestionar usuarios staff.',
  unknown_action: 'Acción no soportada.',
  invalid_json: 'Solicitud mal formada.',
  username_too_short: 'El usuario debe tener al menos 3 caracteres alfanuméricos.',
  username_too_long: 'El usuario es demasiado largo (máx. 32).',
  password_too_short: 'La contraseña debe tener al menos 6 caracteres.',
  password_too_long: 'La contraseña es demasiado larga.',
  password_required: 'La contraseña es requerida.',
  display_name_required: 'El nombre es requerido.',
  invalid_role: 'Rol inválido.',
  branch_required_for_cashier: 'Asigna una sucursal al cajero.',
  username_already_exists: 'Ese usuario ya existe.',
  cannot_demote_last_admin: 'No puedes degradar al último administrador.',
  cannot_demote_self: 'No puedes degradarte a ti mismo.',
  cannot_disable_self: 'No puedes desactivar tu propia cuenta.',
  cannot_delete_self: 'No puedes eliminar tu propia cuenta.',
  cannot_delete_last_admin: 'No puedes eliminar al último administrador.',
  user_id_required: 'Falta el identificador del usuario.',
};

function humanize(code: string, fallback?: string): string {
  return ERROR_MESSAGES[code] ?? fallback ?? code;
}

async function invoke<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('staff-admin', {
    body: payload,
  });
  if (error) {
    // FunctionsHttpError trae el body en .context.response (algunos clientes).
    let code = 'function_invoke_failed';
    let details: string | undefined;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        code = body?.error ?? code;
        details = body?.details;
      } catch { /* noop */ }
    }
    throw new StaffAdminError(code, humanize(code, details ?? error.message));
  }
  if (data && typeof data === 'object' && 'error' in data) {
    const code = String((data as { error: string }).error);
    throw new StaffAdminError(code, humanize(code));
  }
  return data as T;
}

export async function listStaffAccounts(): Promise<StaffAccount[]> {
  const data = await invoke<{ staff: StaffAccount[] }>({ action: 'list' });
  return data.staff ?? [];
}

export async function createStaffAccount(input: CreateStaffInput): Promise<{ user_id: string }> {
  const res = await invoke<{ user_id: string }>({ action: 'create', ...input });
  void logAdminAction({
    action: 'staff_create',
    targetType: 'staff_user',
    targetId: res.user_id,
    metadata: { role: input.role, branch_id: input.branch_id, username: input.username },
  });
  return res;
}

export async function updateStaffAccount(input: UpdateStaffInput): Promise<{ user_id: string }> {
  const res = await invoke<{ user_id: string }>({ action: 'update', ...input });
  void logAdminAction({
    action: input.password ? 'staff_change_password' : 'staff_update',
    targetType: 'staff_user',
    targetId: input.user_id,
    metadata: {
      role: input.role,
      branch_id: input.branch_id,
      changed_password: !!input.password,
      changed_display_name: input.display_name != null,
    },
  });
  return res;
}

export async function setStaffActive(user_id: string, active: boolean): Promise<void> {
  await invoke({ action: 'set_active', user_id, active });
  void logAdminAction({
    action: 'staff_set_active',
    targetType: 'staff_user',
    targetId: user_id,
    metadata: { active },
  });
}

export async function deleteStaffAccount(user_id: string): Promise<void> {
  await invoke({ action: 'delete', user_id });
  void logAdminAction({
    action: 'staff_delete',
    targetType: 'staff_user',
    targetId: user_id,
  });
}