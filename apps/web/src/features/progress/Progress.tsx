import React, { useMemo, useState } from "react";
import { EXERCISE_BY_ID, programById } from "../../data/catalog";
import { reviewSession } from "../../domain/review";
import { ReviewBlock } from "../workout/Summary";
import { getState } from "../../data/store";
import { deleteSession, doneSessions, useStore } from "../../data/store";
import { useNav } from "../../app/nav";
import { computeRecords } from "../../domain/history";
import { fmtDuration, fmtMonth, fmtShort, fmtTime, fmtTonnage, plural, startOfWeek } from "../../domain/format";
import { sessionDoneSets, sessionVolume } from "../../domain/strength";
import { Confirm, TopBar, toast } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { fmtRecord, fmtSets, RECORD_LABEL } from "./shared";
import { LiftList } from "./Lifts";
import type { RecordKind } from "../../domain/history";

export function ProgressHome() {
  const nav = useNav();
  const sessions = useStore(doneSessions);
  const records = useMemo(() => computeRecords(sessions, EXERCISE_BY_ID), [sessions]);
  const weekStart = startOfWeek(Date.now());
  const fourWeeks = sessions.filter((s) => s.startedAt >= weekStart - 21 * 86400000);
  const groups = useMemo(() => {
    const map = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const k = fmtMonth(s.startedAt);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.entries()];
  }, [sessions]);

  return (
    <>
      <TopBar title="Прогресс" />
      <div className="screen">
        <div className="stats">
          <div className="stat card tight">
            <span className="v">{sessions.length}</span>
            <span className="k">всего тренировок</span>
          </div>
          <div className="stat card tight">
            <span className="v">{(fourWeeks.length / 4).toFixed(1).replace(".", ",")}</span>
            <span className="k">в неделю за 4 нед.</span>
          </div>
          <div className="stat card tight">
            <span className="v">{records.size}</span>
            <span className="k">упражнений</span>
          </div>
        </div>

        <div className="grid-2">
          <button className="btn" onClick={() => nav.push({ name: "week" })}>
            <Icon name="chart" size={18} /> Неделя
          </button>
          <button className="btn" onClick={() => nav.push({ name: "body" })}>
            <Icon name="user" size={18} /> Тело и замеры
          </button>
        </div>

        <section className="section">
          <div className="section-head">
            <h2>Рабочие веса</h2>
            <button className="btn small ghost" onClick={() => nav.push({ name: "lifts" })}>
              Все
            </button>
          </div>
          <LiftList limit={5} />
        </section>

        <button className="list-item card tight" style={{ flexDirection: "row" }} onClick={() => nav.push({ name: "records" })}>
          <Icon name="trophy" className="chev" />
          <div className="grow">
            <div className="title">Личные рекорды</div>
            <div className="sub">Лучший вес, повторы и расчётный максимум по каждому упражнению</div>
          </div>
          <Icon name="chev" className="chev" />
        </button>

        <div className="section-head">
          <h2>История</h2>
        </div>
        {!sessions.length && (
          <div className="empty">
            <b>История пока пуста</b>
            <span className="small">Заверши первую тренировку — здесь появятся подходы, объём и рекорды. Графики добавим на этапе 2.</span>
          </div>
        )}

        {groups.map(([month, list]) => (
          <section key={month} className="section">
            <div className="section-head">
              <h2>{month}</h2>
              <span className="small muted">
                {list.length} {plural(list.length, ["тренировка", "тренировки", "тренировок"])}
              </span>
            </div>
            <div className="list history-list">
              {list.map((s) => (
                <button key={s.id} className="list-item" onClick={() => nav.push({ name: "session", id: s.id })}>
                  <div className="stack gap-s" style={{ width: 52 }}>
                    <span className="num small">{fmtShort(s.startedAt)}</span>
                    <span className="xs muted num">{fmtTime(s.startedAt)}</span>
                  </div>
                  <div className="grow">
                    <div className="title ellipsis">{s.title}</div>
                    <div className="sub num">
                      {fmtDuration((s.endedAt ?? s.startedAt) - s.startedAt)} · {sessionDoneSets(s)} подх. · {fmtTonnage(sessionVolume(s))}
                    </div>
                  </div>
                  <Icon name="chev" className="chev" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

export function SessionDetail({ id }: { id: string }) {
  const nav = useNav();
  const session = useStore((s) => s.sessions[id]);
  const [confirm, setConfirm] = useState(false);
  const review = useMemo(() => {
    if (!session) return null;
    const program = programById(getState(), session.programId);
    return reviewSession(session, EXERCISE_BY_ID, { plannedMin: program?.kind === "program" ? program.minutes : null });
  }, [session]);
  if (!session || session.deletedAt) return <TopBar title="Тренировка не найдена" onBack={nav.back} />;
  return (
    <>
      <TopBar
        title={session.title}
        onBack={nav.back}
        actions={
          <button className="icon-btn" aria-label="Удалить тренировку" onClick={() => setConfirm(true)}>
            <Icon name="trash" />
          </button>
        }
      />
      <div className="screen">
        <p className="dim small">
          {fmtShort(session.startedAt)}, {fmtTime(session.startedAt)}
          {session.programName ? ` · ${session.programName}` : ""}
        </p>
        <div className="stats">
          <div className="stat card tight">
            <span className="v">{fmtDuration((session.endedAt ?? session.startedAt) - session.startedAt)}</span>
            <span className="k">время</span>
          </div>
          <div className="stat card tight">
            <span className="v">{sessionDoneSets(session)}</span>
            <span className="k">подходов</span>
          </div>
          <div className="stat card tight">
            <span className="v">{fmtTonnage(sessionVolume(session))}</span>
            <span className="k">объём</span>
          </div>
        </div>
        {review && review.fromProgram && <ReviewBlock review={{ ...review, advice: [] }} />}
        <div className="list">
          {session.exercises.map((e) => {
            const ex = EXERCISE_BY_ID[e.exerciseId];
            return (
              <button key={e.id} className="list-item" onClick={() => nav.push({ name: "exercise", id: e.exerciseId })}>
                <div className="grow">
                  <div className="title">{ex?.name ?? e.exerciseId}</div>
                  <div className="sub num">{fmtSets(e.sets, ex)}</div>
                  {e.circuit && <div className="sub">{e.circuit.stations.map((st) => `${st.reps} ${EXERCISE_BY_ID[st.exerciseId]?.name.toLowerCase() ?? ""}${st.weight ? ` (${st.weight} кг)` : ""}`).join(" · ")}</div>}
                  {e.notes && <div className="sub">Заметка: {e.notes}</div>}
                </div>
                <Icon name="chev" className="chev" />
              </button>
            );
          })}
        </div>
        {session.notes && (
          <section className="section">
            <div className="section-head">
              <h2>Заметки</h2>
            </div>
            <p className="dim" style={{ whiteSpace: "pre-wrap" }}>
              {session.notes}
            </p>
          </section>
        )}
      </div>
      {confirm && (
        <Confirm
          title="Удалить тренировку?"
          text="Она исчезнет из истории и рекордов на всех устройствах."
          confirmLabel="Удалить"
          danger
          onConfirm={() =>
            deleteSession(session.id).then(() => {
              toast("Тренировка удалена");
              nav.back();
            })
          }
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  );
}

export function RecordsScreen() {
  const nav = useNav();
  const sessions = useStore(doneSessions);
  const records = useMemo(() => [...computeRecords(sessions, EXERCISE_BY_ID).entries()], [sessions]);
  const order: RecordKind[] = ["weight", "reps", "duration"];
  return (
    <>
      <TopBar title="Личные рекорды" onBack={nav.back} />
      <div className="screen">
        {!records.length && <p className="dim">Рекорды появятся после первых тренировок.</p>}
        <div className="list">
          {records
            .sort((a, b) => (EXERCISE_BY_ID[a[0]]?.name ?? "").localeCompare(EXERCISE_BY_ID[b[0]]?.name ?? "", "ru"))
            .map(([exId, rec]) => {
              const main = order.map((k) => rec[k]).find(Boolean);
              const one = rec.e1rm;
              return (
                <button key={exId} className="list-item" onClick={() => nav.push({ name: "exercise", id: exId })}>
                  <div className="grow">
                    <div className="title">{EXERCISE_BY_ID[exId]?.name ?? exId}</div>
                    {main && (
                      <div className="sub num">
                        {RECORD_LABEL[main.kind]}: {fmtRecord(main.kind, main.value)}
                        {main.kind === "weight" && main.reps ? ` × ${main.reps}` : ""} · {fmtShort(main.at)}
                        {one ? ` · ≈1ПМ ${fmtRecord("e1rm", one.value)}` : ""}
                      </div>
                    )}
                  </div>
                  <Icon name="chev" className="chev" />
                </button>
              );
            })}
        </div>
        <p className="xs muted">≈1ПМ — расчётный разовый максимум по формуле Эпли. Это оценка, не повод проверять максимум.</p>
      </div>
    </>
  );
}
