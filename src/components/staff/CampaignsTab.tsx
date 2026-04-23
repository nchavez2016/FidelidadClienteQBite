import { getCampaigns, setCampaignStatus } from '@/lib/store';
import { Campaign } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import ProgressRoute from '@/components/ProgressRoute';
import { Plus, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useCampaignEditor } from '@/hooks/useCampaignEditor';

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
                    c.status === 'draft' ? 'bg-muted text-muted-foreground' :
                    'bg-destructive/10 text-destructive'
                  }`}>{c.status === 'active' ? 'Activa' : c.status === 'draft' ? 'Borrador' : 'Finalizada'}</span>
                </div>
                <ProgressRoute currentPoints={0} animate={false} />
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={() => startEditCampaign(c)}>Editar</Button>
                  {c.status === 'draft' && (
                    <Button size="sm" className="bg-success hover:bg-success/90 text-success-foreground" onClick={() => { setCampaignStatus(c.id, 'active'); onRefresh(); toast.success('Campaña activada'); }}>Activar</Button>
                  )}
                  {c.status === 'active' && (
                    <Button size="sm" variant="outline" className="border-destructive/30 text-destructive" onClick={() => onFinishCampaign(c.id)}>Finalizar</Button>
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
                <Input value={editingCampaign.branch || ''} onChange={e => setEditingCampaign({ ...editingCampaign, branch: e.target.value })} placeholder="Gaviota Azul Express" />
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
