"use client";

import { forwardRef, useEffect, useState } from "react";

export type TabItem = { id: string; label: string };

/** Suit la section visible pour surligner l'onglet correspondant. */
export function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0] || "");
  useEffect(() => {
    const targets = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el));
    if (!targets.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: "-160px 0px -55% 0px" });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

type Props = { tabs: readonly TabItem[]; active: string; floating?: boolean; visible?: boolean };

export const TabsBar = forwardRef<HTMLElement, Props>(function TabsBar({ tabs, active, floating = false, visible = true }, ref) {
  const go = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };
  return <nav ref={ref} className={`pd-tabs${floating ? " is-floating" : ""}${floating && visible ? " is-visible" : ""}`} aria-label="Sections de la fiche produit" aria-hidden={floating && !visible ? true : undefined} inert={floating && !visible ? true : undefined}>
    <div className="pd-tabs-inner">
      {tabs.map((tab) => <a key={tab.id} href={`#${tab.id}`} onClick={(event) => go(event, tab.id)} className={active === tab.id ? "is-active" : ""} aria-current={active === tab.id ? "true" : undefined}>{tab.label}</a>)}
    </div>
  </nav>;
});
