import React, { useMemo, useState } from "react";
import { today, updateDay, updateMeta, useStore } from "../../data/store";
import type { BodyEntry, DayLog } from "../../data/types";
import { dayId, dayNoon } from "../../data/defaults";
import { useNav } from "../../app/nav";
import { NumField, TopBar, toast } from "../../ui/kit";
import { LineChart } from "../../ui/LineChart";
import { fmtKg, fmtShort } from "../../domain/format";
import { BODY_FIELDS, BODY_GENERAL, BODY_PAIRS, type BodyField } from "../../data/limits";

// Пары «левая | правая»: график двух сторон и разница Л − П.
const PAIRS: { l: keyof BodyEntry; r: keyof BodyEntry; title: string; chart: string; short: string; names: [string, string] }[] = [
  { l: "armL", r: "armR", title: "Руки: левая и правая", chart: "Объём рук слева и справа", short: "рука", names: ["Левая", "Правая"] },
  { l: "forearmL", r: "forearmR", title: "Предплечья: левое и правое", chart: "Объём предплечий слева и справа", short: "предплечье", names: ["Левое", "Правое"] },
  { l: "thighL", r: "thighR", title: "Бёдра: левое и правое", chart: "Объём бёдер слева и справа", short: "бедро", names: ["Левое", "Правое"] },
];

const dayMs = dayNoon;

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

  const pairCharts = PAIRS.map((p) => ({
    ...p,
    series: [
      { name: p.names[0], color: "var(--series-2)", points: series(days, p.l) },
      { name: p.names[1], color: "var(--series-1)", points: series(days, p.r) },
    ].filter((s) => s.points.length),
  })).filter((p) => p.series.length);
  const diff = (l?: number | null, r?: number | null) => (l && r ? `${l > r ? "+" : ""}${fmtKg(Math.round((l - r) * 10) / 10)} см` : null);
  const diffs = last ? PAIRS.map((p) => ({ short: p.short, d: diff(last[p.l], last[p.r]) })).filter((x) => x.d) : [];
  const field = (f: BodyField) => <NumField key={f.key} id={`body-${f.key}`} label={f.label} suffix={f.unit} max={f.max} value={draft[f.key] ?? null} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />;

  return (
    <>
      <TopBar title="Тело и замеры" onBack={nav.back} />
      <div className="screen">
        <section className="card">
          <div className="section-head">
            <h2 className="eyebrow">Замеры на сегодня</h2>
          </div>
          <div className="grid-2">{BODY_GENERAL.map(field)}</div>
          <span className="xs muted">Левая и правая сторона — для контроля асимметрии</span>
          <div className="grid-2">{BODY_PAIRS.map(field)}</div>
          <p className="xs muted">Мерь в одно и то же время, лучше утром. Руки — в самом широком месте, в расслабленном состоянии. Данные видишь только ты.</p>
          <button className="btn primary block" onClick={save}>
            Сохранить
          </button>
        </section>

        {diffs.length > 0 && (
          <p className="small">
            Разница Л − П:{" "}
            {diffs.map((x, i) => (
              <React.Fragment key={x.short}>
                {i > 0 && " · "}
                {x.short} <b className="num">{x.d}</b>
              </React.Fragment>
            ))}
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
        {pairCharts.map((p) => (
          <section key={p.l} className="section">
            <div className="section-head">
              <h2>{p.title}</h2>
            </div>
            <div className="card tight">
              <LineChart label={p.chart} unit="см" series={p.series} />
            </div>
          </section>
        ))}
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
                    {BODY_FIELDS.filter((f) => d.body?.[f.key])
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
