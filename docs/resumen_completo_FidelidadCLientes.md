# Resumen Completo del Proyecto — Sistema de Fidelización Digital
## Gaviota Azul → Base de conocimiento para nuevos proyectos
**Fecha:** Agosto 2026  
**Preparado para:** Adaptación a nuevos clientes (ej: local de hamburguesas)  
**Estado:** Producción operativa con pendientes definidos

---

## 1. QUÉ SE CONSTRUYÓ

Sistema de fidelización digital completo para **Cevichería Gaviota Azul** (Ecuador).  
Permite a los clientes acumular puntos por visita y canjearlos por premios.  
Administrado desde un panel web por admin y cajeros.

### Funcionalidades implementadas y validadas en producción

| Funcionalidad | Estado | Notas |
|---|---|---|
| Login cliente (por teléfono) | ✅ | Validación 10 dígitos |
| Login staff (admin/cajero) | ✅ | Por usuario interno |
| Registro cliente (web pública) | ✅ | Con consentimiento telefónico |
| Registro cliente desde panel admin | ✅ | Cajero registra en caja |
| Búsqueda de cliente por teléfono | ✅ | Panel de Operaciones |
| Acumulación de puntos (+1 por visita) | ✅ | Con cooldown 60s anti-spam |
| Bonus de puntos (días/horas especiales) | ✅ | Configurable por campaña |
| Solicitud de canje (desde cliente) | ✅ | Queda en estado pending |
| Aprobación de canje (desde cajero) | ✅ | Descuenta puntos automáticamente |
| Reversión de transacciones | ✅ | Para corregir errores en caja |
| Historial de transacciones | ✅ | Por cliente |
| Timeline de premios (hitos) | ✅ | Visualización del progreso |
| Dashboard de métricas (admin) | ✅ | Clientes, puntos, canjes, horas pico |
| Gestión de campañas | ✅ | Hitos y bonus configurables |
| Gestión de usuarios staff | ✅ | Admin crea cajeros |
| Realtime (puntos en vivo) | ✅ | Sin recargar la página |
| Módulo de cumpleaños | ❌ | Diseñado, no implementado |
| Menú digital público | ❌ | Diseñado, no implementado |
| Backup automático de BD | ❌ | Pendiente |

---

## 2. STACK TÉCNICO

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite 5 + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| Routing | React Router |
| Backend/BaaS | Supabase (Postgres + Auth + Realtime + Edge Functions Deno) |
| Cliente BD | @supabase/supabase-js v2 |
| Data fetching | TanStack React Query v5 |
| Deploy frontend | Vercel (plan Hobby gratuito) |
| Repositorio | GitHub: `nchavez2016/FidelidadClienteAzul` |
| IDE/Builder original | Lovable |
| Monitor anti-pausa | UptimeRobot (plan free, ping cada 5 min) |

---

## 3. AMBIENTES

### Desarrollo
- Supabase ref: `vleopegtuhrjenletylm` (gaviota-azul-dev)
- Región: US East (Ohio)
- Lovable apunta SOLO a este proyecto
- NUNCA conectar Lovable a producción

### Producción
- Supabase ref: `ghzimzdsxkimwpvzcdoe` (gaviota-azul)
- Región: South America (São Paulo)
- URL: `https://fidelidad-cliente-azul.vercel.app`
- Dominio: `cevicheriagaviotaazul.com`
- Variables en Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`

---

## 4. MODELO DE DATOS COMPLETO

### Tablas

```sql
-- Sucursales del negocio
branches (
  id uuid PK,
  name text,
  legacy_campaign_id text,
  is_active boolean DEFAULT true,
  deleted_at timestamptz,
  created_at, updated_at
)

-- Perfiles de usuarios (1:1 con auth.users)
profiles (
  id uuid PK → auth.users,
  display_name text,
  phone text UNIQUE,
  gender gender_type,  -- masculino|femenino|otro
  branch_id uuid → branches,
  is_active boolean DEFAULT true,
  deleted_at timestamptz,
  accepted_campaigns uuid[],
  revoked_from_phone text,  -- para bajas/derecho al olvido
  legacy_id text,
  email text UNIQUE (case-insensitive),
  birthdate date,
  -- Consentimiento telefónico
  phone_consent_granted boolean DEFAULT false,
  phone_consent_at timestamptz,
  phone_consent_source text,  -- 'self' o 'staff_panel'
  phone_consent_actor_id uuid,  -- UUID del cajero si fue presencial
  created_at, updated_at
)

-- Roles de usuarios
user_roles (
  id uuid PK,
  user_id uuid → auth.users,
  role app_role,  -- admin|cashier|customer
  UNIQUE (user_id, role)
)

-- Campañas por sucursal
campaigns (
  id uuid PK,
  branch_id uuid → branches,
  name text,
  status campaign_status,  -- draft|active|paused|finished
  start_date date,
  end_date date,
  terms_and_conditions text,
  milestones jsonb,     -- [{name, points_required}]
  bonus_rules jsonb,    -- [{days, hours, multiplier}]
  min_order_amount numeric DEFAULT 5.00,
  points_description text,
  legacy_id text UNIQUE,
  deleted_at timestamptz,
  created_at, updated_at
)

-- Saldo de puntos por cliente/campaña
customer_points (
  customer_id uuid → auth.users,
  campaign_id uuid → campaigns,
  points integer DEFAULT 0,
  points_lifetime integer DEFAULT 0,
  last_tx_id uuid,
  updated_at timestamptz,
  PRIMARY KEY (customer_id, campaign_id)
)

-- Ledger de transacciones (APPEND-ONLY)
point_transactions (
  id uuid PK,
  customer_id uuid → auth.users,
  campaign_id uuid → campaigns,
  branch_id uuid → branches,
  kind tx_kind,  -- earn|bonus|redeem|manual_adjustment|reversal|terms_acceptance
  points_delta integer,
  balance_after integer,
  reward_id uuid,
  bonus_rule_id uuid,
  bonus_multiplier numeric,
  reverses_tx_id uuid UNIQUE,  -- FK self-referencial para reversiones
  idempotency_key text UNIQUE,
  actor_id uuid,
  actor_role app_role,
  comment_category text,
  comment_text text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz,
  effective_at timestamptz
)
-- CRÍTICO: Tiene trigger anti-mutación. Bypass:
-- SELECT set_config('app.pt_internal','1',true);

-- Archivo de transacciones (>12 meses)
point_transactions_archive (
  -- Mismo esquema que point_transactions
  -- MÁS: archived_at timestamptz
  -- SIN trigger anti-mutación (se puede borrar)
)

-- Vista unificada operativa + archivo
-- point_transactions_full → UNION ALL de ambas tablas, campo is_archived

-- Solicitudes de canje
redemption_requests (
  id uuid PK,
  customer_id uuid → auth.users,
  campaign_id uuid → campaigns,
  reward_id text,
  reward_name_snapshot text,
  points_cost_snapshot integer,
  status redemption_status,  -- pending|approved|rejected|cancelled
  requested_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz,
  notes text,
  branch_id uuid → branches,
  created_at timestamptz
  -- UNIQUE parcial: (customer_id, campaign_id) WHERE status='pending'
)

-- Historial de eventos de canje
redemption_request_events (
  id uuid PK,
  request_id uuid → redemption_requests,
  event_type text,
  actor_user_id uuid,
  notes text,
  created_at timestamptz
)

-- Auditoría de acciones admin/staff
admin_audit_log (
  id uuid PK,
  actor_id uuid,
  actor_role app_role,
  action text,
  target_type text,
  target_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz
)
```

### Enums
```sql
app_role: admin, cashier, customer
campaign_status: draft, active, paused, finished
gender_type: masculino, femenino, otro
redemption_status: pending, approved, rejected, cancelled
tx_kind: earn, bonus, redeem, manual_adjustment, reversal, terms_acceptance
```

### Funciones RPC (SECURITY DEFINER)
```
earn_points(customer_id, campaign_id, branch_id, bonus_multiplier, ...)
redeem_reward(customer_id, campaign_id, reward_id, reward_name, points, ...)
reverse_transaction(tx_id, reason)
adjust_points(customer_id, campaign_id, delta, reason)
reset_customer_points(customer_id, campaign_id, reason)
approve_redemption_request(request_id, staff_id, branch_id, notes, ...)
accept_campaign_terms(campaign_id)
handle_new_user() → trigger en auth.users
archive_point_transactions() → mueve >12 meses a archive
purge_archived_point_transactions() → purga inactivos >18 meses
purge_old_admin_audit_log() → retención 6 meses
purge_old_redemption_request_events() → retención 6 meses
log_admin_action(action, target_type, target_id, metadata)
log_system_action(action, target_type, target_id, metadata)
has_role(user_id, role) → boolean
get_actor_display_names(ids[]) → tabla
```

### Jobs pg_cron
```
sdd_purge_admin_audit_log      → día 1 cada mes, 3:00 AM
sdd_purge_redemption_events    → día 1 cada mes, 3:15 AM
sdd_archive_point_transactions → día 2 cada mes, 4:00 AM
sdd_purge_archived_point_transactions → día 2 cada mes, 4:30 AM
```

---

## 5. AUTENTICACIÓN

### Patrón de email interno
Los usuarios NO tienen emails reales. Supabase requiere formato email
para auth, por eso se usa un dominio interno ficticio:

```
Clientes:  <telefono>@phone.gaviota.local
Staff:     <usuario>@staff.gaviota.local
```

### Configuración crítica en Supabase Auth
- **"Confirm email" DESACTIVADO** — obligatorio mientras se usen dominios internos
- Si se activa por error, el sistema deja de funcionar completamente
- La contraseña inicial del cliente ES SU NÚMERO DE TELÉFONO

### Consentimiento telefónico
Persiste en `profiles`:
- `phone_consent_granted` → boolean
- `phone_consent_at` → timestamp de aceptación
- `phone_consent_source` → 'self' (cliente) o 'staff_panel' (cajero)
- `phone_consent_actor_id` → UUID del cajero si fue registro presencial

### Revocación
Si el cliente revoca el consentimiento:
- `profiles.revoked_from_phone` guarda el número original
- `profiles.phone` pasa a `revoked:<phone>:<timestamp>`
- Libera el número para reutilizarlo

---

## 6. EDGE FUNCTIONS

### staff-admin
Única Edge Function del sistema. Maneja todas las acciones de staff.

**Acciones disponibles:**
- `create` → crear usuario staff (admin o cashier)
- `update` → actualizar datos de staff
- `set_active` → activar/desactivar staff
- `delete` → eliminar staff
- `list` → listar staff
- `create_customer` → crear cliente desde panel admin (admin o cashier)

**Secret:** `SUPABASE_SERVICE_ROLE_KEY` — inyectado automáticamente por
Supabase como Default Secret (aparece como DEPRECATED pero funciona).
NO se puede crear manualmente porque Supabase rechaza el prefijo `SUPABASE_`.

**Wrapper frontend:** `src/lib/invokeStaffAdmin.ts`
- Maneja 401 (token expirado) con refreshSession() automático
- Si el refresh falla → signOut() + redirect a /staff/login
- Todos los callers de staff-admin usan este wrapper

**Comando para redesplegar en producción:**
```powershell
cd "C:\@Desarrollo\Proyecto\Gaviota-Azul\FidelidadClienteAzul"
git pull
supabase login --token <token>
supabase functions deploy staff-admin --project-ref ghzimzdsxkimwpvzcdoe
```

---

## 7. PROBLEMAS ENCONTRADOS Y SOLUCIONES

### Bug crítico: trigger anti-mutación silencioso
**Problema:** El trigger `point_transactions_no_mutation` tenía `RETURN NEW`
en operaciones DELETE. En PostgreSQL, `NEW` es NULL en DELETE → el trigger
cancelaba el DELETE silenciosamente sin error. Esto hacía que el archivo
mensual de transacciones nunca moviera ninguna fila.

**Solución:**
```sql
-- Antes (bug):
IF current_setting('app.pt_internal', true) = '1' THEN
  RETURN NEW;  -- NULL en DELETE → cancela silenciosamente
END IF;

-- Después (fix):
IF current_setting('app.pt_internal', true) = '1' THEN
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END IF;
```

### Fallback destructivo en handle_new_user
**Problema:** El trigger `handle_new_user` ante cualquier `unique_violation`
re-insertaba el perfil con `phone=NULL` y `email=NULL`, perdiendo datos válidos.

**Solución:** Detectar qué campo específicamente colisionó y anular solo ese:
- Colisión en email → conservar phone, anular email
- Colisión en phone → conservar email, anular phone
- Colisión en PK (perfil ya existe) → merge de campos no-nulos

### Token JWT expirado en sesiones largas
**Problema:** El cajero deja el panel abierto horas. El token local sigue
activo pero `auth.sessions` fue limpiada en el servidor → 401 en Edge Functions.

**Solución:** Wrapper `invokeStaffAdmin` que detecta el 401, hace
`refreshSession()` y reintenta una vez. Si el refresh falla, hace logout.

### Email inválido en producción
**Problema:** Supabase producción rechazaba `0998035717@phone.gaviota.local`
con `email_address_invalid` porque intentaba validar el dominio al enviar
el email de confirmación.

**Solución:** Desactivar "Confirm email" en Authentication → Sign In / Providers.
Con eso Supabase acepta cualquier formato de email interno.

### Doble rol admin+customer
**Problema:** El usuario admin tenía roles `admin` Y `customer` en `user_roles`.
Esto causaba que `approve_redemption_request` retornara 403 porque la función
interna se confundía con el rol.

**Solución:**
```sql
DELETE FROM public.user_roles
WHERE user_id = '<uuid-admin>'
AND role = 'customer';
```

### Realtime no activo en producción
**Problema:** En producción, `supabase_realtime` tenía 0 tablas publicadas.
Los puntos no se actualizaban en tiempo real para el cliente.

**Solución:** Database → Publications → supabase_realtime → agregar
`point_transactions` y `customer_points`.

### Permisos RPC faltantes en producción
**Problema:** Las funciones RPC existían pero no tenían GRANT en producción.
Causaba 403 al intentar aprobar canjes, emitir puntos, etc.

**Solución:**
```sql
GRANT EXECUTE ON FUNCTION public.approve_redemption_request(...) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_reward(...) TO authenticated;
GRANT EXECUTE ON FUNCTION public.earn_points(...) TO authenticated;
-- (y todas las demás RPCs)
```

### Columna created_at faltante en redemption_requests
**Problema:** El frontend consultaba `redemption_requests.created_at`
que no existía en la tabla de producción → error 400.

**Solución:**
```sql
ALTER TABLE public.redemption_requests
ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
```

### Supabase se pausó en producción
**Problema:** El plan free pausa proyectos sin actividad por 7 días.
El sistema dejó de funcionar un fin de semana.

**Solución:** UptimeRobot configurado con ping cada 5 minutos:
```
URL: https://ghzimzdsxkimwpvzcdoe.supabase.co/rest/v1/branches?select=id&limit=1&apikey=<anon_key>
```

### unknown_action en Edge Function
**Problema:** La acción `create_customer` de staff-admin retornaba
`unknown_action` en producción porque la función no había sido redesplegada
con el nuevo código tras el merge.

**Solución:** Redesplegar la Edge Function con CLI después de cada merge
que modifique `supabase/functions/staff-admin/index.ts`.

---

## 8. CICLO DE VIDA DE LOS DATOS

### point_transactions (ledger)
```
NACE en point_transactions (tabla operativa)
         ↓
     12 meses después (job día 2 de cada mes)
         ↓
SE MUEVE a point_transactions_archive
(solo si: no tiene reversal activo pendiente
 Y el cliente tiene snapshot válido en customer_points)
         ↓
     Cliente inactivo 18+ meses + saldo = 0
         ↓
SE BORRA de point_transactions_archive
```

### Logs de auditoría
```
admin_audit_log → retención 6 meses (job día 1 de cada mes)
redemption_request_events → retención 6 meses (job día 1 de cada mes)
```

---

## 9. FLUJO DE DEPLOY

```
Lovable (dev) → genera cambios en rama
       ↓
PR en GitHub → revisión
       ↓
Merge a main → Vercel redespliega frontend automáticamente
       ↓
Si hay cambios en Edge Functions:
  supabase functions deploy staff-admin --project-ref ghzimzdsxkimwpvzcdoe
       ↓
Si hay cambios de schema SQL:
  Aplicar manualmente en SQL Editor de Supabase producción
```

**IMPORTANTE:** No hay integración GitHub ↔ Supabase. Las migraciones
del repo son solo referencia, NO se ejecutan automáticamente.

---

## 10. REGLAS DE NEGOCIO CRÍTICAS

### Puntos
- 1 punto por visita/orden independiente del monto
- Cooldown de 60 segundos entre acumulaciones del mismo cliente/campaña
- Canje parcial → solo se descuentan los puntos del premio, el resto queda
- Los puntos son por campaña → un cliente puede tener saldos distintos

### Campañas
- Cada sucursal tiene su propia campaña independiente
- Los hitos (premios) viven en JSONB `milestones` dentro de campaigns
- Las reglas de bonus viven en JSONB `bonus_rules`
- El cliente debe aceptar los términos antes de acumular puntos
- La aceptación se registra en `profiles.accepted_campaigns` Y en
  `point_transactions` con kind=`terms_acceptance`

### Canjes
- El cliente solicita → estado `pending`
- El cajero aprueba → estado `approved` + descuento automático de puntos
- Solo puede haber UNA solicitud pendiente por cliente por campaña

### Reversiones
- `point_transactions` es append-only (trigger anti-mutación)
- Las correcciones se hacen con una transacción `reversal` que referencia
  la original via `reverses_tx_id`
- No se puede revertir una reversal

### Roles
- Un usuario debe tener UN SOLO ROL activo
- Doble rol (admin+customer) causa errores en approve_redemption_request
- Los cajeros solo pueden ser creados por admins desde el panel

### Registro desde admin
- Solo nombre, teléfono (10 dígitos), género y consentimiento verbal
- NO se pide email ni fecha de nacimiento
- Contraseña inicial = número de teléfono
- El cajero marca checkbox confirmando el consentimiento verbal del cliente

---

## 11. FLUJOS OPERATIVOS DEL DÍA A DÍA

### Cajero en caja
1. Entra al panel con sus credenciales
2. Busca al cliente por teléfono en Operaciones
3. Si no existe → "Registrar Cliente" → crea en el momento
4. Si existe → ve puntos acumulados y solicitudes pendientes
5. "+1 Punto" para acumular
6. "Canjear" para aprobar solicitud pendiente del cliente
7. "Revertir" si cometió un error

### Cliente
1. Entra al panel con su teléfono y contraseña
2. Ve puntos, timeline de premios, historial
3. Cuando tiene puntos suficientes → solicita canje
4. El canje queda pending hasta que el cajero lo aprueba
5. Ve en tiempo real cuando el cajero le suma puntos (Realtime)

### Admin
1. Accede por la misma URL que el cajero
2. Operaciones, Dashboard, Campañas, Reportes, Usuarios
3. Crea campañas con hitos y bonus configurables
4. Crea y gestiona usuarios staff
5. Ve métricas de rendimiento del programa

---

## 12. MÓDULOS PENDIENTES DE IMPLEMENTAR

### Módulo de Cumpleaños (diseñado, no implementado)

**Reglas de negocio definidas:**
- Premio independiente del catálogo de campañas
- Configurable por sucursal (premio y ventana de días)
- El cliente se acerca físicamente, NO es automático
- Un solo canje por año sin importar la sucursal
- Control anti-fraude: PK `(user_id, birthday_year)` en BD

**Tablas a crear:**
```sql
birthday_config (
  id, branch_id UNIQUE, is_active,
  window_mode ('dias' | 'mes_completo'),
  days_before, days_after,
  reward_type ('producto' | 'descuento'),
  discount_value, gift_product,
  min_purchase_amount,  -- informativo, cajero valida manualmente
  reward_message        -- SOLO visible al cajero, NUNCA al cliente
)

birthday_grants (
  user_id, birthday_year,  -- PK compuesta → control anti-fraude real
  branch_id, granted_by, granted_at
)
```

**RPCs a crear:**
- `get_birthday_status(user_id)` → `{eligible: bool, reward_text}` (panel cliente)
- `get_birthday_redemption_eligibility(user_id, branch_id)` → detalle para cajero
- `grant_birthday_reward(user_id, branch_id)` → ejecuta el canje

**UX definida:**
- Panel cliente: banner navy/dorado SOLO si eligible=true
  La RPC se dispara SOLO si el mes actual = mes del birthdate (check gratis)
- Panel cajero: card dorada al buscar cliente, botón "Aplicar y Registrar Regalo"
- Panel admin: Configuración → Cumpleaños (por sucursal)

**Casos borde importantes:**
- 29 de febrero → observar 28 de febrero en años no bisiestos
- Cruce dic/ene → evaluar cumpleaños en año actual Y año anterior
- `birthday_year` = año de la OCURRENCIA, no del canje

### Menú Digital Público (diseñado, no implementado)

**Rutas:**
- `/menu` → landing selector de sucursal
- `/menu/matriz` → carta Matriz
- `/menu/express` → carta Express

**Tablas a crear:**
```sql
menu_categories (id, branch_id, name, display_order, is_active)
menu_items (id, category_id, name, description, price, is_active, display_order)
```

**Comportamiento:** Sin items configurados → mostrar "En construcción"

**Diseño visual definido:**
- Fondo: `#0A0A0A` (casi negro, reduce fatiga en móvil)
- Texto: `#F5F0E8` (blanco roto, evoca papel artesanal)
- Acento: `#C9A84C` (dorado mate)
- Mobile-first (clientes escanean QR desde el celular)
- Botón "Únete al programa de fidelidad" en dorado → máxima conversión

**Panel admin:** Configuración → Menú (por sucursal)
CRUD de categorías e items, reordenamiento, activar/desactivar sin borrar

---

## 13. DEUDA TÉCNICA DOCUMENTADA

| Deuda | Impacto | Urgencia |
|---|---|---|
| Dominio interno `@phone.gaviota.local` hardcodeado en código | Si se activa "Confirm email" el sistema falla | Baja (funciona con confirm desactivado) |
| Migraciones no sincronizadas con repo | Cada deploy SQL es manual | Media |
| Sin backups automáticos (plan free) | Si la BD se corrompe, no hay recovery | Alta |
| `hydrateCustomers` carga todos los clientes siempre | Performance degradada al crecer | Media |
| Hitos/bonus en JSONB en vez de tablas separadas | Reportería y queries complejas | Baja |
| Una sola Edge Function para todo | Cold start lento al crecer | Baja |
| Sin ambiente de staging formal | Bugs llegan directo a producción | Media |

---

## 14. DECISIONES QUE SE TOMARÍAN DIFERENTE EN V2.0

| Decisión actual | Problema | Cómo hacerlo bien |
|---|---|---|
| Dominio hardcodeado | Frágil, requiere código para cambiar | Variable de entorno `VITE_CUSTOMER_EMAIL_DOMAIN` |
| Migraciones manuales | Desincronización dev/prod | Desde el día 1 todo en `supabase/migrations/` + CLI |
| Sin backups | Riesgo real de pérdida | GitHub Actions + pg_dump semanal a S3/R2 |
| Hidratación pesada al login | Carga todos los datos siempre | RPCs por rol + carga bajo demanda paginada |
| Hitos en JSONB | Difícil de consultar | Tablas separadas `campaign_milestones` + FK |
| Edge Function monolítica | Difícil de mantener | Funciones por dominio: staff, customer, birthday |
| Sin staging | Bugs en producción sin red de seguridad | Branch `staging` + tercer proyecto Supabase |

---

## 15. INFRAESTRUCTURA DE PRODUCCIÓN (estado actual)

### Usuarios reales en producción
- Admin principal: `9299d4af-5dc3-42ff-acfa-3cea9e579670`
- Camilo Delgado: `38b0b123-9a82-4aa3-95f8-eef8bd704113` → rol admin

### Configuración de Auth en producción
- "Confirm email": **DESACTIVADO** ← no activar nunca
- Redirect URL: `https://cevicheriagaviotaazul.com/**`
- Site URL: `https://cevicheriagaviotaazul.com`

### Realtime activo para
- `customer_points` ✅
- `point_transactions` ✅

### Anti-pausa
- UptimeRobot: ping cada 5 minutos ✅
- Estado: UP ✅

---

## 16. PLAN DE NEGOCIO — VENTA A OTROS CLIENTES

### Modelo recomendado: White-label individual

**Para cada cliente nuevo:**
1. Crear proyecto Supabase nuevo (~30 min)
2. Aplicar `schema_production.sql`
3. Configurar `brand_config` con datos del cliente
4. Subir logo a Supabase Storage
5. Configurar variables de entorno en Vercel
6. Configurar dominio del cliente
7. Crear usuario admin del cliente
8. Capacitación de 1 hora
9. Lanzamiento

**Tiempo por cliente: 4-6 horas**

**Estructura de precio sugerida:**
```
Setup inicial (pago único):  $800 - $1,500 USD
Mantenimiento mensual:       $50 - $150 USD/mes
```

### Para hacer posible el white-label (pendiente de implementar)

```sql
CREATE TABLE brand_config (
  id uuid PRIMARY KEY,
  business_name text NOT NULL,
  business_tagline text,
  logo_url text,
  color_primary text DEFAULT '#0A1F44',
  color_accent text DEFAULT '#C9A84C',
  color_background text DEFAULT '#FFFFFF',
  color_text text DEFAULT '#1A1A1A',
  program_name text DEFAULT 'Programa de Fidelidad',
  phone text,
  email text,
  address_matriz text,
  address_express text,
  hours_matriz text,
  hours_express text,
  internal_email_domain text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)
```

El frontend lee la config al cargar y aplica CSS variables dinámicas.
El admin del cliente puede actualizar su marca desde el panel sin tocar código.

---

## 17. PLAN V2.0 — SAAS MULTI-TENANT

Si se decide construir una plataforma donde múltiples empresas se suscriban:

### Stack recomendado
- **Frontend:** Next.js 14 + TypeScript (SSR, middleware nativo, API routes)
- **UI:** shadcn/ui + Tailwind (mismo que Gaviota Azul)
- **Backend:** Supabase (mismo stack, misma experiencia)
- **Pagos:** Stripe (webhooks para suscripciones automáticas)
- **Emails:** Resend ($0 hasta 3,000/mes)
- **IDE:** Antigravity IDE (control total del código)

### Modelo de datos multi-tenant
Todas las tablas llevan `tenant_id`. RLS garantiza aislamiento total.

```sql
-- Nueva tabla maestra
tenants (id, name, slug, plan, plan_expires_at, is_active)
subscriptions (id, tenant_id, plan, price, billing_cycle, status, current_period_end)
brand_config (id, tenant_id, logo_url, color_primary, color_accent, ...)
```

### Hitos del roadmap v2.0
```
Hito 0 (2 sem): Fundación, repo, schema multi-tenant, CI/CD
Hito 1 (2 sem): Auth + tenancy, panel super-admin básico
Hito 2 (1 sem): White-label dinámico, Supabase Storage
Hito 3 (3 sem): Core fidelización (puntos, canjes, campañas)
Hito 4 (1 sem): Registro de clientes mejorado
Hito 5 (1 sem): Módulo de cumpleaños
Hito 6 (1 sem): Menú digital público
Hito 7 (1 sem): Dashboard y reportes + exportación CSV
Hito 8 (2 sem): Stripe + suscripciones automáticas
Hito 9 (1 sem): Producción + onboarding + documentación
Total: ~15 semanas con dedicación parcial / ~8 semanas tiempo completo
```

---

## 18. COMANDOS DE REFERENCIA

```powershell
# Instalar Supabase CLI (Windows con Scoop)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Login con token
supabase login --token <token>

# Vincular proyecto
supabase link --project-ref ghzimzdsxkimwpvzcdoe

# Redesplegar Edge Function en producción
cd "C:\@Desarrollo\Proyecto\Gaviota-Azul\FidelidadClienteAzul"
git pull
supabase functions deploy staff-admin --project-ref ghzimzdsxkimwpvzcdoe
```

```sql
-- Ver usuarios y roles
SELECT p.display_name, p.phone, ur.role, ur.user_id
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id
ORDER BY ur.role;

-- Bypass trigger anti-mutación
SELECT set_config('app.pt_internal', '1', true);
-- ... operación de mantenimiento ...
SELECT set_config('app.pt_internal', '', true);

-- Jobs pg_cron activos
SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;

-- Tamaño de tablas
SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass))
FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(tablename::regclass) DESC;
```

---

## 19. CHECKLIST PARA ADAPTAR A UN NUEVO CLIENTE

Al adaptar este sistema para un nuevo negocio (ej: hamburguesas):

### Cambios en base de datos
- [ ] Crear proyecto Supabase nuevo
- [ ] Aplicar `schema_production.sql`
- [ ] Insertar sucursales del nuevo negocio en `branches`
- [ ] Crear usuario admin del nuevo negocio

### Cambios en configuración
- [ ] Variables de entorno en Vercel apuntando al nuevo Supabase
- [ ] URL Configuration en Supabase Auth (Site URL + Redirect URLs del nuevo dominio)
- [ ] "Confirm email" desactivado en el nuevo proyecto
- [ ] Publicar tablas `customer_points` y `point_transactions` en supabase_realtime
- [ ] Aplicar GRANTs de ejecución a todas las RPCs
- [ ] UptimeRobot configurado para el nuevo proyecto

### Cambios en el código (hasta implementar white-label)
- [ ] Logo e imágenes del nuevo negocio
- [ ] Colores corporativos en Tailwind/CSS
- [ ] Nombre del negocio y del programa de fidelidad
- [ ] Dominio interno de email (`@phone.gaviota.local` → `@phone.nuevonegocio.local`)
- [ ] Textos y mensajes de la app

### Despliegue
- [ ] Redesplegar Edge Function staff-admin en el nuevo proyecto
- [ ] Configurar dominio del nuevo negocio en Vercel
- [ ] Crear campaña inicial desde el panel admin
- [ ] Capacitación al equipo del nuevo negocio

---

## 20. LÍMITES DEL PLAN FREE DE SUPABASE

| Recurso | Límite | Riesgo |
|---|---|---|
| Base de datos | 500 MB | Bajo (pg_cron controla crecimiento) |
| MAUs | 50,000/mes | Muy bajo para negocios locales |
| Edge Functions | 500,000/mes | Bajo |
| Realtime | 200 conexiones simultáneas | Bajo |
| Pausa por inactividad | 7 días | **RESUELTO con UptimeRobot** |
| Backups automáticos | Ninguno | **Riesgo real — pendiente** |

**Cuándo migrar a Pro ($25/mes):**
- +40,000 clientes activos/mes
- BD cerca de 400 MB
- Se necesitan backups para cumplimiento legal

---

*Documento generado en agosto 2026. Basado en implementación real y validada en producción.*
*Todo el código fuente en: `github.com/nchavez2016/FidelidadClienteAzul` (repo privado)*
