import { supabase } from '@/integrations/supabase/client';

type InvokeResult<T> = Awaited<ReturnType<typeof supabase.functions.invoke<T>>>;

/**
 * Wrapper para invocaciones a la edge function `staff-admin`.
 *
 * Maneja el caso en que el JWT local sigue activo pero la sesión
 * server-side (auth.sessions) fue limpiada, causando 401 invalid_token.
 * Intenta `refreshSession()` y reintenta UNA sola vez. Si el refresh
 * falla, cierra sesión y redirige al login del staff.
 */
export async function invokeStaffAdmin<T = unknown>(
  payload: Record<string, unknown>,
): Promise<InvokeResult<T>> {
  let result = await supabase.functions.invoke<T>('staff-admin', { body: payload });

  const status = (result.error as { status?: number } | null)?.status;
  if (result.error && status === 401) {
    console.warn('[invokeStaffAdmin] 401 detected, refreshing session…');
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.error('[invokeStaffAdmin] refresh failed, signing out', refreshError);
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') {
        window.location.href = '/staff/login';
      }
      return result;
    }
    result = await supabase.functions.invoke<T>('staff-admin', { body: payload });
  }

  return result;
}