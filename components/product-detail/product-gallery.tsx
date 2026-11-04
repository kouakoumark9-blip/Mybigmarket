"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type TouchEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Heart, Play, ScanSearch, X } from "lucide-react";
import type { DemoProduct } from "@/lib/demo-data";
import type { ProductImage } from "@/lib/pdp/types";
import { useFavorites } from "@/components/favorites-provider";
import { PdpImage } from "@/components/product-detail/shared";

type Media = ProductImage & { kind: "image" | "video" };

type Props = {
  images: ProductImage[];
  videoUrl?: string;
  label?: string;
  activeIndex: number;
  onSelect: (index: number) => void;
  favoriteItem: DemoProduct;
  onImageSearch: () => void;
};

const THUMBS = 6;

export function ProductGallery({ images, videoUrl, label, activeIndex, onSelect, favoriteItem, onImageSearch }: Props) {
  const media: Media[] = [...images.map((image) => ({ ...image, kind: "image" as const })), ...(videoUrl ? [{ src: videoUrl, alt: "Vidéo du produit", kind: "video" as const }] : [])];
  const count = media.length;
  const index = Math.min(activeIndex, count - 1);
  const active = media[index];
  const poster = images[0]?.src;
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const touchStart = useRef<number | null>(null);
  const thumbList = useRef<HTMLDivElement>(null);
  const { isFavorite, toggle } = useFavorites();
  const favorite = isFavorite(favoriteItem.slug);
  const thumbs = expanded ? media : media.slice(0, THUMBS);

  const go = (delta: number) => onSelect((index + delta + count) % count);

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); go(1); }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); go(-1); }
    if (event.key === "Home") { event.preventDefault(); onSelect(0); }
    if (event.key === "End") { event.preventDefault(); onSelect(count - 1); }
  };

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    if (active.kind !== "image") return;
    const box = event.currentTarget.getBoundingClientRect();
    setZoom({ x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 });
  };

  const onTouchStart = (event: TouchEvent) => { touchStart.current = event.touches[0]?.clientX ?? null; };
  const onTouchEnd = (event: TouchEvent) => {
    if (touchStart.current === null) return;
    const delta = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
    if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
    touchStart.current = null;
  };

  useEffect(() => {
    if (!lightbox) return;
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(false);
      if (event.key === "ArrowRight") onSelect((index + 1) % count);
      if (event.key === "ArrowLeft") onSelect((index - 1 + count) % count);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [lightbox, index, count, onSelect]);

  if (!active) return null;

  return <div className="pd-gallery">
    <div className="pd-thumbs" ref={thumbList} role="listbox" aria-label="Miniatures du produit" aria-orientation="vertical" onKeyDown={(event) => { onKey(event); requestAnimationFrame(() => thumbList.current?.querySelector<HTMLButtonElement>(".pd-thumb.is-active")?.focus()); }}>
      {thumbs.map((item, i) => <button key={`${item.src}-${i}`} type="button" role="option" aria-selected={i === index} tabIndex={i === index ? 0 : -1} className={`pd-thumb${i === index ? " is-active" : ""}`} onClick={() => onSelect(i)} onMouseEnter={() => onSelect(i)} aria-label={`${item.kind === "video" ? "Vidéo" : `Image ${i + 1}`} : ${item.alt}`}>
        <PdpImage src={item.kind === "video" ? poster || item.src : item.src} alt="" width={64} height={64} sizes="64px"/>
        {item.kind === "video" && <span className="pd-thumb-play" aria-hidden="true"><Play size={14} strokeWidth={1.75}/></span>}
      </button>)}
      {count > THUMBS && <button type="button" className="pd-thumbs-more" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-label={expanded ? "Afficher moins de miniatures" : "Afficher toutes les miniatures"}><ChevronDown size={18} strokeWidth={1.5} className={expanded ? "is-flipped" : ""}/></button>}
    </div>

    <div className="pd-stage">
      <div
        className={`pd-stage-media${zoom ? " is-zooming" : ""}`}
        style={zoom ? { "--zx": `${zoom.x}%`, "--zy": `${zoom.y}%` } as React.CSSProperties : undefined}
        tabIndex={0}
        role="group"
        aria-roledescription="galerie"
        aria-label={`${active.alt} (${index + 1} sur ${count}). Flèches gauche et droite pour naviguer, Entrée pour agrandir.`}
        onKeyDown={(event) => { if (event.key === "Enter") setLightbox(true); else onKey(event); }}
        onMouseMove={onMove}
        onMouseLeave={() => setZoom(null)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={() => active.kind === "image" && setLightbox(true)}
      >
        {active.kind === "video"
          ? <video src={active.src} poster={poster} controls playsInline preload="metadata" aria-label={active.alt}/>
          : <PdpImage src={active.src} alt={active.alt} width={900} height={900} priority={index === 0} sizes="(max-width: 900px) 100vw, 40vw"/>}
      </div>
      {label && <span className="pd-stage-label">{label}</span>}
      <div className="pd-stage-actions">
        <button type="button" onClick={() => toggle(favoriteItem)} aria-pressed={favorite} aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"} className={favorite ? "is-on" : ""}><Heart size={18} strokeWidth={1.5} fill={favorite ? "currentColor" : "none"}/></button>
        <button type="button" onClick={onImageSearch} aria-label="Rechercher des produits similaires par image"><ScanSearch size={18} strokeWidth={1.5}/></button>
      </div>
      {count > 1 && <>
        <button type="button" className="pd-stage-prev" onClick={() => go(-1)} aria-label="Image précédente"><ChevronLeft size={20} strokeWidth={1.5}/></button>
        <button type="button" className="pd-stage-next" onClick={() => go(1)} aria-label="Image suivante"><ChevronRight size={20} strokeWidth={1.5}/></button>
      </>}
      <span className="pd-stage-count" aria-hidden="true">{index + 1}/{count}</span>
    </div>

    {lightbox && active.kind === "image" && <div className="pd-lightbox" role="dialog" aria-modal="true" aria-label="Image agrandie" onClick={() => setLightbox(false)}>
      <button type="button" className="pd-lightbox-close" onClick={() => setLightbox(false)} aria-label="Fermer" autoFocus><X size={22} strokeWidth={1.5}/></button>
      <button type="button" className="pd-lightbox-prev" onClick={(event) => { event.stopPropagation(); go(-1); }} aria-label="Image précédente"><ChevronLeft size={26} strokeWidth={1.5}/></button>
      <PdpImage src={active.src} alt={active.alt} width={1400} height={1400} sizes="90vw" onClick={(event) => event.stopPropagation()}/>
      <button type="button" className="pd-lightbox-next" onClick={(event) => { event.stopPropagation(); go(1); }} aria-label="Image suivante"><ChevronRight size={26} strokeWidth={1.5}/></button>
    </div>}
  </div>;
}
