import React, { useMemo, useState } from "react";
import type { EquipmentId, FocusIntent, Location, Profile, ProblemZone } from "../../data/types";
import { EQUIPMENT, EQUIPMENT_PRESETS, FOCUS_AREAS, GOALS, INTENTS, LEVELS, LOCATIONS, MUSCLES, ZONES } from "../../data/seed/labels";
import { EXERCISES, EXERCISE_BY_ID } from "../../data/catalog";
import { Chip, MedicalNote, Note, NumField, Segmented, Sheet } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { uuidv7 } from "../../domain/ids";
import { StationPicker } from "../workout/Circuit";

export type Patch = (p: Partial<Profile>) => void;

export function BodySection({ p, set }: { p: Profile; set: Patch }) {
  return (
    <div className="stack gap-l">
      <div className="grid-2">
        <NumField id="height" label="Рост" suffix="см" step="int" value={p.heightCm} onChange={(v) => set({ heightCm: v })} />
        <NumField id="weight" label="Вес" suffix="кг" value={p.weightKg} onChange={(v) => set({ weightKg: v })} />
      </div>
      <div className="field">
        <span className="label">Опыт тренировок</span>
        <Segmented id="level" value={p.level} onChange={(v) => set({ level: v })} options={Object.entries(LEVELS).map(([value, label]) => ({ value: value as Profile["level"], label }))} />
        <span className="xs muted">Средний — регулярно тренируешься около года или больше.</span>
      </div>
      <div className="grid-2">
        <div className="field">
          <span className="label">Пол</span>
          <Segmented
            id="sex"
            value={p.sex ?? "none"}
            onChange={(v) => set({ sex: v === "none" ? null : (v as Profile["sex"]) })}
            options={[
              { value: "male", label: "М" },
              { value: "female", label: "Ж" },
              { value: "none", label: "—" },
            ]}
          />
        </div>
        <NumField id="birthYear" label="Год рождения" step="int" value={p.birthYear} onChange={(v) => set({ birthYear: v && v > 1900 && v < 2030 ? v : null })} />
      </div>
      <p className="xs muted">Вес, пол и возраст понадобятся на этапе питания для расчёта калорий. Хранятся в твоём личном хранилище.</p>
    </div>
  );
}

export function GoalSection({ p, set }: { p: Profile; set: Patch }) {
  const [picker, setPicker] = useState(false);
  const toggleArea = (muscles: Profile["focusMuscles"]) => {
    const on = muscles.every((m) => p.focusMuscles.includes(m));
    set({ focusMuscles: on ? p.focusMuscles.filter((m) => !muscles.includes(m)) : [...new Set([...p.focusMuscles, ...muscles])] });
  };
  return (
    <div className="stack gap-l">
      <div className="field">
        <span className="label">Главная цель</span>
        <div className="stack gap-s">
          {(Object.keys(GOALS) as Profile["goal"][]).map((g) => (
            <button key={g} type="button" className={"option" + (p.goal === g ? " on" : "")} onClick={() => set({ goal: g })} aria-pressed={p.goal === g}>
              <div className="grow">
                <div className="title">{GOALS[g].name}</div>
                <div className="sub">{GOALS[g].hint}</div>
              </div>
              {p.goal === g && <Icon name="check" />}
            </button>
          ))}
        </div>
        <span className="xs muted">Цель можно поменять в любой момент в профиле.</span>
      </div>
      <div className="field">
        <span className="label">Приоритетные зоны</span>
        <div className="chips">
          {FOCUS_AREAS.map((a) => (
            <Chip key={a.id} on={a.muscles.every((m) => p.focusMuscles.includes(m))} onClick={() => toggleArea(a.muscles)}>
              {a.name}
            </Chip>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">Упражнения в фокусе</span>
        {p.focusExercises.length > 0 && (
          <div className="list">
            {p.focusExercises.map((f) => (
              <div key={f.exerciseId} className="list-item">
                <div className="grow">
                  <div className="title">{EXERCISE_BY_ID[f.exerciseId]?.name ?? f.exerciseId}</div>
                  <select
                    className="select small"
                    style={{ minHeight: 34, marginTop: 6, width: "auto" }}
                    value={f.intent}
                    aria-label="Что хочешь сделать"
                    onChange={(e) => set({ focusExercises: p.focusExercises.map((x) => (x.exerciseId === f.exerciseId ? { ...x, intent: e.target.value as FocusIntent } : x)) })}
                  >
                    {Object.entries(INTENTS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="icon-btn" aria-label="Убрать" onClick={() => set({ focusExercises: p.focusExercises.filter((x) => x.exerciseId !== f.exerciseId) })}>
                  <Icon name="close" size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => setPicker(true)}>
          <Icon name="plus" size={18} /> Добавить упражнение
        </button>
      </div>
      {picker && (
        <ExercisePickerSheet
          exclude={p.focusExercises.map((f) => f.exerciseId)}
          onPick={(id) => {
            set({ focusExercises: [...p.focusExercises, { exerciseId: id, intent: "improve" }] });
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}

export function ExercisePickerSheet({ onPick, onClose, exclude = [], title = "Выбери упражнение", ids }: { onPick: (id: string) => void; onClose: () => void; exclude?: string[]; title?: string; ids?: string[] }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const nq = norm(q);
    const pool = ids ? ids.map((id) => EXERCISE_BY_ID[id]).filter(Boolean) : EXERCISES;
    // Ищем и по названию, и по мышцам: «икр» найдёт подъёмы на носки.
    return pool
      .filter((e) => !exclude.includes(e.id) && (!nq || norm(e.name).includes(nq) || norm(e.nameEn).includes(nq) || e.primary.some((m) => norm(MUSCLES[m].name).includes(nq) || norm(MUSCLES[m].group).includes(nq))))
      .slice(0, 80);
  }, [q, exclude, ids]);
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="search">
        <Icon name="search" size={18} />
        <input id="picker-search" className="input" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="list">
        {list.map((e) => (
          <button key={e.id} className="list-item" onClick={() => onPick(e.id)}>
            <div className="grow">
              <div className="title">{e.name}</div>
              <div className="sub">
                {e.primary.map((m) => MUSCLES[m].name).join(", ") || "—"} · {e.equipment.length ? e.equipment.map((x) => EQUIPMENT[x]).join(", ") : "свой вес"}
              </div>
            </div>
            <Icon name="plus" size={18} className="chev" />
          </button>
        ))}
        {!list.length && <div className="list-item muted">Ничего не найдено</div>}
      </div>
    </Sheet>
  );
}

export const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").trim();

export function PlaceSection({ p, set }: { p: Profile; set: Patch }) {
  const [editLoc, setEditLoc] = useState<Location>(p.locations[0] ?? "gym");
  const toggleLoc = (l: Location) => {
    const has = p.locations.includes(l);
    if (has && p.locations.length === 1) return;
    set({ locations: has ? p.locations.filter((x) => x !== l) : [...p.locations, l] });
  };
  const makePrimary = (l: Location) => set({ locations: [l, ...p.locations.filter((x) => x !== l)] });
  const eq = p.equipment[editLoc] ?? [];
  const toggleEq = (e: EquipmentId) => set({ equipment: { ...p.equipment, [editLoc]: eq.includes(e) ? eq.filter((x) => x !== e) : [...eq, e] } });
  return (
    <div className="stack gap-l">
      <div className="field">
        <span className="label">Где тренируешься</span>
        <div className="chips">
          {(Object.keys(LOCATIONS) as Location[]).map((l) => (
            <Chip key={l} on={p.locations.includes(l)} onClick={() => toggleLoc(l)}>
              {LOCATIONS[l]}
              {p.locations[0] === l && <span className="pill accent">основное</span>}
            </Chip>
          ))}
        </div>
        {p.locations.length > 1 && (
          <div className="row wrap small muted">
            Основное место:
            {p.locations.map((l) => (
              <button key={l} type="button" className={"btn small" + (p.locations[0] === l ? " primary" : "")} onClick={() => makePrimary(l)}>
                {LOCATIONS[l]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="field">
        <span className="label">Оборудование</span>
        <Segmented id="eq-loc" value={editLoc} onChange={setEditLoc} options={p.locations.map((l) => ({ value: l, label: LOCATIONS[l] }))} />
        <div className="chips">
          {(Object.keys(EQUIPMENT) as EquipmentId[]).map((e) => (
            <Chip key={e} on={eq.includes(e)} onClick={() => toggleEq(e)}>
              {EQUIPMENT[e]}
            </Chip>
          ))}
        </div>
        <button type="button" className="btn small ghost" style={{ alignSelf: "flex-start" }} onClick={() => set({ equipment: { ...p.equipment, [editLoc]: [...EQUIPMENT_PRESETS[editLoc]] } })}>
          Типовой набор для «{LOCATIONS[editLoc]}»
        </button>
      </div>
      <div className="field">
        <span className="label">Тренировок в неделю (обычно)</span>
        <Segmented id="days" value={p.daysPerWeek} onChange={(v) => set({ daysPerWeek: v })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
        <span className="xs muted">Если график плавает — укажи реалистичный минимум. Программы идут по очереди, пропуски не страшны.</span>
      </div>
      <div className="field">
        <span className="label">Длительность тренировки</span>
        <Segmented id="minutes" value={p.sessionMin} onChange={(v) => set({ sessionMin: v })} options={[45, 60, 75, 90, 120].map((n) => ({ value: n, label: n < 120 ? `${n}` : "120+" }))} />
        <span className="xs muted">в минутах</span>
      </div>
      <div className="field">
        <span className="label">Удобное время</span>
        <Segmented
          id="time"
          value={p.preferredTime}
          onChange={(v) => set({ preferredTime: v })}
          options={[
            { value: "morning", label: "Утро" },
            { value: "day", label: "День" },
            { value: "evening", label: "Вечер" },
            { value: "any", label: "Любое" },
          ]}
        />
      </div>
    </div>
  );
}

export function HealthSection({ p, set }: { p: Profile; set: Patch }) {
  const addZone = () => set({ problemZones: [...p.problemZones, { id: uuidv7(), zone: "shoulder", side: "left", note: "", limitsHeavy: true }] });
  const upd = (id: string, patch: Partial<ProblemZone>) => set({ problemZones: p.problemZones.map((z) => (z.id === id ? { ...z, ...patch } : z)) });
  return (
    <div className="stack gap-l">
      <div className="field">
        <span className="label">Какая сторона слабее</span>
        <Segmented
          id="weak"
          value={p.weakSide ?? "none"}
          onChange={(v) => set({ weakSide: v === "none" ? null : (v as Profile["weakSide"]) })}
          options={[
            { value: "right", label: "Правая" },
            { value: "left", label: "Левая" },
            { value: "none", label: "Одинаково" },
          ]}
        />
        <span className="xs muted">В односторонних упражнениях начинаешь со слабой стороны, а сильной делаешь столько же повторов — не больше.</span>
      </div>
      <div className="field">
        <span className="label">Проблемные зоны</span>
        {p.problemZones.map((z) => (
          <div key={z.id} className="card tight">
            <div className="row">
              <select className="select" style={{ flex: 1 }} value={z.zone} aria-label="Зона" onChange={(e) => upd(z.id, { zone: e.target.value as ProblemZone["zone"] })}>
                {Object.entries(ZONES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button className="icon-btn" aria-label="Удалить зону" onClick={() => set({ problemZones: p.problemZones.filter((x) => x.id !== z.id) })}>
                <Icon name="trash" size={18} />
              </button>
            </div>
            <Segmented
              value={z.side ?? "none"}
              onChange={(v) => upd(z.id, { side: v === "none" ? null : (v as ProblemZone["side"]) })}
              options={[
                { value: "left", label: "Левое" },
                { value: "right", label: "Правое" },
                { value: "both", label: "Оба" },
                { value: "none", label: "—" },
              ]}
            />
            <input className="input" placeholder="Что беспокоит, например «щелчки»" value={z.note} maxLength={200} onChange={(e) => upd(z.id, { note: e.target.value })} aria-label="Описание" />
            <label className="row small">
              <input type="checkbox" checked={z.limitsHeavy} onChange={(e) => upd(z.id, { limitsHeavy: e.target.checked })} />
              Мешает работать с тяжёлыми весами
            </label>
          </div>
        ))}
        <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} onClick={addZone}>
          <Icon name="plus" size={18} /> Добавить зону
        </button>
      </div>
      <Note>
        Для проблемных зон приложение добавит в разминку блок активации и будет показывать напоминание в упражнениях, которые затрагивают эту зону. Полный раздел профилактики появится на этапе 2.
      </Note>
      <MedicalNote />
    </div>
  );
}

export function BaselinesSection({ p, set }: { p: Profile; set: Patch }) {
  const b = p.baselines;
  const setB = (patch: Partial<Profile["baselines"]>) => set({ baselines: { ...b, ...patch } });
  return (
    <div className="stack gap-l">
      <p className="dim small">Нужно, чтобы подставить стартовые веса. Можно пропустить — тогда вес подбираешь на первой тренировке, а дальше приложение подставляет прошлый результат.</p>
      <div className="grid-2">
        <NumField id="benchKg" label="Жим лёжа, рабочий вес" suffix="кг" value={b.benchKg} onChange={(v) => setB({ benchKg: v })} />
        <NumField id="benchReps" label="На сколько повторов" suffix="раз" step="int" value={b.benchReps} onChange={(v) => setB({ benchReps: v })} />
      </div>
      <div className="grid-2">
        <NumField id="pullups" label="Подтягивания, максимум" suffix="раз" step="int" value={b.pullups} onChange={(v) => setB({ pullups: v })} />
        <NumField id="dips" label="Брусья, максимум" suffix="раз" step="int" value={b.dips} onChange={(v) => setB({ dips: v })} />
      </div>
      <NumField id="pushups" label="Отжимания, максимум" suffix="раз" step="int" value={b.pushups} onChange={(v) => setB({ pushups: v })} />
    </div>
  );
}

export function CircuitSection({ p, set }: { p: Profile; set: Patch }) {
  const c = p.circuit;
  const setC = (patch: Partial<Profile["circuit"]>) => set({ circuit: { ...c, ...patch, configured: true } });
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div className="stack gap-l">
      <label className="row">
        <input type="checkbox" checked={c.enabled} onChange={(e) => setC({ enabled: e.target.checked })} />
        Добавлять круг в программные тренировки
      </label>
      <div className="field">
        <span className="label">Где</span>
        <Segmented
          id="circuit-pos"
          value={c.position}
          onChange={(v) => setC({ position: v })}
          options={[
            { value: "start", label: "После разминки" },
            { value: "end", label: "В конце" },
          ]}
        />
        <span className="xs muted">
          В начале круг работает как интенсивная разминка, но 25–40 подтягиваний и 50–80 отжиманий заранее утомляют спину и грудь — рабочие веса в основных упражнениях будут ниже. В конце он работает как добивка на выносливость и рельеф и не мешает силовой части.
        </span>
      </div>
      <div className="field">
        <span className="label">Станции</span>
        <div className="list">
          {c.stations.map((st, i) => (
            <div key={i} className="list-item">
              <input
                className="input num"
                style={{ width: 64, textAlign: "center" }}
                inputMode="numeric"
                aria-label={`Повторы, станция ${i + 1}`}
                defaultValue={st.reps}
                onBlur={(e) => {
                  const n = Math.round(Number(e.target.value.replace(",", ".")));
                  if (n > 0 && n <= 100) setC({ stations: c.stations.map((x, j) => (j === i ? { ...x, reps: n } : x)) });
                  else e.target.value = String(st.reps);
                }}
              />
              <button type="button" className="grow" style={{ background: "none", border: 0, textAlign: "left", padding: 0 }} onClick={() => setPick(i)}>
                <div className="title">{EXERCISE_BY_ID[st.exerciseId]?.name}</div>
                <div className="sub">Нажми, чтобы сменить вариацию</div>
              </button>
              <Icon name="swap" size={18} className="chev" />
            </div>
          ))}
        </div>
        <span className="xs muted">Вариации можно менять и прямо на тренировке — приложение запомнит последние.</span>
      </div>
      <div className="field">
        <span className="label">Цель</span>
        <Segmented
          id="circuit-target"
          value={c.targetRounds ?? 0}
          onChange={(v) => setC({ targetRounds: v || null })}
          options={[
            { value: 0, label: "Сколько успею" },
            { value: 3, label: "3" },
            { value: 5, label: "5" },
            { value: 8, label: "8" },
          ]}
        />
      </div>
      <div className="field">
        <span className="label">Лимит времени</span>
        <Segmented
          id="circuit-cap"
          value={c.timeCapMin ?? 0}
          onChange={(v) => setC({ timeCapMin: v || null })}
          options={[
            { value: 0, label: "Без лимита" },
            { value: 10, label: "10 мин" },
            { value: 20, label: "20 мин" },
          ]}
        />
      </div>
      {pick != null && (
        <StationPicker
          station={c.stations[pick]}
          index={pick}
          onClose={() => setPick(null)}
          onPick={(id) => {
            setC({ stations: c.stations.map((x, j) => (j === pick ? { ...x, exerciseId: id } : x)) });
            setPick(null);
          }}
        />
      )}
    </div>
  );
}
