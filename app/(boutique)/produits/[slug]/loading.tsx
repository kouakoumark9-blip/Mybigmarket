import "@/components/product-detail/pdp.css";

/** Squelette affiché pendant le chargement de la fiche produit. */
export default function Loading() {
  return <main className="pd" aria-busy="true" aria-label="Chargement de la fiche produit">
    <div className="pd-shell">
      <div className="pd-skel pd-skel-line" style={{ width: "40%", marginBlock: 14 }}/>
      <div className="pd-layout">
        <div className="pd-left">
          <div className="pd-main">
            <div className="pd-area-gallery"><div className="pd-skel-gallery"><div className="pd-skel-thumbs">{Array.from({ length: 6 }, (_, i) => <div key={i} className="pd-skel"/>)}</div><div className="pd-skel pd-skel-stage"/></div></div>
            <div className="pd-area-info">
              <div className="pd-skel pd-skel-line" style={{ height: 22 }}/>
              <div className="pd-skel pd-skel-line" style={{ height: 22, width: "80%" }}/>
              <div className="pd-skel pd-skel-line" style={{ width: "55%" }}/>
              <div className="pd-skel pd-skel-line" style={{ height: 34, width: "45%", marginTop: 20 }}/>
              <div className="pd-skel-swatches">{Array.from({ length: 9 }, (_, i) => <div key={i} className="pd-skel"/>)}</div>
              <div className="pd-skel pd-skel-block"/>
            </div>
            <div className="pd-area-supplier"><div className="pd-skel pd-skel-block"/></div>
          </div>
        </div>
        <div className="pd-right"><div className="pd-skel pd-skel-box"/></div>
      </div>
    </div>
    <span className="sr-only" role="status">Chargement…</span>
  </main>;
}
