import { CommentCategory } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import CommentInput from '@/components/CommentInput';
import { AlertTriangle } from 'lucide-react';

interface ReverseDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  commentCat: CommentCategory | '';
  commentText: string;
  setCommentCat: (v: CommentCategory | '') => void;
  setCommentText: (v: string) => void;
  onReverse: () => void;
}

export default function ReverseDialog({
  open, onOpenChange, commentCat, commentText, setCommentCat, setCommentText, onReverse,
}: ReverseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Revertir Último Movimiento</DialogTitle>
          <DialogDescription>Esta acción no elimina registros, crea una reversión</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Se creará un registro de reversión. Solo funciona dentro de los primeros 5 minutos.</p>
          <CommentInput category={commentCat} text={commentText} onCategoryChange={setCommentCat} onTextChange={setCommentText} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={onReverse}>Confirmar Reversión</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
