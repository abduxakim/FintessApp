import React, { useMemo, useRef, useState } from "react";
import { EXERCISES } from "../../data/catalog";
import { CATEGORIES, DIFFICULTY, EQUIPMENT, LOCATIONS, MUSCLES } from "../../data/seed/labels";
import type { Category, EquipmentId, Exercise, Location, MuscleId } from "../../data/types";
import { BodyMap, MAP_MUSCLES } from "../../ui/BodyMap";
import { useStore } from "../../data/store";
import { useNav } from "../../app/nav";
import { Chip, Sheet, TopBar } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { isAvailable } from "../../domain/availability";
import { norm } from "../profile/forms";

const GROUPS = ["Грудь", "Спина", "Плечи", "Руки", "Кор", "Ноги"] as const;

interface Filters {
  group: string | null;
  /** Несколько мышц: показываются упражнения хотя бы на одну из них. */
  muscles: MuscleId[];
  withSecondary: boolean;
  location: Location | null;
  category: Category | null;
  equipment: EquipmentId | null;
  mine: boolean;
}

export function filterExercises(list: Exercise[], q: string, f: Filters, available: (e: Exercise) => boolean): Exercise[] {
  const nq = norm(q);
  return list.filter((e) => {
    if (nq && !norm(e.name).includes(nq) && !norm(e.nameEn).includes(nq) && !e.primary.some((m) => norm(MUSCLES[m].name).includes(nq))) return false;
    if (f.group && !e.primary.some((m) => MUSCLES[m].group === f.group)) return false;
    if (f.muscles.length && !f.muscles.some((m) => e.primary.includes(m) || (f.withSecondary && e.secondary.includes(m)))) return false;
    if (f.location && !e.locations.includes(f.location)) return false;
    if (f.category && e.category !== f.category) return false;
    if (f.equipment && !e.equipment.includes(f.equipment)) return false;
    if (f.mine && !available(e)) return false;
    return true;
  });
}

export function Library() {
  const nav = useNav();
  const profile = useStore((s) => s.meta.profile);
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filters>({ group: null, muscles: [], withSecondary: false, location: null, category: null, equipment: null, mine: false });
  const [showMap, setShowMap] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const toggleMuscle = (m: MuscleId) => setF((cur) => ({ ...cur, group: null, muscles: cur.muscles.includes(m) ? cur.muscles.filter((x) => x !== m) : [...cur.muscles, m] }));
  const [more, setMore] = useState(false);
  const loc = profile.locations[0] ?? "gym";
  const list = useMemo(() => filterExercises(EXERCISES, q, f, (e) => isAvailable(e, profile, f.location ?? loc)), [q, f, profile, loc]);
  const extra = (f.location ? 1 : 0) + (f.category ? 1 : 0) + (f.equipment ? 1 : 0) + (f.mine ? 1 : 0);

  return (
    <>
      <TopBar title="Упражнения" onBack={nav.depth ? nav.back : undefined} />
      <div className="screen">
        <div className="search">
          <Icon name="search" size={18} />
          <input id="lib-search" className="input" placeholder="Название или мышца" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chips scroll">
          <Chip on={showMap} onClick={() => setShowMap(!showMap)}>
            Мышцы на схеме
          </Chip>
          <Chip on={!f.group && !f.muscles.length} onClick={() => setF({ ...f, group: null, muscles: [] })}>
            Все
          </Chip>
          {GROUPS.map((g) => (
            <Chip key={g} on={f.group === g} onClick={() => setF({ ...f, muscles: [], group: f.group === g ? null : g })}>
              {g}
            </Chip>
          ))}
        </div>
        {showMap && (
          <div className="card tight">
            <BodyMap primary={f.muscles} onSelect={toggleMuscle} />
            <div className="chips">
              {MAP_MUSCLES.map((m) => (
                <Chip key={m} on={f.muscles.includes(m)} onClick={() => toggleMuscle(m)}>
                  {MUSCLES[m].name}
                </Chip>
              ))}
            </div>
            <label className="row small">
              <input type="checkbox" checked={f.withSecondary} onChange={(e) => setF({ ...f, withSecondary: e.target.checked })} />
              Показывать и упражнения, где мышца помогает
            </label>
          </div>
        )}
        {f.muscles.length > 0 && (
          <div className="row wrap small">
            <span>
              {f.muscles.length > 1 ? "Мышцы" : "Мышца"}: <b>{f.muscles.map((m) => MUSCLES[m].name).join(", ")}</b>
            </span>
            <button className="btn small primary" onClick={() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              Показать {list.length} упр.
            </button>
            <button className="btn small ghost" onClick={() => setF({ ...f, muscles: [] })}>
              Сбросить
            </button>
          </div>
        )}
        <div className="row">
          <button className="btn small" onClick={() => nav.push({ name: "photo" })}>
            <Icon name="camera" size={16} /> По фото
          </button>
          <button className="btn small" onClick={() => setMore(true)}>
            Фильтры{extra ? ` · ${extra}` : ""}
          </button>
          <span className="small muted grow" style={{ textAlign: "right" }}>
            {list.length} упр.
          </span>
        </div>
        <div className="list" ref={listRef} style={{ scrollMarginTop: 72 }}>
          {list.map((e) => (
            <button key={e.id} className="list-item" onClick={() => nav.push({ name: "exercise", id: e.id })}>
              <div className="grow">
                <div className="row">
                  <span className="title">{e.name}</span>
                  {e.review === "check" && <span className="pill warn">проверить</span>}
                </div>
                <div className="sub">
                  {e.primary.map((m) => MUSCLES[m].name).join(", ") || CATEGORIES[e.category]} · {e.equipment.length ? e.equipment.map((x) => EQUIPMENT[x]).join(", ") : "свой вес"}
                </div>
              </div>
              <Icon name="chev" className="chev" />
            </button>
          ))}
          {!list.length && <div className="list-item muted">Ничего не найдено. Сбрось фильтры.</div>}
        </div>
      </div>
      {more && (
        <Sheet title="Фильтры" onClose={() => setMore(false)}>
          <div className="field">
            <span className="label">Место</span>
            <div className="chips">
              {(Object.keys(LOCATIONS) as Location[]).map((l) => (
                <Chip key={l} on={f.location === l} onClick={() => setF({ ...f, location: f.location === l ? null : l })}>
                  {LOCATIONS[l]}
                </Chip>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">Тип</span>
            <div className="chips">
              {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                <Chip key={c} on={f.category === c} onClick={() => setF({ ...f, category: f.category === c ? null : c })}>
                  {CATEGORIES[c]}
                </Chip>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">Оборудование</span>
            <div className="chips">
              {(Object.keys(EQUIPMENT) as EquipmentId[]).map((c) => (
                <Chip key={c} on={f.equipment === c} onClick={() => setF({ ...f, equipment: f.equipment === c ? null : c })}>
                  {EQUIPMENT[c]}
                </Chip>
              ))}
            </div>
          </div>
          <label className="row">
            <input type="checkbox" checked={f.mine} onChange={(e) => setF({ ...f, mine: e.target.checked })} />
            Только доступные с моим оборудованием
          </label>
          <div className="grid-2">
            <button className="btn" onClick={() => setF({ ...f, location: null, category: null, equipment: null, mine: false })}>
              Сбросить
            </button>
            <button className="btn primary" onClick={() => setMore(false)}>
              Показать {list.length}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

export { DIFFICULTY };
