import React from "react";
import { MOTIONS } from "./motions";
import { GROUND, solve } from "./engine";
import { MotionView } from "./MotionView";

/** Служебная страница для проверки поз: #motion-gallery. Первая и последняя позы каждой схемы. */
export function MotionGallery() {
  void MotionView;
  void GROUND;
  return (
    <div className="gallery">
      {Object.entries(MOTIONS).flatMap(([key, m]) =>
        [0, m.frames.length - 1].map((fi) => {
          const one = { ...m, frames: [m.frames[fi], m.frames[fi]] };
          void solve;
          return (
            <div key={key + fi}>
              <div className="xs muted">
                {key} · {fi}
              </div>
              <StaticMotion motion={one} />
            </div>
          );
        }),
      )}
    </div>
  );
}

function StaticMotion({ motion }: { motion: (typeof MOTIONS)[string] }) {
  return <MotionView motion={motion} equipment={["barbell"]} label="" />;
}
