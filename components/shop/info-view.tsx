import Link from "next/link";
import { Breadcrumbs } from "./breadcrumbs";
import { INFO_PAGES, LEGAL, type InfoPage } from "@/lib/shop/pages";
import { whatsappLink } from "@/lib/shop/config";

export function InfoView({ page }: { page: InfoPage }) {
  const legal = page.slug === "mentions-legales" ? [LEGAL.ownerName && `Éditeur : ${LEGAL.ownerName}`, LEGAL.registration && `Immatriculation : ${LEGAL.registration}`, LEGAL.address && `Adresse : ${LEGAL.address}`].filter(Boolean) as string[] : [];
  return <>
    <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: page.title }]}/>
    <div className="mb-info-layout">
      <nav className="mb-info-nav" aria-label="Informations">
        {INFO_PAGES.map((item) => <Link key={item.slug} href={`/${item.slug}`} aria-current={item.slug === page.slug ? "page" : undefined}>{item.title}</Link>)}
      </nav>
      <article className="mb-info">
        <h1 className="mb-title">{page.title}</h1>
        <p className="mb-intro">{page.intro}</p>
        {legal.length > 0 && <ul>{legal.map((line) => <li key={line}>{line}</li>)}</ul>}
        {page.sections.map((section, index) => <section key={index}>
          {section.h && <h2>{section.h}</h2>}
          {section.p?.map((text) => <p key={text.slice(0, 40)}>{text}</p>)}
          {section.ul && <ul>{section.ul.map((text) => <li key={text}>{text}</li>)}</ul>}
          {section.ol && <ol>{section.ol.map((text) => <li key={text}>{text}</li>)}</ol>}
        </section>)}
        {page.slug === "contact" && <p><a className="mb-btn mb-btn--whatsapp" href={whatsappLink()} rel="noopener">Écrire sur WhatsApp</a></p>}
      </article>
    </div>
  </>;
}
