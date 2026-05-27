import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import BrandHeader from '@/components/BrandHeader';
import { Users, Shield } from 'lucide-react';

const socialLinks = [
  { name: 'Instagram', href: 'https://www.instagram.com/lagaviotaazulexpress/', handle: '@lagaviotaazulexpress' },
  { name: 'TikTok', href: 'https://www.tiktok.com/@lagaviotaazulexpr', handle: '@lagaviotaazulexpr' },
  { name: 'WhatsApp', href: 'https://api.whatsapp.com/send/?phone=593993763382&text&type=phone_number&app_absent=0', handle: '+593 99 376 3382' },
];

function SocialIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true" className="h-12 w-12 drop-shadow-md sm:h-14 sm:w-14">
      <rect width="96" height="96" rx="24" fill="hsl(var(--primary))" />
      <rect x="13" y="13" width="70" height="70" rx="20" fill="hsl(var(--accent))" />
      {name === 'Instagram' && (
        <>
          <rect x="25" y="25" width="46" height="46" rx="14" fill="none" stroke="hsl(var(--primary))" strokeWidth="7" />
          <circle cx="48" cy="48" r="12" fill="none" stroke="hsl(var(--primary))" strokeWidth="7" />
          <circle cx="63" cy="33" r="5" fill="hsl(var(--primary))" />
        </>
      )}
      {name === 'TikTok' && <path d="M56 24v26.5C56 61.7 47.3 70 36.3 70 27.2 70 20 62.9 20 54.1c0-8.9 7.2-16 16.2-16 2 0 3.8.3 5.5 1v10.4a7.3 7.3 0 0 0-5.5-2.4 6.9 6.9 0 0 0-7 7c0 4 3.1 7 7.1 7 4.5 0 7.6-3.4 7.6-8.6V24H56Zm0 0c2.2 9.2 8.1 14.3 17 15.3v10.4c-6.4-.4-12.1-2.7-17-6.8V24Z" fill="hsl(var(--primary))" />}
      {name === 'WhatsApp' && <path d="M48 22c-14.4 0-26 10.8-26 24.1 0 4.5 1.3 8.7 3.7 12.4L22 74l16.4-3.5c3 1.1 6.2 1.7 9.6 1.7 14.4 0 26-10.8 26-24.1S62.4 22 48 22Zm0 42.2c-3 0-5.8-.6-8.4-1.8l-1.4-.6-6.7 1.4 1.5-6.2-.9-1.4a17 17 0 0 1-2.9-9.5c0-9 8.4-16.3 18.8-16.3S66.8 37.1 66.8 46 58.4 64.2 48 64.2Zm9.8-12.7c-.5-.3-3.2-1.5-3.7-1.7-.5-.2-.9-.3-1.3.3-.4.5-1.4 1.7-1.8 2-.3.4-.7.4-1.2.1-.5-.3-2.3-.8-4.3-2.6-1.6-1.4-2.7-3.1-3-3.6-.3-.6 0-.9.3-1.2.3-.3.6-.7.9-1 .3-.4.4-.6.6-1 .2-.4.1-.8 0-1-.2-.3-1.3-3-1.8-4.1-.5-1.1-1-1-1.3-1h-1.1c-.4 0-1 .1-1.5.7-.5.5-2 1.9-2 4.6 0 2.8 2 5.4 2.3 5.8.3.4 4 6 9.6 8.4 1.4.6 2.4.9 3.3 1.2 1.4.4 2.6.3 3.6.2 1.1-.2 3.2-1.3 3.7-2.5.5-1.3.5-2.4.3-2.6-.2-.2-.6-.4-1.2-.7Z" fill="hsl(var(--primary))" />}
    </svg>
  );
}

function SocialFooter() {
  return (
    <footer className="mt-8 w-full border-t border-accent/30 bg-primary/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Síguenos</p>
        <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6">
          {socialLinks.map((link) => (
            <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`${link.name} ${link.handle}`} title={`${link.name} · ${link.handle}`} className="group inline-flex flex-col items-center gap-1 transition-transform hover:scale-110 active:scale-95">
              <SocialIcon name={link.name} />
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
