import { Building2, Clock3, Globe2, ShieldAlert } from "lucide-react";
import type { DetailedProduct } from "@/lib/product";

export function SupplierCard({ product }: { product: DetailedProduct }) {
  const supplier = product.supplier;
  return <section className="pdp-supplier-card" id="pdp-supplier" aria-labelledby="pdp-supplier-title">
    <div className="pdp-supplier-head"><div className="pdp-supplier-logo" aria-hidden="true">SN</div><div className="pdp-supplier-name"><h2 id="pdp-supplier-title">{supplier.company}</h2><span><i className="pdp-country-mark">{supplier.countryCode}</i> Chine · Profil illustratif · {supplier.yearsActive} ans (exemple)</span></div><a href="#pdp-supplier-details" className="pdp-chevron-link" aria-label="Voir les informations du fournisseur"><Building2 size={17}/></a></div>
    <div className="pdp-supplier-metrics">
      <div><strong>{supplier.rating} <small>({supplier.reviewCount})</small></strong><span>Note de boutique (démo)</span></div>
      <div><strong><Clock3 size={13}/> {supplier.responseTime}</strong><span>Temps de réponse indicatif</span></div>
      <div><strong>{supplier.onTimeDelivery}</strong><span>Taux de livraison illustratif</span></div>
    </div>
    <div className="pdp-supplier-markets"><Globe2 size={15}/><span>Marchés cités (exemple) : {supplier.markets.join(", ")}</span></div>
    <div className="pdp-supplier-footer"><span><ShieldAlert size={15}/> Informations non vérifiées</span><a href="#pdp-supplier-details">Consulter le profil <span aria-hidden="true">›</span></a></div>
    <p id="pdp-supplier-details" className="pdp-supplier-disclaimer">{supplier.disclaimer}</p>
  </section>;
}
