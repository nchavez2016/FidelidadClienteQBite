import { KeyRound, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface PasswordChangeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  needsPasswordChange: boolean;
  newPwd: string;
  confirmPwd: string;
  onNewPwdChange: (val: string) => void;
  onConfirmPwdChange: (val: string) => void;
  onSubmit: () => void;
}

export default function PasswordChangeModal({
  open, onOpenChange, needsPasswordChange,
  newPwd, confirmPwd, onNewPwdChange, onConfirmPwdChange, onSubmit,
}: PasswordChangeModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!needsPasswordChange || !o) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <KeyRound className="w-5 h-5" style={{ color: '#C9A84C' }} />
            Actualiza tu contraseña
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {needsPasswordChange && (
            <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#fef3cd', border: '1px solid #f0d060' }}>
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#b8860b' }} />
              <p className="text-xs font-body" style={{ color: '#8B6914' }}>
                Tu contraseña actual es igual a tu número de teléfono. Por seguridad, te recomendamos crear una contraseña diferente.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Nueva contraseña</Label>
            <Input type="password" placeholder="Mínimo 4 caracteres" value={newPwd} onChange={e => onNewPwdChange(e.target.value)} maxLength={20} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Confirmar contraseña</Label>
            <Input type="password" placeholder="Repite tu contraseña" value={confirmPwd} onChange={e => onConfirmPwdChange(e.target.value)} maxLength={20} />
          </div>
          <div className="flex gap-2">
            <Button onClick={onSubmit} className="flex-1 bg-secondary hover:bg-secondary/90 text-secondary-foreground">Guardar contraseña</Button>
            {!needsPasswordChange && (
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            )}
          </div>
          {needsPasswordChange && (
            <p className="text-[10px] text-center text-muted-foreground font-body">
              Puedes cerrar este aviso, pero te lo recordaremos cada vez que inicies sesión.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
