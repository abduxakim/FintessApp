import React, { useMemo, useState } from "react";
import { today, updateDay, updateMeta, useStore } from "../../data/store";
import type { BodyEntry, DayLog } from "../../data/types";
import { dayId } from "../../data/defaults";
import { useNav } from "../../app/nav";
import { NumField, TopBar, toast } from "../../ui/kit";
import { LineChart } from "../../ui/LineChart";
import { fmtKg, fmtShort } from "../../domain/format";

// Общие замеры и пары «левая | правая» — в два столбца, чтобы стороны стояли рядом.
const GENERAL: { key: keyof BodyEntry; label: string; unit: string }[] = [
  { key: "weightKg", label: "Вес", unit: "кг" },
  { key: "waistCm", label: "Талия", unit: "см" },
  { key: "chestCm", label: "Грудь", unit: "см" },
];
const PAIRS: { key: keyof BodyEntry; label: string; unit: string }[] = [
  { key: "armL", label: "Рука Л", unit: "см" },
  { key: "armR", label: "Рука П", unit: "см" },
  { key: "forearmL", label: "Предплечье Л", unit: "см" },
  { key: "forearmR", label: "Предплечье П", unit: "см" },
  { key: "thighL", label: "Бедро Л", unit: "см" },
  { key: "thighR", label: "Бедро П", unit: "см" },
];
const FIELDS = [...GENERAL, ...PAIRS];

const dayMs = (id: string) => {
  const [y, m, d] = id.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};

function series(days: DayLog[], key: keyof BodyEntry) {
  return days.filter((d) => d.body?.[key]).map((d) => ({ x: dayMs(d.id), y: d.body![key] as number }));
}

export function BodyScreen() {
  const nav = useNav();
  const allDays = useStore((s) => s.days);
  const todayLog = useStore((s) => today(s));
  const [draft, setDraft] = useState<BodyEntry>(() => ({ ...todayLog.body }));
  const days = useMemo(() => Object.values(allDays).filter((d) => d.body && Object.values(d.body).some((v) => v)).sort((a, b) => a.id.localeCompare(b.id)), [allDays]);
  const last = days[days.length - 1]?.body;

  const save = async () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    await new Promise((r) => setTimeout(r, 0));
    const clean = Object.fromEntries(Object.entries(draft).filter(([, v]) => v != null && v !== 0)) as BodyEntry;
    if (!Object.keys(clean).length) return toast("Введи хотя бы одно значение");
    await updateDay(dayId(), (d) => ({ ...d, body: clean }));
    if (clean.weightKg) await updateMeta((m) => (m.profile.weightKg === clean.weightKg ? m : { ...m, profile: { ...m.profile, weightKg: clean.weightKg! } }));
    toast("Замеры сохранены");
  };

  const arms = [
    { name: "Левая", color: "var(--series-2)", points: series(days, "armL") },
    { name: "Правая", color: "var(--series-1)", points: series(days, "armR") },
  ].filter((s) => s.points.length);
  const forearms = [
    { name: "Левое", color: "var(--series-2)", points: series(days, "forearmL") },
    { name: "Правое", color: "var(--series-1)", points: series(days, "forearmR") },
  ].filter((s) => s.points.length);
  const diff = (l?: number | null, r?: number | null) => (l && r ? `${l > r ? "+" : ""}${fmtKg(Math.round((l - r) * 10) / 10)} см` : null);

  return (
    <>
      <TopBar title="Тело и замеры" onBack={nav.back} />
      <div className="screen">
        <section className="card">
          <div className="section-head">
            <h2 className="eyebrow">Замеры на сегодня</h2>
          </div>
          <div className="grid-2">
            {GENERAL.map((f) => (
              <NumField key={f.key} id={`body-${f.key}`} label={f.label} suffix={f.unit} max={f.unit === "кг" ? 400 : 300} value={draft[f.key] ?? null} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
            ))}
          </div>
          <span className="xs muted">Левая и правая сторона — для контроля асимметрии</span>
          <div className="grid-2">
            {PAIRS.map((f) => (
              <NumField key={f.key} id={`body-${f.key}`} label={f.label} suffix={f.unit} max={f.unit === "кг" ? 400 : 300} value={draft[f.key] ?? null} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
            ))}
          </div>
          <p className="xs muted">Мерь в одно и то же время, лучше утром. Руки — в самом широком месте, в расслабленном состоянии. Данные видишь только ты.</p>
          <button className="btn primary block" onClick={save}>
            Сохранить
          </button>
        </section>

        {last && (diff(last.armL, last.armR) || diff(last.forearmL, last.forearmR)) && (
          <p className="small">
            Разница Л − П: {diff(last.armL, last.armR) && <>рука <b className="num">{diff(last.armL, last.armR)}</b></>}
            {diff(last.forearmL, last.forearmR) && <> · предплечье <b className="num">{diff(last.forearmL, last.forearmR)}</b></>}
          </p>
        )}

        <section className="section">
          <div className="section-head">
            <h2>Вес тела</h2>
          </div>
          <div className="card tight">
            <LineChart label="Вес тела по дням" unit="кг" series={[{ name: "Вес", color: "var(--accent)", points: series(days, "weightKg") }]} />
          </div>
        </section>
        {arms.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>Руки: левая и правая</h2>
            </div>
            <div className="card tight">
              <LineChart label="Объём рук слева и справа" unit="см" series={arms} />
            </div>
          </section>
        )}
        {forearms.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>Предплечья: левое и правое</h2>
            </div>
            <div className="card tight">
              <LineChart label="Объём предплечий слева и справа" unit="см" series={forearms} />
            </div>
          </section>
        )}
        {days.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2>Записи</h2>
            </div>
            <div className="list">
              {[...days].reverse().slice(0, 20).map((d) => (
                <div key={d.id} className="list-item">
                  <span className="small muted" style={{ width: 56 }}>
                    {fmtShort(dayMs(d.id))}
                  </span>
                  <span className="grow small num">
                    {FIELDS.filter((f) => d.body?.[f.key])
                      .map((f) => `${f.label} ${fmtKg(d.body![f.key] as number)}`)
                      .join(" · ")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
