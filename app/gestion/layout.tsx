import type { Metadata } from "next";
import "./gestion.css";

/** Administration : jamais indexée, absente du sitemap et du menu public. */
export const metadata: Metadata = { title: { absolute: "Administration" }, robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default function GestionLayout({ children }: { children: React.ReactNode }) {
  return <div className="gs">{children}</div>;
}
