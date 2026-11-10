import type { Highlight, LabeledValue } from "@/lib/pdp/types";

/** Récapitulatif : résumé en une phrase, points clés et caractéristiques principales. */
export function RecapSection({ summary, specs, highlights, id }: { summary: string; specs: LabeledValue[]; highlights: Highlight[]; id: string }) {
  return <section className="pd-section" id={id} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="pd-section-title">Récapitulatif</h2>
    <div className="pd-recap">
      {summary && <p className="pd-recap-summary">{summary}</p>}
      {specs.length > 0 && <dl className="pd-recap-specs">
        {specs.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
      </dl>}
      {highlights.length > 0 && <ul className="pd-recap-points">
        {highlights.map((item) => <li key={item.lead}><b>{item.lead}</b> {item.text}</li>)}
      </ul>}
    </div>
  </section>;
}
