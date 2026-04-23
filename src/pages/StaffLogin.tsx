import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginStaff } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import BrandHeader from '@/components/BrandHeader';
import { toast } from 'sonner';
import { Shield } from 'lucide-react';

export default function StaffLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const staff = loginStaff(username, password);
    if (staff) {
      toast.success(`Bienvenido, ${staff.name}`);
      navigate('/staff/panel');
    } else {
      toast.error('Credenciales incorrectas');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-navy">
      <Card className="w-full max-w-md shadow-brand animate-scale-in">
        <CardHeader className="text-center pb-2">
          <BrandHeader subtitle="Acceso del Personal" />
          <div className="flex items-center justify-center gap-2">
            <Shield className="w-5 h-5 text-secondary" />
            <CardTitle className="text-2xl">Panel Interno</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="username">Usuario</Label>
              <Input id="username" placeholder="admin" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground">Ingresar</Button>
          </form>
          <div className="mt-4 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
            <p className="font-medium mb-1">Credenciales de prueba:</p>
            <p>Admin: admin / admin123</p>
            <p>Cajero: cajero / cajero123</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
