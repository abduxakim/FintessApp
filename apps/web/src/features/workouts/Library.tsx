import React, { useMemo, useState } from "react";
import { EXERCISES } from "../../data/catalog";
import { CATEGORIES, DIFFICULTY, EQUIPMENT, LOCATIONS, MUSCLES } from "../../data/seed/labels";
import type { Category, EquipmentId, Exercise, Location } from "../../data/types";
import { useStore } from "../../data/store";
import { useNav } from "../../app/nav";
import { Chip, Sheet, TopBar } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { isAvailable } from "../../domain/availability";
import { norm } from "../profile/forms";

const GROUPS = ["Грудь", "Спина", "Плечи", "Руки", "Кор", "Ноги"] as const;

interface Filters {
  group: string | null;
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
  const [f, setF] = useState<Filters>({ group: null, location: null, category: null, equipment: null, mine: false });
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
          <Chip on={!f.group} onClick={() => setF({ ...f, group: null })}>
            Все
          </Chip>
          {GROUPS.map((g) => (
            <Chip key={g} on={f.group === g} onClick={() => setF({ ...f, group: f.group === g ? null : g })}>
              {g}
            </Chip>
          ))}
        </div>
        <div className="row">
          <button className="btn small" onClick={() => setMore(true)}>
            Фильтры{extra ? ` · ${extra}` : ""}
          </button>
          <span className="small muted grow" style={{ textAlign: "right" }}>
            {list.length} упр.
          </span>
        </div>
        <div className="list">
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
            <button className="btn" onClick={() => setF({ group: f.group, location: null, category: null, equipment: null, mine: false })}>
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
