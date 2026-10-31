"use client";

import Image from "next/image";
import { useState } from "react";
import { Camera, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { DetailedProduct } from "@/lib/product";
import { FavoriteToggleButton } from "@/components/favorites-provider";

export function ProductGallery({ product, activeIndex, onSelect }: { product: DetailedProduct; activeIndex: number; onSelect: (index: number) => void }) {
  const [showAll, setShowAll] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const active = product.gallery[activeIndex] || product.gallery[0];
  const visibleImages = showAll ? product.gallery : product.gallery.slice(0, 6);
  const move = (delta: number) => onSelect((activeIndex + delta + product.gallery.length) % product.gallery.length);

  return <div className="pdp-gallery-column">
    <div className="pdp-gallery-layout">
      <div className={`pdp-thumbnails ${showAll ? "is-expanded" : ""}`} aria-label="Images du produit">
        {visibleImages.map((image, index) => <button type="button" key={`${image.src}-${index}`} className={`pdp-thumb ${index === activeIndex ? "is-active" : ""}`} onClick={() => onSelect(index)} aria-label={`Voir image ${index + 1} : ${image.alt}`} aria-pressed={index === activeIndex}>
          <Image src={image.src} alt="" width={76} height={76} sizes="76px"/>
        </button>)}
        {product.gallery.length > 6 && <button type="button" className="pdp-thumbs-more" onClick={() => setShowAll((value) => !value)} aria-label={showAll ? "Réduire les miniatures" : "Afficher plus de miniatures"}><ChevronDown size={18} className={showAll ? "rotate-180" : ""}/></button>}
      </div>
      <div className="pdp-main-image-wrap">
        <button type="button" className="pdp-main-image" onClick={() => setLightboxOpen(true)} aria-label={`Agrandir l’image : ${active.alt}`}>
          <Image src={active.src} alt={active.alt} width={900} height={900} priority sizes="(max-width: 1100px) 90vw, 38vw"/>
        </button>
        <div className="pdp-image-actions"><FavoriteToggleButton product={product} showLabel={false}/><button type="button" aria-label="Ouvrir l’image en grand format" onClick={() => setLightboxOpen(true)}><Camera size={18}/></button></div>
        <button type="button" className="pdp-gallery-next" onClick={() => move(1)} aria-label="Image suivante"><ChevronRight size={21}/></button>
        <div className="pdp-gallery-count">{activeIndex + 1} / {product.gallery.length}</div>
      </div>
    </div>
    {lightboxOpen && <div className="pdp-lightbox" role="dialog" aria-modal="true" aria-label="Agrandissement de la photo" onClick={() => setLightboxOpen(false)}>
      <button type="button" className="pdp-lightbox-close" aria-label="Fermer l’image" onClick={() => setLightboxOpen(false)}><X/></button>
      <button type="button" className="pdp-lightbox-prev" aria-label="Image précédente" onClick={(event) => { event.stopPropagation(); move(-1); }}><ChevronLeft/></button>
      <Image src={active.src} alt={active.alt} width={1200} height={1200} onClick={(event) => event.stopPropagation()}/>
      <button type="button" className="pdp-lightbox-next" aria-label="Image suivante" onClick={(event) => { event.stopPropagation(); move(1); }}><ChevronRight/></button>
    </div>}
  </div>;
}
