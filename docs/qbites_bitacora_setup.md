# QBites — Bitácora de Setup y Decisiones Técnicas
## Adaptación del sistema de fidelización (base: Gaviota Azul) para All In Burgers by Qbites

**Última actualización:** [completar fecha]
**Mantenido por:** [completar]

---

## 1. Infraestructura

- **Aislamiento deliberado:** QBites vive en una **cuenta de Supabase separada** de Gaviota Azul (no solo un proyecto distinto). Decisión tomada explícitamente para que la cuota de 2 proyectos gratis del plan free, la facturación, y cualquier pausa/incidente de un negocio nunca afecten al otro.
- **Proyecto Supabase:** `povjovcktiqeooxakhnv`
- **Plan:** Free
- **Región:** [completar — confirmar en Project Settings]
- **Repositorio:** `FidelidadClienteQBite` (GitHub, privado) — fork independiente de `FidelidadClienteAzul`, remoto reapuntado (`git remote set-url`), historial de commits conservado como referencia técnica.
- **Ramas:** `main` (estable/desplegable) + `dev` (trabajo activo). Se hace merge a `main` solo cuando algo está validado.
- **MCP Supabase** conectado en Claude Code vía `.mcp.json`, en modo `read_only=true` + `project_ref` acotado a QBites. Validado con una prueba real de `UPDATE` rechazado por Postgres (`error 25006: cannot execute UPDATE in a read-only transaction`) — confirma que el modo lectura es una restricción real a nivel de base de datos, no solo una sugerencia al modelo.
- **Frontend:** desplegado en Vercel bajo subdominio `*.vercel.app` (sin dominio propio comprado todavía).

---

## 2. Correcciones aplicadas sobre `schema_production.sql`

### 2.1 GRANTs faltantes a `authenticated`
**Problema:** mismo bug ya documentado en el proyecto original de Gaviota Azul ("Permisos RPC faltantes en producción") — el script no incluía `GRANT EXECUTE` sobre las funciones RPC de negocio, ni `GRANT` base sobre 8 de las 10 tablas con RLS habilitado (solo `branches` y `campaigns` tenían GRANT).

**Efecto si no se corregía:** el cliente no podría ver su perfil, sus puntos, ni su historial; ninguna operación de puntos/canjes funcionaría fuera de la Edge Function.

**Fix aplicado:** bloque de `GRANT SELECT/INSERT/UPDATE/DELETE` sobre `profiles`, `user_roles`, `customer_points`, `point_transactions`, `point_transactions_archive`, `redemption_requests`, `redemption_request_events`, `admin_audit_log`; y `GRANT EXECUTE` sobre `has_role`, `get_actor_display_names`, `log_admin_action`, `earn_points`, `redeem_reward`, `reverse_transaction`, `adjust_points`, `reset_customer_points`, `accept_campaign_terms`, `approve_redemption_request`.

**Validado con:**
```sql
has_table_privilege('authenticated', 'public.profiles', 'SELECT')
has_function_privilege('authenticated', 'public.earn_points(...)', 'EXECUTE')
```
→ todos `true`.

**Nota técnica:** una consulta directa a `information_schema.role_table_grants` mostró vacío incluso después de aplicar el GRANT — no es una inconsistencia real, es una restricción de visibilidad estándar de esa vista (solo muestra filas relevantes al rol que consulta). El rol de solo lectura del MCP no tiene esa visibilidad; `has_table_privilege()` sí evalúa el ACL real y es la fuente confiable.

### 2.2 Trigger `on_auth_user_created` faltante
**Problema:** la función `handle_new_user()` existía en el schema, pero nunca estaba conectada a `auth.users` — faltaba el `CREATE TRIGGER`. Ningún registro (cliente ni staff) creaba automáticamente su fila en `profiles`/`user_roles`.

**Fix aplicado:**
```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

**Nota:** al validar esto por primera vez vía MCP (modo lectura) el trigger no apareció en `information_schema.triggers` — se pensó que faltaba. Una segunda consulta directa desde el SQL Editor sí lo mostró: mismo tipo de restricción de visibilidad que en 2.1, no ausencia real. **Lección para el futuro:** ante resultados de `information_schema` inconsistentes entre el MCP y el SQL Editor, sospechar primero de visibilidad por rol antes de concluir que algo no existe.

---

## 3. Bug encontrado: doble rol admin+customer

Al crear el primer usuario admin manualmente (vía Supabase Auth dashboard, sin pasar por el flujo normal de registro), el trigger `handle_new_user()` le asignó `role='customer'` por defecto. Al agregar el rol `admin` por separado, el usuario quedó con **dos roles simultáneos** — mismo bug ya documentado en Gaviota Azul, que causaba 403 en `approve_redemption_request`.

**Fix aplicado:**
```sql
DELETE FROM public.user_roles WHERE user_id = '<uuid>' AND role = 'customer';
```

**Causa raíz:** crear usuarios admin manualmente desde el dashboard de Supabase no sigue el flujo normal de la app y puede dejar el perfil/roles inconsistentes. Recomendado para el futuro: minimizar la creación manual, o revisar `user_roles` después de cada alta manual.

---

## 4. Identidad de marca

| Campo | Valor |
|---|---|
| Nombre corto (UI) | Qbites |
| Nombre completo | All In Burgers by Qbites |
| Ubicación | Quito, Ecuador |
| Sucursal(es) | Una sola: Matriz |
| Color primario | `#D92521` (rojo) |
| Color oscuro | `#0B181E` (negro) |
| Color acento | `#E8A145` (dorado) |
| Dominio de email interno | `@phone.qbites.local` / `@staff.qbites.local` |
| Dominio de la app | subdominio Vercel (sin dominio propio, por decisión, no por limitación) |
| Instagram | instagram.com/qbites.ec |
| TikTok | tiktok.com/@qbites.ec |
| Facebook | facebook.com/share/19aTJCqfFQ |
| Logo | versión fondo transparente (header) + versión blanca sobre fondo rojo `#D92521` (favicon) |

---

## 5. Cambios de código aplicados

- **Dominio de email interno:** `CUSTOMER_DOMAIN`/`STAFF_DOMAIN` actualizados de `gaviota.local` a `qbites.local` en `src/contexts/AuthContext.tsx` (líneas 67-68) y en `supabase/functions/staff-admin/index.ts` (líneas 22-23).
  - **Validado — frontend:** login de admin confirmado funcionando correctamente con el dominio `qbites.local` corregido (flujo de `AuthContext.tsx` / `toEmail()`).
  - **Validado — Edge Function:** redeploy de `staff-admin` confirmado. Evidencia: se creó un usuario adicional exitosamente tras el redeploy (acción `create`, que genera el email vía `toStaffEmail()` → `@staff.qbites.local`), lo que confirma que la función server-side ya corre el código actualizado y no la versión previa con `gaviota.local`.
- **`CampaignsTab.tsx` — sucursales dinámicas:** se eliminó la constante hardcodeada `BRANCH_OPTIONS = ['Gaviota Azul - Matriz', 'Gaviota Azul - Express']`. El `<Select>` ahora lee de `getBranches()` (`src/services/branches.service.ts`), con hidratación vía `hydrateBranches()`/`isBranchesHydrated()`, siguiendo el mismo patrón que `CustomerDashboard.tsx`. `resolveBranchId()` y `getBranchAccent()` quedaron sin tocar, por decisión explícita.
- **Sucursal `Matriz`** sembrada manualmente en la tabla `branches` antes de crear la primera campaña, para evitar depender de la creación implícita/silenciosa de `resolveBranchId()` (riesgo de duplicados por desalineación de nombre, identificado durante la investigación).

---

## 6. Pendientes conocidos (no completados a la fecha de este documento)

- [ ] Textos de marca en `index.html`, `BrandHeader.tsx`, `HeroSection.tsx`, `StaffPanel.tsx` (nombre, meta description, alt text)
- [ ] Links de redes sociales en `Index.tsx` / `CustomerDashboard.tsx` — confirmar si el componente actual soporta ícono de TikTok o hay que agregarlo
- [ ] Colores estructurales en `src/index.css` / `tailwind.config.ts` (tokens HSL)
- [ ] ~20 archivos con hex hardcodeado de la familia azul/dorado → reemplazar por rojo/negro/dorado de QBites (sin tocar verdes/ámbares semánticos)
- [ ] Copiar assets de logo a `src/assets/` y actualizar referencias (`logo.png`, `logo-gaviota.png`, favicon)
- [ ] `brand_config` (tabla + `BrandConfigProvider`) — diseñado, aplicación pendiente
- [ ] Nivel 2 de gestión de sucursales (pantalla admin CRUD) — fuera de alcance de este sprint, documentado como mejora futura, no bloqueante con una sola sucursal
- [ ] Deuda técnica heredada de Gaviota Azul, aún presente en QBites sin resolver: hitos/bonus en JSONB, sin backups automáticos, sin ambiente de staging formal

---

## 7. Divergencias conocidas entre diseño e implementación (heredadas de Gaviota Azul)

- `campaigns.branch` es texto libre, no usa directamente la FK `campaigns.branch_id` — la resolución ocurre indirectamente en `resolveBranchId()` (match por nombre contra `branches`, con riesgo de duplicado si el texto no coincide exactamente).
- `getBranchAccent()` reconoce sucursales por `.includes('matriz')`/`.includes('express')` sobre texto libre, no por relación real con la tabla `branches` — funciona para QBites (una sola sucursal, "Matriz") pero no escala automáticamente a nombres de sucursal arbitrarios si se agregan más en el futuro.

---

## 8. Protección contra pérdida del último admin

**Confirmado:** `staff-admin` ya protege contra eliminar o degradar al último admin (`handleDelete` y `handleUpdate` en `supabase/functions/staff-admin/index.ts`), vía conteo de filas `role='admin'` en `user_roles` antes de aplicar el cambio.

**Segundo admin de respaldo creado**, como mitigación operativa adicional (reduce el impacto si el admin principal pierde acceso).

**Riesgo conocido, aceptado sin acción por ahora:** condición de carrera de baja probabilidad — el conteo de admins y el borrado/degradación no son atómicos (dos llamadas separadas a Supabase), por lo que dos solicitudes concurrentes podrían en teoría dejar el sistema sin ningún admin. Dado el volumen de uso esperado del panel, se acepta el riesgo sin remediar por ahora.
