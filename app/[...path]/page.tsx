import { notFound, permanentRedirect, redirect } from "next/navigation";
import { db } from "@/server/core/db";
import { resolveRedirect } from "@/server/modules/cms/service";

export const dynamic = "force-dynamic";

/**
 * Adresse inconnue (aucune autre route ne correspond) : redirection gérée dans l'administration
 * (301/308 permanente ou 302 temporaire), sinon page introuvable. Les routes existantes passent avant.
 * Adresse mal encodée ou base indisponible : page introuvable, jamais d'erreur 500.
 */
export default async function UnknownPath({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = process.env.DATABASE_URL ? await Promise.resolve().then(() => resolveRedirect(db(), `/${path.map((segment) => decodeURIComponent(segment)).join("/")}`)).catch(() => null) : null;
  if (target) (target.permanent ? permanentRedirect : redirect)(target.location);
  notFound();
}
