import { useState } from 'react';
import { registerCustomer } from '@/lib/store';
import { Gender } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (phone: string) => void;
}

export default function RegisterCustomerDialog({ open, onOpenChange, onCreated }: Props) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');

  const reset = () => { setPhone(''); setName(''); setPassword(''); setGender(''); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 7) { toast.error('Número de teléfono inválido'); return; }
    if (password.length < 4) { toast.error('La contraseña debe tener al menos 4 caracteres'); return; }
    if (!gender) { toast.error('Selecciona el género del cliente'); return; }
    const customer = registerCustomer(phone, name, password, gender);
    if (customer) {
      toast.success(`Cliente ${name || phone} registrado exitosamente`);
      reset();
      onOpenChange(false);
      onCreated?.(phone);
    } else {
      toast.error('El registro manual desde staff fue desactivado. El cliente debe registrarse en /cliente/registro.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-secondary" />
            Registrar nuevo cliente
          </DialogTitle>
          <DialogDescription>Crea una cuenta para el cliente en el momento.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="reg-name">Nombre</Label>
            <Input id="reg-name" placeholder="María García" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="reg-phone">Teléfono</Label>
            <Input id="reg-phone" type="tel" placeholder="0991234567" value={phone} onChange={e => setPhone(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="reg-gender">Género</Label>
            <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
              <SelectTrigger id="reg-gender" className="w-full">
                <SelectValue placeholder="Seleccionar género" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="masculino">Masculino</SelectItem>
                <SelectItem value="femenino">Femenino</SelectItem>
                <SelectItem value="otro">Prefiero no decirlo / Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="reg-password">Contraseña</Label>
            <Input id="reg-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-2">
            <UserPlus className="w-4 h-4" />
            Registrar cliente
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
