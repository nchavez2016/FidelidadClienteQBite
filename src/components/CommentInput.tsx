import { CommentCategory } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface CommentInputProps {
  category: CommentCategory | '';
  text: string;
  onCategoryChange: (v: CommentCategory) => void;
  onTextChange: (v: string) => void;
}

const categories: { value: CommentCategory; label: string }[] = [
  { value: 'positive', label: '😊 Retroalimentación positiva' },
  { value: 'complaint', label: '😟 Queja' },
  { value: 'observation', label: '📝 Observación' },
  { value: 'promotion', label: '🎁 Promoción' },
  { value: 'suggestion', label: '💡 Sugerencia' },
  { value: 'other', label: '💬 Otro' },
];

export default function CommentInput({ category, text, onCategoryChange, onTextChange }: CommentInputProps) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">Comentario (opcional)</Label>
        <Select value={category} onValueChange={(v) => onCategoryChange(v as CommentCategory)}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Seleccionar categoría..." />
          </SelectTrigger>
          <SelectContent>
            {categories.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {category && (
        <Textarea
          placeholder={category === 'other' ? 'Escribe tu comentario (requerido)...' : 'Detalle adicional (opcional)...'}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          className="resize-none"
          rows={2}
        />
      )}
    </div>
  );
}
