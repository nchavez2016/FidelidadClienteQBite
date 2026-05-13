import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { isIdleTimeoutEnabled } from '@/services/security/sessionPolicy';

interface Props {
  open: boolean;
  remainingSec: number;
  onStay: () => void;
  onLogout: () => void;
}

export default function IdleWarningDialog({ open, remainingSec, onStay, onLogout }: Props) {
  const enforced = isIdleTimeoutEnabled();
  return (
    <AlertDialog open={open} onOpenChange={o => { if (!o) onStay(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Sigues ahí?</AlertDialogTitle>
          <AlertDialogDescription>
            Por inactividad, tu sesión {enforced ? 'se cerrará' : 'se cerraría'} en{' '}
            <strong>{remainingSec}s</strong>.
            {!enforced && (
              <span className="block text-xs text-muted-foreground mt-2">
                (Aviso solo informativo — auto-logout deshabilitado en esta build.)
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStay}>Sigo aquí</AlertDialogCancel>
          <AlertDialogAction onClick={onLogout}>Cerrar sesión</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}