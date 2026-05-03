import { getCampaigns, setCampaignStatus } from '@/lib/store';
import { Campaign } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ProgressRoute from '@/components/ProgressRoute';
import { Plus, Settings, Pause, Play, Flame, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { DAY_LABELS } from '@/services/bonusRules.service';
import { toast } from 'sonner';
import { useCampaignEditor } from '@/hooks/useCampaignEditor';

const BRANCH_OPTIONS = ['Gaviota Azul - Matriz', 'Gaviota Azul - Express'];

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

  return (
    <div className="space-y-4 mt-4">
      {!editingCampaign ? (
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-heading font-bold">Campañas</h2>
            <Button onClick={startNewCampaign} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-2">
              <Plus className="w-4 h-4" />Nueva Campaña
            </Button>
          </div>
          {getCampaigns().map(c => (
            <Card key={c.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-heading font-bold text-lg">{c.name}</h3>
                    <p className="text-xs text-muted-foreground">📍 {c.branch || '—'} · {c.startDate} → {c.endDate}</p>
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
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={() => startEditCampaign(c)}>Editar</Button>
                  {c.status === 'draft' && (
                    <Button size="sm" className="bg-success hover:bg-success/90 text-success-foreground" onClick={() => { setCampaignStatus(c.id, 'active'); onRefresh(); toast.success('Campaña activada'); }}>Activar</Button>
                  )}
                  {c.status === 'active' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-400 text-amber-700 hover:bg-amber-50 gap-1"
                        onClick={() => {
                          setCampaignStatus(c.id, 'paused');
                          onRefresh();
                          toast.success('Campaña pausada — los clientes no la verán');
                        }}
                      >
                        <Pause className="w-3.5 h-3.5" />Pausar
                      </Button>
                      <Button size="sm" variant="outline" className="border-destructive/30 text-destructive" onClick={() => onFinishCampaign(c.id)}>Finalizar</Button>
                    </>
                  )}
                  {c.status === 'paused' && (
                    <>
                      <Button
                        size="sm"
                        className="bg-success hover:bg-success/90 text-success-foreground gap-1"
                        onClick={() => {
                          setCampaignStatus(c.id, 'active');
                          onRefresh();
                          toast.success('Campaña reanudada — visible para los clientes');
                        }}
                      >
                        <Play className="w-3.5 h-3.5" />Reanudar
                      </Button>
                      <Button size="sm" variant="outline" className="border-destructive/30 text-destructive" onClick={() => onFinishCampaign(c.id)}>Finalizar</Button>
                    </>
                  )}
                  {c.status === 'finished' && (
                    <Button size="sm" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground" onClick={() => onReactivateCampaign(c.id)}>Reactivar</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
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
                    {BRANCH_OPTIONS.map(branch => (
                      <SelectItem key={branch} value={branch}>{branch}</SelectItem>
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
                Define multiplicadores (x2, x3...) por día y franja horaria para acelerar la frecuencia de visita. Ejemplo: doble gaviota lunes a miércoles de 9:00 a 12:00.
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
                            placeholder="Doble gaviota lunes 9-12"
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

            {/* Preview */}
            {editingCampaign.milestones.length > 0 && (
              <div>
                <h3 className="font-heading font-bold mb-2 text-sm text-muted-foreground">Vista previa del cliente:</h3>
                <div className="bg-muted p-4 rounded-lg">
                  <ProgressRoute currentPoints={0} animate={false} milestones={editingCampaign.milestones} />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={saveCampaignChanges} className="bg-success hover:bg-success/90 text-success-foreground">Guardar Campaña</Button>
              <Button variant="outline" onClick={cancelEdit}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
