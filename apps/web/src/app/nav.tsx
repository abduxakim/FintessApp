import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type Tab = "today" | "workouts" | "nutrition" | "progress" | "profile";

export type Route =
  | { name: "root" }
  | { name: "program"; id: string }
  | { name: "recommend" }
  | { name: "library" }
  | { name: "exercise"; id: string }
  | { name: "session"; id: string }
  | { name: "records" }
  | { name: "profile-edit"; section: "body" | "goal" | "place" | "health" | "baselines" }
  | { name: "data" }
  | { name: "about" };

type Layer = { kind: "route"; route: Route } | { kind: "workout" };

interface NavApi {
  tab: Tab;
  route: Route;
  depth: number;
  setTab: (t: Tab) => void;
  push: (r: Route) => void;
  back: () => void;
  workoutOpen: boolean;
  openWorkout: () => void;
  closeWorkout: () => void;
}

const Ctx = createContext<NavApi | null>(null);
export const useNav = () => useContext(Ctx)!;

// Каждый открытый слой (экран или тренировка) — запись в истории с хэшем #s<глубина>.
// Тогда системная кнопка «Назад» на Android закрывает слои внутри приложения.
// Закрытие из приложения меняет состояние сразу и откатывает историю; системная «Назад»
// приходит событием hashchange и закрывает слои до нужной глубины.
function hashDepth(): number {
  try {
    const m = /^#s(\d+)$/.exec(location.hash);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

function setHash(depth: number, replace: boolean) {
  try {
    const url = depth ? `#s${depth}` : location.pathname + location.search;
    if (replace) history.replaceState(null, "", url);
    else location.hash = `s${depth}`;
  } catch {
    /* история недоступна — работаем без неё */
  }
}

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTabState] = useState<Tab>("today");
  const [layers, setLayers] = useState<Layer[]>([]);
  const ref = useRef<Layer[]>([]);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback((next: Layer[]) => {
    ref.current = next;
    setLayers(next);
  }, []);

  const truncate = useCallback(
    (depth: number) => {
      if (ref.current.length > depth) apply(ref.current.slice(0, depth));
    },
    [apply],
  );

  useEffect(() => {
    if (hashDepth()) setHash(0, true);
    const onHash = () => {
      const d = hashDepth();
      if (d < ref.current.length) truncate(d);
      else if (d > ref.current.length) setHash(ref.current.length, true); // «Вперёд» в истории — игнорируем
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [truncate]);

  /** Закрыть слои до глубины depth: состояние меняется сразу, история браузера догоняет. */
  const popTo = useCallback(
    (depth: number) => {
      const len = ref.current.length;
      if (depth >= len) return;
      truncate(depth);
      try {
        history.go(depth - len);
      } catch {
        /* ignore */
      }
      if (fallback.current) clearTimeout(fallback.current);
      fallback.current = setTimeout(() => {
        if (hashDepth() !== ref.current.length) setHash(ref.current.length, true);
      }, 500);
    },
    [truncate],
  );

  const pushLayer = (layer: Layer) => {
    apply([...ref.current, layer]);
    setHash(ref.current.length, false);
  };

  const routes = layers.filter((l): l is Extract<Layer, { kind: "route" }> => l.kind === "route");
  const api: NavApi = {
    tab,
    route: routes[routes.length - 1]?.route ?? { name: "root" },
    depth: routes.length,
    setTab: (t) => {
      popTo(0);
      setTabState(t);
      window.scrollTo(0, 0);
    },
    push: (r) => {
      pushLayer({ kind: "route", route: r });
      window.scrollTo(0, 0);
    },
    back: () => popTo(ref.current.length - 1),
    workoutOpen: layers.some((l) => l.kind === "workout"),
    openWorkout: () => {
      if (ref.current.some((l) => l.kind === "workout")) return;
      pushLayer({ kind: "workout" });
    },
    closeWorkout: () => {
      const i = ref.current.findIndex((l) => l.kind === "workout");
      if (i >= 0) popTo(i);
    },
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
