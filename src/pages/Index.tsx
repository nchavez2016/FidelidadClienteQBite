import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandHeader from "@/components/BrandHeader";
import { appRoute } from "@/lib/navigation";
import { loadCustomerLoginPage, loadStaffLoginPage } from "@/lib/routePreload";
import { Facebook, Instagram, MessageCircle, Music2, Shield, Users, type LucideIcon } from "lucide-react";

type SocialLink = {
  name: string;
  href: string;
  handle: string;
  icon: LucideIcon;
};

const socialLinks: SocialLink[] = [
  {
    name: "Instagram",
    href: "https://instagram.com/qbites.ec",
    handle: "@qbites.ec",
    icon: Instagram,
  },
  {
    name: "Facebook",
    href: "https://facebook.com/share/19aTJCqfFQ",
    handle: "Facebook",
    icon: Facebook,
  },
  {
    name: "TikTok",
    href: "https://tiktok.com/@qbites.ec",
    handle: "@qbites.ec",
    icon: Music2,
  },
  {
    name: "WhatsApp",
    href: "https://wa.me/593993763382",
    handle: "Escríbenos",
    icon: MessageCircle,
  },
];

function SocialFooter() {
  return (
    <footer className="w-full py-6 px-4">
      <div className="max-w-md mx-auto flex items-center justify-center gap-6">
        {socialLinks.map((link) => {
          const Icon = link.icon;
          return (
            <a
              key={link.name}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${link.name} ${link.handle}`}
              className="flex flex-col items-center gap-1 text-xs opacity-80 hover:opacity-100 transition-opacity"
            >
              <Icon className="w-5 h-5" />
              <span>{link.name}</span>
            </a>
          );
        })}
      </div>
    </footer>
  );
}

export default function Index() {
  const navigate = useNavigate();

  const goCustomerLogin = async () => {
    await loadCustomerLoginPage();
    navigate(appRoute("/cliente/login"));
  };

  const goStaffLogin = async () => {
    await loadStaffLoginPage();
    navigate(appRoute("/staff/login"));
  };

  return (
    <div className="min-h-screen bg-gradient-navy flex flex-col items-center p-4">
      <div className="flex-1 flex items-center justify-center w-full">
        <div className="text-center space-y-8 max-w-md w-full">
          <BrandHeader background="dark" />
          <div>
            <h1 className="text-3xl font-heading font-bold text-primary-foreground mb-2">Programa de Fidelidad</h1>
            <p className="text-primary-foreground/70 text-sm">Acumula puntos y gana premios increíbles</p>
          </div>

          <div className="space-y-3">
            <Button
              onMouseEnter={loadCustomerLoginPage}
              onFocus={loadCustomerLoginPage}
              onPointerDown={loadCustomerLoginPage}
              onClick={() => void goCustomerLogin()}
              className="w-full h-14 text-lg bg-accent hover:bg-accent/90 text-accent-foreground gap-3 shadow-gold"
            >
              <Users className="w-5 h-5" />
              Soy Cliente
            </Button>
            <Button
              onMouseEnter={loadStaffLoginPage}
              onFocus={loadStaffLoginPage}
              onPointerDown={loadStaffLoginPage}
              onClick={() => void goStaffLogin()}
              variant="outline"
              className="w-full h-12 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10"
            >
              <Shield className="w-4 h-4 mr-2" />
              Acceso Personal
            </Button>
          </div>

          <p className="text-primary-foreground/40 text-xs">All In Burgers by Qbites · Quito, Ecuador</p>
        </div>
      </div>
      <div className="w-full text-primary-foreground/80">
        <SocialFooter />
      </div>
    </div>
  );
}
