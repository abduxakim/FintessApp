import React from "react";
import { BLOCKS, PROGRAMS, programById } from "../../data/catalog";
import { useStore } from "../../data/store";
import { useNav } from "../../app/nav";
import { startProgramDay } from "../../app/actions";
import { LOCATIONS } from "../../data/seed/labels";
import { TopBar, toast } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import type { Program } from "../../data/types";

export function WorkoutsHome() {
  const nav = useNav();
  const state = useStore((s) => s);
  const en = state.meta.enrollment;
  const current = programById(state, en?.programId);

  const startBlock = async (b: Program) => {
    await startProgramDay(b, 0);
    nav.openWorkout();
  };

  return (
    <>
      <TopBar title="Тренировки" />
      <div className="screen">
        {current ? (
          <button className="card accent" style={{ textAlign: "left" }} onClick={() => nav.push({ name: "program", id: current.id })}>
            <span className="eyebrow">Моя программа</span>
            <div className="row">
              <div className="grow">
                <h2 style={{ fontSize: "var(--fs-xl)" }}>{current.name}</h2>
                <p className="small dim">
                  Следующая: {current.days[en!.nextDayIndex % current.days.length]?.name} · {current.days[en!.nextDayIndex % current.days.length]?.focus}
                </p>
              </div>
              <Icon name="chev" className="chev" />
            </div>
          </button>
        ) : (
          <div className="empty">
            <b>Программа не выбрана</b>
            <span className="small">Подберём под твой профиль за пару секунд.</span>
            <button className="btn primary" onClick={() => nav.push({ name: "recommend" })}>
              Подобрать программу
            </button>
          </div>
        )}

        <div className="row">
          <button className="btn grow" onClick={() => nav.push({ name: "library" })}>
            <Icon name="search" size={18} /> Упражнения
          </button>
          <button className="btn grow" onClick={() => nav.push({ name: "recommend" })}>
            <Icon name="spark" size={18} /> Подбор
          </button>
        </div>

        <section className="section">
          <div className="section-head">
            <h2>Шаблоны программ</h2>
          </div>
          <div className="list">
            {PROGRAMS.map((p) => (
              <button key={p.id} className="list-item" onClick={() => nav.push({ name: "program", id: p.id })}>
                <div className="grow">
                  <div className="row">
                    <span className="title">{p.name}</span>
                    {en?.programId === p.id && <span className="pill accent">активна</span>}
                  </div>
                  <div className="sub">
                    {p.locations.map((l) => LOCATIONS[l]).join(" · ")} · {p.days.length} трен. · ~{p.minutes} мин
                  </div>
                </div>
                <Icon name="chev" className="chev" />
              </button>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Отдельные блоки</h2>
          </div>
          <div className="list">
            {BLOCKS.map((b) => (
              <div key={b.id} className="list-item">
                <button className="grow" style={{ background: "none", border: 0, textAlign: "left", padding: 0 }} onClick={() => nav.push({ name: "program", id: b.id })}>
                  <div className="title">{b.name}</div>
                  <div className="sub">{b.summary}</div>
                </button>
                <button
                  className="icon-btn filled"
                  aria-label={`Начать: ${b.name}`}
                  onClick={() => {
                    if (state.sessions && Object.values(state.sessions).some((s) => s.status === "active" && !s.deletedAt)) {
                      toast("Сначала заверши текущую тренировку");
                      nav.openWorkout();
                      return;
                    }
                    void startBlock(b);
                  }}
                >
                  <Icon name="play" size={18} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
