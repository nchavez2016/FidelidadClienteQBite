import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { appRoute } from '@/lib/navigation';
import { loadCustomerDashboardPage, loadCustomerRegisterPage } from '@/lib/routePreload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import BrandHeader from '@/components/BrandHeader';
import { toast } from 'sonner';

export default function CustomerLogin() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setPhone(digits);
    setPhoneError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) {
      setPhoneError('El número debe tener 10 dígitos');
      return;
    }
    setPhoneError('');
    setSubmitting(true);
    const dashboardLoad = loadCustomerDashboardPage();
    const { error } = await signIn(phone, password, 'customer');
    setSubmitting(false);
    if (error) {
      toast.error('Teléfono o contraseña incorrectos');
      return;
    }
    toast.success('¡Bienvenido!');
    await dashboardLoad;
    navigate(appRoute('/cliente/dashboard'));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-navy">
      <Card className="w-full max-w-md shadow-brand">
        <CardHeader className="text-center pb-2">
          <BrandHeader subtitle="Programa de Fidelidad" />
          <CardTitle className="text-2xl">Iniciar Sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="phone">Número de teléfono</Label>
              <Input id="phone" type="tel" placeholder="0991234567" value={phone} onChange={e => setPhone(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" disabled={submitting} className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground">{submitting ? 'Ingresando…' : 'Ingresar'}</Button>
            <p className="text-center text-sm text-muted-foreground">
              ¿No tienes cuenta?{' '}
              <button type="button" onMouseEnter={loadCustomerRegisterPage} onFocus={loadCustomerRegisterPage} onPointerDown={loadCustomerRegisterPage} onClick={() => void loadCustomerRegisterPage().then(() => navigate(appRoute('/cliente/registro')))} className="text-secondary underline font-medium">Regístrate aquí</button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
