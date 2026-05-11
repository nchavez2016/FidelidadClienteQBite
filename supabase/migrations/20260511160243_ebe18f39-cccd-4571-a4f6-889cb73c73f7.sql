-- Phase 3.1 Core Ledger — wire up triggers + missing index.
-- Schema, RPCs, RLS y demás ya existen.

DROP TRIGGER IF EXISTS pt_no_mutation ON public.point_transactions;
CREATE TRIGGER pt_no_mutation
BEFORE UPDATE OR DELETE ON public.point_transactions
FOR EACH ROW EXECUTE FUNCTION public.point_transactions_no_mutation();

DROP TRIGGER IF EXISTS pt_apply ON public.point_transactions;
CREATE TRIGGER pt_apply
AFTER INSERT ON public.point_transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_point_transaction();

CREATE INDEX IF NOT EXISTS pt_branch_created_idx
  ON public.point_transactions (branch_id, created_at DESC);