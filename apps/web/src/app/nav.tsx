import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

export type Tab = "today" | "workouts" | "nutrition" | "progress" | "profile";

export type Route =
  | { name: "root" }
  | { name: "program"; id: string }
  | { name: "recommend" }
  | { name: "library" }
  | { name: "exercise"; id: string }
  | { name: "session"; id: string }
  | { name: "records" }
  | { name: "profile-edit"; section: "body" | "goal" | "place" | "health" | "baselines" | "circuit" | "reminders" }
  | { name: "preview" }
  | { name: "program-edit"; id: string }
  | { name: "ask" }
  | { name: "photo" }
  | { name: "lifts" }
  | { name: "body" }
  | { name: "week" }
  | { name: "prehab" }
  | { name: "food-add"; mode: "photo" | "text" | "saved" | "manual" }
  | { name: "meal"; date: string; id: string }
  | { name: "data" }
  | { name: "about" };

type LayerBody = { kind: "route"; route: Route } | { kind: "workout" };
type Layer = LayerBody & { id: number };

interface NavApi {
  tab: Tab;
  route: Route;
  depth: number;
  setTab: (t: Tab) => void;
  push: (r: Route) => void;
  back: () => void;
  /** Закрыть верхний экран и после того, как история браузера догонит, выполнить действие. */
  backThen: (fn: () => void) => void;
  workoutOpen: boolean;
  openWorkout: () => void;
  closeWorkout: () => void;
  /** Ключ текущего экрана: у каждого открытого экрана своё сохранённое состояние и прокрутка. */
  screenKey: string;
}

// Состояние экранов (фильтры, поиск, выбранные мышцы) и позиции прокрутки.
// Живёт, пока экран открыт в стеке: при возврате «Назад» экран восстанавливается как был.
const screenState = new Map<string, Record<string, unknown>>();
const scrollPos = new Map<string, number>();
let layerSeq = 1;

const Ctx = createContext<NavApi | null>(null);
export const useNav = () => useContext(Ctx)!;

/** useState, который переживает переход на другой экран и возврат назад. */
export function useScreenState<T>(name: string, initial: T | (() => T)): [T, (v: T | ((cur: T) => T)) => void] {
  const { screenKey } = useNav();
  const [value, setValue] = useState<T>(() => {
    const bag = screenState.get(screenKey);
    if (bag && name in bag) return bag[name] as T;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  const set = useCallback(
    (v: T | ((cur: T) => T)) => {
      setValue((cur) => {
        const next = typeof v === "function" ? (v as (c: T) => T)(cur) : v;
        const bag = screenState.get(screenKey) ?? {};
        bag[name] = next;
        screenState.set(screenKey, bag);
        return next;
      });
    },
    [screenKey, name],
  );
  return [value, set];
}

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
  const after = useRef<(() => void) | null>(null);
  const runAfter = () => {
    const fn = after.current;
    after.current = null;
    fn?.();
  };

  const apply = useCallback((next: Layer[]) => {
    ref.current = next;
    setLayers(next);
  }, []);

  const truncate = useCallback(
    (depth: number) => {
      if (ref.current.length > depth) {
        // Закрытые экраны забывают своё состояние; открытые ниже — сохраняют.
        for (const l of ref.current.slice(depth)) {
          screenState.delete(`l${l.id}`);
          scrollPos.delete(`l${l.id}`);
        }
        apply(ref.current.slice(0, depth));
      }
    },
    [apply],
  );

  useEffect(() => {
    if (hashDepth()) setHash(0, true);
    const onHash = () => {
      const d = hashDepth();
      if (d < ref.current.length) truncate(d);
      else if (d > ref.current.length) setHash(ref.current.length, true); // «Вперёд» в истории — игнорируем
      if (d === ref.current.length) runAfter();
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
        runAfter();
      }, 500);
    },
    [truncate],
  );

  const routes = layers.filter((l): l is Extract<Layer, { kind: "route" }> & { id: number } => l.kind === "route");
  const topRoute = routes[routes.length - 1];
  const screenKey = topRoute ? `l${topRoute.id}` : `root:${tab}`;

  const pushLayer = (layer: LayerBody) => {
    // Запоминаем прокрутку экрана, с которого уходим.
    if (layer.kind === "route") scrollPos.set(screenKey, window.scrollY);
    apply([...ref.current, { ...layer, id: layerSeq++ } as Layer]);
    setHash(ref.current.length, false);
  };

  // При возврате на экран — восстанавливаем прокрутку, на новый экран — наверх.
  const prevKey = useRef(screenKey);
  useLayoutEffect(() => {
    if (prevKey.current === screenKey) return;
    prevKey.current = screenKey;
    const y = scrollPos.get(screenKey);
    if (y != null) {
      // Ждём, пока экран отрисует список, затем возвращаемся на прежнее место.
      requestAnimationFrame(() => window.scrollTo(0, y));
    } else window.scrollTo(0, 0);
  }, [screenKey]);
  const api: NavApi = {
    tab,
    route: topRoute?.route ?? { name: "root" },
    screenKey,
    depth: routes.length,
    setTab: (t) => {
      scrollPos.set(screenKey, window.scrollY);
      popTo(0);
      setTabState(t);
    },
    push: (r) => {
      pushLayer({ kind: "route", route: r });
    },
    back: () => popTo(ref.current.length - 1),
    backThen: (fn) => {
      if (!ref.current.length) return fn();
      after.current = fn;
      popTo(ref.current.length - 1);
    },
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
