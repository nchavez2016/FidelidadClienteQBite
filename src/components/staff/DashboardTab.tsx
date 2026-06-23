import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { getCustomers, getTransactions, getCampaignById, getCustomerById, getCustomerPoints, getCustomerTotalPoints, hydrateCustomers } from '@/services';
import { getCustomerCounts, type CustomerCounts } from '@/services/analytics/customerCounts.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip as InfoTooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import TransactionItem from '@/components/TransactionItem';
import { Users, TrendingUp, Award, Coins, Filter, PieChart, Clock, RotateCcw, CalendarDays, ShoppingBag, ArrowUpRight, ArrowDownRight, Minus, MessageSquare, Info, Cake, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { CommentCategory } from '@/lib/types';

const commentCatLabels: Record<CommentCategory, string> = {
  complaint: '😟 Queja',
  observation: '📝 Observación',
  other: '💬 Otro',
  positive: '😊 Positivo',
  promotion: '🎁 Promoción',
  suggestion: '💡 Sugerencia',
};

const feedbackCategories: {
  key: CommentCategory;
  label: string;
  icon: string;
  accentClass: string;
  badgeClass: string;
  emphasisClass: string;
}[] = [
  { key: 'positive', label: 'Positivos', icon: '😊', accentClass: 'text-success', badgeClass: 'bg-success/10 text-success', emphasisClass: 'border-success/30 bg-success/5' },
  { key: 'complaint', label: 'Quejas', icon: '😟', accentClass: 'text-destructive', badgeClass: 'bg-destructive/10 text-destructive', emphasisClass: 'border-destructive/30 bg-destructive/5' },
  { key: 'observation', label: 'Observaciones', icon: '📝', accentClass: 'text-secondary', badgeClass: 'bg-secondary/10 text-secondary', emphasisClass: 'border-secondary/30 bg-secondary/5' },
  { key: 'promotion', label: 'Promociones', icon: '🎁', accentClass: 'text-accent', badgeClass: 'bg-accent/10 text-accent', emphasisClass: 'border-accent/30 bg-accent/5' },
  { key: 'suggestion', label: 'Sugerencias', icon: '💡', accentClass: 'text-accent', badgeClass: 'bg-accent/15 text-accent', emphasisClass: 'border-accent/30 bg-accent/5' },
  { key: 'other', label: 'Otros', icon: '💬', accentClass: 'text-muted-foreground', badgeClass: 'bg-muted text-muted-foreground', emphasisClass: 'border-border bg-muted/40' },
];

function InfoHint({ content, label }: { content: ReactNode; label: string }) {
  return (
    <InfoTooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Info className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] space-y-2 text-left leading-relaxed">
        {content}
      </TooltipContent>
    </InfoTooltip>
  );
}

interface DashboardTabProps {
  branchCampaignId?: string;
}

export default function DashboardTab({ branchCampaignId }: DashboardTabProps) {
  const [birthdayTick, setBirthdayTick] = useState(0);
  const allCustomers = getCustomers();
  const allTransactions = getTransactions();
  const campaign = branchCampaignId ? getCampaignById(branchCampaignId) : undefined;

  // Authoritative customer membership counts (profiles ∩ user_roles=customer).
  // Never derive "Clientes Totales" from ledger activity.
  const [customerCounts, setCustomerCounts] = useState<CustomerCounts | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getCustomerCounts().then((c) => { if (!cancelled) setCustomerCounts(c); });
    return () => { cancelled = true; };
  }, []);

  // Refresca el cache de clientes al montar el dashboard para asegurar que
  // fechas de nacimiento recién sincronizadas desde Supabase aparezcan.
  useEffect(() => {
    let cancelled = false;
    void hydrateCustomers().then(() => {
      if (!cancelled) setBirthdayTick(t => t + 1);
    });
    return () => { cancelled = true; };
  }, []);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CommentCategory | null>(null);

  // Filter transactions by date range AND branch campaign
  const filteredTx = useMemo(() => {
    return allTransactions.filter(t => {
      if (branchCampaignId && t.campaignId !== branchCampaignId) return false;
      if (dateFrom && new Date(t.createdAt) < new Date(dateFrom)) return false;
      if (dateTo && new Date(t.createdAt) > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [allTransactions, dateFrom, dateTo, branchCampaignId]);

  // Helper: points of a customer in the active branch (or total if no branch)
  const pointsOf = (c: typeof allCustomers[number]) =>
    branchCampaignId ? getCustomerPoints(c, branchCampaignId) : getCustomerTotalPoints(c);

  // Previous period transactions for trend calculation
  const prevPeriodVisits = useMemo(() => {
    if (!dateFrom && !dateTo) return null;
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : null;
    if (!from || !to) return null;
    const rangeMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - rangeMs);
    const prevTo = new Date(from.getTime() - 1);
    return allTransactions.filter(t => {
      const d = new Date(t.createdAt);
      if (branchCampaignId && t.campaignId !== branchCampaignId) return false;
      const isVisit = t.ledgerKind ? (t.ledgerKind === 'earn' || t.ledgerKind === 'bonus') : (t.type === 'accumulation');
      return isVisit && !t.isReversed && d >= prevFrom && d <= prevTo;
    }).length;
  }, [allTransactions, dateFrom, dateTo, branchCampaignId]);

  const analytics = useMemo(() => {
    // Visits: only real earn/bonus transactions (manual_adjustment never counts).
    const accumulations = filteredTx.filter(t =>
      (t.ledgerKind ? (t.ledgerKind === 'earn' || t.ledgerKind === 'bonus') : t.type === 'accumulation')
      && !t.isReversed,
    );
    const redemptions = filteredTx.filter(t =>
      (t.ledgerKind ? t.ledgerKind === 'redeem' : t.type === 'redemption') && !t.isReversed,
    );
    const reversals = filteredTx.filter(t =>
      t.ledgerKind ? t.ledgerKind === 'reversal' : t.type === 'reversal',
    );
    const totalVisits = accumulations.length;
    const totalPoints = accumulations.reduce((s, t) => s + t.points, 0);
    const totalRedeemed = redemptions.length;
    const totalReversals = reversals.length;
    const pendingPoints = allCustomers.reduce((s, c) => s + pointsOf(c), 0);

    // --- Comments / Novedades ---
    // --- Funnel / Distribución de la Tropa ---
    const milestones = campaign?.milestones?.slice().sort((a, b) => a.requiredPoints - b.requiredPoints) || [];
    const funnel = (() => {
      if (milestones.length === 0) return [];
      const tiers: { label: string; count: number; bgClass: string }[] = [];
      const noPoints = allCustomers.filter(c => pointsOf(c) === 0).length;
      tiers.push({ label: 'Sin actividad (0 pts)', count: noPoints, bgClass: 'bg-muted' });

      const gradientColors = [
        'bg-slate-300 dark:bg-slate-600',
        'bg-sky-300 dark:bg-sky-600',
        'bg-blue-400 dark:bg-blue-500',
        'bg-indigo-500 dark:bg-indigo-400',
        'bg-violet-600 dark:bg-violet-400',
      ];

      for (let i = 0; i < milestones.length; i++) {
        const min = i === 0 ? 1 : milestones[i - 1].requiredPoints;
        const max = milestones[i].requiredPoints;
        const label = i === 0 ? `1 – ${max - 1} pts` : `${min} – ${max - 1} pts`;
        const count = allCustomers.filter(c => { const p = pointsOf(c); return p >= min && p < max; }).length;
        tiers.push({ label, count, bgClass: gradientColors[i % gradientColors.length] });
      }

      const last = milestones[milestones.length - 1].requiredPoints;
      tiers.push({
        label: `≥ ${last} pts (completos)`,
        count: allCustomers.filter(c => pointsOf(c) >= last).length,
        bgClass: 'bg-emerald-500 dark:bg-emerald-400',
      });
      return tiers;
    })();

    // --- Gender analysis (filtered) ---
    // Use DISTINCT customer ids — never derive counts from joined tx rows.
    // Null gender is preserved as its own bucket so:
    //   masculino + femenino + otro + sin_genero === total customers
    const genderBuckets = (['masculino', 'femenino', 'otro', 'sin_genero'] as const).map(g => {
      const matches = allCustomers.filter(c =>
        g === 'sin_genero' ? c.gender == null : c.gender === g,
      );
      const ids = new Set(matches.map(c => c.id));
      const visits = accumulations.filter(t => ids.has(t.customerId)).length;
      const canjes = redemptions.filter(t => ids.has(t.customerId)).length;
      const pctCanje = visits > 0 ? ((canjes / visits) * 100).toFixed(1) : '0.0';
      return { gender: g, count: ids.size, visits, canjes, pctCanje };
    });
    const genderData = genderBuckets.filter(b => b.gender !== 'sin_genero' || b.count > 0);

    // --- Peak hours (filtered) ---
    const hourBuckets = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    accumulations.forEach(t => {
      const h = new Date(t.createdAt).getHours();
      hourBuckets[h].count++;
    });
    const peakHours = hourBuckets.filter(b => b.count > 0);

    // --- Return rate (filtered) ---
    const returnDays = (() => {
      const customerVisits: Record<string, string[]> = {};
      accumulations.forEach(t => {
        if (!customerVisits[t.customerId]) customerVisits[t.customerId] = [];
        customerVisits[t.customerId].push(t.createdAt);
      });
      const gaps: number[] = [];
      Object.values(customerVisits).forEach(dates => {
        // Dedup same-day visits (one visit per calendar day).
        const uniqueDays = Array.from(
          new Set(dates.map(d => new Date(d).toISOString().slice(0, 10))),
        ).sort();
        if (uniqueDays.length < 2) return;
        for (let i = 1; i < uniqueDays.length; i++) {
          const diff =
            (new Date(uniqueDays[i]).getTime() - new Date(uniqueDays[i - 1]).getTime()) /
            (1000 * 60 * 60 * 24);
          if (diff > 0) gaps.push(diff);
        }
      });
      if (gaps.length === 0) return null;
      return Number((gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1));
    })();

    return { totalVisits, totalPoints, totalRedeemed, totalReversals, pendingPoints, funnel, genderData, peakHours, returnDays };
  }, [filteredTx, allCustomers, campaign, branchCampaignId, pointsOf]);

  const genderLabels: Record<string, string> = { masculino: '♂ Masculino', femenino: '♀ Femenino', otro: '⚧ Otro', sin_genero: '— Sin género' };
  const maxFunnel = Math.max(...analytics.funnel.map(f => f.count), 1);
  const clearFilters = () => { setDateFrom(''); setDateTo(''); };
  const customerNameById = useMemo(
    () => Object.fromEntries(allCustomers.map(customer => [customer.id, customer.name])),
    [allCustomers],
  );

  const feedbackCounts = useMemo(
    () => Object.fromEntries(feedbackCategories.map(category => [category.key, filteredTx.filter(tx => tx.commentCategory === category.key).length])) as Record<CommentCategory, number>,
    [filteredTx],
  );

  const filteredCommentTx = useMemo(() => {
    const txs = filteredTx
      .filter((tx): tx is typeof tx & { commentCategory: CommentCategory } => Boolean(tx.commentCategory))
      .slice()
      .reverse();

    if (!categoryFilter) return txs;
    return txs.filter(tx => tx.commentCategory === categoryFilter);
  }, [filteredTx, categoryFilter]);

  const recentComments = useMemo(
    () => filteredCommentTx.slice(0, 5).map(tx => ({
      id: tx.id,
      date: tx.createdAt,
      customer: customerNameById[tx.customerId] || 'N/A',
      category: tx.commentCategory,
      text: tx.commentText?.trim() || 'Sin detalle adicional',
    })),
    [filteredCommentTx, customerNameById],
  );

  const maxPeakCount = Math.max(...analytics.peakHours.map(hour => hour.count), 0);
  const peakHoursChartData = analytics.peakHours.map(hour => ({
    ...hour,
    hourLabel: `${String(hour.hour).padStart(2, '0')}h`,
    isPeak: maxPeakCount > 0 && hour.count === maxPeakCount,
  }));
  const topPeak = peakHoursChartData.find(hour => hour.isPeak);

  // Trend indicator for visits
  const visitsTrend = (() => {
    if (prevPeriodVisits === null) return 'neutral';
    if (analytics.totalVisits > prevPeriodVisits) return 'up';
    if (analytics.totalVisits < prevPeriodVisits) return 'down';
    return 'neutral';
  })();

  // Filtered transactions for history (with optional category filter)
  const historyTx = useMemo(() => {
    let txs = filteredTx.slice().reverse();
    if (categoryFilter) {
      txs = txs.filter(t => t.commentCategory === categoryFilter);
    }
    return txs.slice(0, 50);
  }, [filteredTx, categoryFilter]);

  const toggleCategoryFilter = (cat: CommentCategory) => {
    setCategoryFilter(prev => prev === cat ? null : cat);
  };

  // ═══ Cumpleañeros del mes (independiente del filtro de fechas) ═══
  const monthBirthdays = useMemo(() => {
    const currentMonth = new Date().getMonth(); // 0-11
    const today = new Date();
    const todayKey = `${today.getMonth()}-${today.getDate()}`;
    return allCustomers
      .filter(c => c.isActive !== false && c.birthdate)
      .map(c => {
        // birthdate stored as YYYY-MM-DD — parse as local date to avoid TZ shifts
        const [y, m, d] = (c.birthdate as string).split('-').map(Number);
        if (!m || !d) return null;
        return { customer: c, month: m - 1, day: d, year: y };
      })
      .filter((x): x is { customer: typeof allCustomers[number]; month: number; day: number; year: number } => x !== null && x.month === currentMonth)
      .sort((a, b) => a.day - b.day)
      .map(b => ({
        id: b.customer.id,
        name: b.customer.name,
        phone: b.customer.phone,
        day: b.day,
        isToday: `${b.month}-${b.day}` === todayKey,
      }));
  }, [allCustomers]);
  const monthName = new Date().toLocaleDateString('es-EC', { month: 'long' });

  return (
    <div className="space-y-4 mt-4">
      {/* ═══ FILTRO GLOBAL ═══ */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <CalendarDays className="w-5 h-5 text-secondary" />
            <span className="text-sm font-medium">Segmentador</span>
            {campaign && (
              <span className="text-xs px-2 py-1 rounded-md font-body" style={{ background: 'rgba(197,160,89,0.15)', color: '#8a6f30', border: '1px solid rgba(197,160,89,0.4)' }}>
                Sucursal: <strong>{campaign.branch}</strong>
              </span>
            )}
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40 h-9" />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 h-9" />
            </div>
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">Limpiar</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══ NIVEL 1 — Resumen Operativo ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {[
          {
            label: 'Clientes Totales',
            value: customerCounts?.total ?? allCustomers.length,
            icon: Users,
            trend: null,
            description: 'Total de clientes registrados en el programa',
            info: 'Número acumulado de clientes que se han registrado alguna vez en la campaña. No depende del filtro de fechas.',
          },
          {
            label: 'Visitas del Período',
            value: analytics.totalVisits,
            icon: ShoppingBag,
            trend: visitsTrend,
            description: 'Compras registradas en el rango filtrado',
            info: 'Cantidad de acumulaciones de puntos válidas (compras) realizadas dentro del rango de fechas y sucursal seleccionados. La flecha compara contra el período anterior de igual duración.',
          },
          {
            label: 'Puntos Emitidos',
            value: analytics.totalPoints,
            icon: TrendingUp,
            trend: null,
            description: 'Suma de puntos entregados en el período',
            info: 'Total de puntos otorgados a los clientes por las compras del período. Mide cuánto valor de fidelidad estás liberando al mercado.',
          },
          {
            label: 'Canjes Realizados',
            value: analytics.totalRedeemed,
            icon: Award,
            trend: null,
            description: 'Premios entregados a los clientes',
            info: 'Número de premios efectivamente canjeados en el período. Indica qué tanto los clientes están reclamando los beneficios de la campaña.',
          },
          {
            label: 'Pts. Pendientes',
            value: analytics.pendingPoints,
            icon: Coins,
            trend: null,
            description: 'Puntos vivos en manos de los clientes',
            info: 'Saldo total de puntos que los clientes aún no han canjeado. Representa una obligación futura de la campaña: tarde o temprano se traducirán en premios.',
          },
        ].map((s, i) => (
          <Card key={i} className="border-[0.5px] shadow-md hover:shadow-lg transition-shadow" style={{ borderColor: 'rgba(197,160,89,0.35)' }}>
            <CardContent className="pt-4 pb-3 text-center relative">
              <s.icon className="w-6 h-6 mx-auto mb-1" style={{ color: '#C5A059' }} />
              <div className="flex items-center justify-center gap-1">
                <p className="text-2xl font-heading font-bold">{s.value}</p>
                {s.trend === 'up' && <ArrowUpRight className="w-4 h-4 text-success" />}
                {s.trend === 'down' && <ArrowDownRight className="w-4 h-4 text-destructive" />}
                {s.trend === 'neutral' && dateFrom && dateTo && <Minus className="w-4 h-4 text-muted-foreground" />}
              </div>
              <div className="flex items-center justify-center gap-1">
                <p className="text-[11px] font-medium text-muted-foreground">{s.label}</p>
                <InfoHint label={`Interpretación de ${s.label}`} content={<p>{s.info}</p>} />
              </div>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{s.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ═══ CENTRO DE ATENCIÓN Y SUGERENCIAS ═══ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-secondary" />
            Centro de Atención y Sugerencias
              {categoryFilter && (
                <Button variant="outline" size="sm" className="text-xs h-6 px-2 ml-auto" onClick={() => setCategoryFilter(null)}>
                ✕ Quitar filtro: {commentCatLabels[categoryFilter]}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Contadores interactivos — todas las categorías */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {feedbackCategories.map(cat => {
                const count = feedbackCounts[cat.key];
              const isActive = categoryFilter === cat.key;
                const emphasize = count > 0 && (cat.key === 'complaint' || cat.key === 'suggestion');
              return (
                <button
                  key={cat.key}
                    type="button"
                  onClick={() => toggleCategoryFilter(cat.key)}
                    className={`rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                      isActive ? `${cat.emphasisClass} ring-2 ring-primary/15 shadow-md` : 'border-border bg-card shadow-sm'
                    } ${emphasize && !isActive ? cat.emphasisClass : ''}`}
                    style={isActive || emphasize ? undefined : { borderColor: 'rgba(197,160,89,0.2)' }}
                >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <span className="text-xl leading-none">{cat.icon}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cat.badgeClass}`}>
                        {isActive ? 'Filtrando' : 'Ver'}
                      </span>
                    </div>
                    <p className={`text-2xl font-heading font-bold ${count > 0 ? cat.accentClass : 'text-muted-foreground'}`}>{count}</p>
                    <p className="mt-1 text-xs font-medium text-foreground">{cat.label}</p>
                    
                </button>
              );
            })}
          </div>

          {/* Feed de comentarios en vivo */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {categoryFilter ? `Últimos comentarios — ${commentCatLabels[categoryFilter]}` : 'Últimos comentarios'}
                </p>
                <p className="text-[11px] text-muted-foreground">Mostrando {recentComments.length} de {filteredCommentTx.length}</p>
              </div>
              {recentComments.length > 0 ? (
              <div className="space-y-1.5">
                  {recentComments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-2 text-xs">
                    <span className="text-muted-foreground shrink-0 w-14">
                      {new Date(c.date).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit' })}
                    </span>
                    <span className="font-medium shrink-0 w-24 truncate">{c.customer}</span>
                    <span className="shrink-0">{commentCatLabels[c.category] || c.category}</span>
                    <span className="text-muted-foreground truncate flex-1">{c.text}</span>
                  </div>
                ))}
              </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
                  {categoryFilter ? 'No hay comentarios de esta categoría en el rango seleccionado.' : 'No hay comentarios registrados en el rango seleccionado.'}
                </div>
              )}
            </div>
        </CardContent>
      </Card>

      {/* ═══ NIVEL 2 — Segmentación y Lealtad ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Análisis de Género */}
        <Card className="rounded-xl border-[0.5px] shadow-md" style={{ borderColor: 'rgba(197,160,89,0.35)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="w-5 h-5" style={{ color: '#C5A059' }} />
              Análisis de Género
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.genderData.map(g => (
                <div key={g.gender} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium w-24 shrink-0">{genderLabels[g.gender]}</span>
                  <div className="flex-1 grid grid-cols-4 gap-1 text-center text-xs">
                    <div>
                      <p className="font-bold">{g.count}</p>
                      <p className="text-muted-foreground">Clientes</p>
                    </div>
                    <div>
                      <p className="font-bold text-success">{g.visits}</p>
                      <p className="text-muted-foreground">Visitas</p>
                    </div>
                    <div>
                      <p className="font-bold text-accent">{g.canjes}</p>
                      <p className="text-muted-foreground">Canjes</p>
                    </div>
                    <div>
                      <p className="font-bold text-primary">{g.pctCanje}%</p>
                      <p className="text-muted-foreground">% Canje</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Distribución de la Tropa por Puntos */}
        <Card className="rounded-xl border-[0.5px] shadow-md" style={{ borderColor: 'rgba(197,160,89,0.35)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="w-5 h-5" style={{ color: '#C5A059' }} />
              Distribución de la Tropa por Puntos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.funnel.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay campaña activa</p>
            ) : (
              <div className="space-y-2">
                {analytics.funnel.map((tier, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-32 text-xs text-right text-muted-foreground truncate">{tier.label}</div>
                    <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full transition-all ${tier.bgClass}`}
                        style={{ width: `${Math.max((tier.count / maxFunnel) * 100, tier.count > 0 ? 8 : 0)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
                        {tier.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ NIVEL 3 — Inteligencia y Control ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Horas Pico */}
        <Card className="md:col-span-2 rounded-xl border-[0.5px] shadow-md" style={{ borderColor: 'rgba(197,160,89,0.35)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-5 h-5" style={{ color: '#C5A059' }} />
              Horas Pico — Santa Prisca
            </CardTitle>
          </CardHeader>
          <CardContent>
            {peakHoursChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos de visitas en el período</p>
            ) : (
              <div className="space-y-3">
                {topPeak && (
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">Pico máximo detectado</span>
                    <span className="font-medium text-accent">{topPeak.hourLabel} · {topPeak.count} visitas</span>
                  </div>
                )}
                <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={peakHoursChartData}>
                    <XAxis dataKey="hourLabel" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                    <RechartsTooltip
                      formatter={(value: number) => [value, 'Visitas']}
                      labelFormatter={(_, payload) => {
                        const hour = payload?.[0]?.payload?.hour;
                        return typeof hour === 'number' ? `${String(hour).padStart(2, '0')}:00 – ${String(hour).padStart(2, '0')}:59` : '';
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {peakHoursChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.isPeak ? '#C5A059' : '#001F3F'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alertas y Retorno */}
        <Card className="rounded-xl border-[0.5px] shadow-md" style={{ borderColor: 'rgba(197,160,89,0.35)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="w-5 h-5" style={{ color: '#C5A059' }} />
              Alertas y Retorno
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className={`rounded-xl border p-3 text-center ${analytics.totalReversals > 0 ? 'border-destructive/20 bg-destructive/10' : 'border-border bg-muted/40'}`}>
              <div className="mb-2 flex items-center justify-center gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">Reversiones</p>
                <InfoHint
                  label="Interpretación de reversiones"
                  content={<p>Indica correcciones o anulaciones de puntos. Un número alto sugiere errores operativos o quejas resueltas manualmente. Idealmente debe estar en 0.</p>}
                />
              </div>
              <RotateCcw className={`mx-auto mb-1 h-8 w-8 ${analytics.totalReversals > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              <p className={`text-3xl font-heading font-bold ${analytics.totalReversals > 0 ? 'text-destructive' : ''}`}>{analytics.totalReversals}</p>
              <p className="text-[11px] text-muted-foreground">Controla ajustes manuales del período</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
              <div className="mb-2 flex items-center justify-center gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">Días promedio de retorno</p>
                <InfoHint
                  label="Interpretación de días promedio de retorno"
                  content={
                    <div className="space-y-2">
                      <p>Mide el tiempo que tarda un cliente en volver al local. Entre menor sea el número, mayor es la fidelidad de tu tropa.</p>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>0 – 3 días: Clientes Fanáticos.</p>
                        <p>4 – 7 días: Clientes Frecuentes.</p>
                        <p>+10 días: Clientes en riesgo de olvido.</p>
                      </div>
                    </div>
                  }
                />
              </div>
              <Clock className="mx-auto mb-1 h-8 w-8 text-secondary" />
              <p className="text-3xl font-heading font-bold">{analytics.returnDays ?? '—'}</p>
              <p className="text-[11px] text-muted-foreground">
                {analytics.returnDays !== null ? 'Ritmo real de reactivación del cliente' : 'Sin datos de retorno'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ CUMPLEAÑEROS DEL MES ═══ */}
      <Card className="rounded-xl border-[0.5px] shadow-md" style={{ borderColor: 'rgba(197,160,89,0.35)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 capitalize">
            <Cake className="w-5 h-5" style={{ color: '#C5A059' }} />
            Cumpleañeros de {monthName}
            <span className="ml-auto text-xs font-normal text-muted-foreground normal-case flex items-center gap-2">
              {monthBirthdays.length} {monthBirthdays.length === 1 ? 'cliente' : 'clientes'}
              <button
                type="button"
                onClick={() => { void hydrateCustomers().then(() => setBirthdayTick(t => t + 1)); }}
                className="inline-flex items-center gap-1 text-[10px] text-secondary hover:text-foreground transition-colors"
                aria-label="Refrescar cumpleañeros"
                title="Refrescar cumpleañeros"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthBirthdays.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4 space-y-1">
              <p>No hay cumpleañeros registrados este mes.</p>
              <p className="text-xs">
                {allCustomers.filter(c => c.birthdate).length} de {allCustomers.length} clientes tienen fecha de nacimiento registrada.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {monthBirthdays.map(b => (
                <div
                  key={b.id}
                  className={`flex items-center gap-3 rounded-lg border p-2.5 text-sm ${
                    b.isToday ? 'border-accent/40 bg-accent/10' : 'border-border bg-muted/30'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center w-10 h-10 rounded-md shrink-0" style={{ background: 'rgba(197,160,89,0.15)', color: '#8a6f30' }}>
                    <span className="text-base font-bold leading-none">{b.day}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{b.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.phone}</p>
                  </div>
                  {b.isToday && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/20 text-accent shrink-0">
                      ¡HOY!
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ HISTORIAL DE TRANSACCIONES ═══ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            Historial de Transacciones
            {categoryFilter && (
              <span className="text-xs font-normal text-muted-foreground ml-2">— filtrado por {commentCatLabels[categoryFilter]}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {historyTx.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {categoryFilter ? 'No hay transacciones con esta categoría' : 'No hay transacciones en el período'}
              </p>
            ) : (
              historyTx.map(tx => {
                const c = getCustomerById(tx.customerId);
                return <TransactionItem key={tx.id} tx={tx} customerName={c?.name || 'N/A'} showStaff />;
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
