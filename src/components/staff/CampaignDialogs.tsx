import { setCampaignStatus, resetAllCustomerPoints } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface CampaignDialogsProps {
  showFinishConfirm: boolean;
  setShowFinishConfirm: (v: boolean) => void;
  finishCampaignId: string;
  showReactivateDialog: boolean;
  setShowReactivateDialog: (v: boolean) => void;
  reactivateCampaignId: string;
  onRefresh: () => void;
}

export default function CampaignDialogs({
  showFinishConfirm, setShowFinishConfirm, finishCampaignId,
  showReactivateDialog, setShowReactivateDialog, reactivateCampaignId,
  onRefresh,
}: CampaignDialogsProps) {
  return (
    <>
      {/* Finish Campaign Confirmation */}
      <AlertDialog open={showFinishConfirm} onOpenChange={setShowFinishConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Finalizar campaña?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de finalizar esta campaña? Su estado cambiará a finalizada y dejará de estar activa para los clientes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowFinishConfirm(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => {
                setCampaignStatus(finishCampaignId, 'finished');
                setShowFinishConfirm(false);
                onRefresh();
                toast.success('Campaña finalizada');
              }}
            >
              Sí, finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactivate Campaign Dialog */}
      <Dialog open={showReactivateDialog} onOpenChange={setShowReactivateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reactivar Campaña</DialogTitle>
            <DialogDescription>
              ¿Deseas encerar los puntos de todos los clientes o conservarlos?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Button
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => {
                resetAllCustomerPoints();
                setCampaignStatus(reactivateCampaignId, 'active');
                setShowReactivateDialog(false);
                onRefresh();
                toast.success('Campaña reactivada — puntos encerados a 0');
              }}
            >
              Encerar puntos (todos a 0)
            </Button>
            <Button
              className="bg-success hover:bg-success/90 text-success-foreground"
              onClick={() => {
                setCampaignStatus(reactivateCampaignId, 'active');
                setShowReactivateDialog(false);
                onRefresh();
                toast.success('Campaña reactivada — puntos conservados');
              }}
            >
              Conservar puntos actuales
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReactivateDialog(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
