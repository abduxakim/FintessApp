import React, { useRef, useState } from "react";
import type { Profile } from "../../data/types";
import { programById } from "../../data/catalog";
import { getState, resetLocal, updateMeta, useStore } from "../../data/store";
import { syncNow } from "../../data/sync";
import { exportCsv, exportToFile, importFromText } from "../../data/backup";
import { defaultReminders } from "../../data/defaults";
import type { Reminders } from "../../data/types";
import { useNav } from "../../app/nav";
import { GOALS, LEVELS, LOCATIONS, MUSCLES, ZONES } from "../../data/seed/labels";
import { Confirm, MedicalNote, Note, Segmented, TopBar, toast } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { BaselinesSection, BodySection, CircuitSection, GoalSection, HealthSection, PlaceSection } from "./forms";
import { fmtShort, fmtTime } from "../../domain/format";

type Section = "body" | "goal" | "place" | "health" | "baselines" | "circuit" | "reminders";
const TITLES: Record<Section, string> = { body: "Тело и опыт", goal: "Цель и фокус", place: "Место и график", health: "Здоровье и баланс", baselines: "Базовые результаты", circuit: "Круг 5-10-15", reminders: "Напоминания" };

export function ProfileHome() {
  const nav = useNav();
  const state = useStore((s) => s);
  const p = state.meta.profile;
  const program = programById(state, state.meta.enrollment?.programId);
  const sync = state.sync;
  const rows: { s: Section; sub: string }[] = [
    { s: "body", sub: [p.heightCm && `${p.heightCm} см`, p.weightKg && `${String(p.weightKg).replace(".", ",")} кг`, LEVELS[p.level]].filter(Boolean).join(" · ") },
    { s: "goal", sub: [GOALS[p.goal].name, p.focusMuscles.length ? `фокус: ${[...new Set(p.focusMuscles.map((m) => MUSCLES[m].group.toLowerCase()))].join(", ")}` : null].filter(Boolean).join(" · ") },
    { s: "place", sub: `${p.locations.map((l) => LOCATIONS[l]).join(", ")} · ${p.daysPerWeek}×/нед · ${p.sessionMin} мин` },
    { s: "health", sub: p.problemZones.length ? p.problemZones.map((z) => ZONES[z.zone]).join(", ") : "Нет проблемных зон" },
    { s: "baselines", sub: p.baselines.benchKg ? `Жим ${p.baselines.benchKg} кг × ${p.baselines.benchReps ?? "?"}` : "Не заполнено" },
    { s: "reminders", sub: (() => { const r = state.meta.reminders; return r ? [r.waterEveryMin ? `вода раз в ${r.waterEveryMin / 60} ч` : null, r.workoutGapDays ? `тренировка после ${r.workoutGapDays} дн. перерыва` : null, r.checkin ? "чек-ин утром" : null].filter(Boolean).join(" · ") || "Выключены" : "Выключены"; })() },
    { s: "circuit", sub: p.circuit.enabled ? `${p.circuit.position === "start" ? "После разминки" : "В конце"} · ${p.circuit.stations.map((x) => x.reps).join("-")}` : "Выключен" },
  ];
  return (
    <>
      <TopBar title="Профиль" />
      <div className="screen">
        <div className="list">
          {rows.map((r) => (
            <button key={r.s} className="list-item" onClick={() => nav.push({ name: "profile-edit", section: r.s })}>
              <div className="grow">
                <div className="title">{TITLES[r.s]}</div>
                <div className="sub">{r.sub}</div>
              </div>
              <Icon name="chev" className="chev" />
            </button>
          ))}
        </div>
        <div className="list">
          <button className="list-item" onClick={() => (program ? nav.push({ name: "program", id: program.id }) : (nav.setTab("workouts"), nav.push({ name: "recommend" })))}>
            <div className="grow">
              <div className="title">Программа</div>
              <div className="sub">{program?.name ?? "Не выбрана"}</div>
            </div>
            <Icon name="chev" className="chev" />
          </button>
          <button className="list-item" onClick={() => nav.push({ name: "data" })}>
            <Icon name={sync.mode === "on" ? "cloud" : "cloudOff"} className="chev" />
            <div className="grow">
              <div className="title">Данные и синхронизация</div>
              <div className="sub">{syncLabel(sync.mode, sync.pending)}</div>
            </div>
            <Icon name="chev" className="chev" />
          </button>
          <button className="list-item" onClick={() => nav.push({ name: "about" })}>
            <Icon name="shield" className="chev" />
            <div className="grow">
              <div className="title">О приложении</div>
              <div className="sub">Приватность и важные оговорки</div>
            </div>
            <Icon name="chev" className="chev" />
          </button>
        </div>
      </div>
    </>
  );
}

export function syncLabel(mode: string, pending: number): string {
  if (mode === "on") return pending ? `Отправляется: ${pending}` : "Синхронизировано с облаком";
  if (mode === "connecting") return pending ? `Ждёт связи: ${pending}` : "Подключение…";
  if (mode === "error") return "Ошибка синхронизации";
  return "Только на этом устройстве";
}

export function ProfileEdit({ section }: { section: Section }) {
  if (section === "reminders") return <RemindersEdit />;
  return <ProfileEditInner section={section} />;
}

function RemindersEdit() {
  const nav = useNav();
  const r = useStore((s) => s.meta.reminders) ?? defaultReminders();
  const set = (patch: Partial<Reminders>) => updateMeta((m) => ({ ...m, reminders: { ...defaultReminders(), ...m.reminders, ...patch } }));
  return (
    <>
      <TopBar title="Напоминания" onBack={nav.back} />
      <div className="screen">
        <Note>Приложение работает внутри Claude и не может присылать push-уведомления. Напоминания показываются на экране «Сегодня», когда открываешь приложение. Для точного времени поставь будильник в телефоне.</Note>
        <div className="field">
          <span className="label">Вода: напомнить, если не пил дольше</span>
          <Segmented id="rem-water" value={r.waterEveryMin ?? 0} onChange={(v) => set({ waterEveryMin: v || null })} options={[{ value: 0, label: "Выкл" }, { value: 60, label: "1 ч" }, { value: 90, label: "1,5 ч" }, { value: 120, label: "2 ч" }, { value: 180, label: "3 ч" }]} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="rem-from">Активно с</label>
            <input id="rem-from" type="time" className="input num" value={r.activeFrom} onChange={(e) => e.target.value && set({ activeFrom: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="rem-to">до</label>
            <input id="rem-to" type="time" className="input num" value={r.activeTo} onChange={(e) => e.target.value && set({ activeTo: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <span className="label">Тренировка: напомнить, если перерыв</span>
          <Segmented id="rem-gap" value={r.workoutGapDays ?? 0} onChange={(v) => set({ workoutGapDays: v || null })} options={[{ value: 0, label: "Выкл" }, { value: 3, label: "3 дн" }, { value: 4, label: "4 дн" }, { value: 5, label: "5 дн" }, { value: 7, label: "7 дн" }]} />
        </div>
        <label className="row">
          <input type="checkbox" checked={r.checkin} onChange={(e) => set({ checkin: e.target.checked })} />
          Утром напоминать отметить самочувствие и сон
        </label>
      </div>
    </>
  );
}

function ProfileEditInner({ section }: { section: Exclude<Section, "reminders"> }) {
  const nav = useNav();
  const [p, setP] = useState<Profile>(() => getState().meta.profile);
  // Актуальный профиль для обработчиков: значения, зафиксированные на blur, не должны теряться.
  const latest = useRef(p);
  latest.current = p;
  const set = (patch: Partial<Profile>) =>
    setP((cur) => {
      const next = { ...cur, ...patch };
      latest.current = next;
      return next;
    });
  const save = async () => {
    // Сначала дать полям завершить ввод (onBlur), затем сохранить.
    (document.activeElement as HTMLElement | null)?.blur?.();
    await new Promise((r) => setTimeout(r, 0));
    const next = latest.current;
    await updateMeta((m) => {
      const goalChanged = m.profile.goal !== next.goal;
      return { ...m, profile: next, goalHistory: goalChanged ? [...m.goalHistory, { goal: next.goal, at: Date.now() }] : m.goalHistory };
    });
    toast("Сохранено");
    nav.back();
  };
  return (
    <>
      <TopBar title={TITLES[section]} onBack={nav.back} actions={<button className="btn primary small" onClick={save}>Сохранить</button>} />
      <div className="screen">
        {section === "body" && <BodySection p={p} set={set} />}
        {section === "goal" && <GoalSection p={p} set={set} />}
        {section === "place" && <PlaceSection p={p} set={set} />}
        {section === "health" && <HealthSection p={p} set={set} />}
        {section === "baselines" && <BaselinesSection p={p} set={set} />}
        {section === "circuit" && <CircuitSection p={p} set={set} />}
        <button className="btn primary big block" onClick={save}>
          Сохранить
        </button>
      </div>
    </>
  );
}

export function DataScreen() {
  const nav = useNav();
  const state = useStore((s) => s);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fallbackJson, setFallbackJson] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const sync = state.sync;
  const counts = { sessions: Object.values(state.sessions).filter((s) => !s.deletedAt).length };

  const onExport = async () => {
    const r = await exportToFile();
    if (r.ok) toast("Файл сохранён");
    else if (r.reason === "declined") toast("Сохранение отменено");
    else setFallbackJson(r.json);
  };

  const onImport = async (file: File) => {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Файл слишком большой");
      const text = await file.text();
      const r = await importFromText(text);
      toast(`Импорт: тренировок ${r.sessions}${r.profile ? ", профиль обновлён" : ""}${r.skipped ? `, пропущено ${r.skipped}` : ""}`);
    } catch (e) {
      toast((e as Error).message || "Не удалось прочитать файл");
    }
  };

  return (
    <>
      <TopBar title="Данные" onBack={nav.back} />
      <div className="screen">
        <div className="card">
          <div className="row">
            <Icon name={sync.mode === "on" ? "cloud" : "cloudOff"} />
            <div className="grow">
              <div className="title" style={{ fontWeight: 600 }}>
                {syncLabel(sync.mode, sync.pending)}
              </div>
              {sync.lastSyncAt && (
                <div className="small muted">
                  Последняя синхронизация: {fmtShort(sync.lastSyncAt)}, {fmtTime(sync.lastSyncAt)}
                </div>
              )}
            </div>
          </div>
          {sync.message && <p className="small dim">{sync.message}</p>}
          <dl className="kv">
            <dt>На устройстве</dt>
            <dd>{state.localStorage ? "сохраняется (IndexedDB)" : "недоступно в этом окне — только в облаке"}</dd>
            <dt>Тренировок</dt>
            <dd>{counts.sessions}</dd>
          </dl>
          {sync.mode !== "off" && (
            <button className="btn" onClick={() => syncNow().then(() => toast("Синхронизация выполнена"))}>
              Синхронизировать сейчас
            </button>
          )}
        </div>
        <Note>
          Данные пишутся сначала на телефон, затем в твоё личное хранилище в облаке Claude, которое видишь только ты. Если очистить данные браузера, история восстановится из облака при следующем открытии.
        </Note>

        <section className="section">
          <div className="section-head">
            <h2>Резервная копия</h2>
          </div>
          <div className="grid-2">
            <button className="btn" onClick={() => exportCsv("workouts").then((r) => toast(r === "saved" ? "Файл сохранён" : r === "declined" ? "Сохранение отменено" : "Сохранение файлов здесь недоступно"))}>
              Тренировки CSV
            </button>
            <button className="btn" onClick={() => exportCsv("days").then((r) => toast(r === "saved" ? "Файл сохранён" : r === "declined" ? "Сохранение отменено" : "Сохранение файлов здесь недоступно"))}>
              Дневник CSV
            </button>
          </div>
          <p className="xs muted">CSV открывается в Excel и Google Таблицах: подходы по каждой тренировке; вода, сон, питание и замеры по дням.</p>
          <div className="grid-2">
            <button className="btn" onClick={onExport}>
              <Icon name="download" size={18} /> Экспорт
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={18} /> Импорт
            </button>
          </div>
          <input
            ref={fileRef}
            id="import-file"
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = "";
            }}
          />
          <p className="xs muted">Импорт добавляет записи и обновляет те, что в файле новее. Ничего не удаляет.</p>
          {fallbackJson && (
            <div className="field">
              <label htmlFor="export-json">Сохранение файлов здесь недоступно. Скопируй текст и сохрани его в заметки или файл:</label>
              <textarea id="export-json" className="textarea num xs" readOnly value={fallbackJson} rows={6} onFocus={(e) => e.target.select()} />
              <button
                className="btn small"
                onClick={() =>
                  navigator.clipboard?.writeText(fallbackJson).then(
                    () => toast("Скопировано"),
                    () => toast("Выдели текст и скопируй вручную"),
                  )
                }
              >
                Скопировать
              </button>
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Это устройство</h2>
          </div>
          <button className="btn danger" onClick={() => setConfirmReset(true)}>
            Очистить данные на устройстве
          </button>
          <p className="xs muted">Облачная копия останется, и данные загрузятся снова при следующей синхронизации.</p>
        </section>
      </div>
      {confirmReset && (
        <Confirm
          title="Очистить данные на устройстве?"
          text="Локальная копия удалится. Неотправленные изменения пропадут. Облачная копия останется."
          confirmLabel="Очистить"
          danger
          onConfirm={() =>
            resetLocal().then(() => {
              toast("Локальные данные очищены");
              void syncNow();
            })
          }
          onClose={() => setConfirmReset(false)}
        />
      )}
    </>
  );
}

export function AboutScreen() {
  const nav = useNav();
  return (
    <>
      <TopBar title="О приложении" onBack={nav.back} />
      <div className="screen">
        <MedicalNote />
        <section className="section">
          <div className="section-head">
            <h2>Приватность</h2>
          </div>
          <ul className="stack gap-s small dim" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Профиль, вес и тренировки хранятся на устройстве и в твоём личном хранилище артефакта. Другие люди их не видят, даже если поделиться ссылкой.</li>
            <li>Нет аналитики и сторонних трекеров. Шрифты встроены в приложение.</li>
            <li>На этапе 4 наружу (в Claude) будут уходить только фото и текст еды — без веса и профиля.</li>
          </ul>
        </section>
        <section className="section">
          <div className="section-head">
            <h2>Про контент</h2>
          </div>
          <p className="small dim">
            Описания техники — общие ориентиры. Упражнения с пометкой «проверить» — навыки, где технику лучше поставить с тренером. Расчётный максимум и стартовые веса — оценки.
          </p>
        </section>
        <p className="xs muted">Версия 0.1 · Этап 1</p>
      </div>
    </>
  );
}
