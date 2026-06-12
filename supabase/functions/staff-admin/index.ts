/**
 * staff-admin edge function
 *
 * Single endpoint that performs all privileged staff lifecycle operations:
 *   - create:      crea auth.users + profile + asigna role admin/cashier
 *   - update:      cambia display_name / branch_id / role / password
 *   - set_active:  activa o desactiva la cuenta (ban en Supabase Auth)
 *   - delete:      elimina la cuenta (cascade limpia profile + roles)
 *
 * Seguridad:
 *   - Requiere JWT válido en Authorization. El caller DEBE tener role 'admin'
 *     en public.user_roles. Cashiers NO pueden invocar nada aquí.
 *   - Usa service-role solo dentro del worker. Nunca lo expone al cliente.
 *   - Multirol respetado: si un usuario ya es 'customer', mantenemos esa fila.
 *     Solo añadimos/quitamos las filas admin/cashier.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

type Action = 'create' | 'update' | 'set_active' | 'delete' | 'list';
type StaffRole = 'admin' | 'cashier';

const STAFF_DOMAIN = 'staff.gaviota.local';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toStaffEmail(username: string): string {
  return `${normalizeUsername(username)}@${STAFF_DOMAIN}`;
}

function validateUsername(u: string): string | null {
  const cleaned = normalizeUsername(u);
  if (cleaned.length < 3) return 'username_too_short';
  if (cleaned.length > 32) return 'username_too_long';
  return null;
}

function validatePassword(p: string): string | null {
  if (typeof p !== 'string') return 'password_required';
  if (p.length < 6) return 'password_too_short';
  if (p.length > 72) return 'password_too_long';
  return null;
}

function validateRole(r: unknown): r is StaffRole {
  return r === 'admin' || r === 'cashier';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  // 1. Validar JWT del caller
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'missing_authorization' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: claimsData, error: callerError } = await callerClient.auth.getClaims(token);
  if (callerError || !claimsData?.claims?.sub) {
    console.warn('[staff-admin] getClaims failed', callerError?.message);
    return json(401, { error: 'invalid_token' });
  }
  const callerId = claimsData.claims.sub as string;

  // 2. Cliente con privilegios (service role) — solo dentro del worker.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // 3. Verificar que el caller es admin.
  const { data: isAdminResp, error: roleErr } = await admin.rpc('has_role', {
    _user_id: callerId,
    _role: 'admin',
  });
  if (roleErr) {
    console.error('[staff-admin] has_role rpc failed', roleErr);
    return json(500, { error: 'role_check_failed', details: roleErr.message });
  }
  if (isAdminResp !== true) {
    return json(403, { error: 'forbidden_admin_only' });
  }

  // 4. Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const action = body.action as Action;

  try {
    switch (action) {
      case 'list':
        return await handleList(admin);
      case 'create':
        return await handleCreate(admin, body);
      case 'update':
        return await handleUpdate(admin, body, callerId);
      case 'set_active':
        return await handleSetActive(admin, body, callerId);
      case 'delete':
        return await handleDelete(admin, body, callerId);
      default:
        return json(400, { error: 'unknown_action' });
    }
  } catch (err) {
    console.error('[staff-admin] unhandled error', err);
    const msg = err instanceof Error ? err.message : String(err);
    return json(500, { error: 'internal_error', details: msg });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LIST  — todos los usuarios con role admin o cashier
// ─────────────────────────────────────────────────────────────────────────────
async function handleList(
  admin: ReturnType<typeof createClient>,
): Promise<Response> {
  // 1. Roles staff
  const { data: roleRows, error: rolesErr } = await admin
    .from('user_roles')
    .select('user_id, role')
    .in('role', ['admin', 'cashier']);
  if (rolesErr) return json(500, { error: 'list_roles_failed', details: rolesErr.message });

  const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id as string)));
  if (ids.length === 0) return json(200, { staff: [] });

  // 2. Profiles
  const { data: profileRows, error: profilesErr } = await admin
    .from('profiles')
    .select('id, display_name, branch_id, is_active')
    .in('id', ids);
  if (profilesErr) return json(500, { error: 'list_profiles_failed', details: profilesErr.message });

  // 3. Auth users (para email/username + banned_until)
  const { data: usersResp, error: usersErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usersErr) return json(500, { error: 'list_users_failed', details: usersErr.message });

  const userMap = new Map<string, { email: string | null; banned: boolean; meta: Record<string, unknown> }>();
  for (const u of usersResp.users) {
    if (!ids.includes(u.id)) continue;
    const banned_until = (u as { banned_until?: string | null }).banned_until ?? null;
    const banned = banned_until ? new Date(banned_until).getTime() > Date.now() : false;
    userMap.set(u.id, {
      email: u.email ?? null,
      banned,
      meta: (u.user_metadata ?? {}) as Record<string, unknown>,
    });
  }

  const profileMap = new Map<string, { display_name: string; branch_id: string | null; is_active: boolean }>();
  for (const p of profileRows ?? []) {
    profileMap.set(p.id as string, {
      display_name: (p.display_name as string) ?? '',
      branch_id: (p.branch_id as string | null) ?? null,
      is_active: p.is_active !== false,
    });
  }

  // Agrupa roles por user_id (multirol-friendly).
  const rolesByUser = new Map<string, ('admin' | 'cashier')[]>();
  for (const r of roleRows ?? []) {
    const list = rolesByUser.get(r.user_id as string) ?? [];
    list.push(r.role as 'admin' | 'cashier');
    rolesByUser.set(r.user_id as string, list);
  }

  const staff = ids.map((id) => {
    const u = userMap.get(id);
    const p = profileMap.get(id);
    const userRoles = rolesByUser.get(id) ?? [];
    const role: 'admin' | 'cashier' = userRoles.includes('admin') ? 'admin' : 'cashier';
    const username = (u?.meta?.staff_username as string) ?? (u?.meta?.identifier as string) ?? (u?.email?.split('@')[0] ?? '');
    return {
      id,
      username,
      display_name: p?.display_name ?? username,
      role,
      branch_id: p?.branch_id ?? null,
      active: !(u?.banned ?? false),
    };
  });

  return json(200, { staff });
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────
async function handleCreate(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
): Promise<Response> {
  const username = String(body.username ?? '');
  const password = String(body.password ?? '');
  const display_name = String(body.display_name ?? '').trim();
  const role = body.role;
  const branch_id = body.branch_id ? String(body.branch_id) : null;

  const usernameErr = validateUsername(username);
  if (usernameErr) return json(422, { error: usernameErr });
  const pwErr = validatePassword(password);
  if (pwErr) return json(422, { error: pwErr });
  if (!display_name) return json(422, { error: 'display_name_required' });
  if (!validateRole(role)) return json(422, { error: 'invalid_role' });
  if (role === 'cashier' && !branch_id) {
    return json(422, { error: 'branch_required_for_cashier' });
  }

  const email = toStaffEmail(username);
  const cleanedUsername = normalizeUsername(username);

  // Crear cuenta en auth.users
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      audience: 'staff',
      identifier: cleanedUsername,
      staff_username: cleanedUsername,
      display_name,
    },
  });

  if (createErr) {
    const msg = createErr.message ?? '';
    const isDup =
      msg.toLowerCase().includes('already') ||
      msg.toLowerCase().includes('exist') ||
      (createErr as { status?: number }).status === 422;
    return json(isDup ? 409 : 500, {
      error: isDup ? 'username_already_exists' : 'create_user_failed',
      details: msg,
    });
  }

  const newUserId = created.user!.id;

  // Asegurar profile (handle_new_user ya lo creó porque audience='staff' bypasea
  // la asignación de role customer pero SÍ inserta profile). Hacemos upsert por
  // si el trigger fallara, y aplicamos branch_id.
  const { error: profileErr } = await admin.from('profiles').upsert(
    {
      id: newUserId,
      display_name,
      branch_id,
    },
    { onConflict: 'id' },
  );
  if (profileErr) {
    await admin.auth.admin.deleteUser(newUserId);
    return json(500, { error: 'profile_upsert_failed', details: profileErr.message });
  }

  // Asignar role staff. Multirol-friendly: NO tocamos otras filas.
  const { error: roleErr } = await admin
    .from('user_roles')
    .insert({ user_id: newUserId, role });
  if (roleErr) {
    await admin.auth.admin.deleteUser(newUserId);
    return json(500, { error: 'role_assign_failed', details: roleErr.message });
  }

  return json(200, {
    ok: true,
    user_id: newUserId,
    username: cleanedUsername,
    role,
    branch_id,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE  — display_name / branch_id / role / password
// ─────────────────────────────────────────────────────────────────────────────
async function handleUpdate(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  callerId: string,
): Promise<Response> {
  const user_id = String(body.user_id ?? '');
  if (!user_id) return json(422, { error: 'user_id_required' });

  const display_name = body.display_name as string | undefined;
  const branch_id = body.branch_id === undefined ? undefined : (body.branch_id as string | null);
  const role = body.role as StaffRole | undefined;
  const password = body.password as string | undefined;

  // Profile patch
  const profilePatch: Record<string, unknown> = {};
  if (typeof display_name === 'string' && display_name.trim()) {
    profilePatch.display_name = display_name.trim();
  }
  if (branch_id !== undefined) profilePatch.branch_id = branch_id;
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await admin.from('profiles').update(profilePatch).eq('id', user_id);
    if (error) return json(500, { error: 'profile_update_failed', details: error.message });
  }

  // Role swap (admin ↔ cashier). Mantiene customer si existía.
  if (role !== undefined) {
    if (!validateRole(role)) return json(422, { error: 'invalid_role' });

    // Anti-degradar al último admin a cashier (evitar quedarse sin admins).
    if (role === 'cashier') {
      const wasAdmin = await admin
        .from('user_roles')
        .select('user_id')
        .eq('user_id', user_id)
        .eq('role', 'admin')
        .maybeSingle();
      if (wasAdmin.data) {
        const { count } = await admin
          .from('user_roles')
          .select('user_id', { count: 'exact', head: true })
          .eq('role', 'admin');
        if ((count ?? 0) <= 1) {
          return json(409, { error: 'cannot_demote_last_admin' });
        }
        // Auto-protección extra: el caller no puede degradarse a sí mismo
        // si es el admin afectado.
        if (user_id === callerId) {
          return json(409, { error: 'cannot_demote_self' });
        }
      }
    }

    // Borra solo filas staff (admin/cashier). NO toca customer.
    const { error: delErr } = await admin
      .from('user_roles')
      .delete()
      .eq('user_id', user_id)
      .in('role', ['admin', 'cashier']);
    if (delErr) return json(500, { error: 'role_clear_failed', details: delErr.message });

    const { error: insErr } = await admin
      .from('user_roles')
      .insert({ user_id, role });
    if (insErr) return json(500, { error: 'role_assign_failed', details: insErr.message });
  }

  // Password reset
  if (typeof password === 'string' && password.length > 0) {
    const pwErr = validatePassword(password);
    if (pwErr) return json(422, { error: pwErr });
    const { error } = await admin.auth.admin.updateUserById(user_id, { password });
    if (error) return json(500, { error: 'password_update_failed', details: error.message });
  }

  return json(200, { ok: true, user_id });
}

// ─────────────────────────────────────────────────────────────────────────────
// SET_ACTIVE  — habilita/deshabilita login del usuario
// ─────────────────────────────────────────────────────────────────────────────
async function handleSetActive(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  callerId: string,
): Promise<Response> {
  const user_id = String(body.user_id ?? '');
  const active = body.active === true;
  if (!user_id) return json(422, { error: 'user_id_required' });
  if (user_id === callerId && !active) {
    return json(409, { error: 'cannot_disable_self' });
  }

  const ban_duration = active ? 'none' : '876000h'; // ~100 años
  // @ts-expect-error supabase-js typing for ban_duration via admin update
  const { error } = await admin.auth.admin.updateUserById(user_id, { ban_duration });
  if (error) return json(500, { error: 'set_active_failed', details: error.message });

  return json(200, { ok: true, user_id, active });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────
async function handleDelete(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  callerId: string,
): Promise<Response> {
  const user_id = String(body.user_id ?? '');
  if (!user_id) return json(422, { error: 'user_id_required' });
  if (user_id === callerId) {
    return json(409, { error: 'cannot_delete_self' });
  }

  // Anti-borrar al último admin
  const { data: wasAdmin } = await admin
    .from('user_roles')
    .select('user_id')
    .eq('user_id', user_id)
    .eq('role', 'admin')
    .maybeSingle();
  if (wasAdmin) {
    const { count } = await admin
      .from('user_roles')
      .select('user_id', { count: 'exact', head: true })
      .eq('role', 'admin');
    if ((count ?? 0) <= 1) {
      return json(409, { error: 'cannot_delete_last_admin' });
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user_id);
  if (error) return json(500, { error: 'delete_user_failed', details: error.message });

  return json(200, { ok: true, user_id, deleted: true });
}