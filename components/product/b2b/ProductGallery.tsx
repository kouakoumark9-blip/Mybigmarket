"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Heart, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Galerie produit : miniatures verticales + image principale.
 *
 * Comportements imposés par la maquette :
 *  - miniature active bordée de noir, flèche « ↓ » pour faire défiler la colonne ;
 *  - flèches rondes sur l'image, changement sans rechargement ;
 *  - zoom au survol (desktop), plein écran au clic, balayage tactile ;
 *  - clavier : flèches gauche/droite, Échap pour fermer le plein écran.
 */

export type GalleryImage = { url: string; alt: string };

type Props = {
  images: GalleryImage[];
  title: string;
  favorite: boolean;
  onToggleFavorite: () => void;
  visualSearchEnabled?: boolean;
};

const VISIBLE_THUMBS = 6;

export function ProductGallery({ images, title, favorite, onToggleFavorite, visualSearchEnabled = true }: Props) {
  const safeImages = images.length > 0 ? images : [{ url: "", alt: title }];
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [fullscreen, setFullscreen] = useState(false);
  const touchStart = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const go = useCallback((next: number) => {
    setIndex(((next % safeImages.length) + safeImages.length) % safeImages.length);
  }, [safeImages.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
      if (fullscreen && event.key === "ArrowRight") go(index + 1);
      if (fullscreen && event.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, go, index]);

  const active = safeImages[index];
  const canScrollThumbs = safeImages.length > VISIBLE_THUMBS;

  return <div className="b2b-gallery">
    <div className="b2b-gallery-main">
      <div
        className={`b2b-gallery-stage${zoomed ? " is-zoomed" : ""}`}
        onMouseEnter={() => setZoomed(true)}
        onMouseLeave={() => setZoomed(false)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setOrigin({
            x: ((event.clientX - rect.left) / rect.width) * 100,
            y: ((event.clientY - rect.top) / rect.height) * 100,
          });
        }}
        onClick={() => setFullscreen(true)}
        onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }}
        onTouchEnd={(event) => {
          if (touchStart.current === null) return;
          const delta = event.changedTouches[0].clientX - touchStart.current;
          if (Math.abs(delta) > 40) go(delta < 0 ? index + 1 : index - 1);
          touchStart.current = null;
        }}
        role="button"
        tabIndex={0}
        aria-label={`Agrandir l’image ${index + 1} sur ${safeImages.length}`}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setFullscreen(true); }}
      >
        {active.url
          // eslint-disable-next-line @next/next/no-img-element -- URL distante fournie par la base, dimensions inconnues
          ? <img src={active.url} alt={active.alt} style={zoomed ? { transformOrigin: `${origin.x}% ${origin.y}%` } : undefined} />
          : <div className="b2b-gallery-placeholder" aria-label={active.alt}>{title.slice(0, 1)}</div>}
      </div>

      <div className="b2b-gallery-actions">
        <button type="button" className="b2b-round-btn" aria-pressed={favorite} aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={(event) => { event.stopPropagation(); onToggleFavorite(); }}>
          <Heart size={18} fill={favorite ? "currentColor" : "none"} />
        </button>
        {visualSearchEnabled && <>
          <button type="button" className="b2b-round-btn" aria-label="Recherche visuelle : analyser une image" onClick={(event) => { event.stopPropagation(); fileInput.current?.click(); }}>
            <Search size={17} />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              // La recherche visuelle réelle exige un service d'indexation d'images :
              // on n'envoie rien et on ne prétend pas avoir trouvé un résultat.
              event.target.value = "";
              window.alert("La recherche visuelle n’est pas encore activée sur cette boutique.");
            }}
          />
        </>}
      </div>

      {safeImages.length > 1 && <>
        <button type="button" className="b2b-gallery-nav prev" aria-label="Image précédente" onClick={(event) => { event.stopPropagation(); go(index - 1); }}><ChevronLeft size={20} /></button>
        <button type="button" className="b2b-gallery-nav next" aria-label="Image suivante" onClick={(event) => { event.stopPropagation(); go(index + 1); }}><ChevronRight size={20} /></button>
        <span className="b2b-gallery-counter">{index + 1} / {safeImages.length}</span>
      </>}
    </div>

    {safeImages.length > 1 && <div className="b2b-thumbs-wrap">
      <div className="b2b-thumbs" style={{ "--b2b-thumbs-offset": `${offset * 72}px` } as React.CSSProperties}>
        {safeImages.map((image, position) => <button
          key={`${image.url}-${position}`}
          type="button"
          className={`b2b-thumb${position === index ? " is-active" : ""}`}
          aria-label={`Voir l’image ${position + 1}`}
          aria-current={position === index}
          onClick={() => setIndex(position)}
        >
          {image.url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={image.url} alt="" />
            : <span className="b2b-thumb-placeholder" />}
        </button>)}
      </div>
      {canScrollThumbs && <button
        type="button"
        className="b2b-thumbs-more"
        aria-label="Voir plus de miniatures"
        onClick={() => setOffset((current) => (current + VISIBLE_THUMBS >= safeImages.length ? 0 : current + VISIBLE_THUMBS))}
      >
        <ChevronDown size={16} />
      </button>}
    </div>}

    {fullscreen && <div className="b2b-lightbox" role="dialog" aria-modal="true" aria-label="Image en plein écran" onClick={() => setFullscreen(false)}>
      <button type="button" className="b2b-lightbox-close" aria-label="Fermer" onClick={() => setFullscreen(false)}><X size={22} /></button>
      {safeImages.length > 1 && <button type="button" className="b2b-gallery-nav prev" aria-label="Image précédente" onClick={(event) => { event.stopPropagation(); go(index - 1); }}><ChevronLeft size={24} /></button>}
      {active.url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={active.url} alt={active.alt} onClick={(event) => event.stopPropagation()} />
        : <div className="b2b-gallery-placeholder">{title}</div>}
      {safeImages.length > 1 && <button type="button" className="b2b-gallery-nav next" aria-label="Image suivante" onClick={(event) => { event.stopPropagation(); go(index + 1); }}><ChevronRight size={24} /></button>}
    </div>}
  </div>;
}
