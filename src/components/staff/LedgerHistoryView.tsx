import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Filter, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  queryTransactions,
  exportTransactions,
  LEDGER_KIND_LABELS,
  getStaffNameMap,
  type QueryTransactionsResult,
} from '@/services/ledgerHistory.service';
import { getCampaigns } from '@/services/campaigns.service';
import { getBranches } from '@/services/branches.service';
import { getCustomers } from '@/services/customers.service';
import { logAdminAction } from '@/services/security/adminAudit.service';
import { toCsv, downloadCsv } from '@/lib/csv';
import type { LedgerTxKind } from '@/services/pointsLedger.service';

const ALL_KINDS: LedgerTxKind[] = ['earn', 'bonus', 'redeem', 'manual_adjustment', 'reversal'];
const DEFAULT_WINDOW_DAYS = 90;
const MAX_WINDOW_DAYS = 365;

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function endOfDayIso(date: string) { return `${date}T23:59:59.999Z`; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function LedgerHistoryView() {
  const campaigns = getCampaigns();
  const branches = getBranches();
  const customers = getCustomers();

  const [from, setFrom] = useState(isoDaysAgo(DEFAULT_WINDOW_DAYS));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [campaignId, setCampaignId] = useState<string>('all');
  const [branchId, setBranchId] = useState<string>('all');
  const [kind, setKind] = useState<LedgerTxKind | 'all'>('all');
  const [customerSearch, setCustomerSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<QueryTransactionsResult | null>(null);

  // Match a customer by phone or name → uuid filter
  const matchedCustomerId = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return undefined;
    const c = customers.find(c =>
      c.phone?.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q),
    );
    return c?.id;
  }, [customerSearch, customers]);

  const windowDays = Math.ceil((+new Date(to) - +new Date(from)) / (24 * 3600 * 1000));
  const windowOk = windowDays >= 0 && windowDays <= MAX_WINDOW_DAYS;

  const filters = useMemo(() => ({
    from: from ? `${from}T00:00:00.000Z` : undefined,
    to: to ? endOfDayIso(to) : undefined,
    campaignId: campaignId !== 'all' ? campaignId : undefined,
    branchId: branchId !== 'all' ? branchId : undefined,
    kinds: kind !== 'all' ? [kind] : undefined,
    customerId: matchedCustomerId,
  }), [from, to, campaignId, branchId, kind, matchedCustomerId]);

  const fetchPage = async () => {
    if (!windowOk) {
      toast.error(`Ventana máx ${MAX_WINDOW_DAYS} días`);
      return;
    }
    setLoading(true);
    try {
      const res = await queryTransactions({ ...filters, page, pageSize });
      setResult(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error consultando ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchPage(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, pageSize]);
  // Reset to page 0 on filter change (and refetch).
  useEffect(() => {
    setPage(0);
    void fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, campaignId, branchId, kind, matchedCustomerId]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { rows, truncated } = await exportTransactions(filters, 5000);
      const staffMap = getStaffNameMap();
      const csv = toCsv(
        ['fecha', 'cliente', 'campaña', 'sucursal', 'tipo', 'delta', 'balance', 'actor', 'motivo', 'tx_id'],
        rows.map(r => [
          r.createdAt,
          customers.find(c => c.id === r.customerId)?.name ?? r.customerId,
          campaigns.find(c => c.id === r.campaignId)?.name ?? r.campaignId,
          (r as { branchId?: string }).branchId ?? '',
          r.type,
          r.points,
          r.balanceAfter ?? '',
          staffMap[r.staffId] ?? r.staffName ?? r.staffId,
          r.commentText ?? '',
          r.id,
        ]),
        truncated
          ? { notes: [`Export truncado a 5000 filas. Reduce la ventana o filtros para ver el dataset completo.`] }
          : {},
      );
      downloadCsv(`ledger-${from}_${to}.csv`, csv);
      if (truncated) toast.warning('Export truncado a 5000 filas. Filtra mejor para descargar todo.');
      else toast.success(`Export listo (${rows.length} filas)`);
      void logAdminAction({
        action: 'export_csv',
        targetType: 'ledger',
        metadata: { rows: rows.length, truncated, filters },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  };

  const totalChip = result?.estimatedTotal != null
    ? `~${result.estimatedTotal.toLocaleString('es-EC')} resultados`
    : 'total no disponible';

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Historial de transacciones (ledger)</h3>
          <Badge variant="secondary">{totalChip}</Badge>
        </div>
        <Button onClick={handleExport} disabled={exporting || loading} variant="outline" size="sm">
          {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Campaña</Label>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sucursal</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={kind} onValueChange={v => setKind(v as LedgerTxKind | 'all')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {ALL_KINDS.map(k => <SelectItem key={k} value={k}>{LEDGER_KIND_LABELS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cliente (nombre o tel)</Label>
          <Input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Buscar…" />
        </div>
      </div>

      {!windowOk && (
        <div className="text-xs text-destructive">
          Ventana inválida (máx {MAX_WINDOW_DAYS} días).
        </div>
      )}

      <div className="overflow-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2">Fecha</th>
              <th className="text-left p-2">Cliente</th>
              <th className="text-left p-2">Campaña</th>
              <th className="text-left p-2">Tipo</th>
              <th className="text-right p-2">Δ</th>
              <th className="text-right p-2">Balance</th>
              <th className="text-left p-2">Actor</th>
              <th className="text-left p-2">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="p-2"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : (result?.rows.length ?? 0) === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Sin resultados</td></tr>
            ) : result!.rows.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="p-2 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                <td className="p-2">{customers.find(c => c.id === r.customerId)?.name ?? r.customerId.slice(0, 8)}</td>
                <td className="p-2">{campaigns.find(c => c.id === r.campaignId)?.name ?? '—'}</td>
                <td className="p-2"><Badge variant="outline">{r.type}</Badge></td>
                <td className={`p-2 text-right font-mono ${r.points < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                  {r.points > 0 ? '+' : ''}{r.points}
                </td>
                <td className="p-2 text-right font-mono">{r.balanceAfter ?? '—'}</td>
                <td className="p-2">{r.staffName ?? '—'}</td>
                <td className="p-2 truncate max-w-[200px]" title={r.commentText ?? ''}>{r.commentText ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Por página</Label>
          <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || loading}>
            ← Anterior
          </Button>
          <span className="text-sm text-muted-foreground">Página {page + 1}</span>
          <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={!result?.hasMore || loading}>
            Siguiente →
          </Button>
        </div>
      </div>
    </Card>
  );
}