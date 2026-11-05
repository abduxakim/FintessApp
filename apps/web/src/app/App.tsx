import React, { useEffect } from "react";
import { activeSession, loadLocal, useStore } from "../data/store";
import { startSync } from "../data/sync";
import { NavProvider, useNav, type Tab } from "./nav";
import { Icon } from "../ui/icons";
import { ToastHost } from "../ui/kit";
import { Onboarding } from "../features/profile/Onboarding";
import { Today } from "../features/today/Today";
import { WorkoutsHome } from "../features/workouts/Workouts";
import { ProgramDetail } from "../features/workouts/ProgramDetail";
import { RecommendScreen } from "../features/workouts/Recommend";
import { Library } from "../features/workouts/Library";
import { ExerciseDetail } from "../features/workouts/ExerciseDetail";
import { WorkoutOverlay } from "../features/workout/Workout";
import { ProgressHome, RecordsScreen, SessionDetail } from "../features/progress/Progress";
import { NutritionHome } from "../features/nutrition/Nutrition";
import { AboutScreen, DataScreen, ProfileEdit, ProfileHome } from "../features/profile/Profile";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "Сегодня", icon: "today" },
  { id: "workouts", label: "Тренировки", icon: "dumbbell" },
  { id: "nutrition", label: "Питание", icon: "food" },
  { id: "progress", label: "Прогресс", icon: "chart" },
  { id: "profile", label: "Профиль", icon: "user" },
];

function Screen() {
  const { tab, route } = useNav();
  switch (route.name) {
    case "program":
      return <ProgramDetail key={route.id} id={route.id} />;
    case "recommend":
      return <RecommendScreen />;
    case "library":
      return <Library />;
    case "exercise":
      return <ExerciseDetail key={route.id} id={route.id} />;
    case "session":
      return <SessionDetail key={route.id} id={route.id} />;
    case "records":
      return <RecordsScreen />;
    case "profile-edit":
      return <ProfileEdit key={route.section} section={route.section} />;
    case "data":
      return <DataScreen />;
    case "about":
      return <AboutScreen />;
  }
  switch (tab) {
    case "today":
      return <Today />;
    case "workouts":
      return <WorkoutsHome />;
    case "nutrition":
      return <NutritionHome />;
    case "progress":
      return <ProgressHome />;
    case "profile":
      return <ProfileHome />;
  }
}

function BottomNav() {
  const nav = useNav();
  const hasActive = useStore((s) => !!activeSession(s));
  return (
    <nav className="nav" aria-label="Основные разделы">
      <div className="nav-inner">
        {TABS.map((t) => (
          <button key={t.id} className={nav.tab === t.id ? "on" : ""} aria-current={nav.tab === t.id ? "page" : undefined} onClick={() => nav.setTab(t.id)}>
            <Icon name={t.icon} />
            {t.label}
            {t.id === "today" && hasActive && <span className="badge" aria-label="Идёт тренировка" />}
          </button>
        ))}
      </div>
    </nav>
  );
}

function Shell() {
  const ready = useStore((s) => s.ready);
  const onboarded = useStore((s) => s.meta.onboarded);
  const waitCloud = useStore((s) => s.bootstrapping && s.meta.rev === 0);
  const nav = useNav();
  if (!ready || (!onboarded && waitCloud))
    return (
      <div className="app">
        <div className="screen" style={{ paddingTop: 40 }}>
          <span className="eyebrow">Загрузка</span>
          <div className="hero-title">Тренировки</div>
        </div>
      </div>
    );
  if (!onboarded) return <Onboarding />;
  return (
    <>
      <div className="app">
        <Screen />
      </div>
      <BottomNav />
      {nav.workoutOpen && <WorkoutOverlay />}
      <ToastHost />
    </>
  );
}

export function App() {
  useEffect(() => {
    void loadLocal().then(() => startSync());
    try {
      void navigator.storage?.persist?.();
    } catch {
      /* ignore */
    }
  }, []);
  return (
    <NavProvider>
      <Shell />
    </NavProvider>
  );
}
