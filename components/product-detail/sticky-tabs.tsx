"use client";

import { useEffect, useState } from "react";

const tabs = [
  { id: "pdp-attributes", label: "Attribut" },
  { id: "pdp-reviews", label: "Avis" },
  { id: "pdp-supplier", label: "Fournisseur" },
  { id: "pdp-description", label: "Description" },
];

export function StickyTabs() {
  const [active, setActive] = useState(tabs[0].id);
  useEffect(() => {
    const targets = tabs.map((tab) => document.getElementById(tab.id)).filter((item): item is HTMLElement => Boolean(item));
    if (!targets.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: "-130px 0px -62% 0px", threshold: [0, .1, .4, .7] });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return <nav className="pdp-sticky-tabs" aria-label="Sections de la fiche produit">{tabs.map((tab) => <a href={`#${tab.id}`} key={tab.id} className={active === tab.id ? "is-active" : ""} aria-current={active === tab.id ? "location" : undefined}>{tab.label}</a>)}</nav>;
}
