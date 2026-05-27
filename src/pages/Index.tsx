import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import BrandHeader from '@/components/BrandHeader';
import { Users, Shield } from 'lucide-react';
import socialInstagram from '@/assets/social-instagram.png';
import socialTiktok from '@/assets/social-tiktok.png';
import socialWhatsapp from '@/assets/social-whatsapp.png';

const socialLinks = [
  { name: 'Instagram', href: 'https://www.instagram.com/lagaviotaazulexpress/', handle: '@lagaviotaazulexpress', icon: socialInstagram },
  { name: 'TikTok', href: 'https://www.tiktok.com/@lagaviotaazulexpr', handle: '@lagaviotaazulexpr', icon: socialTiktok },
  { name: 'WhatsApp', href: 'https://api.whatsapp.com/send/?phone=593993763382&text&type=phone_number&app_absent=0', handle: '+593 99 376 3382', icon: socialWhatsapp },
];

function SocialFooter() {
  return (
    <footer className="mt-8 w-full border-t border-accent/30 bg-primary/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Síguenos</p>
        <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6">
          {socialLinks.map((link) => (
            <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`${link.name} ${link.handle}`} title={`${link.name} · ${link.handle}`} className="group inline-flex flex-col items-center gap-1 transition-transform hover:scale-110 active:scale-95">
              <img src={link.icon} alt={link.name} loading="lazy" className="h-14 w-14 drop-shadow-md sm:h-16 sm:w-16" />
              <span className="text-[10px] text-primary-foreground/70 group-hover:text-accent">{link.name}</span>
            </a>
          ))}
        </div>
        <p className="text-[10px] text-primary-foreground/50">© {new Date().getFullYear()} Cevichería Gaviota Azul</p>
      </div>
    </footer>
  );
}

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
