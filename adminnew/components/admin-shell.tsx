"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Activity, ArrowLeftRight, BadgePercent, Bell, Bot, Boxes, Calculator, ChevronRight, CircleHelp, ClipboardList, CreditCard, FileText, Globe2, Headset, History, Image, Inbox, LayoutDashboard, ListChecks, MapPin, Menu, MessageSquareQuote, PackageSearch, Percent, Plane, Ruler, Search, Settings2, Shield, Tags, Ticket, Trash2, TriangleAlert, Truck, Undo2, UserCog, Users, Warehouse, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { can, isPermissionCode } from "@/lib/permission-matrix";

type NavItem = { label: string; href: string; permission: string; icon?: typeof Boxes; implemented?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  { label: "Pilotage", items: [
    { label: "Tableau de bord", href: "/", permission: "dashboard.read", icon: LayoutDashboard, implemented: true },
    { label: "Assistant IA", href: "/assistant-ia", permission: "ai.use", icon: Bot, implemented: true },
  ] },
  { label: "Ventes", items: [
    { label: "Commandes", href: "/commandes", permission: "orders.read", icon: ClipboardList, implemented: true },
    { label: "Retours produits", href: "/commandes/retours", permission: "support.disputes.manage", icon: Undo2, implemented: true },
    { label: "Factures et avoirs", href: "/factures", permission: "orders.documents.manage", icon: FileText, implemented: true },
  ] },
  { label: "Catalogue", items: [
    { label: "Produits", href: "/catalogue/produits", permission: "catalog.products.read", icon: PackageSearch, implemented: true },
    { label: "Catégories et marques", href: "/catalogue/categories", permission: "catalog.categories.manage", icon: Boxes, implemented: true },
    { label: "Fournisseurs", href: "/catalogue/fournisseurs", permission: "catalog.suppliers.manage", icon: Users, implemented: true },
    { label: "Attributs", href: "/catalogue/attributs", permission: "catalog.attributes.read", icon: Tags, implemented: true },
    { label: "Caractéristiques", href: "/catalogue/caracteristiques", permission: "catalog.features.read", icon: ListChecks, implemented: true },
    { label: "Stock", href: "/catalogue/stock", permission: "catalog.stock.read", icon: Boxes, implemented: true },
    { label: "Opérations de stock", href: "/catalogue/stock/operations", permission: "catalog.stock.update", icon: ArrowLeftRight, implemented: true },
    { label: "Mouvements de stock", href: "/catalogue/stock/mouvements", permission: "catalog.stock.read", icon: History, implemented: true },
    { label: "Alertes et réappro", href: "/catalogue/stock/alertes", permission: "catalog.stock.read", icon: TriangleAlert, implemented: true },
    { label: "Entrepôts", href: "/catalogue/entrepots", permission: "catalog.stock.read", icon: Warehouse, implemented: true },
    { label: "Avis", href: "/catalogue/avis", permission: "catalog.reviews.moderate", icon: CircleHelp, implemented: true },
    { label: "Corbeille", href: "/catalogue/corbeille", permission: "catalog.trash.manage", icon: Trash2, implemented: true },
  ] },
  { label: "Relations clients", items: [
    { label: "Clients et adresses", href: "/clients", permission: "customers.read", icon: Users, implemented: true },
    { label: "Groupes de clients", href: "/clients/groupes", permission: "customers.manage", icon: UserCog, implemented: true },
    { label: "Corbeille clients", href: "/clients/corbeille", permission: "customers.manage", icon: Trash2, implemented: true },
    { label: "Tickets clients", href: "/service-client/tickets", permission: "support.read", icon: Inbox, implemented: true },
    { label: "Modèles de réponse", href: "/service-client/modeles", permission: "support.read", icon: MessageSquareQuote, implemented: true },
    { label: "Conversations", href: "/service-client", permission: "support.messages.read", icon: Headset, implemented: true },
  ] },
  { label: "Opérations", items: [
    { label: "Transport", href: "/transport", permission: "shipping.read", icon: Truck, implemented: true },
    { label: "Transporteurs", href: "/transport/methodes", permission: "shipping.manage", icon: Plane, implemented: true },
    { label: "Zones de livraison", href: "/transport/zones", permission: "shipping.manage", icon: MapPin, implemented: true },
    { label: "Tranches tarifaires", href: "/transport/tarifs", permission: "shipping.manage", icon: Ruler, implemented: true },
    { label: "Paliers de remise", href: "/transport/paliers", permission: "shipping.manage", icon: BadgePercent, implemented: true },
    { label: "Simulateur de devis", href: "/transport/simulateur", permission: "shipping.read", icon: Calculator, implemented: true },
    { label: "Corbeille transport", href: "/transport/corbeille", permission: "shipping.manage", icon: Trash2, implemented: true },
    { label: "Paiement", href: "/paiement", permission: "payments.read", icon: CreditCard, implemented: true },
  ] },
  { label: "Boutique", items: [
    { label: "Apparence et pages", href: "/apparence", permission: "appearance.manage", icon: Image, implemented: true },
    { label: "Marketing", href: "/marketing", permission: "marketing.manage", icon: BadgePercent, implemented: true },
    { label: "Bons de réduction", href: "/marketing/bons", permission: "pricing.read", icon: Ticket, implemented: true },
    { label: "Règles de prix", href: "/marketing/regles", permission: "pricing.read", icon: Percent, implemented: true },
    { label: "Statistiques", href: "/statistiques", permission: "analytics.read", icon: Activity, implemented: true },
  ] },
  { label: "Configuration", items: [
    { label: "Paramètres", href: "/parametres", permission: "settings.read", icon: Settings2, implemented: true },
    { label: "Employés et rôles", href: "/employes", permission: "employees.manage", icon: Shield, implemented: true },
  ] },
  { label: "Mon compte", items: [
    { label: "Sécurité du compte", href: "/securite", permission: "dashboard.read", icon: Shield, implemented: true },
  ] },
];

const roleLabels: Record<string, string> = {
  super_admin: "SuperAdmin",
  catalog_manager: "Gestionnaire catalogue",
  orders_manager: "Gestionnaire commandes",
  logistician: "Logisticien",
  customer_service: "Service client",
};

export function AdminShell({ children, user }: { children: ReactNode; user: { name: string; email: string; roleCode: string; permissions: string[] } }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Même règle que l'API : `.manage` accorde toute la ressource, une écriture accorde la lecture.
  const allowed = (code: string) => (isPermissionCode(code) ? can(user.permissions, code) : user.permissions.includes(code));
  const groups = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => allowed(item.permission)) })).filter((group) => group.items.length > 0);
  // L'entrée active est la plus précise (« Mouvements de stock » plutôt que « Stock »).
  const activeHref = groups.flatMap((group) => group.items.map((item) => item.href))
    .filter((href) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
  const initials = user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "M";

  return <div className="admin-frame">
    <aside className={`admin-sidebar ${mobileOpen ? "is-open" : ""}`} aria-label="Navigation d’administration">
      <div className="admin-brand"><div className="admin-brand-mark">M</div><div><b>mybigmarket</b><small>Administration privée</small></div><button className="ml-auto rounded p-2 text-slate-300 hover:bg-white/10 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu"><X size={17}/></button></div>
      <nav className="admin-nav">
        {groups.map((group) => <div key={group.label}>
          <p className="admin-nav-group">{group.label}</p>
          {group.items.map((item) => {
            const Icon = item.icon || Boxes;
            const active = item.href === activeHref;
            if (!item.implemented) return <div key={item.href} className="admin-nav-link" aria-disabled="true" title="Ce module sera activé lors de son étape de livraison"><Icon size={16}/><span>{item.label}</span><span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[9px]">À venir</span></div>;
            return <Link key={item.href} className={`admin-nav-link ${active ? "active" : ""}`} href={item.href} onClick={() => setMobileOpen(false)}><Icon size={16}/><span>{item.label}</span>{active && <ChevronRight size={14} className="ml-auto"/>}</Link>;
          })}
        </div>)}
      </nav>
      <div className="admin-sidebar-footer">Espace réservé aux employés.<br/>Les accès sont journalisés.</div>
    </aside>
    {mobileOpen && <button className="fixed inset-0 z-30 bg-slate-950/50 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu"/>}
    <div className="admin-main">
      <header className="admin-topbar">
        <div className="admin-topbar-left"><Button variant="ghost" className="admin-mobile-menu !px-2" aria-label="Ouvrir le menu" onClick={() => setMobileOpen(true)}><Menu size={19}/></Button><label className="admin-search"><Search size={15}/><input aria-label="Recherche globale" placeholder="Rechercher dans l’administration…"/></label></div>
        <div className="admin-topbar-actions"><a className="hidden items-center gap-2 rounded-md px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:inline-flex" href="https://mybigmarket.vercel.app" target="_blank" rel="noreferrer">Voir la boutique <Globe2 size={15}/></a><Button variant="ghost" className="!relative !px-2" aria-label="Notifications"><Bell size={17}/></Button><div className="admin-employee-menu"><div className="admin-avatar" aria-hidden="true">{initials}</div><div className="hidden sm:block"><div className="admin-employee-name">{user.name}</div><div className="admin-employee-role">{roleLabels[user.roleCode] || "Employé"}</div></div><Button variant="ghost" className="!px-2" onClick={() => signOut({ callbackUrl: "/login" })} aria-label="Se déconnecter">Déconnexion</Button></div></div>
      </header>
      <main className="admin-content">{children}</main>
    </div>
  </div>;
}
