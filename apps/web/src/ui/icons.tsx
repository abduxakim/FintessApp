import React from "react";

const P: Record<string, string> = {
  today: "M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z",
  dumbbell: "M3 10v4M6.5 7.5v9M17.5 7.5v9M21 10v4M6.5 12h11",
  food: "M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.2 1.2-3.5 3.6-3.5 7v3H17",
  chart: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 9a7.5 7.5 0 0 1 15 0",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  check: "m5 12.5 4.5 4.5L19 7.5",
  back: "M15 5 8 12l7 7",
  chev: "m9 5 7 7-7 7",
  close: "M6 6l12 12M18 6 6 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4",
  swap: "M7 7h12l-3-3M17 17H5l3 3",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12v4l2.5 2.5M9.5 2.5h5",
  up: "m6 15 6-6 6 6",
  down: "m6 9 6 6 6-6",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  note: "M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-11v6m0-9.5v.01",
  alert: "M12 4 2.5 20h19zM12 10v4.5m0 3v.01",
  cloud: "M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.25 4.25 0 0 1-.5 8.5z",
  cloudOff: "M3 3l18 18M8.5 6.4A6 6 0 0 1 18 9.5a4.25 4.25 0 0 1 2.2 7.6M17 18H7a4.5 4.5 0 0 1-1.6-8.7",
  play: "M8 5.5v13l10-6.5z",
  pause: "M8 5v14M16 5v14",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  video: "M3 6h12v12H3zM15 10l6-3v10l-6-3",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zm0 2H5v1a3 3 0 0 0 3 3m8-4h3v1a3 3 0 0 1-3 3m-4 3v4m-3 3h6",
  download: "M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19h14",
  upload: "M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19h14",
  spark: "M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
  shield: "M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z",
};

export function Icon({ name, size = 22, stroke = 2, className }: { name: keyof typeof P | string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] ?? ""} />
    </svg>
  );
}
