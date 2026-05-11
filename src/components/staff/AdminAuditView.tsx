/**
 * Phase 4 — Admin audit log viewer.
 * Source: public.admin_audit_log (RLS = admin only).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Download, Loader2, RefreshCw, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getStaffNameMap } from '@/services/ledgerHistory.service';
import { toCsv, downloadCsv } from '@/lib/csv';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface AuditRow {
  id: string;
  created_at: string;
  actor_id: string;
  actor_role: 'admin' | 'cashier';
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
}

const ACTIONS = [
  'reset_points', 'adjust_points', 'export_csv',
  'staff_create', 'staff_update', 'staff_set_active', 'staff_delete', 'staff_change_password',
] as const;

const PAGE_SIZE = 50;

function fmt(iso: string) {
  return new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function summarize(meta: Record<string, unknown>): string {
  const keep = ['campaign_id', 'delta', 'previous_balance', 'new_balance', 'tx_id', 'role', 'branch_id', 'rows', 'truncated', 'active'];
  const parts: string[] = [];
  for (const k of keep) {
    if (meta[k] != null) parts.push(`${k}=${typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : String(meta[k])}`);
  }
  return parts.join(' · ') || '—';
}

export default function AdminAuditView() {
  const [actorFilter, setActorFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'cashier'>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const staffNames = getStaffNameMap();
  const actorName = (id: string) => staffNames[id] ?? id.slice(0, 8);

  const targetTypes = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => { if (r.target_type) set.add(r.target_type); });
    return Array.from(set).sort();
  }, [rows]);

  const buildQuery = useCallback((limit: number, offset: number) => {
    let q = supabase
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit);
    if (roleFilter !== 'all') q = q.eq('actor_role', roleFilter);
    if (actionFilter !== 'all') q = q.eq('action', actionFilter);
    if (targetTypeFilter !== 'all') q = q.eq('target_type', targetTypeFilter);
    if (from) q = q.gte('created_at', `${from}T00:00:00.000Z`);
    if (to) q = q.lte('created_at', `${to}T23:59:59.999Z`);
    if (actorFilter.trim()) {
      // Match by actor_id (uuid prefix) — simplest server-side filter.
      q = q.ilike('actor_id', `${actorFilter.trim()}%`);
    }
    return q;
  }, [roleFilter, actionFilter, targetTypeFilter, from, to, actorFilter]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = page * PAGE_SIZE;
      const { data, error } = await buildQuery(PAGE_SIZE, offset); // pageSize+1
      if (error) throw error;
      const all = (data as AuditRow[] | null) ?? [];
      setHasMore(all.length > PAGE_SIZE);
      setRows(all.slice(0, PAGE_SIZE));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar audit log');
    } finally {
      setLoading(false);
    }
  }, [buildQuery, page]);

  useEffect(() => { void fetchPage(); }, [fetchPage]);

  // Realtime — refresh on insert (audit log is append-only).
  useEffect(() => {
    let ch: RealtimeChannel | null = supabase
      .channel('admin_audit_log_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_audit_log' }, () => {
        if (page === 0) void fetchPage();
      })
      .subscribe();
    return () => { if (ch) supabase.removeChannel(ch); ch = null; };
  }, [page, fetchPage]);

  // Reset page on filter change
  useEffect(() => { setPage(0); /* fetch via fetchPage dep */ }, [roleFilter, actionFilter, targetTypeFilter, from, to, actorFilter]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const MAX = 5000;
      const { data, error } = await buildQuery(MAX, 0);
      if (error) throw error;
      const all = (data as AuditRow[] | null) ?? [];
      const truncated = all.length > MAX;
      const list = truncated ? all.slice(0, MAX) : all;
      const csv = toCsv(
        ['created_at', 'actor_id', 'actor_name', 'role', 'action', 'target_type', 'target_id', 'metadata'],
        list.map(r => [r.created_at, r.actor_id, actorName(r.actor_id), r.actor_role, r.action, r.target_type ?? '', r.target_id ?? '', JSON.stringify(r.metadata)]),
        truncated ? { notes: ['Export truncated at 5000 rows. Narrow filters for full data.'] } : {},
      );
      downloadCsv(`admin-audit-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      if (truncated) toast.warning('Export truncated at 5000 rows. Narrow filters for full data.');
      else toast.success(`Export listo (${list.length} filas)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Audit log administrativo</h3>
          <Badge variant="secondary">{rows.length}{hasMore ? '+' : ''} resultados</Badge>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void fetchPage()} disabled={loading} variant="ghost" size="sm">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refrescar
          </Button>
          <Button onClick={handleExport} disabled={exporting || loading} variant="outline" size="sm">
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Exportar CSV
          </Button>
        </div>
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
          <Label className="text-xs">Rol</Label>
          <Select value={roleFilter} onValueChange={v => setRoleFilter(v as typeof roleFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="cashier">Cajero</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Acción</Label>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo target</Label>
          <Select value={targetTypeFilter} onValueChange={setTargetTypeFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {targetTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Actor (uuid prefix)</Label>
          <Input value={actorFilter} onChange={e => setActorFilter(e.target.value)} placeholder="ej. 7f3a…" />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm flex items-center justify-between">
          <span className="text-destructive flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</span>
          <Button size="sm" variant="outline" onClick={() => void fetchPage()}>Reintentar</Button>
        </div>
      )}

      <div className="overflow-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2">Fecha</th>
              <th className="text-left p-2">Actor</th>
              <th className="text-left p-2">Rol</th>
              <th className="text-left p-2">Acción</th>
              <th className="text-left p-2">Target</th>
              <th className="text-left p-2">Detalles</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="p-2"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin registros</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="p-2 whitespace-nowrap">{fmt(r.created_at)}</td>
                <td className="p-2 truncate max-w-[180px]" title={r.actor_id}>{actorName(r.actor_id)}</td>
                <td className="p-2"><Badge variant={r.actor_role === 'admin' ? 'default' : 'secondary'}>{r.actor_role}</Badge></td>
                <td className="p-2"><Badge variant="outline">{r.action}</Badge></td>
                <td className="p-2 text-xs">
                  {r.target_type ?? '—'}
                  {r.target_id && <div className="text-muted-foreground truncate max-w-[160px]" title={r.target_id}>{r.target_id.slice(0, 8)}…</div>}
                </td>
                <td className="p-2 text-xs text-muted-foreground truncate max-w-[320px]" title={JSON.stringify(r.metadata)}>{summarize(r.metadata)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || loading}>← Anterior</Button>
        <span className="text-sm text-muted-foreground">Página {page + 1}</span>
        <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={!hasMore || loading}>Siguiente →</Button>
      </div>
    </Card>
  );
}