import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import BrandHeader from '@/components/BrandHeader';
import { Users, Shield } from 'lucide-react';
import SocialFooter from '@/components/customer/SocialFooter';

export default function Index() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-navy flex flex-col items-center p-4">
      <div className="flex-1 flex items-center justify-center w-full">
      <div className="text-center space-y-8 max-w-md w-full">
        <BrandHeader />
        <div>
          <h1 className="text-3xl font-heading font-bold text-primary-foreground mb-2">
            Programa de Fidelidad
          </h1>
          <p className="text-primary-foreground/70 text-sm">
            Acumula puntos y gana premios increíbles
          </p>
        </div>

        <div className="space-y-3">
          <Button
            onClick={() => navigate('/cliente/login')}
            className="w-full h-14 text-lg bg-accent hover:bg-accent/90 text-accent-foreground gap-3 shadow-gold"
          >
            <Users className="w-5 h-5" />
            Soy Cliente
          </Button>
          <Button
            onClick={() => navigate('/staff/login')}
            variant="outline"
            className="w-full h-12 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10"
          >
            <Shield className="w-4 h-4 mr-2" />
            Acceso Personal
          </Button>
        </div>

        <p className="text-primary-foreground/40 text-xs">
          Desde 1984 · Quito, Ecuador
        </p>
      </div>
      </div>
      <div className="w-full text-primary-foreground/80">
        <SocialFooter />
      </div>
    </div>
  );
}
