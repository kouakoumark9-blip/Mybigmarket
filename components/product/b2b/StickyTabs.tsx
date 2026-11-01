"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Onglets collants avec suivi de lecture.
 *
 * IntersectionObserver plutôt qu'un écouteur de scroll : le coût est constant et
 * l'onglet actif correspond vraiment à la section visible, même quand des images
 * chargent et décalent la page. Le clic fait un défilement fluide qui tient
 * compte de la hauteur de la barre collée (sinon le titre passe dessous).
 */

export type TabDefinition = { id: string; label: string };

export function StickyTabs({ tabs }: { tabs: TabDefinition[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const barHeight = useRef(0);

  useEffect(() => {
    const sections = tabs
      .map((tab) => document.getElementById(tab.id))
      .filter((section): section is HTMLElement => section !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // On retient la section visible la plus haute : celle que le lecteur voit en premier.
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: [0, 1] },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [tabs]);

  const go = (id: string) => {
    const section = document.getElementById(id);
    if (!section) return;
    const offset = section.getBoundingClientRect().top + window.scrollY - (barHeight.current || 96) - 8;
    window.scrollTo({ top: offset, behavior: "smooth" });
    setActive(id);
  };

  return <nav
    className="b2b-tabs"
    aria-label="Sections de la fiche produit"
    ref={(node) => { barHeight.current = node?.offsetHeight ?? 0; }}
  >
    {tabs.map((tab) => <button
      key={tab.id}
      type="button"
      className={active === tab.id ? "is-active" : undefined}
      aria-current={active === tab.id ? "true" : undefined}
      onClick={() => go(tab.id)}
    >
      {tab.label}
    </button>)}
  </nav>;
}
