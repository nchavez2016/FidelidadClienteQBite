import { useCallback, useEffect, useState } from 'react';
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
import { useAuth } from '@/hooks/useAuth';
import { getBranches } from '@/services/branches.service';
import {
  listStaffAccounts,
  deleteStaffAccount,
  setStaffActive,
  type StaffAccount,
} from '@/services/staff/staffAccount.service';
import StaffUserDialog from './StaffUserDialog';

export default function UsersTab() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listStaffAccounts();
      setStaff(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cargar el staff');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffAccount | null>(null);
  const [deleting, setDeleting] = useState<StaffAccount | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'cashier'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const branches = getBranches();
  const branchName = (id?: string | null) => branches.find(b => b.id === id)?.name ?? '—';

  const all = staff
    .filter(s => roleFilter === 'all' || s.role === roleFilter)
    .filter(s => statusFilter === 'all' || (statusFilter === 'active' ? s.active : !s.active));

  const handleToggleActive = async (s: StaffAccount) => {
    try {
      await setStaffActive(s.id, !s.active);
      toast.success(!s.active ? 'Usuario activado' : 'Usuario desactivado');
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el estado');
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteStaffAccount(deleting.id);
      toast.success('Usuario eliminado');
      setDeleting(null);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5" style={{ color: '#E8A145' }} />
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
        {loading && (
          <Card className="p-6 text-center text-muted-foreground text-sm">Cargando staff…</Card>
        )}
        {!loading && all.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground text-sm">No hay usuarios con esos filtros.</Card>
        )}
        {!loading && all.map(s => {
          const isMe = user?.id === s.id;
          const inactive = !s.active;
          return (
            <Card key={s.id} className="p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-heading font-semibold text-sm truncate">{s.display_name}</span>
                  <Badge variant={s.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">
                    {s.role === 'admin' ? 'Admin' : 'Cajero'}
                  </Badge>
                  {isMe && <Badge variant="outline" className="text-[10px]">Tú</Badge>}
                  {inactive
                    ? <Badge variant="destructive" className="text-[10px]">Inactivo</Badge>
                    : <Badge variant="outline" className="text-[10px] border-green-500 text-green-600">Activo</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  @{s.username} · Sucursal: {branchName(s.branch_id)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setDialogOpen(true); }} title="Editar">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleToggleActive(s)}
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
        onSaved={() => void refresh()}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas eliminar a <strong>{deleting?.display_name}</strong>? Esta acción no se puede deshacer.
              Su historial de transacciones se conserva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}