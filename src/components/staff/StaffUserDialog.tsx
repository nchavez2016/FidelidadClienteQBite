import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { UserPlus, Pencil } from 'lucide-react';
import { getBranches } from '@/services/branches.service';
import {
  createStaffAccount,
  updateStaffAccount,
  type StaffAccount,
  type StaffRole,
} from '@/services/staff/staffAccount.service';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: StaffAccount | null;
  onSaved: () => void;
}

export default function StaffUserDialog({ open, onOpenChange, editing, onSaved }: Props) {
  const isEdit = !!editing;
  const branches = useMemo(() => getBranches(), [open]);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<StaffRole>('cashier');
  const [branchId, setBranchId] = useState<string>('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.display_name ?? '');
      setUsername(editing?.username ?? '');
      setRole((editing?.role as StaffRole) ?? 'cashier');
      setBranchId(editing?.branch_id ?? '');
      setPassword('');
      setSubmitting(false);
    }
  }, [open, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!name.trim()) return toast.error('Ingresa el nombre');
    if (!isEdit && (!username.trim() || username.trim().length < 3)) {
      return toast.error('Usuario muy corto (mín. 3)');
    }
    if (role === 'cashier' && !branchId) return toast.error('Asigna una sucursal al cajero');
    if (!isEdit && password.length < 6) return toast.error('Contraseña mínima de 6 caracteres');

    setSubmitting(true);
    try {
      if (isEdit && editing) {
        await updateStaffAccount({
          user_id: editing.id,
          display_name: name.trim(),
          branch_id: role === 'cashier' ? branchId : (branchId || null),
          role,
          password: password ? password : undefined,
        });
        toast.success('Usuario actualizado');
      } else {
        await createStaffAccount({
          username: username.trim(),
          password,
          display_name: name.trim(),
          role,
          branch_id: role === 'cashier' ? branchId : (branchId || null),
        });
        toast.success('Usuario creado');
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSubmitting(false);
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
            <Input
              id="staff-username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="ana"
              autoComplete="off"
              disabled={isEdit}
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground mt-1">El usuario no se puede cambiar después de crear la cuenta.</p>
            )}
          </div>
          <div>
            <Label>Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
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
              value={branchId || undefined}
              onValueChange={(v) => setBranchId(v)}
            >
              <SelectTrigger><SelectValue placeholder="Selecciona una sucursal" /></SelectTrigger>
              <SelectContent>
                {branches.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
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
              placeholder={isEdit ? 'Dejar en blanco para no cambiar' : 'Mínimo 6 caracteres'}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}