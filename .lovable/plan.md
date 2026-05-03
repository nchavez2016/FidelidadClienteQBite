# Gestión de Usuarios del Staff (Admin)

## Objetivo
Agregar al panel del administrador una nueva sección "Usuarios" donde podrá administrar a los miembros del staff (admins y cajeros): crear, editar, asignar sucursal, cambiar contraseña, activar/desactivar y eliminar.

## Alcance funcional

**Roles soportados:** `admin` y `cashier` (los únicos que existen hoy).

**Reglas de negocio:**
- Solo el `admin` puede acceder a esta sección.
- Un cajero **debe** tener una sucursal asignada (`branchCampaignId`).
- Un admin **puede** tener sucursal por defecto (opcional) y puede cambiar entre sucursales libremente.
- El `username` es único (validación al crear/editar).
- No se puede eliminar ni desactivar al usuario actualmente logueado (auto-protección).
- Debe quedar siempre al menos **un admin activo** en el sistema (no se puede eliminar el último).
- Soporta múltiples admins y múltiples cajeros por sucursal.
- Al "dar de baja" (desactivar) un usuario, no podrá iniciar sesión, pero su historial transaccional se conserva.

## Cambios técnicos

### 1. Modelo (`src/lib/types.ts`)
Agregar campo opcional `active?: boolean` a `StaffUser` (default `true` por compatibilidad con datos existentes).

### 2. Servicio (`src/services/staff.service.ts`)
Añadir funciones:
- `createStaff(input)` — valida unicidad de username, genera id, default `active: true`.
- `updateStaff(id, patch)` — edita name/role/branch/active; valida unicidad si cambia username.
- `changeStaffPassword(id, newPassword)` — actualiza password aislado.
- `deleteStaff(id)` — elimina, bloquea si es el último admin o el usuario actual.
- `setStaffActive(id, active)` — activar/desactivar, mismas protecciones.
- Modificar `loginStaff` para rechazar usuarios con `active === false`.

### 3. Validación (`src/services/validation/schemas.ts`)
Nuevo `staffUpsertSchema` (username, name, role, password opcional en update, branchCampaignId opcional para admin / requerido para cashier).

### 4. UI

**Nuevo tab "Usuarios"** en `StaffPanel.tsx` (visible solo si `isAdmin`), agregando un quinto `TabsTrigger` con icono `Users`. Cambiar `grid-cols-4` → `grid-cols-5`.

**Nuevo componente `src/components/staff/UsersTab.tsx`:**
- Tabla/lista de staff con columnas: Nombre, Usuario, Rol (badge), Sucursal asignada, Estado (Activo/Inactivo), Acciones.
- Botón "Nuevo usuario" arriba a la derecha.
- Acciones por fila: Editar, Cambiar contraseña, Activar/Desactivar (toggle), Eliminar (con confirmación).
- Filtros simples por rol y por estado.

**Nuevo componente `src/components/staff/StaffUserDialog.tsx`** (crear/editar):
- Campos: Nombre, Usuario, Rol (select admin/cashier), Sucursal (select de campañas operables; obligatorio si rol=cashier), Contraseña (requerida en crear, opcional en editar), Estado activo (switch en modo edición).
- Validación con zod.

**Nuevo componente `src/components/staff/ChangePasswordDialog.tsx`** — input nueva contraseña + confirmación.

**Diálogo de confirmación de eliminación** reutilizando `AlertDialog`.

### 5. Comportamiento al cambiar rol/sucursal de un usuario logueado en otra sesión
No aplica para esta iteración (localStorage); los cambios surten efecto en su próximo login.

## Layout (referencia)

```text
+------------------------------------------------------+
| Operaciones | Dashboard | Campañas | Reportes | Usuarios |
+------------------------------------------------------+
| Usuarios del staff                  [+ Nuevo usuario]|
| [Filtro rol ▾] [Filtro estado ▾]                     |
+------------------------------------------------------+
| Nombre     Usuario   Rol     Sucursal   Estado  ⋯    |
| Ana López  ana       Admin   —          Activo  ⋯    |
| Juan Paz   juanp     Cajero  Express    Activo  ⋯    |
| Luis Mora  luism     Cajero  Matriz     Inactivo⋯    |
+------------------------------------------------------+
```

## Archivos a crear/modificar
- modificar: `src/lib/types.ts`, `src/services/staff.service.ts`, `src/services/validation/schemas.ts`, `src/pages/StaffPanel.tsx`
- crear: `src/components/staff/UsersTab.tsx`, `src/components/staff/StaffUserDialog.tsx`, `src/components/staff/ChangePasswordDialog.tsx`

## Fuera de alcance
- Recuperación de contraseña por el propio usuario.
- Auditoría de cambios sobre usuarios (quién editó a quién).
- Roles adicionales más allá de admin/cashier.
- Hash de contraseñas (sigue siendo texto plano hasta migrar a Supabase Auth, igual que el resto del sistema).
