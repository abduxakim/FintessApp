import React, { useMemo } from "react";
import { EXERCISE_BY_ID } from "../../data/catalog";
import { liveSessions, useStore } from "../../data/store";
import { useNav, useScreenState } from "../../app/nav";
import { weekSummary } from "../../domain/weekly";
import { dailyTargets } from "../../domain/nutrition";
import { fmtDuration, fmtKg, fmtShort, fmtTonnage, plural } from "../../domain/format";
import { TopBar } from "../../ui/kit";
import { Icon } from "../../ui/icons";

export function WeekScreen() {
  const nav = useNav();
  const sessions = useStore(liveSessions);
  const days = useStore((s) => s.days);
  const profile = useStore((s) => s.meta.profile);
  const [offset, setOffset] = useScreenState("week", 0);
  const w = useMemo(() => weekSummary(sessions, days, profile, EXERCISE_BY_ID, offset), [sessions, days, profile, offset]);
  const t = dailyTargets(profile, w.weightEnd ?? profile.weightKg, false).targets;
  const pct = (v: number | null, target: number | undefined) => (v != null && target ? `${Math.round((v / target) * 100)}%` : "—");
  const max = Math.max(1, ...w.load.map((l) => Math.max(l.sets, l.target)));
  return (
    <>
      <TopBar title="Неделя" onBack={nav.back} />
      <div className="screen">
        <div className="row">
          <button className="icon-btn" aria-label="Предыдущая неделя" onClick={() => setOffset(offset + 1)}>
            <Icon name="back" />
          </button>
          <b className="grow" style={{ textAlign: "center" }}>
            {offset === 0 ? "Эта неделя" : `${fmtShort(w.from)} — ${fmtShort(w.to - 1)}`}
          </b>
          <button className="icon-btn" aria-label="Следующая неделя" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 1))}>
            <Icon name="chev" />
          </button>
        </div>
        <div className="stats">
          <div className="stat card tight">
            <span className="v">{w.workouts}</span>
            <span className="k">{plural(w.workouts, ["тренировка", "тренировки", "тренировок"])}</span>
          </div>
          <div className="stat card tight">
            <span className="v">{w.sets}</span>
            <span className="k">подходов</span>
          </div>
          <div className="stat card tight">
            <span className="v">{w.prs}</span>
            <span className="k">рекордов</span>
          </div>
        </div>
        <p className="small dim">
          Время в зале: {fmtDuration(w.minutes * 60000)} · объём {fmtTonnage(w.volume)}
        </p>
        <section className="card tight" aria-label="Нагрузка по группам за неделю">
          <div className="section-head">
            <h2 className="eyebrow">Нагрузка по группам</h2>
            <span className="xs muted">подходы / ориентир</span>
          </div>
          {w.load.map((l) => (
            <div key={l.group} className="emphasis-row">
              <span className="small">{l.group}</span>
              <span className="emphasis-bar" style={{ position: "relative" }}>
                <span style={{ width: `${Math.max(l.sets ? 6 : 0, (l.sets / max) * 100)}%` }} />
              </span>
              <span className="small num">
                {l.sets}/{l.target}
              </span>
            </div>
          ))}
        </section>
        <div className="list">
          <div className="list-item">
            <span className="grow">Сон</span>
            <span className="num small">{w.sleepAvg != null ? `${fmtKg(Math.round(w.sleepAvg * 10) / 10)} ч в среднем · ${w.sleepDays} дн.` : "нет записей"}</span>
          </div>
          <div className="list-item">
            <span className="grow">Вода</span>
            <span className="num small">{w.waterAvg != null ? `${Math.round(w.waterAvg)} мл/день · ${pct(w.waterAvg, t?.water)}` : "нет записей"}</span>
          </div>
          <div className="list-item">
            <span className="grow">Калории</span>
            <span className="num small">{w.kcalAvg != null ? `≈${Math.round(w.kcalAvg)} ккал · ${pct(w.kcalAvg, t?.kcal)} · ${w.foodDays} дн.` : "нет записей"}</span>
          </div>
          <div className="list-item">
            <span className="grow">Белок</span>
            <span className="num small">{w.proteinAvg != null ? `≈${Math.round(w.proteinAvg)} г · ${pct(w.proteinAvg, t?.protein)}` : "нет записей"}</span>
          </div>
          <div className="list-item">
            <span className="grow">Готовность</span>
            <span className="num small">{w.readinessAvg != null ? `${Math.round(w.readinessAvg)} из 100` : "нет чек-инов"}</span>
          </div>
          <div className="list-item">
            <span className="grow">Вес тела</span>
            <span className="num small">
              {w.weightEnd != null ? `${fmtKg(w.weightEnd)} кг${w.weightStart != null && w.weightStart !== w.weightEnd ? ` (было ${fmtKg(w.weightStart)})` : ""}` : "нет замеров"}
            </span>
          </div>
        </div>
        <p className="xs muted">Средние считаются по дням, где есть записи. Калории и белок — оценки по фото и описаниям.</p>
      </div>
    </>
  );
}
