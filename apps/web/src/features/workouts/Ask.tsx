import React, { useRef, useState } from "react";
import { EXERCISES, EXERCISE_BY_ID } from "../../data/catalog";
import { getState, liveSessions } from "../../data/store";
import { capability } from "../../data/runtime";
import { useNav } from "../../app/nav";
import { preparePlan } from "../../app/actions";
import { groupLoad } from "../../domain/balance";
import { buildPrompt, localPlan, parsePlan } from "../../domain/planner";
import { Note, TopBar } from "../../ui/kit";
import { Icon } from "../../ui/icons";

type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: (input: string, opts?: Record<string, unknown>) => Promise<unknown>;
};

const EXAMPLES = ["Спина и ноги, около 80 минут", "Короткая на руки за 40 минут", "Хочу прокачать икры и плечи", "Устал, что-то лёгкое на 30 минут", "Улица: турник и брусья"];

const ERRORS: Record<string, string> = {
  not_granted: "Доступ к Claude не разрешён — составил по ключевым словам.",
  rate_limited: "Лимит запросов к Claude исчерпан — составил по ключевым словам.",
  invalid_json: "Claude ответил не в том формате — составил по ключевым словам.",
};

export function AskScreen() {
  const nav = useNav();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);

  const done = (plan: ReturnType<typeof localPlan>, note?: string) => {
    preparePlan(note ? { ...plan, rationale: `${note} ${plan.rationale}` } : plan);
    setBusy(false);
    setStatus(null);
    nav.push({ name: "preview" });
  };

  const build = async (useClaude: boolean) => {
    const q = text.trim();
    if (!q) return;
    const st = getState();
    const profile = st.meta.profile;
    const load = groupLoad(liveSessions(st), EXERCISE_BY_ID, profile);
    const local = () => localPlan(q, profile, EXERCISES, EXERCISE_BY_ID, load);
    if (!useClaude) return done(local());

    const sample = await capability<SampleFn>("sample");
    if (!sample) return done(local(), "Claude недоступен в этом окне — составил по ключевым словам.");
    setBusy(true);
    setStatus("Claude составляет тренировку… обычно 10–40 секунд");
    ctl.current = new AbortController();
    try {
      const raw = await sample.json(buildPrompt(q, profile, EXERCISES, load), { signal: ctl.current.signal, modelTier: "default" });
      const plan = parsePlan(raw, EXERCISE_BY_ID);
      if (!plan) return done(local(), "Ответ Claude не подошёл — составил по ключевым словам.");
      done(plan);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      setBusy(false);
      setStatus(null);
      if (code === "cancelled") return;
      done(local(), ERRORS[code] ?? "Claude сейчас недоступен — составил по ключевым словам.");
    }
  };

  return (
    <>
      <TopBar title="Тренировка по запросу" onBack={nav.back} />
      <div className="screen">
        <p className="dim">Опиши, что хочешь сегодня: какие мышцы, сколько времени, где, как себя чувствуешь. Получишь план, который можно поправить перед стартом.</p>
        <div className="field">
          <label htmlFor="ask-text">Запрос</label>
          <textarea id="ask-text" className="textarea" rows={3} maxLength={500} value={text} placeholder="Например: спина и ноги, час, плечо сегодня ноет" onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="chips">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip" onClick={() => setText(ex)}>
              {ex}
            </button>
          ))}
        </div>
        {busy ? (
          <div className="card tight">
            <p className="small">{status}</p>
            <button className="btn" onClick={() => ctl.current?.abort()}>
              Остановить
            </button>
          </div>
        ) : (
          <div className="stack">
            <button className="btn primary big block" disabled={!text.trim()} onClick={() => build(true)}>
              <Icon name="spark" size={18} /> Составить с Claude
            </button>
            <button className="btn block" disabled={!text.trim()} onClick={() => build(false)}>
              Быстро, без Claude
            </button>
          </div>
        )}
        <Note>
          В Claude уходят только твой запрос, цель, уровень, оборудование, ограничения (например, «левое плечо») и число подходов за неделю. Вес, замеры и заметки — нет. Если упоминаешь боль — приложение не ставит диагнозов; при боли лучше обратиться к врачу.
        </Note>
      </div>
    </>
  );
}
