"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, MessageSquare } from "lucide-react";
import type { Review, ReviewSummary } from "@/lib/pdp/types";
import { PdpImage, Stars } from "@/components/product-detail/shared";

type Filter = "all" | "photos" | 1 | 2 | 3 | 4 | 5;

export function ReviewsSection({ summary, id }: { summary: ReviewSummary; id: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const total = summary.distribution?.reduce((sum, value) => sum + value, 0) || summary.count;
  const photos = summary.items.flatMap((review) => review.photos ?? []);
  const items = useMemo(() => summary.items.filter((review: Review) => filter === "all" || (filter === "photos" ? Boolean(review.photos?.length) : review.rating === filter)), [summary.items, filter]);
  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "Tous" },
    { id: "photos", label: `Avec photos (${summary.items.filter((review) => review.photos?.length).length})` },
    ...([5, 4, 3, 2, 1] as const).map((stars) => ({ id: stars as Filter, label: `${stars} étoile${stars > 1 ? "s" : ""}` })),
  ];

  return <section className="pd-section" id={id} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="pd-section-title">Avis clients</h2>
    <div className="pd-reviews-top">
      <div className="pd-reviews-score">
        <strong>{summary.average.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
        <Stars value={summary.average} size={16}/>
        <span className="pd-muted">{summary.count.toLocaleString("fr-FR")} avis</span>
      </div>
      {summary.distribution && <ul className="pd-reviews-bars" aria-label="Répartition des notes">
        {summary.distribution.map((value, index) => {
          const stars = 5 - index;
          const percent = total ? Math.round((value / total) * 100) : 0;
          return <li key={stars}><span>{stars} ★</span><span className="pd-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${stars} étoiles : ${percent} %`}><i style={{ width: `${percent}%` }}/></span><span>{value}</span></li>;
        })}
      </ul>}
    </div>
    {photos.length > 0 && <ul className="pd-review-photos" aria-label="Photos des clients">{photos.map((photo) => <li key={photo.src}><PdpImage src={photo.src} alt={photo.alt} width={96} height={96} sizes="96px" loading="lazy"/></li>)}</ul>}
    {summary.items.length > 0 ? <><div className="pd-chips pd-review-filters" role="group" aria-label="Filtrer les avis">
      {filters.map((item) => <button key={String(item.id)} type="button" className={`pd-chip${filter === item.id ? " is-selected" : ""}`} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
    </div>
    {items.length ? <ul className="pd-review-list">
      {items.map((review) => <li key={review.id} className="pd-review">
        <header><b>{review.author}</b>{review.country && <span className="pd-muted"> · {review.country}</span>}<time className="pd-muted" dateTime={review.date}>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(review.date))}</time></header>
        <p className="pd-review-meta"><Stars value={review.rating} size={13}/>{review.verified && <span className="pd-verified"><BadgeCheck size={13} strokeWidth={1.75} aria-hidden="true"/> Achat vérifié</span>}</p>
        <p>{review.text}</p>
        {review.photos?.length ? <ul className="pd-review-photos is-inline">{review.photos.map((photo) => <li key={photo.src}><PdpImage src={photo.src} alt={photo.alt} width={72} height={72} sizes="72px" loading="lazy"/></li>)}</ul> : null}
      </li>)}
    </ul> : <p className="pd-empty"><MessageSquare size={18} strokeWidth={1.5} aria-hidden="true"/> Aucun avis ne correspond à ce filtre.</p>}</>
    : <p className="pd-empty"><MessageSquare size={18} strokeWidth={1.5} aria-hidden="true"/> Les commentaires détaillés des acheteurs s&apos;afficheront ici après leurs premières commandes.</p>}
  </section>;
}
