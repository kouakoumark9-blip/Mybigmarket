import { count, desc, eq } from "drizzle-orm";
import { MessageSquareText, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminProducts, adminReviews, adminUsers } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { moderateReviewAction } from "./actions";

export const dynamic = "force-dynamic";
const notices: Record<string, string> = { updated: "Modération enregistrée.", error: "La modération n’a pas abouti. Réessaie." };
const ratingLabel = (rating: number) => `${rating}/5`;
const dateLabel = (date: Date) => new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric" }).format(date);

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string; notice?: string }> }) {
  await requireEmployee("catalog.reviews.moderate");
  const params = await searchParams;
  const status = params.status === "published" ? "published" : params.status === "pending" ? "pending" : "all";
  const filter = status === "published" ? eq(adminReviews.isPublished, true) : status === "pending" ? eq(adminReviews.isPublished, false) : undefined;
  const db = getAdminDb();
  const [reviews, pendingCount, publishedCount] = await Promise.all([
    db.select({ id: adminReviews.id, rating: adminReviews.rating, comment: adminReviews.comment, verifiedPurchase: adminReviews.verifiedPurchase, isPublished: adminReviews.isPublished, createdAt: adminReviews.createdAt, productTitle: adminProducts.title, buyerName: adminUsers.name })
      .from(adminReviews).leftJoin(adminProducts, eq(adminReviews.productId, adminProducts.id)).leftJoin(adminUsers, eq(adminReviews.buyerId, adminUsers.id)).where(filter).orderBy(desc(adminReviews.createdAt)).limit(100),
    db.select({ value: count() }).from(adminReviews).where(eq(adminReviews.isPublished, false)),
    db.select({ value: count() }).from(adminReviews).where(eq(adminReviews.isPublished, true)),
  ]);
  const notice = params.notice ? notices[params.notice] : undefined;

  return <>
    <div className="admin-breadcrumb"><span>Catalogue</span><span>/</span><strong>Avis</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Modération des avis</h1><p className="admin-page-subtitle">Examine les avis réellement soumis avant leur affichage public.</p></div></div>
    {notice && <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700" role="status">{notice}</p>}
    <div className="mb-5 flex flex-wrap gap-2"><a href="/catalogue/avis" className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${status === "all" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}>Tous ({Number(pendingCount[0]?.value || 0) + Number(publishedCount[0]?.value || 0)})</a><a href="/catalogue/avis?status=pending" className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${status === "pending" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}>À examiner ({Number(pendingCount[0]?.value || 0)})</a><a href="/catalogue/avis?status=published" className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${status === "published" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}>Publiés ({Number(publishedCount[0]?.value || 0)})</a></div>
    <Card>
      {reviews.length ? <div className="divide-y divide-slate-100">{reviews.map((review) => <article key={review.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">{ratingLabel(review.rating)}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${review.verifiedPurchase ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{review.verifiedPurchase ? "Achat vérifié" : "Achat non vérifié"}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${review.isPublished ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800"}`}>{review.isPublished ? "Publié" : "En attente"}</span></div><h2 className="font-semibold text-slate-900">{review.productTitle || "Produit supprimé"}</h2><p className="mt-1 text-sm leading-6 text-slate-700">{review.comment || "Aucun commentaire écrit."}</p><p className="mt-2 text-xs text-slate-500">{review.buyerName || "Client"} · {dateLabel(review.createdAt)}</p></div><form action={moderateReviewAction}><input type="hidden" name="id" value={review.id}/><input type="hidden" name="visibility" value={review.isPublished ? "hide" : "publish"}/><button type="submit" className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold ${review.isPublished ? "border border-slate-200 bg-white text-slate-700" : "bg-slate-950 text-white"}`}>{review.isPublished ? "Retirer du site" : "Publier l’avis"}</button></form></article>)}</div> : <div className="admin-empty"><MessageSquareText size={22} className="mb-2 text-slate-400"/><strong>Aucun avis à afficher</strong>Les avis réels soumis par les clients apparaîtront ici avant modération.</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-700"/><span>Les avis de démonstration ne sont pas seedés. La publication et le retrait sont journalisés; la mention « Achat vérifié » n’apparaît que si la commande est confirmée.</span></div>
    </Card>
  </>;
}
