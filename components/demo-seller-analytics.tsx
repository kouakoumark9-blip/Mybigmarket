import { BarChart3, Boxes, CircleDollarSign, PackageCheck } from "lucide-react";
import { formatXof } from "@/lib/demo-data";

const months = [
  { label: "Mai", amount: 340000 }, { label: "Juin", amount: 520000 }, { label: "Juil.", amount: 410000 },
  { label: "Août", amount: 760000 }, { label: "Sept.", amount: 620000 }, { label: "Oct.", amount: 910000 },
];
const products = [
  { name: "Sacs à dos scolaires", units: 38, amount: 684000 },
  { name: "Gourdes isothermes", units: 27, amount: 418500 },
  { name: "Accessoires téléphone", units: 19, amount: 266000 },
];
export function DemoSellerAnalytics() {
  const max = Math.max(...months.map((month) => month.amount));
  return <section className="demo-seller-analytics">
    <div className="demo-store-settings-heading"><div><span className="eyebrow">OUTIL VENDEUR · EXEMPLE</span><h2><BarChart3 size={17}/> Statistiques de vente</h2></div><span className="demo-publish-status">Fictif</span></div>
    <div className="demo-analytics-kpis"><div><CircleDollarSign size={15}/><span><b>{formatXof(3_560_000)}</b><small>volume sur 6 mois</small></span></div><div><PackageCheck size={15}/><span><b>42</b><small>commandes</small></span></div><div><Boxes size={15}/><span><b>126</b><small>unités</small></span></div></div>
    <div className="demo-analytics-chart" aria-label="Volume mensuel de démonstration">{months.map((month) => <div key={month.label}><span>{formatXof(month.amount)}</span><i><b style={{ height: `${Math.max(6, Math.round(month.amount / max * 100))}%` }}/></i><small>{month.label}</small></div>)}</div>
    <div className="demo-analytics-products"><b>Meilleures ventes</b>{products.map((product, index) => <div key={product.name}><span>{index + 1}</span><b>{product.name}</b><small>{product.units} unités · {formatXof(product.amount)}</small></div>)}</div>
    <p className="demo-analytics-note">Exemple visuel seulement : chiffres inventés, non liés aux commandes fictives du simulateur.</p>
  </section>;
}
