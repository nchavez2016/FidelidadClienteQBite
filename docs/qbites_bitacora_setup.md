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

## 10. Imágenes temáticas de Gaviota Azul reemplazadas por assets reales de QBites

**Ícono de progreso** (`ProgressRoute.tsx`, marcador del hito actual en la ruta de puntos): se probaron sucesivamente `ficha-qbites.png`, `ficha-qbites.svg` y dos variantes 3D (`Hamburguesa3D1.png`/`Hamburguesa3D2.png`) — las dos primeras (ficha de póker con texto en el borde) resultaron ilegibles a 28×28px real, verificado capturando los píxeles renderizados vía canvas (sin suavizado ni zoom CSS, para evitar que un SVG se re-vectorice nítido al ampliarlo). **Resuelto** con `hamburguesa-3d.png` (copia de `Hamburguesa3D2.png`, elegida entre las dos por leerse más limpia a tamaño real) — sí se distingue como silueta de hamburguesa a 28px. Reemplaza a `gaviota3d.png` en los 3 puntos de uso del componente.

**Ajuste posterior — recorte del margen transparente:** se probó agrandar la caja del ícono (`w-7 h-7` = 28px → 36px → 40px en `ProgressRoute.tsx`) para mejorar la legibilidad, pero se confirmó con `getBoundingClientRect()` que eso genera solapamiento real con el hito "Inicio" (10×15px de solapamiento a 28px, creciendo a 18×23px a 36px y 22×27px a 40px) — el límite es de espacio disponible en el layout, no de nitidez de la imagen. En su lugar, se recortó el margen transparente de `hamburguesa-3d.png`: el contenido útil real ocupaba solo 531×541px dentro de un lienzo de 1254×1254px (~43%). Se recortó a 561×571px (531×541 + 15px de aire), dejando la caja de 28px en `ProgressRoute.tsx` sin tocar. Verificado con `getBoundingClientRect()`: el solapamiento con "Inicio" no cambió (10×15px, igual al baseline) — el ícono se ve más grande dentro del mismo espacio disponible, sin invadir el layout. El original sin recortar se conservó en `src/assets/Hamburguesa3D2.png` por si se necesita reprocesar con otro margen.

**Carrusel de fotos del hero** (`HeroSection.tsx` y `StaffPanel.tsx`): las 3 fotos originales (`gaviota_especial.png`, `camaron_apanado.png`, `papa_ahogada.png`, temática de cevichería) se reemplazaron por 3 fotos reales de QBites (`chicken-tender.png`, `hamburguesa.png`, `sanduche.png`), manteniendo el mismo patrón de rotación que ya existía (`heroCarouselImages`/`carouselImages` + `AnimatePresence`/crossfade por índice). Se pasó primero por un bloque de color sólido como placeholder temporal mientras no había fotos reales; ese placeholder ya no existe, quedó reemplazado por las fotos definitivas.

**Assets huérfanos eliminados:** `ficha-qbites.svg`, `gaviota3d.png` (y `ficha-qbites.png`, que ya se había eliminado previamente).

**Estado actual:** no queda ningún placeholder temporal ni ninguna referencia de imagen a Gaviota Azul (mariscos/ceviche/gaviota) en la app.

---

## 8. Protección contra pérdida del último admin

**Confirmado:** `staff-admin` ya protege contra eliminar o degradar al último admin (`handleDelete` y `handleUpdate` en `supabase/functions/staff-admin/index.ts`), vía conteo de filas `role='admin'` en `user_roles` antes de aplicar el cambio.

**Segundo admin de respaldo creado**, como mitigación operativa adicional (reduce el impacto si el admin principal pierde acceso).

**Riesgo conocido, aceptado sin acción por ahora:** condición de carrera de baja probabilidad — el conteo de admins y el borrado/degradación no son atómicos (dos llamadas separadas a Supabase), por lo que dos solicitudes concurrentes podrían en teoría dejar el sistema sin ningún admin. Dado el volumen de uso esperado del panel, se acepta el riesgo sin remediar por ahora.

---

## 9. `.env` expuesto en el historial heredado de Gaviota Azul

**Problema:** se detectó `.env` versionado en 3 commits del historial heredado de Gaviota Azul (9 y 13 de mayo de 2026) — el repo QBites es un fork con historial conservado, y esos commits venían con él. `.env` tampoco estaba en `.gitignore`, por lo que el riesgo seguía abierto hacia adelante.

**Verificación de impacto:** se confirmó que las variables expuestas en esos commits eran únicamente `PUBLISHABLE_KEY`/`URL` (claves públicas de Supabase, de por sí seguras para exponer del lado del cliente) — sin claves privadas ni `SERVICE_ROLE_KEY`. Riesgo real: ninguno.

**Fix aplicado:**
- Se limpió el historial completo con `git-filter-repo` desde un clon fresco (elimina `.env` de todos los commits, no solo del HEAD).
- Se forzó el push a `origin` en ambas ramas (`dev` y `main`).
- Se agregó `.env` a `.gitignore`.

**Cómo se validó:** verificación independiente tras el cleanup —
- `git log --all --full-history -- .env` → vacío, `.env` ya no aparece en ningún commit.
- Los hashes de los commits viejos que sí lo contenían (`d165645`, `71a6eb6`) ya no existen como objetos válidos en el repo — confirma que el historial fue reescrito, no solo enmascarado.
- `dev` y `main` locales coinciden exactamente con `origin/dev` y `origin/main` — confirma que el force-push se completó y quedó sincronizado.

---

## 11. Actualizaciones en tiempo real no llegaban al cliente (`supabase_realtime` vacía)

**Problema:** al asignar puntos como admin, el cliente no reflejaba el cambio en vivo (sin refrescar) — tampoco se disparaba la animación del ícono de progreso. El frontend ya tenía implementadas las suscripciones (`subscribePointTransactionsRealtime()` en `pointsLedger.service.ts`, `subscribeCustomerPointsRealtime()` en `customerPoints.service.ts`, ambas activadas desde `AuthContext.tsx`), así que el síntoma apuntaba a un problema del lado de la base, no del cliente.

**Causa raíz:** la publicación `supabase_realtime` existe pero estaba **vacía** — verificado con `SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';` (0 filas) y `SELECT pubname, puballtables FROM pg_publication WHERE pubname = 'supabase_realtime';` (`puballtables = false`). Ninguna tabla estaba transmitiendo cambios — las suscripciones del frontend estaban correctamente abiertas pero nunca recibían eventos.

**Fix aplicado:**
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.point_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_points;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_audit_log;
```

**Nota técnica verificada antes de aplicar:** se confirmó que `customer_points` tiene `REPLICA IDENTITY` por defecto con clave primaria `(customer_id, campaign_id)` — exactamente las columnas que el handler de `DELETE` necesita de `payload.old`, así que no hizo falta `REPLICA IDENTITY FULL` adicional.

**Cómo se validó:** confirmado en vivo con dos sesiones simultáneas (dos navegadores/pestañas) — la asignación de puntos desde una sesión de admin se refleja en la otra sesión sin necesidad de refrescar la página.

---

## 12. Módulo de cumpleaños

**Qué se construyó:**
- **Base de datos** (`supabase/Schemabbdd/schema_production.sql`, sección "MÓDULO DE CUMPLEAÑOS"):
  - Tabla `birthday_config` — fila única (singleton vía `id boolean` + `CHECK`), con `is_active`, `reward_description` (texto visible al cliente) y `reward_message` (texto interno solo staff). Trigger `set_birthday_config_audit` completa `updated_at`/`updated_by` automáticamente.
  - Tabla `birthday_grants` — historial de entregas, con `UNIQUE (user_id, birthday_year)` como anti-fraude (una entrega por cliente por año calendario). Sin acceso directo vía API — solo a través de las funciones.
  - Funciones `SECURITY DEFINER`: `get_birthday_status(p_customer_id)` (consultable por el propio cliente o por staff — nunca expone `reward_message`), `grant_birthday_reward(p_customer_id, p_notes)` (solo staff, valida rol, programa activo, mes de cumpleaños y anti-doble-entrega, audita vía `log_admin_action`), y `get_birthday_grants_this_year()` (listado staff-only, agregada a pedido durante la revisión).
  - RLS en ambas tablas + `GRANT`s correspondientes (config: SELECT/UPDATE gateados; grants: sin GRANT a `authenticated`, solo vía funciones).
  - Programa arranca **desactivado** (`is_active = false`) a propósito — un admin debe encenderlo desde la pantalla de configuración.

- **Frontend** (`src/services/birthday.service.ts` + 3 puntos de UI):
  1. Banner en el panel cliente (`BirthdayBanner.tsx`, insertado en `CustomerDashboard.tsx`) — condicionado a `get_birthday_status`.
  2. Tarjeta + botón "Registrar entrega" en Operaciones (`BirthdayRewardCard.tsx`, insertado en `OperationsTab.tsx`).
  3. Extensión de la tarjeta "Cumpleañeros del mes" ya existente en `DashboardTab.tsx` (líneas 645-694 del mapeo original) con badges Entregado/Pendiente por cliente, más un ícono de engranaje que abre `BirthdayConfigDialog.tsx` (pantalla simple de configuración del premio).

**Hallazgo de seguridad detectado y corregido antes de construir el frontend:** la primera versión de la policy RLS de `birthday_config` (`birthday_config_select_all`) permitía `SELECT` a cualquier usuario autenticado, incluyendo clientes — como RLS filtra filas y no columnas, eso exponía `reward_message` (pensado como "solo staff") a cualquier cliente que hiciera un `select` directo a la tabla. Se corrigió a `birthday_config_select_staff` (restringida a `admin`/`cashier`) antes de escribir el `BirthdayBanner` del cliente, que de todas formas nunca necesitó acceso directo a la tabla — usa `get_birthday_status()`, que ya devolvía únicamente `reward_description` de forma segura desde el diseño original. El script final en `schema_production.sql` ya incluye la versión corregida directamente, sin rastro de la policy con el bug.

**Verificado en vivo (sin datos de prueba, ciclo real de config):**
- Diálogo de configuración carga los valores reales desde Supabase (coinciden con el seed).
- Guardado end-to-end confirmado con SQL directo de solo lectura: se cambió `is_active` a `true` y de vuelta a `false` desde la UI, verificando en la base que el trigger completó `updated_at`/`updated_by` correctamente ambas veces.
- Banner y tarjeta de cajero verificados sin errores de consola cuando no es mes de cumpleaños del cliente (caso real disponible para probar).

**Pendiente de confirmar:** el flujo completo de "Registrar entrega" (`grant_birthday_reward`) — incluyendo el caso de usar un `birthdate` temporal en un cliente de prueba para forzar el mes de cumpleaños — **no se ha validado todavía**. Se ofreció hacerlo pero no se recibió confirmación para modificar el `birthdate` de un cliente real, ni hay registro de que se haya hecho por otra vía.

---

## 13. Reorganización de navegación del panel admin (Campañas → Configuración)

**Motivo:** el módulo de cumpleaños (sección 12) ya tenía su propia lógica funcionando, pero el punto de entrada a su configuración (ícono de engranaje en la tarjeta "Cumpleañeros del mes" del Dashboard) quedaba poco descubrible y mezclaba una acción de configuración dentro de una tarjeta pensada como reporte. Se decidió reubicar el control, sin tocar la lógica interna de campañas ni de cumpleaños.

**Qué se cambió:**
- **`src/pages/StaffPanel.tsx`** (línea 282): el `TabsTrigger` de `value="campaigns"` cambió su texto visible de "Campañas" a "Configuración", conservando el ícono `Settings` y el mismo `value` (para no romper el `sessionStorage` que persiste el tab activo).
- **`src/components/staff/CampaignsTab.tsx`**: el contenido existente (Vista A - lista de campañas, y Vista B - formulario de edición) se envolvió en un `<Tabs>` anidado, replicando el mismo patrón ya usado en `ReportsTab.tsx`, con dos `TabsTrigger` simétricos: "Campañas" (ícono `Star`, contenido original sin cambios de lógica) y "Cumpleaños" (ícono `Cake`, nuevo). El sub-tab "Cumpleaños" agrega el componente `BirthdayConfigCard` (líneas 619-670): lee `birthday_config` vía `getBirthdayConfig()` al montar, muestra badge Activo/Inactivo + el `reward_description` vigente, y un botón "Editar configuración" que abre el `BirthdayConfigDialog` ya existente (sin reescribirlo, solo reubicando desde dónde se dispara).
- **`src/components/staff/DashboardTab.tsx`**: se quitó el ícono de engranaje, el estado `showBirthdayConfig` y el render de `BirthdayConfigDialog` de la tarjeta "Cumpleañeros del mes" — esa tarjeta queda como reporte puro (lista de cumpleañeros del mes con badges Entregado/Pendiente), sin ninguna acción de configuración.

**Cómo se validó:**
- Verificación estática: lectura completa de `CampaignsTab.tsx` confirmando balance correcto de `Tabs`/`TabsContent` y `BirthdayConfigCard` correctamente definido y referenciado; `grep` en `DashboardTab.tsx` confirmando cero referencias remanentes a `Settings2`/`BirthdayConfigDialog`/`showBirthdayConfig`.
- Verificación en vivo (navegador, sesión admin real): captura del sub-tab "Campañas" mostrando ambos sub-tabs simétricos (ícono + texto en los dos) y el contenido original de campañas intacto; captura del sub-tab "Cumpleaños" mostrando `BirthdayConfigCard` con estado real cargado desde Supabase (badge y premio vigente reflejando el valor actual de `birthday_config`, no datos de prueba).

**Nota sobre el estado mostrado en la captura:** la verificación en vivo mostró `birthday_config` como **Activo**, con premio "Postre de cortesía en tu mes de cumpleaños 🎂" — distinto del `is_active=false` que se creía vigente al cierre de la sección 12. El usuario confirmó (validación propia, fuera de esta sesión) que ese es el estado correcto actual — no es un bug de `BirthdayConfigCard` ni del backend, el componente simplemente refleja el valor real de la tabla.
