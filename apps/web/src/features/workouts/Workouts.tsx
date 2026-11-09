import React from "react";
import { BLOCKS, PROGRAMS, programById } from "../../data/catalog";
import { useStore } from "../../data/store";
import { useNav } from "../../app/nav";
import { createProgram, prepareProgramDay } from "../../app/actions";
import { LOCATIONS } from "../../data/seed/labels";
import { TopBar, toast } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import type { Program } from "../../data/types";

export function WorkoutsHome() {
  const nav = useNav();
  const state = useStore((s) => s);
  const en = state.meta.enrollment;
  const current = programById(state, en?.programId);
  const myPrograms = Object.values(state.programs).filter((p) => !p.deletedAt && p.owner === "user").sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  // Блоки тоже открываются планом: можно посмотреть и поправить перед стартом.
  const startBlock = (b: Program) => {
    prepareProgramDay(b, 0);
    nav.push({ name: "preview" });
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
                  Следующая: {[current.days[en!.nextDayIndex % current.days.length]?.name, current.days[en!.nextDayIndex % current.days.length]?.focus].filter(Boolean).join(" · ")}
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

        <div className="grid-2">
          <button className="btn" onClick={() => nav.push({ name: "library" })}>
            <Icon name="search" size={18} /> Упражнения
          </button>
          <button className="btn" onClick={() => nav.push({ name: "ask" })}>
            <Icon name="spark" size={18} /> По запросу
          </button>
          <button className="btn" onClick={() => nav.push({ name: "prehab" })}>
            <Icon name="shield" size={18} /> Профилактика
          </button>
          <button className="btn" onClick={() => nav.push({ name: "photo" })}>
            <Icon name="camera" size={18} /> Тренажёр по фото
          </button>
        </div>

        <section className="section">
          <div className="section-head">
            <h2>Мои программы</h2>
          </div>
          {myPrograms.length > 0 && (
            <div className="list">
              {myPrograms.map((p) => (
                <button key={p.id} className="list-item" onClick={() => nav.push({ name: "program-edit", id: p.id })}>
                  <div className="grow">
                    <div className="row">
                      <span className="title">{p.name}</span>
                      {en?.programId === p.id && <span className="pill accent">активна</span>}
                    </div>
                    <div className="sub">{p.days.map((d) => d.name).join(" · ")}</div>
                  </div>
                  <Icon name="chev" className="chev" />
                </button>
              ))}
            </div>
          )}
          <button
            className="btn block"
            onClick={async () => {
              const p = await createProgram();
              nav.push({ name: "program-edit", id: p.id });
            }}
          >
            <Icon name="plus" size={18} /> Создать свою программу
          </button>
          <p className="xs muted">Или открой любой шаблон и нажми «Скопировать и изменить».</p>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Шаблоны программ</h2>
            <button className="btn small ghost" onClick={() => nav.push({ name: "recommend" })}>
              Подобрать
            </button>
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
                    startBlock(b);
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
