import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { UserPlus, Pencil } from 'lucide-react';
import { createStaff, updateStaff, getOperableCampaigns } from '@/lib/store';
import type { StaffUser } from '@/lib/types';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: StaffUser | null;
  onSaved: () => void;
}

type Role = 'admin' | 'cashier';

export default function StaffUserDialog({ open, onOpenChange, editing, onSaved }: Props) {
  const isEdit = !!editing;
  const campaigns = getOperableCampaigns();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('cashier');
  const [branchCampaignId, setBranchCampaignId] = useState<string>('');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setUsername(editing?.username ?? '');
      setRole((editing?.role as Role) ?? 'cashier');
      setBranchCampaignId(editing?.branchCampaignId ?? '');
      setPassword('');
      setActive(editing?.active !== false);
    }
  }, [open, editing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!name.trim()) return toast.error('Ingresa el nombre');
      if (!username.trim() || username.trim().length < 3) return toast.error('Usuario muy corto (mín. 3)');
      if (role === 'cashier' && !branchCampaignId) return toast.error('Asigna una sucursal al cajero');
      if (!isEdit && password.length < 4) return toast.error('Contraseña mínima de 4 caracteres');

      if (isEdit && editing) {
        updateStaff(editing.id, {
          name,
          username,
          role,
          branchCampaignId: role === 'cashier' ? branchCampaignId : branchCampaignId || undefined,
          active,
          password: password ? password : undefined,
        });
        toast.success('Usuario actualizado');
      } else {
        createStaff({
          name,
          username,
          role,
          branchCampaignId: role === 'cashier' ? branchCampaignId : branchCampaignId || undefined,
          password,
          active,
        });
        toast.success('Usuario creado');
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            {isEdit ? <Pencil className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? 'Actualiza los datos del miembro del staff.' : 'Crea un nuevo miembro del staff (admin o cajero).'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="staff-name">Nombre</Label>
            <Input id="staff-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ana López" />
          </div>
          <div>
            <Label htmlFor="staff-username">Usuario</Label>
            <Input id="staff-username" value={username} onChange={e => setUsername(e.target.value)} placeholder="ana" autoComplete="off" />
          </div>
          <div>
            <Label>Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cashier">Cajero</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sucursal {role === 'cashier' ? '(requerida)' : '(opcional)'}</Label>
            <Select
              value={branchCampaignId || undefined}
              onValueChange={(v) => setBranchCampaignId(v)}
            >
              <SelectTrigger><SelectValue placeholder="Selecciona una sucursal" /></SelectTrigger>
              <SelectContent>
                {campaigns.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.branch} — {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="staff-pass">{isEdit ? 'Nueva contraseña (opcional)' : 'Contraseña'}</Label>
            <Input
              id="staff-pass"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={isEdit ? 'Dejar en blanco para no cambiar' : 'Mínimo 4 caracteres'}
              autoComplete="new-password"
            />
          </div>
          {isEdit && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="cursor-pointer">Usuario activo</Label>
                <p className="text-xs text-muted-foreground">Si está inactivo no podrá iniciar sesión.</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          )}
          <Button type="submit" className="w-full">
            {isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}