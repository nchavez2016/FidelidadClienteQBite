import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { resetCustomerPoints } from '@/services/pointsLedger.service';
import { logAdminAction } from '@/services/security/adminAudit.service';
import { getPointsByCustomer } from '@/services/customerPoints.service';
import { getCampaigns } from '@/services/campaigns.service';
import type { Customer } from '@/lib/types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer: Customer | null;
  /** Optional default campaign (e.g., the staff's branch campaign). */
  defaultCampaignId?: string;
  onDone?: () => void;
}

export default function ResetPointsDialog({ open, onOpenChange, customer, defaultCampaignId, onDone }: Props) {
  const campaigns = getCampaigns();
  const balances = useMemo(
    () => (customer ? getPointsByCustomer(customer.id) : {}),
    [customer, open],
  );

  const candidateIds = Object.keys(balances).filter(id => (balances[id] ?? 0) !== 0);
  const [campaignId, setCampaignId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setConfirm('');
    const initial = defaultCampaignId && balances[defaultCampaignId]
      ? defaultCampaignId
      : candidateIds[0] ?? defaultCampaignId ?? '';
    setCampaignId(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer?.id]);

  const currentBalance = campaignId ? (balances[campaignId] ?? 0) : 0;
  const campaignName = campaigns.find(c => c.id === campaignId)?.name ?? campaignId;
  const reasonValid = reason.trim().length >= 5;
  const confirmValid = confirm.trim().toUpperCase() === 'RESET';
  const canSubmit = !!customer && !!campaignId && reasonValid && confirmValid && !busy;

  const handleSubmit = async () => {
    if (!customer || !campaignId) return;
    setBusy(true);
    try {
      const res = await resetCustomerPoints(customer.id, campaignId, reason.trim());
      await logAdminAction({
        action: 'reset_points',
        targetType: 'customer',
        targetId: customer.id,
        metadata: {
          campaign_id: campaignId,
          previous_balance: currentBalance,
          new_balance: res.new_balance,
          tx_id: res.tx_id,
          reason: reason.trim(),
        },
      });
      toast.success(
        res.tx_id
          ? `Saldo reseteado. tx ${res.tx_id.slice(0, 8)}…`
          : 'Saldo ya estaba en cero.',
      );
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo resetear');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Resetear puntos del cliente
          </DialogTitle>
          <DialogDescription>
            Esta acción genera un ajuste manual negativo en el ledger. <strong>Es irreversible</strong> y queda registrada en el audit log.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div><span className="text-muted-foreground">Cliente:</span> <strong>{customer?.name ?? '—'}</strong></div>
            <div><span className="text-muted-foreground">Teléfono:</span> {customer?.phone ?? '—'}</div>
          </div>

          <div className="space-y-2">
            <Label>Campaña</Label>
            <Select value={campaignId} onValueChange={setCampaignId} disabled={busy}>
              <SelectTrigger><SelectValue placeholder="Selecciona campaña" /></SelectTrigger>
              <SelectContent>
                {campaigns.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — saldo actual: {balances[c.id] ?? 0}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {campaignId && (
              <p className="text-xs text-muted-foreground">
                Se inserta tx <code>manual_adjustment</code> de <strong>−{currentBalance}</strong> en {campaignName}.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-reason">Motivo (obligatorio)</Label>
            <Textarea
              id="reset-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ej. Solicitud del cliente / corrección operativa…"
              disabled={busy}
              maxLength={500}
            />
            {!reasonValid && reason.length > 0 && (
              <p className="text-xs text-destructive">Mínimo 5 caracteres.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-confirm">Escribe <code>RESET</code> para confirmar</Label>
            <Input
              id="reset-confirm"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="RESET"
              disabled={busy}
              autoComplete="off"
            />
          </div>

          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <strong>Acción irreversible.</strong> El saldo no se puede restaurar excepto registrando una nueva acumulación manual.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Resetear puntos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}