# Phase 4 — Operational UX & Admin Tooling (revised)

Builds on Phase 3.4. Auth/ledger architecture untouched unless a critical bug appears.

## 4.1 Admin reset UI (`reset_customer_points`)

- New `src/components/staff/ResetPointsDialog.tsx`, admin-only (`useAuth().roles.includes('admin')`).
- Entry points: row action in `UsersTab` and customer panel in `OperationsTab`.
- Modal flow:
  1. Show current balance per campaign (from `customer_points`).
  2. Required `reason` (zod, min 5 chars).
  3. Irreversible warning + typed "RESET" confirmation.
  4. Call `resetCustomerPoints(customerId, campaignId, reason)`.
  5. Toast with returned `tx_id` + `new_balance`; UI updates via realtime.

## 4.2 Professional ledger history

- New `LedgerHistoryView` mounted inside `ReportsTab`.
- Service: `queryTransactions({ from, to, campaignId, branchId, kind, customerId, page, pageSize })`.
- **Default time window: last 90 days**, user can extend explicitly. Hard cap 365 days per query.
- **Pagination strategy** (avoid `count: 'exact'` on growing datasets):
  - Use `count: 'estimated'` (Postgres planner stats) for the totals chip.
  - Use `head + range` requests; if estimated count is unavailable, show "página N — más resultados" with a `hasMore` flag derived from `rows.length === pageSize + 1` (fetch one extra and slice).
  - Page sizes 25/50/100, default 50.
- Filters UI: date range, campaign, branch, kind multi-select, customer search.
- Columns: created_at, customer, campaign, branch, kind label, delta, balance_after, actor, reason.

## 4.3 CSV export

- `src/lib/csv.ts` helper, client-side.
- Re-runs the active query without pagination, capped at **5,000 rows**.
- If the result hits the cap, prepend a banner toast **and** add a `# Export truncated at 5000 rows. Narrow filters for full data.` header line in the CSV; disable the silent path.

## 4.4 Ops dashboard

- Replace KPI panel content in `DashboardTab` (keep shell).
- Window toggle: Today / 7d / 30d.
- KPI cards: points issued (earn+bonus), points redeemed (|redeem|), reversals count, active customers (distinct).
- Lists: top 5 customers, top 5 campaigns, activity by cashier (`getStaffNameMap`).
- Aggregations in new `analytics.service.ts` via `point_transactions` SELECTs (no extra tables).

## 4.5 QA operacional

- **Realtime reconnect** in `pointsLedger.service.ts`:
  - Listen to channel `system` events (`CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`).
  - **Exponential backoff**: 1s → 2s → 4s → 8s → 16s (cap 30s), reset on success.
  - **Debounce** reconnect attempts (250ms) to coalesce bursts.
  - **Single-flight lock** in `ledgerHistory.service.ts`: `hydrateLedgerHistory()` already returns an `inflight` promise; extend to also coalesce reconnect-triggered rehydrates so concurrent reconnects share one fetch.
- Visibility-change in `AuthContext`: on `visibilitychange → visible`, schedule a single `hydrateLedgerHistory()` (skipped if inflight or last-hydrate < 5s).
- Loading/error states: skeletons in history + dashboard, error fallbacks with retry.
- `docs/SMOKE_TESTS_PHASE_4.md`: reconnect, multi-tab convergence, hard refresh persistence, admin-only reset, cooldown toast.

## 4.6 Security prep (scaffolding, no enforcement)

- `src/services/security/sessionPolicy.ts`:
  - Constants `STAFF_IDLE_TIMEOUT_MS = 30 * 60_000`, `CUSTOMER_IDLE_TIMEOUT_MS = 12h`.
  - **Feature flag** `IDLE_TIMEOUT_ENABLED = false` (env-overridable). Hook is wired but **does not call `signOut`** while disabled — instead logs to console for QA.
  - `useIdleTimeout(role)` hook:
    - Activity events: `mousemove`, `keydown`, `click`, `scroll`, `touchstart`, `focus` (passive listeners).
    - **Warning modal**: shows 60s before expiry with countdown; "Sigo aquí" extends; "Cerrar sesión" logs out immediately.
    - Even when enabled later, requires explicit confirmation timeout (no silent kick) — protects cashier mid-operation.
    - Cleared on unmount; resets on tab focus.
  - Wired in `AuthContext` based on resolved role; while flag off it only renders warning never auto-logout.
- `src/services/security/mfa.ts` stub: thin wrappers around `supabase.auth.mfa.*`. Surfaced as disabled "Próximamente" item in admin settings menu.
- **Audit trail migration** (separate Supabase migration call):
  - Table `admin_audit_log(actor_id, action, target_type, target_id, metadata jsonb)` + RLS (insert via SECURITY DEFINER `log_admin_action`, select admin-only).
  - Called after `reset_customer_points`, `adjust_points`, `staff-admin` mutations.

## Technical notes

- No new dependencies.
- All queries scoped by existing RLS.
- Realtime continues using the `supabase_realtime` publication.
- CSV stays client-side this phase.

## Out of scope

- Enabling MFA in Supabase project settings.
- Server-side aggregations / materialized views.
- Activating `IDLE_TIMEOUT_ENABLED=true` (deferred until QA signs off).

## Deliverables

- New: `ResetPointsDialog.tsx`, `LedgerHistoryView.tsx`, `analytics.service.ts`, `csv.ts`, `sessionPolicy.ts`, `IdleWarningDialog.tsx`, `mfa.ts`, audit-log migration, `SMOKE_TESTS_PHASE_4.md`.
- Edited: `UsersTab`, `OperationsTab`, `DashboardTab`, `ReportsTab`, `AuthContext`, `pointsLedger.service.ts`, `ledgerHistory.service.ts`, `customers.service.ts`.
- One DB migration (admin audit log + `log_admin_action` RPC).
