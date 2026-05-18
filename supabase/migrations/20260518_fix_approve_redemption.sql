-- supabase/migrations/20260518_fix_approve_redemption.sql
-- Fix crítico: sincronización de approve_redemption_request con BD real

-- 1. Eliminar versiones obsoletas para evitar ambigüedad de enrutamiento
DROP FUNCTION IF EXISTS public.approve_redemption_request(uuid, uuid, text, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.approve_redemption_request(uuid, uuid, text, uuid) CASCADE;

-- 2. Crear función corregida (firma única de 5 parámetros)
CREATE FUNCTION public.approve_redemption_request(
  p_request_id uuid,
  p_staff_id uuid,
  p_notes text,
  p_branch_id uuid,
  p_comment_category text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req RECORD;
  v_user_role TEXT;
  v_can_approve BOOLEAN := FALSE;
BEGIN
  -- Validar rol del ejecutor
  SELECT role INTO v_user_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_user_role IN ('cashier', 'admin') THEN
    v_can_approve := TRUE;
  END IF;

  IF NOT v_can_approve THEN
    RAISE EXCEPTION 'Permission denied: User must have cashier or admin role' USING ERRCODE = '42501';
  END IF;

  -- Bloquear solicitud para evitar concurrencia
  SELECT * INTO v_req
  FROM public.redemption_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already processed' USING ERRCODE = '42501';
  END IF;

  -- 1. Procesar ledger (7 parámetros exactos. p_comment_category NO va aquí)
  PERFORM public.redeem_reward(
    v_req.customer_id,
    v_req.campaign_id,
    v_req.reward_id::uuid,              -- ← CASTING EXPLÍCITO: TEXT → UUID
    v_req.reward_name_snapshot,
    v_req.points_cost_snapshot,
    p_branch_id,
    gen_random_uuid()::TEXT
  );

  -- 2. Actualizar estado
  UPDATE public.redemption_requests
  SET status = 'approved',
      resolved_by = p_staff_id,
      notes = p_notes,
      resolved_at = now()
  WHERE id = p_request_id;

  -- 3. Evento de aprobación
  INSERT INTO public.redemption_request_events (
    request_id, event_type, actor_user_id, notes, created_at
  ) VALUES (
    p_request_id, 'approved', p_staff_id, p_notes, now()
  );

  -- 4. Auditoría admin (CORREGIDO: parámetros nombrados)
  IF v_user_role = 'admin' THEN
    PERFORM public.log_admin_action(
      p_action      => 'approve_redemption_request',
      p_target_type => 'redemption_request',
      p_target_id   => p_request_id,
      p_metadata    => jsonb_build_object(
        'customer_id', v_req.customer_id,
        'campaign_id', v_req.campaign_id,
        'reward_id', v_req.reward_id,
        'points_cost', v_req.points_cost_snapshot,
        'branch_id', p_branch_id,
        'notes', p_notes,
        'comment_category', p_comment_category
      )
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    IF v_user_role = 'admin' THEN
      PERFORM public.log_admin_action(
        p_action      => 'approve_redemption_request_error',
        p_target_type => 'redemption_request',
        p_target_id   => p_request_id,
        p_metadata    => jsonb_build_object(
          'error_message', SQLERRM,
          'sql_state', SQLSTATE
        )
      );
    END IF;
    RAISE;
END;
$$;

-- 3. Otorgar permisos de ejecución
GRANT EXECUTE ON FUNCTION public.approve_redemption_request(
  uuid, uuid, text, uuid, text
) TO authenticated, service_role;