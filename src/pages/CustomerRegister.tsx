import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { appRoute } from '@/lib/navigation';
import { loadCustomerLoginPage } from '@/lib/routePreload';
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
  const [email, setEmail] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setPhone(digits);
    setPhoneError('');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) {
      setPhoneError('El número debe tener 10 dígitos');
      return;
    }
    setPhoneError('');
    if (password.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return; }
    if (!gender) { toast.error('Por favor selecciona tu género'); return; }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) { toast.error('Correo electrónico inválido'); return; }
    if (!birthdate) { toast.error('Ingresa tu fecha de nacimiento'); return; }
    const bd = new Date(birthdate);
    const today = new Date();
    if (isNaN(bd.getTime()) || bd >= today) { toast.error('Fecha de nacimiento inválida'); return; }
    const age = (today.getTime() - bd.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (age < 13) { toast.error('Debes tener al menos 13 años para registrarte'); return; }
    if (!consent) { toast.error('Debes aceptar el uso de tu número celular para continuar'); return; }
    setSubmitting(true);
    const { error } = await signUp(phone, password, 'customer', {
      display_name: name,
      gender,
      contact_email: email.trim().toLowerCase(),
      birthdate,
      consent_accepted: true,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.includes('registered') ? 'Este número ya está registrado' : error);
      return;
    }
    toast.success('¡Cuenta creada! Ahora puedes iniciar sesión.');
    navigate(appRoute('/cliente/login'));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-navy">
      <Card className="w-full max-w-md shadow-brand">
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
              <Input id="phone" type="tel" inputMode="numeric" placeholder="0991234567" value={phone} onChange={e => handlePhoneChange(e.target.value)} required />
              {phoneError && <p className="text-xs text-destructive mt-1">{phoneError}</p>}
            </div>
            <div>
              <Label htmlFor="email">Correo electrónico</Label>
              <Input id="email" type="email" placeholder="tu@correo.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="birthdate">Fecha de nacimiento</Label>
              <Input id="birthdate" type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} max={new Date().toISOString().slice(0, 10)} required />
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
            <Button type="submit" disabled={submitting} className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground">{submitting ? 'Creando…' : 'Crear Cuenta'}</Button>
            <p className="text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{' '}
              <button type="button" onMouseEnter={loadCustomerLoginPage} onFocus={loadCustomerLoginPage} onPointerDown={loadCustomerLoginPage} onClick={() => void loadCustomerLoginPage().then(() => navigate(appRoute('/cliente/login')))} className="text-secondary underline font-medium">Inicia sesión</button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
