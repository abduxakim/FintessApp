import React from "react";
import type { Emphasis } from "../domain/emphasis";
import { MUSCLES } from "../data/seed/labels";
import { BodyMap } from "./BodyMap";

/** Упор тренировки: схема мышц, подходы по группам и главные мышцы. */
export function EmphasisCard({ e, title = "Упор тренировки" }: { e: Emphasis; title?: string }) {
  if (!e.groups.length) return null;
  const max = e.groups[0].sets || 1;
  return (
    <section className="card tight" aria-label={title}>
      <div className="section-head">
        <h2 className="eyebrow">{title}</h2>
        <span className="xs muted">подходы по группам</span>
      </div>
      <div className="emphasis">
        <div className="emphasis-map">
          <BodyMap primary={e.main} secondary={e.minor} captions={false} />
        </div>
        <div className="stack gap-s grow">
          {e.groups.map((g) => (
            <div key={g.group} className="emphasis-row">
              <span className="small">{g.group}</span>
              <span className="emphasis-bar">
                <span style={{ width: `${Math.max(8, (g.sets / max) * 100)}%` }} />
              </span>
              <span className="small num">{g.sets}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="xs muted">Главные мышцы: {e.main.slice(0, 5).map((m) => MUSCLES[m].name.toLowerCase()).join(", ")}</p>
    </section>
  );
}
