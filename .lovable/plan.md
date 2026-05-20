## Resumen

Dos correcciones mínimas, independientes, sin refactors estructurales:

1. **Control transaccional al cancelar premio (cliente).** El cliente puede pulsar "Cancelar" después de que el cajero ya aprobó, porque la UI no revalida estado contra DB antes de cancelar y deja el botón visible hasta el siguiente polling.
2. **Pérdida de estado del panel staff al cambiar de pestaña del navegador.** Cuando el tab del staff pierde foco y vuelve, Supabase emite `TOKEN_REFRESHED` y el `onAuthStateChange` actual fuerza `setRolesLoaded(false)`, lo que desmonta `StaffPanel` y borra cliente seleccionado, búsqueda, pestaña activa y demás `useState` locales.

---

## Fix 1 — Cancelación de premio: verificar entrega antes de cancelar

### `src/pages/CustomerDashboard.tsx` — `handleCancelRequest`

Antes de llamar `cancelRedemptionRequestByCustomer`, re-consultar el estado real:

```ts
const fresh = await getPendingRequest(customer.id, selectedCampaignId);
if (!fresh || fresh.id !== req.id || fresh.status !== 'pending') {
  toast.error('Tu premio ya fue entregado o la solicitud ya no está pendiente');
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['pendingRequest', customer.id] }),
    queryClient.invalidateQueries({ queryKey: ['historicalRequests', customer.id] }),
    queryClient.invalidateQueries({ queryKey: ['ledgerTx', customer.id] }),
  ]);
  return;
}
```

En el `catch`, si el error proviene del guard server-side (`status='pending'` no matcheó), aplicar el mismo invalidate y mostrar el mismo mensaje. No se toca el RPC.

### `src/components/customer/RewardsCard.tsx`

Endurecer la condición del botón Cancelar:

```tsx
{onCancelRequest && pendingRequest.status === 'pending' && (
  <button onClick={() => onCancelRequest(pendingRequest)}>…</button>
)}
```

### Lo que NO se cambia

- `approve_redemption_request`, `redeem_reward`, RLS, ni triggers.
- Polling sigue en 3 s.
- No se agrega cooldown de re-solicitud.

---

## Fix 2 — Persistir estado del panel staff al cambiar de pestaña

### Causa

`src/contexts/AuthContext.tsx` (líneas ~130-153) — el listener corre `setRolesLoaded(false)` ante **cualquier** evento de auth con sesión presente, incluido `TOKEN_REFRESHED` que dispara el navegador al recuperar foco. `StaffPanel.tsx` tiene:

```ts
if (!user || !rolesLoaded || !hasStaffRole) return null;
```

Al renderizar `null`, React desmonta el árbol → todos los `useState` (`activeTab` en sessionStorage sobrevive, pero `selectedCustomer`, `phoneSearch`, `commentText`, `pendingRequest` cacheado, etc.) se pierden.

### Cambio en `src/contexts/AuthContext.tsx`

En `onAuthStateChange`:

- Si `event === 'TOKEN_REFRESHED'` o `event === 'USER_UPDATED'` **y** `nextSession?.user?.id === user?.id` (mismo usuario), actualizar sólo `session`/`user` sin tocar `rolesLoaded`, sin re-fetchear roles, sin re-correr `postAuthHydrate`.
- Re-hidratar roles y bridge sólo en `SIGNED_IN` con usuario distinto o en `SIGNED_OUT`.

Esquema:

```ts
const prevUserId = userRef.current?.id; // ref sincronizada con user
setSession(nextSession);
setUser(nextSession?.user ?? null);

if (!nextSession?.user) {
  setRoles([]); setRolesLoaded(true); clearLegacySessions(); return;
}

const sameUser = nextSession.user.id === prevUserId;
if (sameUser && (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
  return; // no tocar rolesLoaded, no remount
}

setRolesLoaded(false);
setTimeout(() => { /* fetchProfile + fetchRoles + bridgeLegacy + postAuthHydrate (igual que hoy) */ }, 0);
```

### Lo que NO se cambia

- No se quita el handler `visibilitychange` que hace `rehydrateLedgerHistory` (es throttled a 5 s y es legítimo refrescar ledger al volver al tab).
- No se cambia `StaffPanel` (`activeTab` ya persiste en `sessionStorage`).
- No se introduce ningún nuevo contexto ni se cambia React Query.

---

## Validación

**Fix 1:**
1. Cliente pide premio → cajero aprueba → cliente pulsa Cancelar dentro de 3 s → toast "Tu premio ya fue entregado…", botón desaparece, puntos actualizados sin recargar.
2. Cliente pide y cancela antes de que cajero apruebe → flujo normal sigue funcionando.
3. Consola: ninguna llamada a `cancelRedemptionRequestByCustomer` cuando la solicitud ya no está pendiente.

**Fix 2:**
1. Staff loguea → selecciona cliente en Operaciones → cambia a otra pestaña del navegador → vuelve → cliente seleccionado, búsqueda y pestaña activa permanecen intactos.
2. Misma prueba en pestañas Dashboard, Campañas, Reportes, Usuarios.
3. Log esperado: al volver al tab debe verse `[Auth] onAuthStateChange { event: 'TOKEN_REFRESHED' }` **sin** que aparezca un nuevo `[STAFF_PANEL_RENDER]` con `rolesLoaded: false`.
4. Logout/login real sigue rehidratando roles y bridge legacy correctamente.
