import { useState, useMemo } from 'react';
import { getTransactions, getCustomerById, getCustomers, getCampaignById, getCustomerPoints, getCustomerTotalPoints } from '@/lib/store';
import { CommentCategory } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Download, Users, MessageSquare, Gift, List, CalendarDays } from 'lucide-react';
import LedgerHistoryView from './LedgerHistoryView';
import AdminAuditView from './AdminAuditView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';

const commentLabels: Record<CommentCategory, string> = {
  positive: '😊 Positivo',
  complaint: '😟 Queja',
  observation: '📝 Observación',
  promotion: '🎁 Promoción',
  suggestion: '💡 Sugerencia',
  other: '💬 Otro',
};

function downloadCSV(filename: string, header: string, rows: string[]) {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface ReportsTabProps {
  branchCampaignId?: string;
}

export default function ReportsTab({ branchCampaignId }: ReportsTabProps) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const allTx = getTransactions();
  const allCustomers = getCustomers();
  const campaign = branchCampaignId ? getCampaignById(branchCampaignId) : undefined;

  // Helper: customer points scoped to active branch (or total if none)
  const pointsOf = (c: typeof allCustomers[number]) =>
    branchCampaignId ? getCustomerPoints(c, branchCampaignId) : getCustomerTotalPoints(c);

  const filtered = useMemo(() => {
    return allTx.filter(t => {
      if (branchCampaignId && t.campaignId !== branchCampaignId) return false;
      if (dateFrom && new Date(t.createdAt) < new Date(dateFrom)) return false;
      if (dateTo && new Date(t.createdAt) > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [allTx, dateFrom, dateTo, branchCampaignId]);

  // --- 1. Reporte de Experiencia ---
  const exportExperience = () => {
    const header = 'Fecha,Cliente,Teléfono,Categoría,Comentario,Staff,Tipo Transacción,Puntos';
    const rows = filtered
      .filter(t => t.commentCategory || t.type === 'reversal')
      .map(t => {
        const c = getCustomerById(t.customerId);
        const cat = t.commentCategory ? commentLabels[t.commentCategory] : (t.type === 'reversal' ? '🔄 Reversión' : '');
        return `"${fmtDate(t.createdAt)}","${c?.name || 'N/A'}","${c?.phone || ''}","${cat}","${(t.commentText || '').replace(/"/g, '""')}","${t.staffName}","${t.type}","${t.points}"`;
      });
    downloadCSV(`experiencia_cliente_${new Date().toISOString().slice(0, 10)}.csv`, header, rows);
  };

  // --- 2. Reporte Base de Datos (Tropa) ---
  const exportCustomerDB = () => {
    const header = 'Nombre,Teléfono,Género,Puntos Actuales,Fecha Registro,Última Visita,Días Promedio Retorno,Total Visitas';
    const rows = allCustomers.map(c => {
      const custTx = filtered.filter(t => t.customerId === c.id && t.type === 'accumulation' && !t.isReversed)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const lastVisit = custTx.length > 0 ? custTx[custTx.length - 1].createdAt : '';
      let avgReturn = '-';
      if (custTx.length >= 2) {
        let totalDays = 0;
        for (let i = 1; i < custTx.length; i++) {
          totalDays += (new Date(custTx[i].createdAt).getTime() - new Date(custTx[i - 1].createdAt).getTime()) / 86400000;
        }
        avgReturn = (totalDays / (custTx.length - 1)).toFixed(1);
      }
      return `"${c.name}","${c.phone}","${c.gender}","${pointsOf(c)}","${fmtDateShort(c.createdAt)}","${lastVisit ? fmtDateShort(lastVisit) : 'Sin visitas'}","${avgReturn}","${custTx.length}"`;
    });
    downloadCSV(`base_clientes_${new Date().toISOString().slice(0, 10)}.csv`, header, rows);
  };

  // --- 3. Reporte Análisis de Potencial de Canje ---
  const exportRewards = () => {
    const milestones = campaign?.milestones?.slice().sort((a, b) => a.requiredPoints - b.requiredPoints) || [];
    const redemptions = filtered.filter(t => t.type === 'redemption');
    const accumulations = allTx.filter(t => t.customerId && t.type === 'accumulation' && !t.isReversed && (!branchCampaignId || t.campaignId === branchCampaignId));

    const header = 'Premio / Hito,Puntos Requeridos,Canjes Realizados,Clientes Elegibles (sin canjear),Días Promedio de Consecución,Puntos en Espera (50-99%)';

    const rows = milestones.map(m => {
      // Canjes realizados for this milestone
      const milestonRedemptions = redemptions.filter(t => t.rewardId === m.id);
      const canjes = milestonRedemptions.length;

      // Clientes elegibles: have enough points but haven't redeemed this milestone
      const redeemedCustomerIds = new Set(milestonRedemptions.map(t => t.customerId));
      const eligible = allCustomers.filter(c => pointsOf(c) >= m.requiredPoints && !redeemedCustomerIds.has(c.id));

      // Días promedio de consecución: avg days from first accumulation to reaching requiredPoints
      let totalDays = 0;
      let countReached = 0;
      allCustomers.forEach(c => {
        const custAcc = accumulations
          .filter(t => t.customerId === c.id)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        if (custAcc.length === 0) return;
        const firstDate = new Date(custAcc[0].createdAt).getTime();
        // Find the transaction where balance reached requiredPoints
        const reachedTx = custAcc.find(t => t.balanceAfter >= m.requiredPoints);
        if (reachedTx) {
          totalDays += (new Date(reachedTx.createdAt).getTime() - firstDate) / 86400000;
          countReached++;
        }
      });
      const avgDays = countReached > 0 ? (totalDays / countReached).toFixed(1) : '-';

      // Puntos en espera: sum of points from customers at 50%-99% of requiredPoints
      const halfPoint = m.requiredPoints * 0.5;
      const puntosEnEspera = allCustomers
        .filter(c => { const p = pointsOf(c); return p >= halfPoint && p < m.requiredPoints; })
        .reduce((sum, c) => sum + pointsOf(c), 0);

      return `"${m.rewardName}","${m.requiredPoints}","${canjes}","${eligible.length}","${avgDays}","${puntosEnEspera}"`;
    });

    if (rows.length === 0) rows.push('"Sin hitos configurados","0","0","0","-","0"');
    downloadCSV(`analisis_potencial_canje_${new Date().toISOString().slice(0, 10)}.csv`, header, rows);
  };

  // --- 4. Log Transaccional Total ---
  const exportFullLog = () => {
    const header = 'Timestamp,Cliente,Teléfono,Acción,Puntos,Balance,Staff,Premio,Categoría,Comentario,Reversado';
    const rows = filtered.map(t => {
      const c = getCustomerById(t.customerId);
      const action = t.type === 'accumulation' ? 'Compra' : t.type === 'redemption' ? 'Canje' : t.type === 'reversal' ? 'Reversión' : 'Aceptación T&C';
      return `"${fmtDate(t.createdAt)}","${c?.name || 'N/A'}","${c?.phone || ''}","${action}","${t.points}","${t.balanceAfter}","${t.staffName}","${t.rewardName || ''}","${t.commentCategory ? commentLabels[t.commentCategory] : ''}","${(t.commentText || '').replace(/"/g, '""')}","${t.isReversed ? 'Sí' : ''}"`;
    });
    downloadCSV(`log_transaccional_${new Date().toISOString().slice(0, 10)}.csv`, header, rows);
  };

  // Stats for preview cards
  const experienceCount = filtered.filter(t => t.commentCategory || t.type === 'reversal').length;
  const reports = [
    {
      title: 'Experiencia del Cliente',
      description: 'Comentarios por categoría (Positivos, Quejas, Observaciones, Promociones, Sugerencias, Otros) + Reversiones con detalle de staff.',
      icon: MessageSquare,
      color: 'text-secondary',
      badge: `${experienceCount} registros`,
      action: exportExperience,
    },
    {
      title: 'Base de Datos — Tropa',
      description: 'Listado de clientes con género, puntos, última visita y frecuencia de retorno individual.',
      icon: Users,
      color: 'text-primary',
      badge: `${allCustomers.length} clientes`,
      action: exportCustomerDB,
    },
    {
      title: 'Análisis de Potencial de Canje',
      description: 'Canjes, clientes elegibles, días de consecución y puntos en espera (50-99%) por cada hito.',
      icon: Gift,
      color: 'text-accent',
      badge: `${campaign?.milestones?.length || 0} hitos`,
      action: exportRewards,
    },
    {
      title: 'Log Transaccional Total',
      description: 'Historial crudo: Timestamp, Cliente, Acción (+/- puntos), Staff y Comentario.',
      icon: List,
      color: 'text-success',
      badge: `${filtered.length} transacciones`,
      action: exportFullLog,
    },
  ];

  return (
    <div className="space-y-4 mt-4">
      <Tabs defaultValue="reports" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reports">Reportes</TabsTrigger>
          <TabsTrigger value="ledger">Historial</TabsTrigger>
          {isAdmin && <TabsTrigger value="audit">Auditoría</TabsTrigger>}
        </TabsList>

        <TabsContent value="reports" className="space-y-4">
        {/* Date Filter */}
        <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-end gap-3 flex-wrap">
            <CalendarDays className="w-5 h-5 text-secondary mb-2" />
            {campaign && (
              <span className="text-xs px-2 py-1 rounded-md font-body mb-2" style={{ background: 'rgba(197,160,89,0.15)', color: '#8a6f30', border: '1px solid rgba(197,160,89,0.4)' }}>
                Sucursal: <strong>{campaign.branch}</strong>
              </span>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
            </div>
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>Limpiar</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map(r => (
          <Card key={r.title} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <r.icon className={`w-5 h-5 ${r.color}`} />
                  <CardTitle className="text-base font-heading">{r.title}</CardTitle>
                </div>
                <Badge variant="secondary" className="text-xs font-normal">{r.badge}</Badge>
              </div>
              <CardDescription className="text-xs mt-1">{r.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button variant="outline" size="sm" className="gap-2 w-full" onClick={r.action}>
                <Download className="w-4 h-4" />
                Descargar CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
        </TabsContent>

        <TabsContent value="ledger">
          <LedgerHistoryView />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="audit">
            <AdminAuditView />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
