import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { getBirthdayConfig, updateBirthdayConfig, type BirthdayConfig } from '@/services/birthday.service';

interface BirthdayConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Pantalla simple de configuración del premio — admin-only (el botón que la abre ya está gateado en DashboardTab, que solo renderiza para isAdmin). */
export default function BirthdayConfigDialog({ open, onOpenChange, onSaved }: BirthdayConfigDialogProps) {
  const [config, setConfig] = useState<BirthdayConfig | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [rewardDescription, setRewardDescription] = useState('');
  const [rewardMessage, setRewardMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void getBirthdayConfig()
      .then(cfg => {
        setConfig(cfg);
        setIsActive(cfg.isActive);
        setRewardDescription(cfg.rewardDescription);
        setRewardMessage(cfg.rewardMessage);
      })
      .catch(err => {
        console.error('[BirthdayConfigDialog] load failed', err);
        toast.error('No se pudo cargar la configuración');
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateBirthdayConfig({ isActive, rewardDescription, rewardMessage });
      toast.success('Configuración de cumpleaños guardada');
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error('[BirthdayConfigDialog] save failed', err);
      toast.error('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <Settings2 className="w-5 h-5 text-accent" />
            Configuración de premio de cumpleaños
          </DialogTitle>
        </DialogHeader>

        {loading || !config ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Cargando…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-semibold">Programa activo</Label>
                <p className="text-xs text-muted-foreground">Si está apagado, nadie puede reclamar ni registrar entregas.</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <div>
              <Label className="text-xs">Texto visible al cliente</Label>
              <Input
                value={rewardDescription}
                onChange={e => setRewardDescription(e.target.value)}
                placeholder="Postre de cortesía en tu mes de cumpleaños 🎂"
                maxLength={200}
              />
            </div>

            <div>
              <Label className="text-xs">Instrucciones internas (solo staff)</Label>
              <Textarea
                value={rewardMessage}
                onChange={e => setRewardMessage(e.target.value)}
                placeholder="Verificar identidad antes de entregar…"
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void handleSave()} disabled={saving || loading} className="bg-accent hover:bg-accent/90 text-accent-foreground">
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
