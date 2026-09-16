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

---

## 14. Escalada visual de intensidad temática (motivo póker) y marca de agua del hero

### 14.1 `PokerAmbience` en `ProgressRoute.tsx`

**Qué se construyó:** un sistema de ambientación visual de fondo alrededor de la ruta de puntos, que escala en intensidad según el porcentaje de avance del cliente hacia el último hito de la campaña activa — sin tocar los íconos de hitos (marcador de hamburguesa, gift/lock/check), solo fondo/ambientación.

- `progressRatio = currentPoints / maxPoints` (último hito de la campaña). Tres estados calculados en `ProgressRoute.tsx`:
  - **`inicio`** (`ratio < 0.33`): sin borde, un ♠ casi imperceptible (opacidad 0.05).
  - **`medio`** (`0.33 ≤ ratio ≤ 0.66`): borde superior dorado 2px (`#E8A145`) + dos palos (♠/♣) a opacidad 0.125.
  - **`cerca`** (`ratio > 0.66`): borde superior dorado + inferior rojo (`#D92521`) 3px cada uno, + un palo (♠) grande a opacidad 0.20.
- Componente interno `PokerAmbience({ state })`: capa decorativa `position: absolute; inset: 0; pointer-events-none; z-0`, sin ocupar espacio en el layout. El wrapper exterior (mobile y desktop) lleva `overflow-hidden rounded-lg` para que el borde y el recorte de los palos sigan el radio de la tarjeta contenedora.
- Transición entre estados: cambio de estilo directo en el re-render (sin animación continua ni interpolación), por decisión explícita.
- Mismo componente reutilizado automáticamente en los 3 puntos de uso (`CustomerDashboard.tsx`, `OperationsTab.tsx` vista staff, `CampaignsTab.tsx` preview con `currentPoints=0`) sin código adicional — es el mismo `ProgressRoute`.

**Bugs encontrados y corregidos antes de cerrar (todos en la misma sesión, antes de cualquier commit):**
1. **Borde no seguía el border-radius de la tarjeta** (se cortaba en línea recta antes de la esquina) — causa: el wrapper con el borde no tenía `border-radius` propio. Fix: `rounded-lg` (12px) + `overflow-hidden` en el wrapper exterior.
2. **Palo grande de `cerca` se superponía con el marcador (hamburguesa)** — en desktop el marcador viaja cerca del borde derecho en ese rango de progreso; en mobile vive siempre cerca del borde izquierdo. Fix: se reposicionó el palo grande de `-top-4 -right-4` a `bottom-2 right-2` (posición no-negativa, franja vertical/horizontal libre de íconos en ambos layouts) + `z-0` explícito.
3. **Overflow en mobile** (el palo se cortaba/sobresalía) — mismo fix que el punto 1 (`overflow-hidden` en el wrapper) más el uso de offsets no-negativos, evitando depender solo del recorte para contener un elemento posicionado fuera de su caja.

**Cómo se validó:** verificación mixta (visual + inspección de DOM vía JS) en vivo, con datos reales de clientes de la base — no con datos simulados:
- Opacidades confirmadas leyendo `span.style.opacity` en el DOM: 0.05 / 0.125 / 0.2 según estado.
- Border-radius y overflow confirmados vía `getComputedStyle()`: `border-radius: 12px`, `overflow: hidden` en ambos layouts.
- Capturas en desktop (~700px) y en mobile real (375px) para los 3 estados, usando clientes reales de la base (`Napoleon Chavez` en 14/30 pts para `medio`, un cliente de prueba creado y luego subido a 23/30 pts vía las herramientas de staff para `cerca`).

### 14.2 Trébol dorado como marca de agua en `HeroSection.tsx`

**Qué se construyó:** un `♣` grande (220px), color `#E8A145`, opacidad 0.09, agregado como capa decorativa (`position: absolute`, sin espacio propio en el layout) sobre el fondo oscuro del header del cliente — mismo patrón que `PokerAmbience`, no un ícono con su propio lugar en el flujo. Contenido por el `overflow-hidden` que ya tenía el wrapper del hero.

**Iteración de posición:** el primer intento (esquina inferior derecha) quedó casi completamente oculto detrás de la tarjeta de puntos (frosted-glass con `backdrop-filter: blur(18px)` + fondo blanco al 8% — el blur borra prácticamente cualquier elemento de baja opacidad detrás suyo, igual que ya le pasa al patrón de olas y al triángulo dorado decorativos preexistentes). Se reposicionó arriba (`top: -30px; right: -15px`), zona donde el fondo oscuro del hero queda mayormente visible (logo/saludo, antes de que empiece la tarjeta), confirmado por `getBoundingClientRect()` antes de fijarlo.

**Descartado en el camino:** una primera versión ponía un trébol pequeño y sólido debajo del logo, ocupando su propio espacio en el layout — se revirtió por pedido explícito, no era el patrón buscado.

### 14.3 Investigación del logo: SVG blanco vs. PNG actual

**Hallazgo:** se recibieron dos archivos SVG para comparar contra `logo-qbites.png` (el usado actualmente en `HeroSection.tsx`):
- Un primer archivo (`logo-qbites_White.svg`, 443 bytes) resultó estar **vacío** — el `<g>` no contenía ningún `<path>`, confirmado con el mismo método de detección de canal alfa ya usado para el ícono de progreso (0 píxeles con alpha>10 en todo el lienzo). No se aplicó ningún cambio.
- Un segundo archivo (`logo-qbites-dark.svg`, con geometría real) sí tenía paths válidos, con el color como un único atributo `fill="#000000"` en el `<g>` padre (heredado por todos los `<path>`, ninguno lo sobreescribe) — confirmado editable, sin imagen rasterizada embebida. Se generó `logo-qbites-blanco.svg` cambiando ese atributo a `#FFFFFF`.

**Comparación de bounding box (canal alfa, ambos renderizados a 400×400px):** resultado idéntico pixel a pixel entre el PNG y el SVG — mismo bbox de contenido (x:72–323, y:136–268), mismo `fillRatioArea` (20.9%). El SVG es una réplica vectorial exacta del PNG, no una versión con menos margen interno.

**Decisión:** no se reemplazó el PNG por el SVG — no habría ninguna ganancia de tamaño visual al mismo ancho en px, ya que ambos tienen exactamente el mismo margen interno. Para agrandar el logo de verdad haría falta **recortar su margen interno** (como ya se hizo antes con el ícono de progreso `hamburguesa-3d.png`, sección 10), no cambiar de formato PNG→SVG. `logo-qbites-blanco.svg` queda disponible en `src/assets/` para uso futuro (nitidez en pantallas de alta densidad, recolor programático) si se decide migrar por esa razón.

---

## 15. Cambio de contraseña de cliente completamente roto (localStorage legacy, nunca tocaba Supabase Auth)

### 15.1 Causa raíz original

**Síntoma reportado:** un cliente cambiaba su contraseña (autoservicio o vía staff) y la operación mostraba éxito, pero el login solo funcionaba con la contraseña **anterior** — la nueva nunca era aceptada.

**Causa raíz:** `resetCustomerPassword()` en `src/services/customers.service.ts` (línea 331 antes de eliminarse) nunca llamaba a Supabase — el propio código lo admitía con un comentario sin resolver: `// TODO(Supabase Auth): supabase.auth.updateUser({ password })`. La función solo escribía en `credentials`, una tabla legacy persistida en `localStorage` del navegador (`src/services/credentials.service.ts`, encabezada como "TRANSITIONAL... TODO: delete this file"), completamente desconectada de `auth.users`. El login real, en cambio, sí usa Supabase de verdad: `supabase.auth.signInWithPassword()` en `AuthContext.tsx`. Como el "cambio" nunca llegaba a `auth.users`, el login seguía validando contra la contraseña real (la anterior), sin importar qué se guardara localmente.

Esta misma función legacy tenía **dos llamadores**, es decir, dos escenarios afectados por el mismo bug (ver 15.2).

### 15.2 Los 3 escenarios corregidos

1. **Autoservicio del cliente** (`src/pages/CustomerDashboard.tsx`, `handleChangePassword`) — antes llamaba a `resetCustomerPassword()`; ahora llama a `useAuth().updatePassword()`, que internamente ejecuta `supabase.auth.updateUser({ password })` (`src/contexts/AuthContext.tsx`). Este es el único cambio de contraseña donde el propio usuario cambia su clave — no requiere ni pasa por la Edge Function de staff.

2. **Reseteo desde el panel de staff** (`src/components/staff/OperationsTab.tsx`, diálogo "Gestionar cuenta del cliente" → "Restablecer clave") — antes llamaba a la misma `resetCustomerPassword()` legacy (sin siquiera la validación de "no igual al teléfono" que sí tenía el modal del cliente); ahora invoca la Edge Function `staff-admin` (`action: 'update'`) vía `invokeStaffAdminOp()`, que ejecuta `admin.auth.admin.updateUserById(user_id, { password })` del lado servidor con service role.

3. **Aviso visual "Tu contraseña es igual a tu número de teléfono"** (banner en `CustomerDashboard.tsx` y badge "Clave insegura" en `OperationsTab.tsx`) — dependía de `customerNeedsPasswordChange()`, que comparaba contra la misma tabla `credentials` de `localStorage` (`getCredentialPassword(customer.id) === customer.phone`). Se confirmó que esta comparación podía mostrar el aviso de forma permanente e incorrecta (fila huérfana escrita por el `resetCustomerPassword()` legacy antes de eliminarse, nunca actualizada después) y, en el sentido contrario, podía no mostrarlo nunca para un cliente real recién creado con `password = phone` desde el panel (esa vía nunca escribía en `localStorage`, por ejecutarse server-side). Corregido en 15.4 con un flag real en `profiles`.

**Mensajes de éxito corregidos:** en los tres flujos, el toast de éxito ahora solo se dispara si la llamada real (`supabase.auth.updateUser`, `invokeStaffAdminOp`, o la lectura del flag) no devolvió error — antes se mostraba incondicionalmente en los dos primeros casos.

### 15.3 Hallazgo de seguridad durante el fix: toma de cuenta ajena vía `staff-admin`, y su cierre

Al migrar el escenario 2, se detectó que el despachador de la Edge Function `staff-admin` (`supabase/functions/staff-admin/index.ts`) exigía rol `admin` para **cualquier** `action: 'update'` — el botón "Restablecer clave" del panel, sin embargo, es visible también para `cashier` (a diferencia de "Resetear puntos", que sí está gateado a admin). Se decidió permitir que un `cashier` resetee la clave de un cliente, pero **acotado**:

- El despachador solo relaja la exigencia de `admin` a `admin` **o** `cashier` cuando el body de la request contiene **exclusivamente** `user_id` + `password` (función `isPasswordOnlyUpdate()`) — cualquier campo adicional (`role`, `branch_id`, `display_name`) cae en la rama estricta de admin-only, cerrando la vía de que un cashier escale privilegios de otro staff a través del mismo endpoint.
- **Hallazgo adicional detectado antes de aplicar:** esa restricción de forma del body no impedía que un cashier apuntara el reseteo a **cualquier** `user_id` — incluido otro cashier o un admin (toma de cuenta ajena, no escalada de rol). Cerrado agregando una verificación de destino: dentro de la rama password-only, si el caller **no** es admin (o sea, es cashier), se exige `has_role(target_user_id, 'customer') = true` antes de permitir el reset; si el destino no es un cliente, `403 forbidden_cashier_target_not_customer`. Un admin conserva su capacidad actual sin esta restricción adicional.
- Errores técnicos (`role_check_failed`, típicamente un fallo de RPC) se humanizan a "Ocurrió un error, intenta de nuevo." en `src/services/staff/staffAccount.service.ts` (`ERROR_MESSAGES`) antes de llegar al toast — nunca se expone el código/mensaje crudo de Postgres al cajero.

### 15.4 Flag real `must_change_password` (reemplaza la comparación legacy contra `localStorage`)

**Decisión:** en vez de seguir comparando `getCredentialPassword(customer.id) === customer.phone` contra una tabla de `localStorage` desconectada de la realidad, se agregó una columna real en `profiles`, calculada y mantenida server-side.

**Schema** (`supabase/Schemabbdd/schema_production.sql`, sección "Fecha 16/09/2026"):
```sql
ALTER TABLE public.profiles ADD COLUMN must_change_password boolean DEFAULT false;
```
- `must_change_password` se agregó a la lista de campos **privilegiados** del trigger `profiles_guard_privileged_fields` (junto a `phone`, `is_active`, `branch_id`, etc.) — un cliente no puede tocarlo con un `UPDATE` directo a `profiles`, ni para ponerlo en `true` ni en `false`.
- Para que el cliente pueda limpiar su propio flag tras cambiar su clave real (sin permitirle manipularlo arbitrariamente), se agregó `clear_own_must_change_password()` — función `SECURITY DEFINER`, mismo patrón ya usado por `accept_campaign_terms()` (`set_config('app.profile_internal','1',true)` alrededor del `UPDATE`), con `GRANT EXECUTE` a `authenticated`.

**Quién escribe el flag:**
- `handleCreateCustomer` (Edge Function `staff-admin`) — `must_change_password: true` siempre, porque este flujo crea la cuenta con `password = phone`.
- `handleUpdate` / reseteo de contraseña (misma Edge Function) — tras el `updateUserById` exitoso, compara la nueva contraseña contra `profiles.phone` del destino y fija el flag en consecuencia (`true` si coinciden, `false` si no). No fatal si esta escritura falla — la contraseña ya cambió correctamente.
- `AuthContext.tsx` (`updatePassword()`, autoservicio) — tras `supabase.auth.updateUser()` exitoso, llama `supabase.rpc('clear_own_must_change_password')`.

**Lectura:** `Customer.mustChangePassword` (`src/lib/types.ts`), poblado desde `profiles.must_change_password` en `profileToCustomer()` (`src/services/customers.service.ts`). `CustomerDashboard.tsx` y `OperationsTab.tsx` leen `customer.mustChangePassword` directamente — ya no llaman a `customerNeedsPasswordChange()`.

**Problema de caché detectado y corregido durante la validación en vivo:** `useCustomerSession.ts` (`refresh()` → `resolveCustomer()`) devuelve el customer **cacheado** en memoria si ya existe, sin volver a leer Supabase — así que, tras un cambio de contraseña exitoso, el aviso seguía mostrándose porque la caché local no se enteraba del nuevo valor del flag. Se agregó `patchCachedCustomer()` (`customers.service.ts`, mismo patrón de escritura local que ya usaba `updateCustomerPhone()`) para reflejar el nuevo valor de forma optimista de inmediato en ambos flujos (autoservicio y reseteo desde staff), sin esperar al siguiente `hydrateCustomers()`.

**Nota de tipos:** `must_change_password` se declaró opcional (`boolean | null`) en la interfaz `ProfileRow` interna, porque los tipos generados de Supabase (`supabase gen types`) aún no incluyen esta columna nueva — no se regeneraron como parte de este fix. El valor real sí llega correctamente en runtime (`select('*')`). Mismo patrón de cast (`as never`) ya usado en `birthday.service.ts` se reutilizó para el nombre de la función RPC nueva en la llamada `supabase.rpc(...)`, por la misma razón.

**Cómo se validó (en vivo, por el usuario):** reseteo de contraseña desde el panel admin → login con la clave nueva exitoso → aviso visible correctamente; cambio de contraseña propia dentro de la sesión del cliente → aviso desaparece correctamente. Ambos escenarios confirmados sobre el proyecto Supabase real (`povjovcktiqeooxakhnv`), con SQL ejecutado manualmente por el usuario en el SQL Editor y Edge Function redesplegada (`supabase functions deploy staff-admin`).

**Deuda pendiente, no resuelta en este fix:** `customerNeedsPasswordChange()` y `getCredentialPassword()` (`credentials.service.ts`) quedaron sin llamadores tras esta migración, pero **no se eliminaron** — quedan como código muerto a limpiar en una pasada futura. El archivo `credentials.service.ts` **no** es candidato a eliminación total: `verifyCredential` ya estaba muerta desde antes (usada solo por `loginCustomer`/`loginCustomerDetailed`, sin llamadores), pero `updateCredentialIdentifier` (usada por `updateCustomerPhone()` y la revocación de consentimiento LOPDP) y `setCredential` (usada por el seed de datos demo en `bootstrap.ts`) siguen genuinamente en uso.

---

## 16. Sesión consolidada: fix de contraseñas + integridad visual del marcador de progreso

### Bloque 1 — Fix de contraseñas (resumen consolidado; ver sección 15 para el detalle línea por línea, SQL exacto y capturas)

**Causa raíz:** `resetCustomerPassword()` (`src/services/customers.service.ts`) nunca llamaba a Supabase Auth — el propio código traía un `// TODO(Supabase Auth): supabase.auth.updateUser({ password })` sin resolver. Solo escribía en `credentials`, una tabla legacy persistida en `localStorage` del navegador, completamente desconectada de `auth.users`. El login real (`supabase.auth.signInWithPassword()`) sí valida contra Supabase de verdad, así que el cambio de contraseña "exitoso" nunca se reflejaba ahí. **Este mismo bug ya se había reportado por escrito para Gaviota Azul** — no es una regresión nueva de QBites, es un defecto heredado del proyecto base que nunca se corrigió durante el fork.

**Los 3 escenarios corregidos:**
1. **Autoservicio del cliente** (`CustomerDashboard.tsx`) — migrado a `useAuth().updatePassword()`, que ejecuta `supabase.auth.updateUser({ password })` de verdad.
2. **Reseteo desde el panel de staff** (`OperationsTab.tsx`, diálogo "Gestionar cuenta del cliente") — migrado a la Edge Function `staff-admin` (`action: 'update'`) vía `invokeStaffAdminOp()`, que ejecuta `admin.auth.admin.updateUserById()` con service role del lado servidor.
3. **Aviso visual** ("Tu contraseña es igual a tu número de teléfono" / badge "Clave insegura") — dejó de depender de `customerNeedsPasswordChange()` (comparación contra la tabla legacy de `localStorage`, que podía mentir en ambos sentidos) y pasó a leer el flag real `profiles.must_change_password`.

**Hallazgo de seguridad detectado durante la migración, y su cierre:** al permitir que un `cashier` (no solo `admin`) resetee la clave de un cliente desde el panel, se abrió una vía potencial de toma de cuenta ajena — un cashier podía apuntar el reseteo a `user_id` de otro staff (incluido un admin), no solo de un cliente. Se cerró en el despachador de la Edge Function: dentro de la rama "password-only update" (body con **exclusivamente** `user_id` + `password`, sin `role`/`branch_id`/`display_name` — eso evita escalar privilegios vía el mismo endpoint), si el caller **no** es admin (es cashier), se exige adicionalmente `has_role(target_user_id, 'customer') = true` antes de permitir el reset. Un admin conserva su capacidad actual sin esta restricción extra.

**Flag real `must_change_password`, con blindaje:** se agregó la columna a `profiles` (`schema_production.sql`), se incluyó en la lista de campos **privilegiados** del trigger `profiles_guard_privileged_fields` (un cliente no puede tocarlo con un `UPDATE` directo, ni a `true` ni a `false`), y se agregó la función `SECURITY DEFINER` `clear_own_must_change_password()` (mismo patrón que `accept_campaign_terms()`) para que el propio cliente pueda limpiar su flag tras un cambio de clave legítimo, sin poder manipularlo arbitrariamente. Verificado en vivo por el usuario: reseteo desde admin → login con clave nueva → aviso correcto; cambio propio → aviso desaparece.

### Bloque 2 — Integridad visual del marcador de progreso (`ProgressRoute.tsx`)

No son 3 bugs sueltos — es una sola cadena de hallazgos relacionados, cada uno descubierto investigando el anterior.

**(a) Contraste WCAG.** En `StatsGrid.tsx`, el color de las etiquetas (`#8a96a6`, 9-10px) daba 2.61:1–3.00:1 contra los fondos reales de la app — muy por debajo del mínimo de 4.5:1. Se reemplazó por el token ya existente `text-muted-foreground` (`hsl(var(--muted-foreground))` = `#576C75`, definido en `index.css`), dando 4.79–5.52:1. El valor numérico de la card "Puntos actuales" también fallaba (2.18:1, dorado sobre casi-blanco cuando `getBranchAccent()` no resolvía ningún acento) — se fijó a `#0B181E` siempre, sin condicional por accento. El mismo patrón (`borderStrong`/`color` del acento "Express" usado directo como texto, sobre fondos `bg`/`bgStrong` que fallan contraste) apareció repetido en `OperationsTab.tsx` (líneas ~102/319/333/346), `CampaignSwitcher.tsx` (líneas ~55/58/61/62) y `CampaignsTab.tsx` (línea ~156) — los 4 sitios se corrigieron igual, forzando `#0B181E`. Todo verificado en vivo con `getComputedStyle()` contra el DOM real, incluyendo una campaña de prueba temporal (`branch` apuntando a un registro temporal en `branches` con "Express" en el nombre, status `draft`) creada y borrada sin dejar rastro, para forzar esa rama de código sin tocar la sucursal real ("QBites - Matriz", la única que existe hoy).

**(b) Solape del marcador con "Inicio" en 0 puntos.** Con un cliente en 0 puntos (`Axel`, caso real), el marcador (imagen de hamburguesa) se dibujaba encima del ícono de bandera de "Inicio", tanto en mobile como en desktop — confirmado con `getBoundingClientRect()` (`overlaps: true` en ambos layouts). Primer fix: un offset aplicado solo cuando `currentPoints <= 0` exactamente (`MOBILE_MARKER_START_OFFSET` / `DESKTOP_MARKER_START_OFFSET`).

**(c) El hallazgo más importante: `left: -10px` histórico, y quién lo rompió de verdad.** Investigando un fragmento rojo/negro sin identificar junto a "12 pts — El Trío" (cliente real a 16 pts), se rastreó con `getBoundingClientRect()` hasta el marcador mobile: `left: -10px` — un valor **hardcodeado desde el primer commit** de este componente (confirmado con `git log --follow -p`), nunca calculado por fórmula en el código. Reconstruido a mano: `-10 = trackLeft(15) + trackWidth(3) − markerWidth(28)`, es decir, el marcador siempre se calibró para que su borde derecho coincidiera exactamente con el borde derecho de la línea del track — un ajuste visual a ojo, no geométrico puro. Ese `-10` **nunca fue un error** y fue inofensivo durante toda la vida del componente porque el wrapper mobile jamás tuvo `overflow-hidden` ni padding horizontal — cualquier desborde se pintaba fuera de la caja sin consecuencia. Cuando la sección 14.1 de esta bitácora agregó `overflow-hidden` (para resolver el desborde del ♠ decorativo en el estado "cerca de la meta"), ese cambio, hecho para un problema totalmente distinto, empezó a recortar sin que nadie lo notara un desborde que existía desde el día uno. Corregido agregando `pl-3` (12px) al wrapper — 2px de margen real sobre los 10px necesarios, movimiento uniforme de toda la ruta, sin casos especiales.

**(d) Refinamiento final: de condición fija a distancia geométrica real.** El fix de (b) usaba `currentPoints === 0` como condición — funcionaba para 0 puntos pero no para 1 punto (`Alejandro Fuertes`, caso real: `overlaps: true` seguía dándose). Se reemplazó por un cálculo de distancia real: `gap = (gaviotaTop − MARKER_Y_SHIFT) − INICIO_NODE_BOTTOM`, empujando el marcador solo lo necesario para mantener un margen mínimo (4px) cuando `gap < 4`, sin tocar nada cuando el recorrido natural ya deja ese margen. Verificado que la transición ocurre entre 3 y 4 puntos (2-3 pts no existen como cliente real hoy, verificado por SQL — se confirmó por fórmula pura y reproducción estática con la misma lógica ya validada contra el DOM real). Reproducidos los 5 escenarios ya cerrados (Axel 0pts, Alejandro 1pt, User 2 11pts, Napoleon Chavez 16pts, Prueba ProgressRoute 23pts) sin ninguna regresión — los 3 con más de 3 puntos dieron `markerStyleTop` byte-idéntico a antes del cambio.

**Lección explícita:** un fix corregido para un caso puede alterar silenciosamente el comportamiento de otro código que dependía de las condiciones anteriores — el `overflow-hidden` de (c) es el ejemplo de libro: se agregó correctamente para resolver (a) el desborde del ♠ en "cerca de la meta", pero nadie revisó si algo más dentro de ese mismo contenedor dependía de que no hubiera clipping. Vale la pena, al tocar un componente compartido, revisar rápidamente si algo más se apoya en el estado que se está cambiando — no solo verificar que el caso que se está arreglando quede bien.

---

## 17. Riesgo conocido: sembrar `branches` es un bloqueante duro, no un paso opcional — y `resolveBranchId()` puede crear duplicados silenciosos

**Contexto:** al eliminar el `INSERT INTO public.branches` de la sección 11 de `schema_production.sql` (reemplazado por un comentario que documenta la siembra de sucursales como paso manual del checklist de onboarding), se investigó el `<Select>` de sucursal en `CampaignsTab.tsx` para confirmar que el cambio era seguro.

**Hallazgo 1 — bloqueante duro, no opcional:** el `<Select>` de sucursal (`CampaignsTab.tsx:332-341`) es **cerrado** — mapea directamente sobre `getBranches()` sin ningún input de texto libre ni botón "Agregar sucursal" en ningún lugar del archivo (confirmado por grep completo). Si `branches` está vacía, el `<SelectContent>` renderiza cero opciones — solo el placeholder. Y como `useCampaignEditor.ts:88` exige `editingCampaign.branch` no vacío antes de guardar (`'El nombre de la sucursal es obligatorio'`), **no hay ningún camino desde este panel para crear la primera campaña si `branches` está vacía** — sembrar al menos una fila deja de ser "housekeeping posterior" y pasa a ser un requisito de arranque bloqueante para cualquier proyecto nuevo clonado de este schema.

**Hallazgo 2 — `resolveBranchId()` sigue activa, no huérfana, con un caso de borde real:** trazado línea por línea: `CampaignsTab.tsx:603` (botón "Guardar Campaña") → `saveCampaignChanges()` (`useCampaignEditor.ts:97`) → `saveCampaign()` (`campaigns.service.ts:257,261`) → `saveCampaignAsync()` → `resolveBranchId()` (`campaigns.service.ts:170`) — se ejecuta en **cada** guardado de campaña, no es código muerto. Su rama de auto-creación (líneas 101-105: si el nombre no coincide con ninguna fila existente, genera un `crypto.randomUUID()` y llama `saveBranchAsync()`) es casi inalcanzable por el `<Select>` cerrado — con una excepción real: `useCampaignEditor.ts:121` precarga `branch: campaign.branch || campaign.name` al editar una campaña. Si una campaña legacy tiene `branch` vacío/null, el Select se precarga con el **nombre de la campaña**, no con un nombre de sucursal real. Si el staff guarda sin corregir manualmente el Select, `resolveBranchId()` no encuentra coincidencia y **crea una sucursal nueva silenciosamente** con ese nombre — sin ningún aviso ni confirmación.

**Mismo patrón que el riesgo ya documentado en la sección 7** ("Divergencias conocidas... heredadas de Gaviota Azul": *"`resolveBranchId()` (match por nombre contra `branches`, con riesgo de duplicado si el texto no coincide exactamente)"*) — no es un hallazgo nuevo aislado, es la confirmación concreta, con la ruta de código exacta y el caso de borde específico, de un riesgo que ya se sabía que existía en abstracto desde el fork de Gaviota Azul.

**Estado:** documentado, no corregido. Ninguna de las dos partes de este hallazgo se resolvió en código — quedan como riesgos conocidos para una futura pasada (opciones a evaluar: agregar un flujo de creación de sucursal en el propio `<Select>`/panel admin; o hacer que `resolveBranchId()` falle explícitamente en vez de auto-crear cuando no hay coincidencia exacta).

---

## 18. `brand_config` — deriva de schema y GRANTs excesivos (corregidos), y estado real de la funcionalidad (pendiente)

### (a) Hallazgo técnico de hoy — mismo patrón de deriva que `must_change_password`, ya corregido

**Problema 1 — nunca se agregó al schema:** la tabla `public.brand_config` existe en producción (confirmado vía MCP: `rls_enabled: true`, 1 fila) pero `grep -rn "brand_config" supabase/Schemabbdd/schema_production.sql` daba **0 resultados** — exactamente el mismo tipo de deriva ya documentado para `must_change_password` (sección 15.4): algo se creó/modificó directo en la base real sin que el archivo de schema, que se supone es la fuente de verdad, se actualizara.

**Problema 2 — GRANTs excesivos por creación vía Table Editor:** al verificar los privilegios reales con `aclexplode(relacl)` (no `information_schema.role_table_grants`, que sabemos que muestra vacío por visibilidad de rol — sección 2.1), se encontró que `anon` y `authenticated` tenían **INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN** — CRUD completo, no solo lectura/escritura acotada. Consistente con haberse creado la tabla desde el Table Editor de Supabase (que otorga esos privilegios por defecto) en vez de con un script de `GRANT` explícito como el resto de este schema. Las RLS policies (`brand_config_select_all` público, `brand_config_update_admin` solo `has_role(...,'admin')`) sí protegían correctamente en la práctica — nadie sin rol admin podía escribir de verdad — pero era defensa en profundidad rota.

**Corrección aplicada:** `CREATE TABLE` + RLS + policies agregadas a `schema_production.sql` (sección fechada 16/09/2026, ver ese archivo) documentando cómo debe crearse esta tabla desde cero en cualquier proyecto nuevo. Sobre producción (`povjovcktiqeooxakhnv`), donde la tabla ya existía, se aplicó `REVOKE ALL ... FROM anon, authenticated` seguido de los `GRANT` acotados (`SELECT` a `anon, authenticated`, `UPDATE` a `authenticated`) — confirmado antes de aplicar, con `grep -rn "brand_config"` sobre `src/` y `supabase/` completos (cero resultados en ambos), que ningún código del frontend ni de las Edge Functions usa esta tabla hoy, así que el `REVOKE` no afecta nada visible.

### (b) `brand_config` — propósito y estado real (pendiente de completar)

**Qué es:** una tabla de configuración de marca de fila única (`id` fijo en `1`) — nombre de negocio, nombre del programa de fidelidad, URL de logo, color primario y color de acento. Pensada para que un admin pueda cambiar estos valores desde un panel, sin tocar código ni redesplegar.

**Por qué se creó:** decisión tomada durante el rebranding de Gaviota Azul → QBites, cuando se evaluó tener un panel de colores editable en vez de repetir el proceso manual de rebranding (buscar y reemplazar hex/tokens en el código) cada vez que el negocio cambiara de identidad visual o que este mismo schema se reutilizara para un cliente distinto.

**Qué falta para que cumpla su propósito — ninguna de las dos piezas existe hoy:**
1. Un `BrandConfigProvider` (o equivalente) en el frontend que lea `brand_config` al cargar la app y aplique `business_name`/`program_name`/`logo_url`/`color_primary`/`color_accent` como variables CSS (o equivalente) en runtime.
2. Una pantalla de admin ("Configuración → Marca") que permita editar esos valores — reutilizando el patrón ya usado en `BirthdayConfigDialog`/`BirthdayConfigCard` (sección 12) como referencia de cómo se construyó un panel de configuración de fila única similar.

**Estado actual real:** los colores y nombres de QBites siguen **hardcodeados directamente en el código** — tokens de Tailwind (`tailwind.config.ts`), variables CSS (`index.css`), y hex sueltos repetidos en aproximadamente 20 archivos de componentes (`#0B181E`, `#E8A145`, `#D92521`, etc., ya inventariados en distintas secciones de esta bitácora). `brand_config` es la pieza de base ya lista en la base de datos — schema, RLS, GRANTs correctos — para cuando se decida completar esta funcionalidad, en este proyecto o en cualquier otro que reutilice este mismo schema. Hasta entonces, la tabla existe pero no tiene ningún efecto visible en la app.

---

## 19. Creación del proyecto de producción limpio (`gygbnxyylzdxfcediuad`) — proceso reportado por el usuario, no verificado por el asistente

> **Nota de procedencia:** a diferencia del resto de esta bitácora, esta entrada **no fue verificada con acceso directo** al proyecto — el MCP de Supabase de esta sesión está conectado únicamente a `povjovcktiqeooxakhnv` (confirmado con `get_project_url()` en el momento de escribir esto), sin ninguna vía de consulta a `gygbnxyylzdxfcediuad`. Todo lo que sigue es el reporte del usuario sobre un proceso que ejecutó él mismo fuera de esta sesión, transcrito tal como lo describió. Se documenta igual porque el proceso en sí — y los 3 hallazgos que produjo — es información valiosa y repetible para cualquier futuro proyecto que reutilice este schema, independientemente de que el asistente no haya podido confirmarlo con SQL en vivo esta vez.

**(1) Aplicación de `schema_production.sql` completo desde cero — reportado sin errores.** Corrida completa del script sobre el proyecto nuevo (`gygbnxyylzdxfcediuad`), sin intervención del asistente.

**(2) Hallazgo — datos hardcodeados de Gaviota Azul en la siembra de `branches`:** el script, antes de esta sesión, traía un `INSERT INTO public.branches` con nombres literales `'Gaviota Azul - Express'` / `'Gaviota Azul - Matriz'` (sección 11 del schema) — residuo del proyecto base del fork, nunca actualizado a los datos reales de ningún negocio que use este schema después. **Corregido** (sección 17/18 de esta bitácora y el propio `schema_production.sql`): el `INSERT` se eliminó por completo del script y se reemplazó por un comentario que documenta que sembrar la(s) sucursal(es) real(es) es un **paso manual del checklist de onboarding**, no parte del schema — cada proyecto nuevo decide su propio nombre de sucursal(es) al momento de darse de alta, sin depender de datos de ejemplo hardcodeados heredados de Gaviota Azul.

**(3) Hallazgo — `brand_config` nunca había sido parte del schema:** confirmado independientemente en esta sesión (sección 18) que la tabla existía en `povjovcktiqeooxakhnv` pero nunca se había agregado a `schema_production.sql`. Para el proyecto nuevo, se agregó **esta vez con los `GRANT` correctos desde el nacimiento** (`SELECT` a `anon`/`authenticated`, `UPDATE` solo a `authenticated`, con `REVOKE ALL` previo) — a diferencia del proyecto original, donde la tabla había quedado con permisos excesivos (`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` para `anon` y `authenticated`) por haberse creado en algún momento vía el Table Editor de Supabase sin especificar privilegios. El proyecto nuevo nace sin ese defecto.

**(4) Creación del primer admin — mismo patrón de bug ya conocido (sección 3):** al crear el primer usuario admin manualmente (vía Supabase Auth dashboard, sin pasar por el flujo normal de registro de la app), se repitieron los dos síntomas ya documentados en la sección 3 de esta bitácora para el proyecto original:
- El perfil (`profiles`) quedó creado **sin datos** (sin `display_name`/email real) — porque `handle_new_user()` depende de metadata que solo llega cuando el registro pasa por el flujo normal de signup de la app, no cuando se crea el usuario a mano desde el dashboard. Completado manualmente.
- El trigger `handle_new_user()` le asignó **`role = 'customer'` por defecto** en vez de `admin` — mismo comportamiento exacto ya visto y corregido antes. Corregido a mano (eliminar la fila `customer` de `user_roles` e insertar `admin`, mismo procedimiento que en la sección 3).

**Por qué se documenta igual, sin verificación directa:** el valor de esta entrada no es "confirmar que un servidor específico quedó bien" — es dejar registrado que **este es un proceso manual, repetible, y ya conocido de punta a punta** para poner en marcha un proyecto nuevo desde este mismo schema: aplicar el script, sembrar sucursales a mano (paso 17/18), verificar `brand_config` (paso 18), y esperar — no como sorpresa, sino como parte del checklist — que el primer admin creado manualmente necesite dos correcciones a mano (perfil y rol). Cualquier persona que repita este proceso en un futuro proyecto debería anticipar estos 3 pasos manuales en vez de descubrirlos de cero.
