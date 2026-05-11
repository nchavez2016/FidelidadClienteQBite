# Phase 4 — Smoke Tests

## 4.1 Admin reset (`reset_customer_points`)
1. Login as **admin**, open `ResetPointsDialog` for a customer with balance > 0.
2. Verify select shows current balance per campaign.
3. Submit without "RESET" or with reason < 5 chars → button disabled.
4. Submit valid → toast shows `tx_id` prefix; UI balance becomes 0 via realtime.
5. Login as **cashier** → reset entry point hidden / RPC returns `forbidden`.
6. `select * from admin_audit_log where action='reset_points'` → row exists.

## 4.2 Ledger history
- Default window = last 90 days. Manually setting > 365 days → toast error.
- Pagination: page 2 loads next batch; "Siguiente" disabled when `hasMore=false`.
- Estimated total chip renders (or "total no disponible" if planner has no stat).
- Filters by date / campaign / branch / kind / customer search apply server-side.

## 4.3 CSV export
- Export with < 5000 matching rows → toast success, no truncation note in CSV.
- Force > 5000 (broaden filters) → CSV header includes `# Export truncado…`, toast warning.
- `admin_audit_log` row with action `export_csv` recorded.

## 4.4 Realtime reconnect
1. Open two tabs as admin. Earn in tab A → tab B updates within ~1s.
2. DevTools → Network → Offline for 10s → restore.
3. Console shows `[ledger] reconnect scheduled attempt=1 delayMs=1000`, then 2/4/…
4. Once `SUBSCRIBED`, attempt counter resets; rehydrate skipped if last < 5s.
5. Hard refresh → balances and history match server.

## 4.5 Idle timeout (flag OFF by default)
- After ~30 min idle on staff (or set `localStorage.setItem('lov.idleTimeout','on')` to test faster path) the warning modal appears with countdown.
- "Sigo aquí" resets timer. Activity events tested: mousemove, keydown, click, scroll, touchstart, focus.
- With flag **OFF**: countdown reaches 0 → console warns, NO logout. Modal closes.
- With flag **ON** (`localStorage.setItem('lov.idleTimeout','on')`): countdown reaches 0 → `signOut` fires.

## 4.6 Audit trail
- After `reset_points`, `export_csv`, `staff_*` mutations call `logAdminAction()`, verify row exists.
- Non-admin SELECT on `admin_audit_log` → 0 rows (RLS).
- `log_admin_action` with metadata > 16 KB → throws `metadata_too_large`.

## 4.7 Cooldown (regression from 3.4)
- Two earns within 60s → second returns `cooldown_active`; UI shows toast.
---

## Phase 4 — final closing checklist (admin tools)

### 1. Audit log visibility (admin only)
- Login as **cashier** → Reportes → no “Auditoría” tab.
- Login as **admin** → Reportes → “Auditoría” tab present, table loads.
- Trigger any admin action (reset puntos, alta de staff). Audit row appears
  via realtime within ~1 s without manual refresh.

### 2. CSV export truncation
- In Historial: pick a wide window (>5000 ledger rows) → export → verify:
  - first CSV line: `# Export truncated at 5000 rows. Narrow filters for full data.`
  - toast warning visible.
- In Auditoría same behavior at 5000 audit rows.

### 3. Realtime reconnect logs
- Open DevTools console. Toggle network offline 5 s, then online.
- Expect sequence:
  - `[REALTIME_RECONNECT] {channel:'point_transactions', attempt:1, delayMs:1000}`
  - `[REALTIME_RESYNC] {...}`
  - `[REALTIME_RECOVERED] {...afterAttempts:N}`
- Backoff doubles (1s → 2s → 4s …) capped at 30s.

### 4. Multi-tab sync
- Tab A (cashier) acumula 1 punto.
- Tab B (admin, mismo cliente abierto) ve la fila nueva en LedgerHistoryView
  y el saldo actualizado sin refresh.

### 5. Admin reset
- Admin → OperationsTab → buscar cliente con saldo > 0 → “Resetear puntos”.
- Modal: motivo ≥5 chars + escribir `RESET` → confirma → toast con tx_id.
- En Auditoría aparece `reset_points` con metadata: `previous_balance`,
  `new_balance`, `tx_id`, `reason`.

### 6. Dashboard refresh (KPIs)
- DashboardTab muestra issued/redeemed/reversals/active customers para 7d.
- Ejecuta una transacción nueva → tras `visibilitychange` o refrescar la
  ventana, los KPIs reflejan el cambio.

### 7. Hard refresh persistence
- Acumula → reload (Cmd+Shift+R).
- Sesión sigue activa, saldo persistente, ledger hidratado desde Supabase.
- No quedan llaves `gaviota_transactions` en localStorage.
