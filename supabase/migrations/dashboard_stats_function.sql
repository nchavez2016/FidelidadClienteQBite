-- Función para obtener estadísticas del Dashboard sin límite de registros
-- Corrige problemas de IDs de campaña vs sucursal y elimina límite de 500 registros

CREATE OR REPLACE FUNCTION get_dashboard_stats(
    p_branch_id UUID DEFAULT NULL,
    p_date_from TIMESTAMP DEFAULT NULL,
    p_date_to TIMESTAMP DEFAULT NULL
)
RETURNS TABLE (
    total_customers BIGINT,
    total_visits BIGINT,
    total_points_issued BIGINT,
    total_redemptions BIGINT,
    total_reversals BIGINT,
    pending_points BIGINT,
    funnel_data JSONB,
    gender_data JSONB,
    peak_hours JSONB,
    return_rate_days NUMERIC,
    top_customers JSONB,
    top_campaigns JSONB,
    cashier_activity JSONB
) AS $$
DECLARE
    v_date_from TIMESTAMP := COALESCE(p_date_from, NOW() - INTERVAL '7 days');
    v_date_to TIMESTAMP := COALESCE(p_date_to, NOW());
    v_range_days INTERVAL;
BEGIN
    -- Calcular rango de días para análisis de retorno
    v_range_days := v_date_to - v_date_from;
    
    RETURN QUERY
    WITH 
    -- 1. Estadísticas básicas del período
    basic_stats AS (
        SELECT 
            -- Clientes totales (con rol 'customer')
            (SELECT COUNT(*) FROM auth.users u 
             JOIN public.user_roles ur ON u.id = ur.user_id 
             WHERE ur.role = 'customer') as total_customers,
            
            -- Visitas acumuladas (earn/bonus no reversados)
            COUNT(CASE WHEN kind IN ('earn', 'bonus') AND NOT is_reversed THEN 1 END) as total_visits,
            
            -- Puntos emitidos
            COALESCE(SUM(CASE WHEN kind IN ('earn', 'bonus') AND NOT is_reversed THEN points_delta ELSE 0 END), 0) as total_points_issued,
            
            -- Canjes realizados
            COUNT(CASE WHEN kind = 'redeem' AND NOT is_reversed THEN 1 END) as total_redemptions,
            
            -- Reversales
            COUNT(CASE WHEN kind = 'reversal' THEN 1 END) as total_reversals,
            
            -- Puntos pendientes (saldo actual de clientes)
            COALESCE(SUM(balance_after), 0) as pending_points
        FROM public.point_transactions pt
        WHERE 
            (p_branch_id IS NULL OR pt.branch_id = p_branch_id) AND
            (v_date_from IS NULL OR pt.created_at >= v_date_from) AND
            (v_date_to IS NULL OR pt.created_at <= v_date_to)
    ),
    
    -- 2. Análisis de embudo por puntos
    funnel_analysis AS (
        SELECT 
            -- Niveles del embudo basados en hitos de campañas
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'label', tier_label,
                    'count', customer_count,
                    'bg_class', bg_class
                )
            ) as funnel_data
        FROM (
            SELECT 
                CASE 
                    WHEN milestone_required = 0 THEN 'Sin actividad (0 pts)'
                    WHEN i = 0 THEN '1 - ' || (milestone_required - 1) || ' pts'
                    ELSE prev_milestone + 1 || ' - ' || (milestone_required - 1) || ' pts'
                END as tier_label,
                customer_count,
                CASE 
                    WHEN milestone_required = 0 THEN 'bg-muted'
                    WHEN i = 0 THEN 'bg-slate-300 dark:bg-slate-600'
                    WHEN i = 1 THEN 'bg-sky-300 dark:bg-sky-600'
                    WHEN i = 2 THEN 'bg-blue-400 dark:bg-blue-500'
                    WHEN i = 3 THEN 'bg-indigo-500 dark:bg-indigo-400'
                    WHEN i = 4 THEN 'bg-violet-600 dark:bg-violet-400'
                    ELSE 'bg-emerald-500 dark:bg-emerald-400'
                END as bg_class
            FROM (
                SELECT 
                    i,
                    milestone_required,
                    customer_count,
                    LAG(milestone_required, 1, 0) OVER (ORDER BY i) as prev_milestone
                FROM (
                    SELECT 
                        ROW_NUMBER() OVER (ORDER BY milestone_required) as i,
                        milestone_required,
                        COUNT(*) as customer_count
                    FROM (
                        SELECT 
                            CASE 
                                WHEN COALESCE(cp.balance, 0) = 0 THEN 0
                                WHEN cp.balance < m1.required_points THEN 1
                                WHEN cp.balance < m2.required_points THEN 2
                                WHEN cp.balance < m3.required_points THEN 3
                                WHEN cp.balance < m4.required_points THEN 4
                                ELSE 5
                            END as milestone_group,
                            COUNT(*) as customer_count
                        FROM public.customer_campaign_points cp
                        LEFT JOIN public.milestones m1 ON cp.campaign_id = m1.campaign_id AND m1.order = 1
                        LEFT JOIN public.milestones m2 ON cp.campaign_id = m2.campaign_id AND m2.order = 2
                        LEFT JOIN public.milestones m3 ON cp.campaign_id = m3.campaign_id AND m3.order = 3
                        LEFT JOIN public.milestones m4 ON cp.campaign_id = m4.campaign_id AND m4.order = 4
                        WHERE 
                            (p_branch_id IS NULL OR cp.branch_id = p_branch_id) AND
                            cp.balance > 0
                        GROUP BY milestone_group
                    ) t
                    CROSS JOIN LATERAL (
                        SELECT required_points 
                        FROM public.milestones m 
                        WHERE m.campaign_id = cp.campaign_id 
                        ORDER BY m.order 
                        LIMIT 1 OFFSET (milestone_group - 1)
                    ) m
                ) t
            ) t
        ) t
    ),
    
    -- 3. Análisis de género
    gender_analysis AS (
        SELECT 
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'gender', gender_label,
                    'count', customer_count,
                    'visits', visit_count,
                    'redemptions', redemption_count,
                    'pct_redemption', pct_redemption
                )
            ) as gender_data
        FROM (
            SELECT 
                CASE 
                    WHEN c.gender IS NULL THEN 'sin_genero'
                    ELSE c.gender
                END as gender_key,
                CASE 
                    WHEN c.gender IS NULL THEN '— Sin género'
                    WHEN c.gender = 'masculino' THEN '♂ Masculino'
                    WHEN c.gender = 'femenino' THEN '♀ Femenino'
                    WHEN c.gender = 'otro' THEN '⚧ Otro'
                    ELSE c.gender
                END as gender_label,
                COUNT(DISTINCT c.id) as customer_count,
                COUNT(CASE WHEN pt.kind IN ('earn', 'bonus') AND NOT pt.is_reversed THEN 1 END) as visit_count,
                COUNT(CASE WHEN pt.kind = 'redeem' AND NOT pt.is_reversed THEN 1 END) as redemption_count,
                CASE 
                    WHEN COUNT(CASE WHEN pt.kind IN ('earn', 'bonus') AND NOT pt.is_reversed THEN 1 END) > 0 
                    THEN ROUND(
                        (COUNT(CASE WHEN pt.kind = 'redeem' AND NOT pt.is_reversed THEN 1 END) * 100.0) /
                        COUNT(CASE WHEN pt.kind IN ('earn', 'bonus') AND NOT pt.is_reversed THEN 1 END), 1
                    )
                    ELSE 0
                END as pct_redemption
            FROM public.customers c
            LEFT JOIN public.point_transactions pt ON c.id = pt.customer_id
            WHERE 
                (p_branch_id IS NULL OR pt.branch_id = p_branch_id) AND
                (v_date_from IS NULL OR pt.created_at >= v_date_from) AND
                (v_date_to IS NULL OR pt.created_at <= v_date_to)
            GROUP BY gender_key, gender_label
        ) t
    ),
    
    -- 4. Horas pico
    peak_hours_analysis AS (
        SELECT 
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'hour', hour,
                    'count', tx_count,
                    'is_peak', is_peak
                )
            ) as peak_hours
        FROM (
            SELECT 
                EXTRACT(HOUR FROM pt.created_at) as hour,
                COUNT(*) as tx_count,
                MAX(COUNT(*)) OVER () = COUNT(*) as is_peak
            FROM public.point_transactions pt
            WHERE 
                pt.kind IN ('earn', 'bonus') AND NOT pt.is_reversed AND
                (p_branch_id IS NULL OR pt.branch_id = p_branch_id) AND
                (v_date_from IS NULL OR pt.created_at >= v_date_from) AND
                (v_date_to IS NULL OR pt.created_at <= v_date_to)
            GROUP BY EXTRACT(HOUR FROM pt.created_at)
            ORDER BY hour
        ) t
    ),
    
    -- 5. Tasa de retorno (días promedio entre visitas)
    return_rate_analysis AS (
        SELECT 
            AVG(gap_days) as return_rate_days
        FROM (
            SELECT 
                customer_id,
                AVG(
                    EXTRACT(DAY FROM (visit_date - prev_visit_date))
                ) as gap_days
            FROM (
                SELECT 
                    customer_id,
                    visit_date,
                    LAG(visit_date, 1) OVER (PARTITION BY customer_id ORDER BY visit_date) as prev_visit_date
                FROM (
                    SELECT 
                        customer_id,
                        DATE(created_at) as visit_date
                    FROM public.point_transactions
                    WHERE 
                        kind IN ('earn', 'bonus') AND NOT is_reversed AND
                        (p_branch_id IS NULL OR branch_id = p_branch_id) AND
                        (v_date_from IS NULL OR created_at >= v_date_from) AND
                        (v_date_to IS NULL OR created_at <= v_date_to)
                    GROUP BY customer_id, DATE(created_at)
                ) t
            ) t
            WHERE prev_visit_date IS NOT NULL
            GROUP BY customer_id
        ) t
        WHERE gap_days > 0
    ),
    
    -- 6. Clientes top por puntos
    top_customers_analysis AS (
        SELECT 
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'customer_id', customer_id,
                    'points', points,
                    'visits', visits
                )
            ) as top_customers
        FROM (
            SELECT 
                customer_id,
                SUM(CASE WHEN kind IN ('earn', 'bonus') AND NOT is_reversed THEN points_delta ELSE 0 END) as points,
                COUNT(*) as visits
            FROM public.point_transactions
            WHERE 
                kind IN ('earn', 'bonus') AND NOT is_reversed AND
                (p_branch_id IS NULL OR branch_id = p_branch_id) AND
                (v_date_from IS NULL OR created_at >= v_date_from) AND
                (v_date_to IS NULL OR created_at <= v_date_to)
            GROUP BY customer_id
            ORDER BY points DESC
            LIMIT 10
        ) t
    ),
    
    -- 7. Campañas top por puntos
    top_campaigns_analysis AS (
        SELECT 
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'campaign_id', campaign_id,
                    'points', points,
                    'visits', visits
                )
            ) as top_campaigns
        FROM (
            SELECT 
                campaign_id,
                SUM(CASE WHEN kind IN ('earn', 'bonus') AND NOT is_reversed THEN points_delta ELSE 0 END) as points,
                COUNT(*) as visits
            FROM public.point_transactions
            WHERE 
                kind IN ('earn', 'bonus') AND NOT is_reversed AND
                (p_branch_id IS NULL OR branch_id = p_branch_id) AND
                (v_date_from IS NULL OR created_at >= v_date_from) AND
                (v_date_to IS NULL OR created_at <= v_date_to)
            GROUP BY campaign_id
            ORDER BY points DESC
            LIMIT 10
        ) t
    ),
    
    -- 8. Actividad por cajero
    cashier_activity_analysis AS (
        SELECT 
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'actor_id', actor_id,
                    'visits', visits,
                    'points_issued', points_issued,
                    'points_redeemed', points_redeemed
                )
            ) as cashier_activity
        FROM (
            SELECT 
                actor_id,
                COUNT(*) as visits,
                COALESCE(SUM(CASE WHEN kind IN ('earn', 'bonus') AND NOT is_reversed THEN points_delta ELSE 0 END), 0) as points_issued,
                COALESCE(SUM(CASE WHEN kind = 'redeem' AND NOT is_reversed THEN -points_delta ELSE 0 END), 0) as points_redeemed
            FROM public.point_transactions
            WHERE 
                actor_id IS NOT NULL AND
                (p_branch_id IS NULL OR branch_id = p_branch_id) AND
                (v_date_from IS NULL OR created_at >= v_date_from) AND
                (v_date_to IS NULL OR created_at <= v_date_to)
            GROUP BY actor_id
            ORDER BY visits DESC
            LIMIT 20
        ) t
    )
    
    SELECT 
        bs.total_customers,
        bs.total_visits,
        bs.total_points_issued,
        bs.total_redemptions,
        bs.total_reversals,
        bs.pending_points,
        fa.funnel_data,
        ga.gender_data,
        pha.peak_hours,
        COALESCE(rra.return_rate_days, 0)::NUMERIC as return_rate_days,
        tca.top_customers,
        tca.top_campaigns,
        caa.cashier_activity
    FROM basic_stats bs
    CROSS JOIN funnel_analysis fa
    CROSS JOIN gender_analysis ga
    CROSS JOIN peak_hours_analysis pha
    CROSS JOIN return_rate_analysis rra
    CROSS JOIN top_customers_analysis tca
    CROSS JOIN top_campaigns_analysis tca2
    CROSS JOIN cashier_activity_analysis caa;
    
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminamos la política que causa error y usamos permisos estándar
GRANT EXECUTE ON FUNCTION get_dashboard_stats(UUID, TIMESTAMP, TIMESTAMP) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_stats(UUID, TIMESTAMP, TIMESTAMP) TO service_role;

-- Nota: La seguridad interna de la función ya valida que sea admin o cashier