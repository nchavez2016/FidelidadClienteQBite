import { useState } from 'react';
import { Gender } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { UserPlus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStaffAuth } from '@/hooks/useStaffAuth';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (phone: string) => void;
}

export default function RegisterCustomerDialog({ open, onOpenChange, onCreated }: Props) {
  const { staff } = useStaffAuth();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setPhone(''); setName(''); setGender(''); setConsent(false); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.info('[RegisterCustomerDialog] submit', { name, phone, gender, consent });
    if (!name.trim()) { toast.error('Ingresa el nombre completo'); return; }
    if (!/^\d{10}$/.test(phone)) { toast.error('El número debe tener 10 dígitos'); return; }
    if (!gender) { toast.error('Selecciona el género del cliente'); return; }
    if (!consent) { toast.error('Debes confirmar el consentimiento verbal'); return; }

    setSubmitting(true);
    try {
      console.info('[RegisterCustomerDialog] invoking staff-admin create_customer');
      const { data, error } = await supabase.functions.invoke('staff-admin', {
        body: {
          action: 'create_customer',
          name: name.trim(),
          phone,
          gender,
          phone_consent_confirmed: true,
          branch_id: staff?.branchId ?? null,
        },
      });
      console.info('[RegisterCustomerDialog] invoke result', { data, error });
      if (error) {
        // FunctionsHttpError exposes context with the body
        const ctx = (error as { context?: Response }).context;
        let serverMsg = error.message;
        if (ctx) {
          try {
            const parsed = await ctx.clone().json();
            serverMsg = parsed.message || parsed.error || serverMsg;
          } catch { /* ignore */ }
        }
        toast.error(serverMsg || 'No se pudo registrar al cliente');
        return;
      }
      if (data?.error) {
        toast.error(data.message || data.error);
        return;
      }
      toast.success('Cliente registrado correctamente');
      reset();
      onOpenChange(false);
      onCreated?.(phone);
    } catch (err) {
      console.error('[RegisterCustomerDialog] unexpected error', err);
      toast.error(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setSubmitting(false);
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
            <Label htmlFor="reg-name">Nombre completo</Label>
            <Input id="reg-name" placeholder="María García" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="reg-phone">Número de celular</Label>
            <Input
              id="reg-phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="0991234567"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
              required
            />
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
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Checkbox
                id="reg-consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="reg-consent" className="text-sm leading-snug cursor-pointer font-normal">
                Confirmo que el cliente otorgó su consentimiento verbal para registrar su número de celular.
              </Label>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              La contraseña inicial del cliente será su número de celular.
            </p>
          </div>
          <Button
            type="submit"
            disabled={!consent || submitting}
            onClick={() => console.log('CLICK REGISTRAR', { consent, submitting, name, phone, gender })}
            className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {submitting ? 'Registrando...' : 'Registrar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
