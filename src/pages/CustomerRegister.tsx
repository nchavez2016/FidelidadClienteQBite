import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerCustomer } from '@/lib/store';
import { Gender } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import BrandHeader from '@/components/BrandHeader';
import { toast } from 'sonner';

export default function CustomerRegister() {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [consent, setConsent] = useState(false);
  const navigate = useNavigate();

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 7) { toast.error('Número de teléfono inválido'); return; }
    if (password.length < 4) { toast.error('La contraseña debe tener al menos 4 caracteres'); return; }
    if (!gender) { toast.error('Por favor selecciona tu género'); return; }
    if (!consent) { toast.error('Debes aceptar el uso de tu número celular para continuar'); return; }
    const customer = registerCustomer(phone, name, password, gender, { consentAccepted: true });
    if (customer) {
      toast.success('¡Cuenta creada! Ahora puedes iniciar sesión.');
      navigate('/cliente/login');
    } else {
      toast.error('Este número ya está registrado');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-navy">
      <Card className="w-full max-w-md shadow-brand animate-scale-in">
        <CardHeader className="text-center pb-2">
          <BrandHeader subtitle="Crea tu cuenta" />
          <CardTitle className="text-2xl">Registro</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <Label htmlFor="name">Tu nombre</Label>
              <Input id="name" placeholder="María García" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="phone">Número de teléfono</Label>
              <Input id="phone" type="tel" placeholder="0991234567" value={phone} onChange={e => setPhone(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="gender">Género</Label>
              <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
                <SelectTrigger id="gender" className="w-full">
                  <SelectValue placeholder="Selecciona tu género" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="femenino">Femenino</SelectItem>
                  <SelectItem value="otro">Prefiero no decirlo / Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <div className="rounded-md border p-3 bg-muted/30">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-1" />
                <span className="text-xs leading-relaxed">
                  Acepto que mi número celular sea usado <strong>EXCLUSIVAMENTE</strong> para el programa de fidelidad: registro, acumulación/asignación de puntos y redención de beneficios. <strong>NO</strong> se usará para marketing, publicidad ni compartido con terceros.
                  <br /><br />
                  <span className="text-muted-foreground">Puedo revocar este consentimiento cuando quiera desde mi perfil o contactando al admin.</span>
                </span>
              </label>
            </div>
            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground">Crear Cuenta</Button>
            <p className="text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{' '}
              <button type="button" onClick={() => navigate('/cliente/login')} className="text-secondary underline font-medium">Inicia sesión</button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
