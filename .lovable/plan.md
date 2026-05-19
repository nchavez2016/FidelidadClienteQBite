## Diagnóstico

El edge function `staff-admin` (acción `update`) sí persiste correctamente los cambios:
- `branch_id` → `UPDATE profiles SET branch_id` (verificado en DB, valores actualizados).
- `password` → `auth.admin.updateUserById` (funcional, por eso el re-login con la nueva contraseña sí entra).

El bug está en el **frontend**, en `src/pages/StaffPanel.tsx` (líneas 61–71):

```ts
const initialBranchId = staff?.branchCampaignId && activeCampaigns.find(c => c.id === staff.branchCampaignId)
  ? staff.branchCampaignId
  : activeCampaigns[0]?.id || '';
```

Dos problemas encadenados:

1. **Campo equivocado.** `useStaffAuth` expone `staff.branchId` (uuid de `branches`), pero `StaffPanel` lee `staff.branchCampaignId` (campo legacy que ya nadie setea). Siempre es `undefined`.
2. **Comparación equivocada.** Aunque se leyera `branchId`, se compara contra `campaign.id` (id de campaña), cuando debería compararse contra `campaign.branchId` (id de sucursal de la campaña).

Resultado: el panel **siempre** cae al fallback `activeCampaigns[0]` — la "primera sucursal/campaña activa" — sin importar qué sucursal tenga asignada el cajero en la BD. Por eso, tras editar la sucursal del usuario y volver a entrar, el panel sigue mostrando exactamente la misma sucursal de antes.

La contraseña sí se actualiza correctamente — el síntoma reportado ("sigo en la misma sucursal") es consecuencia del bug de mapeo, no de un problema de password.

## Fix mínimo

Modificar únicamente `src/pages/StaffPanel.tsx`:

1. Calcular `initialBranchId` mapeando `staff.branchId` → campaña cuya `branchId` coincida:
   ```ts
   const campaignForBranch = staff?.branchId
     ? activeCampaigns.find(c => c.branchId === staff.branchId)
     : undefined;
   const initialBranchId = campaignForBranch?.id ?? activeCampaigns[0]?.id ?? '';
   ```
2. Sincronizar el estado `branchCampaignId` cuando `staff.branchId` cambie (re-login o refetch), para que un cajero al iniciar sesión siempre aterrice en la sucursal asignada por el admin, no en la primera de la lista. `useEffect` que dispare `setBranchCampaignId(campaignForBranch.id)` cuando `staff?.branchId` cambie y exista una campaña para esa sucursal.
3. Mantener el actual override manual vía `handleBranchChange` (admin puede cambiar de sucursal en la sesión); no se toca esa lógica.

No se modifica el edge function, ni `useStaffAuth`, ni `StaffUserDialog`, ni tipos. No se introducen capas nuevas de estado ni refactors.

## Validación

- Editar un cajero, cambiar su sucursal en el diálogo, re-loguear → debe aparecer la nueva sucursal en el header del panel y en `OperationsTab`.
- Editar contraseña → confirmar que el login con la nueva contraseña funciona (ya lo hace, validación de regresión).
- Admin sin sucursal asignada → sigue cayendo al fallback (`activeCampaigns[0]`), comportamiento existente preservado.
