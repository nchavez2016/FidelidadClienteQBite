import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UserPlus, Pencil, Trash2, ShieldCheck, ShieldOff, Users } from 'lucide-react';
import { toast } from 'sonner';
import { getStaff, getCurrentStaff, deleteStaff, setStaffActive, getOperableCampaigns } from '@/lib/store';
import StaffUserDialog from './StaffUserDialog';
import type { StaffUser } from '@/lib/types';

export default function UsersTab() {
  const [, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [deleting, setDeleting] = useState<StaffUser | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'cashier'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const current = getCurrentStaff();
  const campaigns = getOperableCampaigns();
  const branchName = (id?: string) => campaigns.find(c => c.id === id)?.branch ?? '—';

  const all = getStaff()
    .filter(s => roleFilter === 'all' || s.role === roleFilter)
    .filter(s => statusFilter === 'all' || (statusFilter === 'active' ? s.active !== false : s.active === false));

  const handleToggleActive = (s: StaffUser) => {
    try {
      setStaffActive(s.id, s.active === false ? true : false);
      toast.success(s.active === false ? 'Usuario activado' : 'Usuario desactivado');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el estado');
    }
  };

  const handleDelete = () => {
    if (!deleting) return;
    try {
      deleteStaff(deleting.id);
      toast.success('Usuario eliminado');
      setDeleting(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5" style={{ color: '#C5A059' }} />
          <h2 className="font-heading text-lg font-semibold">Usuarios del staff</h2>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2">
          <UserPlus className="w-4 h-4" /> Nuevo usuario
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los roles</SelectItem>
            <SelectItem value="admin">Administradores</SelectItem>
            <SelectItem value="cashier">Cajeros</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        {all.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground text-sm">No hay usuarios con esos filtros.</Card>
        )}
        {all.map(s => {
          const isMe = current?.id === s.id;
          const inactive = s.active === false;
          return (
            <Card key={s.id} className="p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-heading font-semibold text-sm truncate">{s.name}</span>
                  <Badge variant={s.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">
                    {s.role === 'admin' ? 'Admin' : 'Cajero'}
                  </Badge>
                  {isMe && <Badge variant="outline" className="text-[10px]">Tú</Badge>}
                  {inactive
                    ? <Badge variant="destructive" className="text-[10px]">Inactivo</Badge>
                    : <Badge variant="outline" className="text-[10px] border-green-500 text-green-600">Activo</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  @{s.username} · Sucursal: {branchName(s.branchCampaignId)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setDialogOpen(true); }} title="Editar">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleToggleActive(s)}
                  title={inactive ? 'Activar' : 'Desactivar'}
                  disabled={isMe}
                >
                  {inactive ? <ShieldCheck className="w-4 h-4 text-green-600" /> : <ShieldOff className="w-4 h-4 text-amber-600" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleting(s)}
                  title="Eliminar"
                  disabled={isMe}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <StaffUserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={refresh}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas eliminar a <strong>{deleting?.name}</strong>? Esta acción no se puede deshacer.
              Su historial de transacciones se conserva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}