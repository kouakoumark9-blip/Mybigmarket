import type { ProductDescription } from "@/lib/pdp/types";
import { PdpImage } from "@/components/product-detail/shared";

export function DescriptionSection({ description, id }: { description: ProductDescription; id: string }) {
  return <section className="pd-section" id={id} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="pd-section-title">Description</h2>
    <div className="pd-description">
      {description.paragraphs.map((paragraph) => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)}
      {description.images.map((image) => <PdpImage key={image.src} src={image.src} alt={image.alt} width={1600} height={700} sizes="(max-width: 1260px) 100vw, 1220px" loading="lazy"/>)}
    </div>
  </section>;
}
