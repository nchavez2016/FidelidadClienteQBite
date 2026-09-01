import { Customer, CommentCategory, Milestone, Campaign } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import CommentInput from '@/components/CommentInput';
import { Gift, CheckCircle, Lock, Hourglass } from 'lucide-react';

interface RedeemDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: Customer | null;
  campaign: Campaign | undefined;
  currentPoints: number;
  selectedReward: Milestone | null;
  setSelectedReward: (v: Milestone | null) => void;
  commentCat: CommentCategory | '';
  commentText: string;
  setCommentCat: (v: CommentCategory | '') => void;
  setCommentText: (v: string) => void;
  onRedeem: () => void;
  /** Si viene de una solicitud del cliente, bloquea la selección. */
  lockedFromRequest?: boolean;
}

export default function RedeemDialog({
  open, onOpenChange, customer, campaign, currentPoints, selectedReward, setSelectedReward,
  commentCat, commentText, setCommentCat, setCommentText, onRedeem, lockedFromRequest,
}: RedeemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Gift className="w-5 h-5 text-accent" />
            {lockedFromRequest ? 'Confirmar canje solicitado' : 'Canjear Premio'}
          </DialogTitle>
          <DialogDescription>
            {lockedFromRequest
              ? `El cliente ya seleccionó este premio. Confirma la entrega ${campaign?.branch ? `(${campaign.branch})` : ''}.`
              : `Selecciona el premio a canjear ${campaign?.branch ? `(${campaign.branch})` : ''}`}
          </DialogDescription>
        </DialogHeader>
        {customer && (
          <div className="space-y-4">
            <p className="text-sm">Puntos actuales en {campaign?.branch || 'sucursal'}: <strong className="text-accent">{currentPoints}</strong></p>
            {lockedFromRequest && selectedReward ? (
              <div className="rounded-lg p-3 flex items-start gap-3" style={{ background: 'rgba(217,37,33,0.08)', border: '1.5px solid #D92521' }}>
                <Hourglass className="w-5 h-5 mt-0.5" style={{ color: '#D92521' }} />
                <div className="flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#0B181E' }}>Premio solicitado por el cliente</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: '#0B181E' }}>🎁 {selectedReward.rewardName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Costo: {selectedReward.requiredPoints} pts</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
              {campaign?.milestones.sort((a, b) => a.requiredPoints - b.requiredPoints).map(m => {
                const available = currentPoints >= m.requiredPoints;
                return (
                  <button
                    key={m.id}
                    disabled={!available}
                    onClick={() => setSelectedReward(m)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                      selectedReward?.id === m.id ? 'border-accent bg-accent/10' :
                      available ? 'hover:border-secondary' : 'opacity-40 cursor-not-allowed'
                    }`}
                  >
                    {available ? <CheckCircle className="w-5 h-5 text-success shrink-0" /> : <Lock className="w-5 h-5 text-muted-foreground shrink-0" />}
                    <div className="flex-1">
                      <p className="font-medium text-sm">{m.rewardName}</p>
                      <p className="text-xs text-muted-foreground">{m.requiredPoints} puntos</p>
                    </div>
                  </button>
                );
              })}
              </div>
            )}
            {selectedReward && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 text-sm space-y-1">
                <p>Tienes <strong>{currentPoints}</strong> puntos</p>
                <p>Vas a canjear <strong>{selectedReward.requiredPoints}</strong></p>
                <p>Te quedarán <strong>{currentPoints - selectedReward.requiredPoints}</strong> puntos</p>
              </div>
            )}
            <CommentInput category={commentCat} text={commentText} onCategoryChange={setCommentCat} onTextChange={setCommentText} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setSelectedReward(null); }}>Cancelar</Button>
          <Button disabled={!selectedReward} onClick={onRedeem} className="bg-accent hover:bg-accent/90 text-accent-foreground">Confirmar Canje</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
