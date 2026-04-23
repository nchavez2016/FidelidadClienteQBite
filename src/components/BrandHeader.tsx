import logo from '@/assets/logo.png';

export default function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <img src={logo} alt="La Gaviota Azul Express" className="h-20 w-auto" />
      {subtitle && <p className="text-sm text-muted-foreground font-body">{subtitle}</p>}
    </div>
  );
}
