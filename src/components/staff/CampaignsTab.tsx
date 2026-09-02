import { useState, useEffect } from 'react';
import { getCampaigns, setCampaignStatus, deleteCampaign } from '@/services';
import { Campaign } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ProgressRoute from '@/components/ProgressRoute';
import { Plus, Settings, Pause, Play, Flame, Trash2, Trophy, Eye, Award, Coins, Zap, ArrowLeftRight, ChevronDown, ChevronUp, Star, Cake, Settings2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DAY_LABELS } from '@/services/bonusRules.service';
import { toast } from 'sonner';
import { useCampaignEditor } from '@/hooks/useCampaignEditor';
import { getBranchAccent } from '@/lib/utils';
import { getBranches, hydrateBranches, isBranchesHydrated } from '@/services/branches.service';
import { getBirthdayConfig, type BirthdayConfig } from '@/services/birthday.service';
import BirthdayConfigDialog from './BirthdayConfigDialog';

interface CampaignsTabProps {
  onRefresh: () => void;
  onFinishCampaign: (id: string) => void;
  onReactivateCampaign: (id: string) => void;
}

export default function CampaignsTab({ onRefresh, onFinishCampaign, onReactivateCampaign }: CampaignsTabProps) {
  const {
    editingCampaign, setEditingCampaign,
    newMilestoneName, setNewMilestoneName,
    newMilestonePoints, setNewMilestonePoints,
    newMilestoneDesc, setNewMilestoneDesc,
    addMilestone, removeMilestone, saveCampaignChanges,
    startNewCampaign, startEditCampaign, cancelEdit,
    addBonusRule, updateBonusRule, removeBonusRule,
  } = useCampaignEditor(onRefresh);

  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const canConfirmDelete = deleteConfirmText.trim().toUpperCase() === 'ELIMINAR';

  const [branchesReady, setBranchesReady] = useState<boolean>(isBranchesHydrated());
  useEffect(() => {
    if (branchesReady) return;
    let alive = true;
    void hydrateBranches().then(() => {
      if (alive) setBranchesReady(true);
    });
    return () => {
      alive = false;
    };
  }, [branchesReady]);
  const branches = getBranches();

  return (
    <div className="space-y-4 mt-4">
      <Dialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) { setDeleteTarget(null); setDeleteConfirmText(''); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Eliminar campaña</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará la campaña{' '}
              <strong>{deleteTarget?.name}</strong>. Para continuar, escribe <strong>ELIMINAR</strong> en el campo.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs">Confirmación</Label>
            <Input
              autoFocus
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="Escribe ELIMINAR"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(''); }}>
              Cancelar
            </Button>
            <Button
              disabled={!canConfirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => {
                if (!deleteTarget || !canConfirmDelete) return;
                const name = deleteTarget.name;
                deleteCampaign(deleteTarget.id);
                setDeleteTarget(null);
                setDeleteConfirmText('');
                onRefresh();
                toast.success(`Campaña "${name}" eliminada`);
              }}
            >
              Eliminar definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="campaigns" className="space-y-4">
        <TabsList>
          <TabsTrigger value="campaigns" className="gap-1.5"><Star className="w-3.5 h-3.5" />Campañas</TabsTrigger>
          <TabsTrigger value="birthday" className="gap-1.5"><Cake className="w-3.5 h-3.5" />Cumpleaños</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
      {!editingCampaign ? (
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-heading font-bold">Campañas</h2>
            <Button onClick={startNewCampaign} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-2">
              <Plus className="w-4 h-4" />Nueva Campaña
            </Button>
          </div>
          {(() => {
            const statusOrder: Record<string, number> = { active: 0, paused: 1, draft: 2, finished: 3 };
            return [...getCampaigns()].sort((a, b) => {
              const sa = statusOrder[a.status] ?? 99;
              const sb = statusOrder[b.status] ?? 99;
              if (sa !== sb) return sa - sb;
              return (a.name || '').localeCompare(b.name || '');
            });
          })().map(c => {
            const branchAccent = getBranchAccent(c.branch);
            const statusStyles =
              c.status === 'active'
                ? { borderColor: 'hsl(var(--success))', borderLeftWidth: '4px', background: 'hsl(var(--card))' }
                : c.status === 'paused'
                ? { borderColor: 'rgb(251,191,36)', borderLeftWidth: '4px', background: 'rgba(251,191,36,0.04)' }
                : c.status === 'draft'
                ? { borderColor: 'hsl(var(--muted-foreground) / 0.4)', borderLeftWidth: '4px', borderStyle: 'dashed' as const, background: 'hsl(var(--muted) / 0.3)' }
                : { borderColor: 'hsl(var(--destructive) / 0.4)', borderLeftWidth: '4px', background: 'hsl(var(--destructive) / 0.04)', opacity: 0.85 };
            return (
            <Card key={c.id} style={statusStyles}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="rounded-md px-3 py-1.5"
                    style={branchAccent ? {
                      background: branchAccent.bg,
                      border: `1px solid ${branchAccent.border}`,
                    } : undefined}
                  >
                    <h3
                      className="font-heading font-bold text-lg"
                      style={branchAccent ? { color: branchAccent.color } : undefined}
                    >
                      {c.name}
                    </h3>
                    <p
                      className="text-xs"
                      style={branchAccent ? { color: branchAccent.color, opacity: 0.85 } : undefined}
                    >
                      📍 {c.branch || '—'} · {c.startDate} → {c.endDate}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    c.status === 'active' ? 'bg-success/10 text-success' :
                    c.status === 'paused' ? 'bg-amber-100 text-amber-700 border border-amber-300' :
                    c.status === 'draft' ? 'bg-muted text-muted-foreground' :
                    'bg-destructive/10 text-destructive'
                  }`}>{
                    c.status === 'active' ? 'Activa' :
                    c.status === 'paused' ? '⏸ En pausa' :
                    c.status === 'draft' ? 'Borrador' : 'Finalizada'
                  }</span>
                </div>
                <ProgressRoute currentPoints={0} animate={false} />

                {/* Vista previa rápida de configuración (sin necesidad de editar) */}
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {/* Hitos */}
                  <div className="rounded-lg p-2.5 bg-muted/50 border border-border">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Trophy className="w-3.5 h-3.5 text-accent" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Hitos ({c.milestones.length})
                      </span>
                    </div>
                    {c.milestones.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">Sin hitos configurados.</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {[...c.milestones]
                          .sort((a, b) => a.requiredPoints - b.requiredPoints)
                          .map(m => (
                            <li key={m.id} className="text-[11px] flex items-center justify-between gap-2">
                              <span className="truncate">
                                <span className="font-semibold">{m.requiredPoints} pts</span> · {m.rewardName}
                              </span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                  {/* Bonus rules */}
                  <div
                    className="rounded-lg p-2.5"
                    style={{
                      background: (c.bonusRules?.length ?? 0) > 0 ? 'rgba(245,158,11,0.06)' : undefined,
                      border: (c.bonusRules?.length ?? 0) > 0 ? '1px solid rgba(245,158,11,0.25)' : '1px solid hsl(var(--border))',
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Flame className="w-3.5 h-3.5" style={{ color: (c.bonusRules?.length ?? 0) > 0 ? '#d97706' : undefined }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: (c.bonusRules?.length ?? 0) > 0 ? '#92400e' : undefined }}>
                        Bonus de puntos ({c.bonusRules?.length ?? 0})
                      </span>
                    </div>
                    {(c.bonusRules?.length ?? 0) === 0 ? (
                      <p className="text-[11px] text-muted-foreground">Sin reglas bonus configuradas.</p>
                    ) : (
                      <ul className="space-y-1">
                        {c.bonusRules!.map(r => (
                          <li key={r.id} className="text-[11px] flex items-center justify-between gap-2">
                            <span className="truncate" style={{ color: r.active ? '#92400e' : '#94a3b8', textDecoration: r.active ? 'none' : 'line-through' }}>
                              {r.label || `Bonus x${r.multiplier}`} · {r.days.map(d => DAY_LABELS[d]).join(',')} · {r.startTime}-{r.endTime}
                            </span>
                            <span
                              className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                background: r.active ? 'rgba(217,119,6,0.18)' : 'rgba(0,0,0,0.04)',
                                color: r.active ? '#b45309' : '#94a3b8',
                              }}
                            >
                              x{r.multiplier}{r.active ? '' : ' · off'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* T&C preview */}
                {c.termsAndConditions && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold">T&C:</span>{' '}
                    <span className="line-clamp-2">{c.termsAndConditions}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mt-3">
                  <Button size="sm" variant="outline" className="w-full sm:w-auto min-w-0 overflow-hidden" onClick={() => startEditCampaign(c)}>
                    <span className="block truncate">Editar</span>
                  </Button>
                  {c.status === 'draft' && (
                    <Button size="sm" className="w-full sm:w-auto min-w-0 overflow-hidden bg-success hover:bg-success/90 text-success-foreground" onClick={() => { setCampaignStatus(c.id, 'active'); onRefresh(); toast.success('Campaña activada'); }}>
                      <span className="block truncate">Activar</span>
                    </Button>
                  )}
                  {c.status === 'active' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto min-w-0 overflow-hidden border-amber-400 text-amber-700 hover:bg-amber-50 gap-1"
                        onClick={() => {
                          setCampaignStatus(c.id, 'paused');
                          onRefresh();
                          toast.success('Campaña pausada — los clientes no la verán');
                        }}
                      >
                        <Pause className="w-3.5 h-3.5 shrink-0" />
                        <span className="block truncate">Pausar</span>
                      </Button>
                      <Button size="sm" variant="outline" className="w-full sm:w-auto min-w-0 overflow-hidden border-destructive/30 text-destructive" onClick={() => onFinishCampaign(c.id)}>
                        <span className="block truncate">Finalizar</span>
                      </Button>
                    </>
                  )}
                  {c.status === 'paused' && (
                    <>
                      <Button
                        size="sm"
                        className="w-full sm:w-auto min-w-0 overflow-hidden bg-success hover:bg-success/90 text-success-foreground gap-1"
                        onClick={() => {
                          setCampaignStatus(c.id, 'active');
                          onRefresh();
                          toast.success('Campaña reanudada — visible para los clientes');
                        }}
                      >
                        <Play className="w-3.5 h-3.5 shrink-0" />
                        <span className="block truncate">Reanudar</span>
                      </Button>
                      <Button size="sm" variant="outline" className="w-full sm:w-auto min-w-0 overflow-hidden border-destructive/30 text-destructive" onClick={() => onFinishCampaign(c.id)}>
                        <span className="block truncate">Finalizar</span>
                      </Button>
                    </>
                  )}
                  {c.status === 'finished' && (
                    <Button size="sm" className="w-full sm:w-auto min-w-0 overflow-hidden bg-secondary hover:bg-secondary/90 text-secondary-foreground" onClick={() => onReactivateCampaign(c.id)}>
                      <span className="block truncate">Reactivar</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto min-w-0 overflow-hidden ml-auto sm:ml-auto border-destructive/40 text-destructive hover:bg-destructive/10 gap-1"
                    onClick={() => { setDeleteTarget(c); setDeleteConfirmText(''); }}
                    aria-label="Eliminar campaña"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="block truncate">Eliminar</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-accent" />
              {editingCampaign.name ? `Editando: ${editingCampaign.name}` : 'Nueva Campaña'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Nombre de campaña</Label>
                <Input value={editingCampaign.name} onChange={e => setEditingCampaign({ ...editingCampaign, name: e.target.value })} placeholder="Ruta del Sabor 2025" />
              </div>
              <div>
                <Label>Sucursal *</Label>
                <Select value={editingCampaign.branch || ''} onValueChange={value => setEditingCampaign({ ...editingCampaign, branch: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(branch => (
                      <SelectItem key={branch.id} value={branch.name}>{branch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Inicio</Label>
                <Input type="date" value={editingCampaign.startDate} onChange={e => setEditingCampaign({ ...editingCampaign, startDate: e.target.value })} />
              </div>
              <div>
                <Label>Fin</Label>
                <Input type="date" value={editingCampaign.endDate} onChange={e => setEditingCampaign({ ...editingCampaign, endDate: e.target.value })} />
              </div>
            </div>

            {/* Milestones */}
            <div>
              <h3 className="font-heading font-bold mb-2">Hitos de la Ruta</h3>
              {editingCampaign.milestones.length > 0 && (
                <div className="space-y-2 mb-4">
                  {editingCampaign.milestones.sort((a, b) => a.requiredPoints - b.requiredPoints).map(m => (
                    <div key={m.id} className="flex items-start gap-2 p-3 bg-muted rounded-lg">
                      <div className="w-20">
                        <Label className="text-[10px]">Puntos</Label>
                        <Input
                          type="number"
                          value={m.requiredPoints}
                          onChange={e => {
                            const pts = parseInt(e.target.value) || 0;
                            const updated = { ...editingCampaign, milestones: editingCampaign.milestones.map(mi => mi.id === m.id ? { ...mi, requiredPoints: pts } : mi).sort((a, b) => a.requiredPoints - b.requiredPoints).map((mi, i) => ({ ...mi, order: i + 1 })) };
                            setEditingCampaign(updated);
                          }}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-[10px]">Premio</Label>
                        <Input
                          value={m.rewardName}
                          onChange={e => {
                            const updated = { ...editingCampaign, milestones: editingCampaign.milestones.map(mi => mi.id === m.id ? { ...mi, rewardName: e.target.value } : mi) };
                            setEditingCampaign(updated);
                          }}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-[10px]">Descripción</Label>
                        <Input
                          value={m.description || ''}
                          onChange={e => {
                            const updated = { ...editingCampaign, milestones: editingCampaign.milestones.map(mi => mi.id === m.id ? { ...mi, description: e.target.value || undefined } : mi) };
                            setEditingCampaign(updated);
                          }}
                          className="h-8 text-sm"
                          placeholder="Opcional"
                        />
                      </div>
                      <Button size="sm" variant="ghost" className="text-destructive mt-4" onClick={() => removeMilestone(m.id)}>✕</Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <Input placeholder="Nombre del premio" value={newMilestoneName} onChange={e => setNewMilestoneName(e.target.value)} className="flex-1 min-w-[150px]" />
                <Input placeholder="Puntos" type="number" value={newMilestonePoints} onChange={e => setNewMilestonePoints(e.target.value)} className="w-24" />
                <Input placeholder="Descripción (opc.)" value={newMilestoneDesc} onChange={e => setNewMilestoneDesc(e.target.value)} className="flex-1 min-w-[150px]" />
                <Button onClick={addMilestone} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-1"><Plus className="w-4 h-4" />Agregar</Button>
              </div>
            </div>

            {/* Configuración de puntos por orden */}
            {(() => {
              const amount = editingCampaign.minOrderAmount ?? 5;
              const dynamicPlaceholder = `Ej: 1 punto por orden de $${amount.toFixed(2)} USD o más. El monto no importa, cuenta la orden.`;
              return (
                <div
                  className="rounded-lg p-4 space-y-4"
                  style={{ background: '#EEF2F8', border: '1.5px solid #E8A145' }}
                >
                  <h3 className="font-heading font-bold" style={{ color: '#0B181E' }}>
                    Cómo se gana 1 punto
                  </h3>

                  <div>
                    <Label>Monto mínimo por orden para ganar 1 punto</Label>
                    <div className="relative mt-1">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editingCampaign.minOrderAmount ?? ''}
                        onChange={e => {
                          const v = e.target.value;
                          setEditingCampaign({
                            ...editingCampaign,
                            minOrderAmount: v === '' ? undefined : Math.max(0, parseFloat(v) || 0),
                          });
                        }}
                        placeholder="Ej: 5.00"
                        className="pr-12 bg-white"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground pointer-events-none">
                        USD
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Si se deja vacío, se usa $5.00 USD por defecto.</p>
                  </div>

                  <div>
                    <Label>Descripción de cómo ganar puntos</Label>
                    <Input
                      type="text"
                      maxLength={120}
                      value={editingCampaign.pointsDescription ?? ''}
                      onChange={e => setEditingCampaign({ ...editingCampaign, pointsDescription: e.target.value })}
                      placeholder={dynamicPlaceholder}
                      className="mt-1 bg-white"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Si lo dejas vacío, se usará: 1 punto por orden de ${amount.toFixed(2)} USD o más.
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {(editingCampaign.pointsDescription?.length ?? 0)}/120
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Bonus rules */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-heading font-bold flex items-center gap-1.5">
                  <Flame className="w-4 h-4" style={{ color: '#d97706' }} />
                  Bonus de puntos (opcional)
                </h3>
                <Button size="sm" variant="outline" onClick={addBonusRule} className="gap-1 border-amber-400 text-amber-700 hover:bg-amber-50">
                  <Plus className="w-3.5 h-3.5" />Nueva regla
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Define multiplicadores (x2, x3...) por día y franja horaria para acelerar la frecuencia de visita. Ejemplo: doble puntos lunes a miércoles de 9:00 a 12:00.
              </p>
              {(editingCampaign.bonusRules || []).length === 0 ? (
                <div className="text-[11px] text-center text-muted-foreground py-3 rounded-lg" style={{ border: '1px dashed rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.04)' }}>
                  Aún no hay reglas bonus. Agrega una para premiar visitas en horarios estratégicos.
                </div>
              ) : (
                <div className="space-y-2">
                  {(editingCampaign.bonusRules || []).map(rule => (
                    <div key={rule.id} className="rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.25)' }}>
                      {/* Fila 1: etiqueta a ancho completo + acciones */}
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <Label className="text-[10px]">Etiqueta</Label>
                          <Input
                            value={rule.label || ''}
                            placeholder="Doble puntos lunes a miércoles de 9:00 a 12:00"
                            onChange={e => updateBonusRule(rule.id, { label: e.target.value })}
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="flex flex-col items-center gap-1 pt-0.5">
                          <Label className="text-[10px]">Activa</Label>
                          <Switch checked={rule.active} onCheckedChange={v => updateBonusRule(rule.id, { active: v })} />
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive h-9 mt-4"
                          onClick={() => removeBonusRule(rule.id)}
                          aria-label="Eliminar regla"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      {/* Fila 2: multiplicador + horas (grid responsive, no se aprietan) */}
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <div>
                          <Label className="text-[10px]">Multiplicador</Label>
                          <Input
                            type="number"
                            min={2}
                            max={10}
                            value={rule.multiplier}
                            onChange={e => updateBonusRule(rule.id, { multiplier: Math.max(2, parseInt(e.target.value) || 2) })}
                            className="h-9 text-sm w-full"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">Desde</Label>
                          <Input
                            type="time"
                            step={300}
                            value={rule.startTime}
                            onChange={e => updateBonusRule(rule.id, { startTime: e.target.value })}
                            className="h-9 text-sm w-full"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">Hasta</Label>
                          <Input
                            type="time"
                            step={300}
                            value={rule.endTime}
                            onChange={e => updateBonusRule(rule.id, { endTime: e.target.value })}
                            className="h-9 text-sm w-full"
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <Label className="text-[10px]">Días de la semana</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {DAY_LABELS.map((d, idx) => {
                            const selected = rule.days.includes(idx);
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  const next = selected
                                    ? rule.days.filter(x => x !== idx)
                                    : [...rule.days, idx].sort();
                                  updateBonusRule(rule.id, { days: next });
                                }}
                                className="text-[10px] px-2 py-1 rounded-md font-semibold transition-colors"
                                style={{
                                  background: selected ? '#d97706' : '#fff',
                                  color: selected ? '#fff' : '#92400e',
                                  border: `1px solid ${selected ? '#d97706' : 'rgba(245,158,11,0.4)'}`,
                                }}
                              >
                                {d}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Terms and Conditions */}
            <div>
              <Label className="text-sm font-bold flex items-center gap-1.5">
                📋 Términos y Condiciones <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={editingCampaign.termsAndConditions}
                onChange={e => setEditingCampaign({ ...editingCampaign, termsAndConditions: e.target.value })}
                placeholder="Escribe los términos y condiciones de esta campaña..."
                rows={5}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Este texto será visible para clientes y cajeros.</p>
            </div>

            {/* Preview en vivo de lo que verá el cliente */}
            <CustomerTermsPreview campaign={editingCampaign} />

            <div className="flex gap-2">
              <Button onClick={saveCampaignChanges} className="bg-success hover:bg-success/90 text-success-foreground">Guardar Campaña</Button>
              <Button variant="outline" onClick={cancelEdit}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="birthday" className="space-y-4">
          <BirthdayConfigCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BirthdayConfigCard() {
  const [config, setConfig] = useState<BirthdayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  const load = () => {
    setLoading(true);
    void getBirthdayConfig()
      .then(setConfig)
      .catch(err => { console.error('[CampaignsTab] getBirthdayConfig failed', err); setConfig(null); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cake className="w-5 h-5 text-accent" />
            Premio de cumpleaños
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : !config ? (
            <p className="text-sm text-muted-foreground">No se pudo cargar la configuración.</p>
          ) : (
            <>
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                config.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
              }`}>
                {config.isActive ? 'Activo' : 'Inactivo'}
              </span>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Premio vigente</p>
                <p className="text-sm">{config.rewardDescription || 'Sin definir'}</p>
              </div>
            </>
          )}
          <Button onClick={() => setShowDialog(true)} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-2">
            <Settings2 className="w-4 h-4" />Editar configuración
          </Button>
        </CardContent>
      </Card>

      <BirthdayConfigDialog open={showDialog} onOpenChange={setShowDialog} onSaved={load} />
    </>
  );
}

function CustomerTermsPreview({ campaign }: { campaign: Campaign }) {
  const [legalOpen, setLegalOpen] = useState(false);
  const amount = campaign?.minOrderAmount ?? 5;
  const cardText = campaign?.pointsDescription?.trim()
    ? campaign.pointsDescription
    : `1 punto por orden de $${amount.toFixed(2)} USD o más. El monto no importa, cuenta la orden.`;

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Eye className="h-3.5 w-3.5" />
        Vista del cliente
      </div>

      <div className="rounded-lg bg-background border border-border p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full p-2" style={{ background: 'rgba(11,24,30,0.1)' }}>
            <Award className="h-5 w-5" style={{ color: '#0B181E' }} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold" style={{ color: '#0B181E' }}>
              {campaign?.name || 'Nombre de la campaña'}
            </h3>
            <p className="text-xs text-muted-foreground">
              Antes de continuar, conoce cómo funciona
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border p-3 flex gap-3">
          <Coins className="h-5 w-5 mt-0.5" style={{ color: '#E8A145' }} />
          <div className="flex-1">
            <p className="text-sm font-medium">Cómo ganar puntos</p>
            <p className="text-xs text-muted-foreground">{cardText}</p>
          </div>
        </div>

        {(campaign?.bonusRules || []).filter(r => r.active).length > 0 && (
          <div className="rounded-md border border-border p-3 flex gap-3">
            <Zap className="h-5 w-5 mt-0.5" style={{ color: '#E8A145' }} />
            <div className="flex-1">
              <p className="text-sm font-medium">Puntos dobles activos</p>
              <p className="text-xs text-muted-foreground">Gana puntos extra en días y horarios seleccionados.</p>
            </div>
          </div>
        )}

        <div className="rounded-md border border-border p-3 flex gap-3">
          <ArrowLeftRight className="h-5 w-5 mt-0.5" style={{ color: '#E8A145' }} />
          <div className="flex-1">
            <p className="text-sm font-medium">Canje parcial</p>
            <p className="text-xs text-muted-foreground">Puedes canjear premios parcialmente según tus puntos disponibles.</p>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setLegalOpen(o => !o)}
            className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <span>Términos y condiciones legales</span>
            {legalOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {legalOpen && (
            <div className="mt-2 max-h-48 overflow-y-auto text-xs text-muted-foreground whitespace-pre-wrap">
              {campaign?.termsAndConditions || 'Sin términos definidos.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
