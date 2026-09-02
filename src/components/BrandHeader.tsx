import logoLight from '@/assets/logo-qbites.png';
import logoDark from '@/assets/logo-qbites-dark.svg';

interface BrandHeaderProps {
  subtitle?: string;
  /** Fondo sobre el que se renderiza el header: 'light' (tarjeta blanca, usa logo oscuro) o 'dark' (fondo negro de marca, usa logo claro). */
  background?: 'light' | 'dark';
}

export default function BrandHeader({ subtitle, background = 'light' }: BrandHeaderProps) {
  const logo = background === 'dark' ? logoLight : logoDark;
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <img src={logo} alt="Qbites" className="h-32 w-auto" />
      {subtitle && <p className="text-sm text-muted-foreground font-body">{subtitle}</p>}
    </div>
  );
}
