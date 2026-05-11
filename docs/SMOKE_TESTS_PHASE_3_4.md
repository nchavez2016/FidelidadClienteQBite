# Phase 3.4 — Smoke Tests (manual)

All tests must be executed against a clean Supabase env with at least one
admin, one cashier and one customer account.

## 1. Earn
- As cashier: open a customer, press "Sumar punto".
- Expected: balance increases by 1 (or by bonus multiplier), a new
  `point_transactions` row of kind `earn`/`bonus` appears in history,
  log line `[LEDGER_EARN]`.

## 2. Redeem
- As cashier: redeem a reward the customer can afford.
- Expected: balance drops by `requiredPoints`, ledger row of kind `redeem`
  with `metadata.reward_name`, log line `[LEDGER_REDEEM]`.

## 3. Reverse
- Within 5 minutes of a transaction, press "Revertir último".
- Expected: ledger row of kind `reversal` with `reverses_tx_id` pointing to
  the original; balance returns to previous value.
- Trying to reverse a `reversal` is rejected (`cannot_reverse_reversal`).

## 4. Cooldown (server-side)
- As cashier: earn a point, then press again within 60s.
- Expected: RPC raises `cooldown_active`, UI shows "Debes esperar al
  menos 1 minuto entre puntos (anti-abuso)". No ledger row inserted.

## 5. Auth role isolation
- As `customer`: calling any of `earn_points`, `redeem_reward`,
  `reverse_transaction`, `adjust_points`, `reset_customer_points` must
  return `forbidden` (PostgreSQL `42501`).
- As `cashier`: `adjust_points` and `reset_customer_points` must also
  return `forbidden` (admin-only).
- Direct INSERT/UPDATE/DELETE on `customer_points` and `point_transactions`
  from any role except service_role is rejected by RLS.

## 6. Realtime
- Open the same customer in two browsers. Earn from one tab.
- Expected: the second tab sees the new balance and history row without
  reload (channels: `customer_points_changes`, `point_transactions_changes`).

## 7. Reset (admin)
- As admin: call `resetCustomerPoints(customerId, campaignId, reason)`.
- Expected: `manual_adjustment` ledger row with `points_delta = -previous`
  and `metadata.op = 'reset_customer_points'`; balance is 0.
- Calling on already-zero balance returns `tx_id: null, new_balance: 0`
  without inserting a no-op row.