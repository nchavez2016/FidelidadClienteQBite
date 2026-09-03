<<<<<<< HEAD
# Sistema de Fidelización de Clientes — QBites
=======
# Sistema de Fidelización de Clientes
>>>>>>> 0992513eba694ec3c590b75fe88c2ec844393be7

Plataforma web de fidelización de clientes desarrollada para **All In Burgers by Qbites** (Quito, Ecuador), con arquitectura pensada para ser adaptable (white-label) a otros negocios de consumo (retail, restaurantes, etc.) — de hecho, este mismo código nació para otro negocio (una cevichería) y se adaptó a QBites sin cambios estructurales, como prueba de ese diseño.

## Tabla de contenidos

- [Propósito de negocio](#propósito-de-negocio)
- [Estructura de carpetas](#estructura-de-carpetas)
- [Tecnologías usadas](#tecnologías-usadas)
- [Arquitectura](#arquitectura)
  - [Frontend](#arquitectura-frontend)
  - [Backend](#arquitectura-backend)
- [Puesta en marcha del entorno](#puesta-en-marcha-del-entorno)
  - [1. Requisitos previos](#1-requisitos-previos)
  - [2. Clonar e instalar dependencias](#2-clonar-e-instalar-dependencias)
  - [3. Variables de entorno](#3-variables-de-entorno)
  - [4. Base de datos (Supabase)](#4-base-de-datos-supabase)
  - [5. Levantar el frontend](#5-levantar-el-frontend)
  - [6. Edge Functions](#6-edge-functions)
  - [7. Tests](#7-tests)
- [Despliegue](#despliegue)

---

## Propósito de negocio

El objetivo del sistema es **incrementar la recurrencia y retención de clientes** de un negocio físico (cevichería, restaurante, comercio) mediante un programa de puntos operado desde caja:

- El cliente se registra con su número de teléfono (sin fricción, sin correo obligatorio) y acepta los términos de la campaña vigente.
- Por cada visita/orden, el cajero acredita puntos al cliente desde el panel de caja (**Panel de Operaciones**).
- El cliente consulta su saldo, el historial de transacciones y el avance hacia los premios (**hitos**) desde su propio panel, con actualización en tiempo real.
- Cuando el cliente reúne los puntos suficientes, solicita el canje; el cajero lo aprueba en caja y el sistema descuenta los puntos automáticamente.
- El administrador del negocio configura campañas (hitos, reglas de bono por días/horas), gestiona sucursales y usuarios de caja, y consulta métricas de uso (clientes activos, puntos emitidos, canjes, horas pico) desde un dashboard.

Todo el registro de puntos es un **ledger append-only** (`point_transactions`): nunca se sobrescriben ni se borran movimientos, solo se agregan (incluidas las reversiones), lo cual garantiza trazabilidad y auditoría completa de cada punto otorgado o canjeado.

El sistema fue diseñado desde el inicio con la idea de **reutilizarse para otros negocios** (arquitectura multi-sucursal, multi-campaña, roles admin/cajero/cliente desacoplados de la marca), aunque hoy corre en modo single-tenant por cliente (un proyecto Supabase + un despliegue Vercel por negocio).

---

## Estructura de carpetas

```
Qbite/
├── docs/                          # Documentación funcional y de negocio (smoke tests, resumen de arquitectura)
├── public/                        # Assets estáticos servidos tal cual (favicon, robots.txt, etc.)
├── src/
│   ├── assets/                    # Imágenes usadas por la UI (logo, fotos de producto)
│   ├── components/
│   │   ├── auth/                  # Guards de ruta (ProtectedRoute)
│   │   ├── customer/               # Componentes del panel del cliente (hero, stats, premios, términos, BirthdayBanner)
│   │   ├── staff/                  # Componentes del panel de caja/admin (operaciones, "Configuración" con sub-tabs Campañas/Cumpleaños, reportes, usuarios, BirthdayConfigDialog, BirthdayRewardCard)
│   │   ├── security/                # Componentes de seguridad de sesión (aviso de inactividad)
│   │   └── ui/                      # Design system (shadcn/ui) — componentes primitivos reutilizables
│   ├── contexts/                  # AuthContext: sesión, rol activo, hidratación post-login
│   ├── hooks/                     # Hooks de dominio (useAuth, useStaffAuth, useCustomerSession, useIdleTimeout, ...)
│   ├── integrations/
│   │   └── supabase/               # Cliente Supabase tipado, tipos generados de la BD, middleware de auth
│   ├── lib/                        # Utilidades transversales (formatters, csv, logger, navigation, invokeStaffAdmin)
│   ├── pages/                      # Páginas/rutas de la app (Index, CustomerLogin/Dashboard, StaffLogin/Panel, NotFound)
│   ├── services/                   # Capa de acceso a datos y reglas de negocio (ver Arquitectura backend), incluye birthday.service.ts
│   │   ├── drivers/                 # Implementaciones intercambiables de persistencia (LocalStorage, Supabase)
│   │   ├── analytics/               # Cálculo de KPIs y métricas para el dashboard
│   │   ├── auth/                    # Puente de autenticación (legacy bridge, tipos)
│   │   ├── rules/                   # Reglas de negocio sobre transacciones (bonos, cooldown)
│   │   ├── security/                 # Auditoría admin, MFA, política de sesión
│   │   ├── storage/                  # Claves y adaptador de almacenamiento local
│   │   ├── validation/               # Esquemas de validación (zod)
│   │   └── mocks/                    # Datos semilla para desarrollo/testing
│   └── test/                        # Setup y ejemplos de pruebas unitarias (Vitest)
├── supabase/
│   ├── config.toml                 # Configuración del proyecto Supabase (ref, edge functions)
│   ├── functions/staff-admin/      # Única Edge Function: operaciones privilegiadas de staff (Deno)
│   ├── migrations/                  # Historial de migraciones SQL (schema, RLS, RPCs, triggers, cron jobs)
│   └── types.ts                     # Tipos TypeScript generados desde el schema de la BD
├── index.html                      # Entry point de Vite
├── vite.config.ts                  # Configuración de build/dev server
├── vercel.json                     # Rewrites SPA para despliegue en Vercel
└── package.json
```

---

## Tecnologías usadas

| Capa | Tecnología |
|---|---|
| Lenguaje | TypeScript |
| Frontend | React 18 + Vite 5 |
| UI / Design system | shadcn/ui (Radix UI) + Tailwind CSS |
| Enrutamiento | React Router v6 |
| Data fetching / cache | TanStack React Query v5 |
| Formularios y validación | React Hook Form + Zod |
| Gráficos | Recharts |
| Backend / BaaS | Supabase (PostgreSQL + Auth + Realtime + Edge Functions en Deno) |
| Cliente de base de datos | `@supabase/supabase-js` v2 |
| Testing unitario | Vitest + Testing Library |
| Testing E2E | Playwright |
| Linting | ESLint + typescript-eslint |
| Gestor de paquetes | npm (o Bun, hay `bun.lockb`) |
| Hosting frontend | Vercel |
| IDE/Builder original | Lovable |

---

## Arquitectura

### Arquitectura Frontend

- **SPA en React + Vite**, enrutada con `react-router-dom`. Las rutas principales (`src/App.tsx`) son públicas (`/`, `/cliente/login`, `/cliente/registro`, `/staff/login`) y protegidas (`/cliente/dashboard`, `/staff/panel`) mediante `ProtectedRoute`, que valida el rol activo (`customer`, `cashier`, `admin`) contra el `AuthContext`.
- Las páginas del panel (`CustomerDashboard`, `StaffPanel`) se cargan con `React.lazy` para mantener el bundle inicial liviano; `Index` (landing) se importa de forma estática.
- **`AuthContext`** (`src/contexts/AuthContext.tsx`) centraliza la sesión de Supabase Auth, el rol activo y la hidratación de datos post-login (perfil, roles, sucursal). Expone `isHydrating` para mostrar *skeletons* mientras se recargan los datos tras un refresh de página.
- **Capa de servicios** (`src/services/*.service.ts`) encapsula toda la lógica de negocio y acceso a datos, y es lo único que los componentes de UI consumen — nunca llaman a Supabase directamente. Esto permite:
  - Que las **reglas de negocio** (cooldown de acumulación, cálculo de bonos, validaciones) vivan en un solo lugar (`src/services/rules/`).
  - Un **adaptador de persistencia** (`src/services/dbAdapter.ts` + `src/services/drivers/`) con un driver actualmente basado en Supabase (`SupabaseDriver`) y otro en memoria/`localStorage` (`LocalStorageDriver`) usado en tests y prototipado, ambos implementando la misma interfaz `DbDriver`.
- **Realtime**: `pointsLedger.service.ts` se suscribe a los canales de Supabase Realtime sobre `point_transactions` y `customer_points` para reflejar puntos nuevos en el panel del cliente sin recargar la página, con reconexión y backoff exponencial ante cortes de red.
- **UI**: componentes primitivos de `src/components/ui` (shadcn/ui sobre Radix) + Tailwind CSS para estilos utilitarios; componentes de dominio organizados por audiencia (`customer/`, `staff/`, `auth/`, `security/`).
- **Ambientación decorativa reutilizable**: `ProgressRoute.tsx` implementa un patrón de capas de fondo (`PokerAmbience`) que escala en intensidad visual según el porcentaje de avance del cliente — sin ocupar espacio en el layout ni interferir con la iconografía funcional. El mismo patrón (elemento grande, opacidad baja, posicionado como fondo) se reutiliza en `HeroSection.tsx` como marca de agua del hero del cliente. Detalle completo en `docs/qbites_bitacora_setup.md`.

### Arquitectura Backend

El backend es **Supabase como BaaS** (Backend as a Service): no hay un servidor Node/Express propio, la lógica de negocio sensible vive en la base de datos y en una única Edge Function.

- **PostgreSQL** con esquema completo en `supabase/Schemabbdd/schema_production.sql` (tablas, enums, índices, RLS). Tablas clave: `branches`, `profiles`, `user_roles`, `campaigns`, `customer_points`, `point_transactions` (ledger append-only), `point_transactions_archive`, `redemption_requests`, `redemption_request_events`, `admin_audit_log`, `birthday_config`, `birthday_grants`.
- **Reglas de negocio críticas viven en funciones RPC `SECURITY DEFINER`** (no en el cliente), por ejemplo `earn_points`, `redeem_reward`, `reverse_transaction`, `adjust_points`, `approve_redemption_request`, `accept_campaign_terms`, `get_birthday_status`, `grant_birthday_reward`, `get_birthday_grants_this_year`. Esto evita que un cliente comprometido pueda manipular puntos directamente vía REST.
- **Row Level Security (RLS)** en todas las tablas: el cliente solo lee/escribe sus propios datos; el staff tiene acceso acotado a su sucursal; el admin tiene acceso total. Los roles se resuelven con la función `has_role(user_id, role)`.
- **Trigger anti-mutación** sobre `point_transactions`: impide `UPDATE`/`DELETE` directos sobre el ledger (excepto en operaciones internas de mantenimiento vía `set_config('app.pt_internal', '1', true)`), forzando que toda corrección se haga como una nueva transacción de tipo `reversal`.
- **Jobs `pg_cron`** para mantenimiento periódico: purga de logs de auditoría y eventos de canje (retención 6 meses), archivado de transacciones con más de 12 meses, purga de archivo para clientes inactivos 18+ meses.
- **Auth**: Supabase Auth con un patrón de "email interno" ya que no se piden correos reales — `<telefono>@phone.<negocio>.local` para clientes y `<usuario>@staff.<negocio>.local` para staff (requiere tener **desactivada** la confirmación de email en el proyecto Supabase).
- **Edge Function `staff-admin`** (`supabase/functions/staff-admin/index.ts`, Deno): único endpoint privilegiado del sistema. Verifica el JWT del caller y exige rol `admin` (salvo `create_customer`, disponible también para `cashier`). Soporta las acciones `create`, `update`, `set_active`, `delete`, `list` (gestión de usuarios de staff) y `create_customer` (alta de cliente desde caja). Usa la Service Role Key solo dentro del propio worker, nunca expuesta al frontend. El wrapper `src/lib/invokeStaffAdmin.ts` maneja la expiración de token (401 → `refreshSession()` → reintento; si falla, `signOut()`).
- **Realtime** de Supabase publicado sobre `point_transactions`, `customer_points` y `admin_audit_log` para sincronización en vivo con el frontend.

---

## Puesta en marcha del entorno

### 1. Requisitos previos

- [Node.js](https://nodejs.org/) 18 o superior (o [Bun](https://bun.sh/), el repo incluye `bun.lockb`)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (para desarrollo local de la base de datos y despliegue de Edge Functions)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (requerido por `supabase start` para levantar Postgres localmente)
- Una cuenta de [Supabase](https://supabase.com/) (para usar un proyecto en la nube en vez de/además del entorno local)
- Git

### 2. Clonar e instalar dependencias

```bash
git clone <url-del-repositorio>
cd Qbite
npm install
```

(o `bun install` si prefieres Bun)

### 3. Variables de entorno

Crea un archivo `.env` en la raíz del proyecto (o edita el existente) con las credenciales del proyecto Supabase a usar:

```bash
VITE_SUPABASE_URL="https://<tu-proyecto>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon-public-key>"
VITE_SUPABASE_PROJECT_ID="<project-ref>"

# Usadas por el server-side client (SSR) / tooling
SUPABASE_URL="https://<tu-proyecto>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<anon-public-key>"
```

> ⚠️ Estas claves son la **anon/public key**, segura para exponer en el frontend porque el acceso real está controlado por RLS. Nunca coloques la `service_role key` en variables `VITE_*` ni en el frontend.

### 4. Base de datos (Supabase)

Tienes dos caminos: usar un proyecto Supabase en la nube, o levantar Supabase localmente con Docker.

#### Opción A — Proyecto Supabase en la nube

1. Crea un proyecto nuevo en [supabase.com](https://supabase.com/).
2. En **Authentication → Sign In / Providers**, **desactiva "Confirm email"** (imprescindible: el sistema usa dominios de correo internos ficticios y falla si esta opción está activa).
3. Aplica el esquema ejecutando **`supabase/Schemabbdd/schema_production.sql`** completo en el **SQL Editor** de Supabase — es la **fuente de verdad** del schema: incluye tablas, RLS, GRANTs, el trigger `on_auth_user_created`, las publicaciones de Realtime y el módulo de cumpleaños (`birthday_config`, `birthday_grants`).

   > ⚠️ `supabase/migrations/` es **historial de referencia** (el registro incremental de cómo se llegó hasta acá), no la fuente de verdad para levantar un entorno nuevo — está incompleto respecto a `schema_production.sql` (le faltan, entre otras cosas, los GRANTs corregidos, el trigger `on_auth_user_created` y el módulo de cumpleaños completo). No lo uses para un setup desde cero.
4. Verifica en **Database → Publications** que `point_transactions`, `customer_points` y `admin_audit_log` queden agregadas a `supabase_realtime`, y que las funciones RPC tengan `GRANT EXECUTE ... TO authenticated` — el script del paso 3 ya lo hace; este paso es solo para confirmarlo.
5. Copia la **URL** y la **anon key** del proyecto (Settings → API) a tu `.env` (paso 3).

#### Opción B — Supabase local (Docker)

```bash
supabase start
```

Esto levanta Postgres, Auth, Realtime, Storage y el Studio local (con Docker). Al finalizar, la CLI imprime la URL local y la `anon key` — úsalas en tu `.env`. Las migraciones en `supabase/migrations/` se aplican automáticamente al iniciar; para reaplicarlas desde cero:

```bash
supabase db reset
```

> ⚠️ Ese auto-aplicado solo cubre `supabase/migrations/`, que está incompleto (ver nota de la Opción A) — después de `supabase start` o `supabase db reset`, aplica también `supabase/Schemabbdd/schema_production.sql` manualmente contra la instancia local (Studio local → SQL Editor) para tener el schema completo, incluido el módulo de cumpleaños.

Para detener el entorno local:

```bash
supabase stop
```

### 5. Levantar el frontend

```bash
npm run dev
```

La app queda disponible en `http://localhost:8080` (puerto definido en `vite.config.ts`).

Otros scripts útiles:

```bash
npm run build       # build de producción
npm run build:dev    # build en modo desarrollo (sin minificar)
npm run preview      # sirve el build de producción localmente
npm run lint          # linting con ESLint
```

### 6. Edge Functions

Para desarrollo local de la Edge Function `staff-admin`:

```bash
supabase functions serve staff-admin
```

Para desplegarla a un proyecto en la nube:

```bash
supabase functions deploy staff-admin --project-ref <tu-project-ref>
```

La función depende de `SUPABASE_SERVICE_ROLE_KEY`, inyectada automáticamente por Supabase como *default secret* — no es necesario configurarla manualmente.

### 7. Tests

```bash
npm run test         # ejecuta la suite de Vitest una vez
npm run test:watch    # modo watch
npx playwright test   # tests end-to-end (requiere el frontend corriendo)
```

---

## Despliegue

- **Frontend**: desplegado en Vercel. `vercel.json` define el rewrite necesario para SPA (todas las rutas resuelven a `index.html`). Configura en Vercel las mismas variables de entorno del paso 3.
- **Edge Functions**: se despliegan manualmente con la Supabase CLI (`supabase functions deploy staff-admin --project-ref <ref>`) tras cada cambio en `supabase/functions/staff-admin/`. No hay integración automática GitHub ↔ Supabase.
- **Migraciones SQL**: no se aplican automáticamente en cada deploy; deben ejecutarse manualmente contra el proyecto Supabase correspondiente (`supabase db push` o vía SQL Editor) cuando cambie el esquema.
