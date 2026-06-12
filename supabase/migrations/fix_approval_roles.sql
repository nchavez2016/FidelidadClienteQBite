-- Corregir función de aprobación para que use rol 'cashier' o 'admin'
-- Modificar la función approve_redemption_request para verificar roles explícitamente

CREATE OR REPLACE FUNCTION public.approve_redemption_request(
  p_request_id UUID,
  p_staff_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_comment_category TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req RECORD;
  v_user_role TEXT;
  v_can_approve BOOLEAN := FALSE;
BEGIN
  -- Verificar el rol del usuario que llama la función
  SELECT role INTO v_user_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  -- Verificar si tiene permiso para aprobar (cashier o admin)
  IF v_user_role IN ('cashier', 'admin') THEN
    v_can_approve := TRUE;
  END IF;
  
  IF NOT v_can_approve THEN
    RAISE EXCEPTION 'Permission denied: User must have cashier or admin role';
  END IF;

  -- Lock the row for update
  SELECT * INTO v_req
  FROM public.redemption_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already processed';
  END IF;

  -- 1. Insert ledger transaction first (calls existing RPC)
  -- Si falla (ej: no hay suficientes puntos, error de validación), toda la transacción se revierte!
  PERFORM public.redeem_reward(
    v_req.customer_id,
    v_req.campaign_id,
    v_req.reward_id,
    v_req.reward_name_snapshot,
    v_req.points_cost_snapshot,
    p_branch_id,
    gen_random_uuid()::TEXT,
    p_comment_category
  );

  -- 2. Update request to approved
  UPDATE public.redemption_requests
  SET status = 'approved',
      resolved_by = p_staff_id,
      notes = p_notes,
      resolved_at = now()
  WHERE id = p_request_id;
  
  -- 3. Insertar evento de aprobación en la tabla de eventos
  INSERT INTO public.redemption_request_events (
    request_id,
    event_type,
    actor_user_id,
    notes,
    created_at
  ) VALUES (
    p_request_id,
    'approved',
    p_staff_id,
    p_notes,
    now()
  );
  
  -- 4. Registrar acción de auditoría para admin
  IF v_user_role = 'admin' THEN
    PERFORM public.log_admin_action(
      p_staff_id,
      'approve_redemption_request',
      JSONB_BUILD_OBJECT(
        'request_id', p_request_id,
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
    -- Registrar error en auditoría si es admin
    IF v_user_role = 'admin' AND SQLSTATE != '23505' THEN
      PERFORM public.log_admin_action(
        p_staff_id,
        'approve_redemption_request_error',
        JSONB_BUILD_OBJECT(
          'request_id', p_request_id,
          'error_message', SQLERRM,
          'sql_state', SQLSTATE,
          'error_details', SQLSTATE
        )
      );
    END IF;
    RAISE;
END;
$$;

-- 1. Eliminamos el intento de política que causa el error
-- 2. Otorgamos permisos de ejecución de forma correcta
GRANT EXECUTE ON FUNCTION public.approve_redemption_request(UUID, UUID, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_redemption_request(UUID, UUID, TEXT, UUID, TEXT) TO service_role;

-- 3. Aseguramos que la tabla de eventos solo sea accesible por el staff
ALTER TABLE public.redemption_request_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_events_staff_only" ON public.redemption_request_events;
CREATE POLICY "insert_events_staff_only" ON public.redemption_request_events
    FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('admin', 'cashier')
      )
    );

-- 4. Aseguramos que la auditoría sea solo para el administrador
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_admin_only" ON public.admin_audit_log;
CREATE POLICY "audit_log_admin_only" ON public.admin_audit_log
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
      )
    );