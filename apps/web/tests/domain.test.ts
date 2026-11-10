import { describe, expect, it } from "vitest";
import { e1rm, setVolume, weightForReps, setReps } from "../src/domain/strength";
import { computeRecords, lastPerformance, sessionPRs } from "../src/domain/history";
import { alternatives, isAvailable, zoneCaution } from "../src/domain/availability";
import { recommendPrograms } from "../src/domain/recommend";
import { advanceEnrollment, baselineWeight, buildSessionFromProgram, finalizeSession, makeSessionExercise, newSet, pickVariant, programCycle, suggestedReps } from "../src/domain/session";
import { reviewSession } from "../src/domain/review";
import { defaultCircuit } from "../src/data/defaults";
import { parseNum, plural, fmtClock } from "../src/domain/format";
import { uuidv7 } from "../src/domain/ids";
import { EXERCISES, EXERCISE_BY_ID, PROGRESSIONS } from "../src/data/seed/exercises";
import { ALL_BUILTIN, PROGRAMS } from "../src/data/seed/programs";
import { defaultProfile } from "../src/data/defaults";
import { parseImport } from "../src/data/validate";
import type { Profile, WorkoutSession } from "../src/data/types";

function session(id: string, at: number, exerciseId: string, sets: [number | null, number][]): WorkoutSession {
  return {
    id, status: "done", title: "t", programId: null, programName: null, dayId: null, dayIndex: null,
    startedAt: at, endedAt: at + 3600000, notes: "", createdAt: at, updatedAt: at, rev: 1, deletedAt: null,
    exercises: [{
      id: id + "e", exerciseId, block: "main", plannedItemId: null, swappedFromId: null, targetSets: sets.length,
      repsMin: 6, repsMax: 8, durationSec: null, restSec: 90, notes: "",
      sets: sets.map(([w, r]) => newSet({ weight: w, reps: r, done: true, doneAt: at })),
    }],
  };
}

const userProfile = (): Profile => ({
  ...defaultProfile(),
  heightCm: 185, level: "intermediate", goal: "definition", focusMuscles: ["lats", "upper_back", "traps", "chest"],
  locations: ["gym"], daysPerWeek: 2, sessionMin: 90, weakSide: "right",
  problemZones: [{ id: "z", zone: "shoulder", side: "left", note: "щелчки", limitsHeavy: true }],
  baselines: { benchKg: 70, benchReps: 8 },
});

describe("strength", () => {
  it("e1rm по Эпли", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 1);
    expect(e1rm(100, 15)).toBeNull();
    expect(e1rm(null, 5)).toBeNull();
  });
  it("рабочий вес под повторы округляется вниз до шага", () => {
    const w = weightForReps(e1rm(70, 8)!, 8);
    expect(w).toBe(70);
    expect(weightForReps(e1rm(70, 8)!, 12) % 2.5).toBe(0);
    expect(weightForReps(e1rm(70, 8)!, 12)).toBeLessThan(70);
  });
  it("объём одностороннего подхода считает обе стороны, повторы — по слабой", () => {
    const s = newSet({ weight: 20, repsL: 12, repsR: 10, done: true });
    expect(setVolume(s)).toBe(440);
    expect(setReps(s)).toBe(10);
    expect(setVolume(newSet({ weight: 20, reps: 10, done: false }))).toBe(0);
  });
});

describe("history", () => {
  const a = session("a", 1000, "bench_press", [[60, 8], [60, 7]]);
  const b = session("b", 2000, "bench_press", [[62.5, 8], [62.5, 8]]);
  it("последний результат — самая свежая тренировка", () => {
    expect(lastPerformance("bench_press", [a, b])?.sessionId).toBe("b");
    expect(lastPerformance("bench_press", [a, b], "b")?.sessionId).toBe("a");
  });
  it("рекорды и PR текущей тренировки", () => {
    const rec = computeRecords([a, b], EXERCISE_BY_ID).get("bench_press")!;
    expect(rec.weight?.value).toBe(62.5);
    const prs = sessionPRs(b, [a, b], EXERCISE_BY_ID);
    expect(prs.map((p) => p.kind)).toContain("weight");
    expect(prs.find((p) => p.kind === "e1rm")).toBeUndefined();
  });
  it("первое выполнение — не рекорд", () => {
    expect(sessionPRs(a, [a], EXERCISE_BY_ID)).toEqual([]);
  });
});

describe("каталог", () => {
  it("id упражнений уникальны", () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
  });
  it("все упражнения программ и прогрессий существуют", () => {
    for (const p of ALL_BUILTIN) for (const d of p.days) for (const i of d.items) expect(EXERCISE_BY_ID[i.exerciseId], `${p.id}:${i.exerciseId}`).toBeDefined();
    for (const pr of PROGRESSIONS) for (const s of pr.steps) expect(EXERCISE_BY_ID[s.exerciseId]).toBeDefined();
    for (const p of ALL_BUILTIN) for (const d of p.days) for (const i of d.items) for (const v of i.variants ?? []) expect(EXERCISE_BY_ID[v], `${p.id}:${v}`).toBeDefined();
  });
  it("у каждого упражнения есть техника и ошибки", () => {
    for (const e of EXERCISES) {
      expect(e.technique.length, e.id).toBeGreaterThan(20);
      expect(e.mistakes.length, e.id).toBeGreaterThan(0);
    }
  });
  it("диапазоны повторов корректны", () => {
    for (const p of ALL_BUILTIN) for (const d of p.days) for (const i of d.items) {
      if (i.durationSec) expect(i.durationSec).toBeGreaterThan(0);
      else expect(i.repsMin! <= i.repsMax!, i.id).toBe(true);
    }
  });
});

describe("доступность и замены", () => {
  const p = userProfile();
  it("в зале со стандартным набором доступна штанга", () => {
    expect(isAvailable(EXERCISE_BY_ID.bench_press, p, "gym")).toBe(true);
    expect(isAvailable(EXERCISE_BY_ID.bench_press, p, "home")).toBe(false);
  });
  it("аналоги — тот же паттерн и доступны", () => {
    const alts = alternatives(EXERCISE_BY_ID.bench_press, EXERCISES, p, "home");
    expect(alts.length).toBeGreaterThan(0);
    for (const a of alts) {
      expect(a.pattern).toBe("h_push");
      expect(isAvailable(a, p, "home")).toBe(true);
    }
  });
  it("напоминание о плече для жимов, не для разминки", () => {
    expect(zoneCaution(EXERCISE_BY_ID.bench_press, p)?.zone).toBe("shoulder");
    expect(zoneCaution(EXERCISE_BY_ID.band_pull_apart, p)).toBeNull();
    expect(zoneCaution(EXERCISE_BY_ID.back_squat, p)).toBeNull();
  });
});

describe("рекомендации", () => {
  it("для зала, 2 раз в неделю и фокуса на спину/грудь первой идёт программа на рельеф", () => {
    const recs = recommendPrograms(userProfile(), PROGRAMS, EXERCISE_BY_ID, EXERCISES);
    expect(recs[0].program.id).toBe("recomp_back_chest");
    expect(recs[0].reasons.length).toBeGreaterThan(1);
  });
  it("для улицы — уличная или калистеника", () => {
    const p = { ...userProfile(), locations: ["outdoor" as const], goal: "endurance" as const, level: "beginner" as const, focusMuscles: [] };
    const top = recommendPrograms(p, PROGRAMS, EXERCISE_BY_ID, EXERCISES)[0].program.id;
    expect(["street_bars", "calisthenics_beginner"]).toContain(top);
  });
});

describe("сборка тренировки", () => {
  const p = userProfile();
  const program = PROGRAMS.find((x) => x.id === "recomp_back_chest")!;
  it("стартовый вес жима — из базовых результатов", () => {
    expect(baselineWeight(EXERCISE_BY_ID.bench_press, p, 8)).toBe(70);
    expect(baselineWeight(EXERCISE_BY_ID.lat_pulldown, p, 10)).toBeNull();
  });
  it("вес берётся из прошлого раза", () => {
    const prev = session("x", 1000, "bench_press", [[72.5, 8], [72.5, 7], [70, 8], [70, 8]]);
    const s = buildSessionFromProgram({ program, dayIndex: 0, profile: p, sessions: [prev], exerciseById: EXERCISE_BY_ID, all: EXERCISES, now: 5000 });
    const bench = s.exercises.find((e) => e.exerciseId === "bench_press")!;
    expect(bench.sets.map((x) => x.weight)).toEqual([72.5, 72.5, 70, 70]);
    expect(s.exercises[0].block).toBe("warmup");
    expect(s.status).toBe("active");
  });
  it("недоступное упражнение заменяется аналогом", () => {
    const home = { ...p, locations: ["home" as const], equipment: { ...p.equipment, home: ["dumbbell" as const, "bench" as const] } };
    const s = buildSessionFromProgram({ program, dayIndex: 0, profile: home, sessions: [], exerciseById: EXERCISE_BY_ID, all: EXERCISES });
    const swapped = s.exercises.find((e) => e.swappedFromId === "bench_press");
    expect(swapped).toBeDefined();
  });
  it("завершение убирает невыполненные подходы, а пропущенные упражнения плана оставляет для сводки", () => {
    const s = buildSessionFromProgram({ program, dayIndex: 1, profile: p, sessions: [], exerciseById: EXERCISE_BY_ID, all: EXERCISES });
    s.exercises[1].sets[0] = { ...s.exercises[1].sets[0], done: true, reps: 10 };
    s.exercises.push(makeSessionExercise({ exercise: EXERCISE_BY_ID.plank, block: "main", sets: 2, restSec: 30, profile: p, sessions: [] }));
    const f = finalizeSession(s, 9999);
    expect(f.exercises.length).toBe(s.exercises.length - 1); // добавленная вручную пустая — удалена
    expect(f.exercises[1].sets.length).toBe(1);
    expect(f.exercises.filter((e) => e.sets.length === 0).length).toBe(s.exercises.length - 2);
    expect(f.status).toBe("done");
  });
  it("программа идёт по очереди и по кругу", () => {
    const en = { programId: program.id, startedAt: 0, nextDayIndex: 2, completedSessions: 0 };
    expect(advanceEnrollment(en, program, 2).nextDayIndex).toBe(0);
    expect(advanceEnrollment(en, program, 0).nextDayIndex).toBe(1);
  });
  it("подсказка повторов: прошлый раз → нижняя граница", () => {
    const s = buildSessionFromProgram({ program, dayIndex: 0, profile: p, sessions: [], exerciseById: EXERCISE_BY_ID, all: EXERCISES });
    const bench = s.exercises.find((e) => e.exerciseId === "bench_press")!;
    expect(suggestedReps(bench, 0, null)).toBe(6);
    expect(suggestedReps(bench, 3, [newSet({ reps: 9 }), newSet({ reps: 7 })])).toBe(7);
  });
});

describe("импорт", () => {
  it("отклоняет чужой файл и мусор", () => {
    expect(() => parseImport("not json")).toThrow();
    expect(() => parseImport(JSON.stringify({ app: "other" }))).toThrow();
  });
  it("пропускает некорректные записи", () => {
    const good = session("g", 1, "bench_press", [[60, 5]]);
    const r = parseImport(JSON.stringify({ app: "fitness-app", sessions: [good, { id: 1 }, { ...good, id: "h", exercises: "x" }], programs: [] }));
    expect(r.sessions.length).toBe(1);
    expect(r.skipped).toBe(2);
  });
});

describe("формат", () => {
  it("склонения и числа", () => {
    expect(plural(1, ["подход", "подхода", "подходов"])).toBe("подход");
    expect(plural(3, ["подход", "подхода", "подходов"])).toBe("подхода");
    expect(plural(11, ["подход", "подхода", "подходов"])).toBe("подходов");
    expect(parseNum("62,5")).toBe(62.5);
    expect(parseNum("")).toBeNull();
    expect(parseNum("-3")).toBeNull();
    expect(fmtClock(90)).toBe("1:30");
    expect(fmtClock(3725)).toBe("1:02:05");
  });
  it("uuidv7 сортируется по времени", () => {
    expect(uuidv7(1000) < uuidv7(2000)).toBe(true);
    expect(uuidv7()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("чередование, перенос и круг", () => {
  const p = userProfile();
  const split = PROGRAMS.find((x) => x.id === "split_back_chest_shoulders")!;
  it("вариации меняются по циклам, базовые упражнения — нет", () => {
    const item = split.days[0].items.find((i) => i.variants)!;
    expect(pickVariant(item, 0)).toBe(item.exerciseId);
    expect(pickVariant(item, 1)).toBe(item.variants![0]);
    expect(pickVariant(item, 1 + item.variants!.length)).toBe(item.exerciseId);
    const s0 = buildSessionFromProgram({ program: split, dayIndex: 0, profile: p, sessions: [], exerciseById: EXERCISE_BY_ID, all: EXERCISES, cycle: 0 });
    const s1 = buildSessionFromProgram({ program: split, dayIndex: 0, profile: p, sessions: [], exerciseById: EXERCISE_BY_ID, all: EXERCISES, cycle: 1 });
    expect(s0.exercises.map((e) => e.exerciseId)).toContain("pull_up");
    expect(s1.exercises.map((e) => e.exerciseId)).toContain("pull_up");
    expect(s0.exercises.map((e) => e.exerciseId).join()).not.toBe(s1.exercises.map((e) => e.exerciseId).join());
  });
  it("номер цикла считается по завершённым тренировкам", () => {
    expect(programCycle({ programId: split.id, startedAt: 0, nextDayIndex: 0, completedSessions: 7 }, split)).toBe(2);
    expect(programCycle({ programId: "other", startedAt: 0, nextDayIndex: 0, completedSessions: 7 }, split)).toBe(0);
  });
  it("перенесённые упражнения встают после разминки", () => {
    const s = buildSessionFromProgram({
      program: split, dayIndex: 1, profile: p, sessions: [], exerciseById: EXERCISE_BY_ID, all: EXERCISES,
      carryOver: [{ exerciseId: "barbell_row", sets: 2, repsMin: 8, repsMax: 10, durationSec: null, restSec: 90, fromSessionId: "x" }],
    });
    const i = s.exercises.findIndex((e) => e.carried);
    expect(s.exercises[i].exerciseId).toBe("barbell_row");
    expect(s.exercises[i - 1].block).toBe("warmup");
    expect(s.exercises[i].targetSets).toBe(2);
  });
  it("круг вставляется по настройке и считает рекорд по кругам", () => {
    const withCircuit = { ...p, circuit: { ...defaultCircuit(), enabled: true, position: "end" as const, configured: true } };
    const s = buildSessionFromProgram({ program: split, dayIndex: 2, profile: withCircuit, sessions: [], exerciseById: EXERCISE_BY_ID, all: EXERCISES });
    const ci = s.exercises.findIndex((e) => e.circuit);
    expect(ci).toBeGreaterThan(0);
    expect(s.exercises[ci + 1].block).toBe("cooldown");
    const startS = buildSessionFromProgram({ program: split, dayIndex: 2, profile: { ...withCircuit, circuit: { ...withCircuit.circuit, position: "start" } }, sessions: [], exerciseById: EXERCISE_BY_ID, all: EXERCISES });
    const si = startS.exercises.findIndex((e) => e.circuit);
    expect(startS.exercises[si - 1].block).toBe("warmup");
    s.exercises[ci].sets = [newSet({ done: true, reps: 1 }), newSet({ done: true, reps: 1 })];
    const a = { ...finalizeSession(s, 2000), startedAt: 1000 };
    const b = { ...a, id: "b", startedAt: 3000, exercises: a.exercises.map((e) => (e.circuit ? { ...e, sets: [...e.sets, newSet({ done: true, reps: 1 })] } : e)) };
    expect(computeRecords([a, b], EXERCISE_BY_ID).get("circuit_5_10_15")?.rounds?.value).toBe(3);
    expect(sessionPRs(b, [a, b], EXERCISE_BY_ID).map((x) => x.kind)).toContain("rounds");
  });
  it("без круга в профиле — блока нет", () => {
    const s = buildSessionFromProgram({ program: split, dayIndex: 0, profile: p, sessions: [], exerciseById: EXERCISE_BY_ID, all: EXERCISES });
    expect(s.exercises.some((e) => e.circuit)).toBe(false);
  });
});

describe("сводка", () => {
  const p = userProfile();
  const split = PROGRAMS.find((x) => x.id === "split_back_chest_shoulders")!;
  const build = () => buildSessionFromProgram({ program: split, dayIndex: 0, profile: p, sessions: [], exerciseById: EXERCISE_BY_ID, all: EXERCISES, now: 0 });
  const doMain = (s: ReturnType<typeof build>, share: number) => {
    const main = s.exercises.filter((e) => e.block === "main");
    const n = Math.round(main.length * share);
    main.slice(0, n).forEach((e) => e.sets.forEach((x) => Object.assign(x, { done: true, reps: 8 })));
    return finalizeSession(s, 60 * 60000);
  };
  it("полное выполнение — идём дальше", () => {
    const r = reviewSession(doMain(build(), 1), EXERCISE_BY_ID, { profile: p, nextDayName: "Грудь + трицепс" });
    expect(r.verdict).toBe("full");
    expect(r.recommended).toBe("continue");
    expect(r.completion).toBe(1);
  });
  it("частичное — советует добить пропущенное, не больше трёх упражнений", () => {
    const r = reviewSession(doMain(build(), 0.6), EXERCISE_BY_ID, { profile: p });
    expect(r.verdict).toBe("partial");
    expect(r.recommended).toBe("carry");
    expect(r.carry.length).toBeGreaterThan(0);
    expect(r.carry.length).toBeLessThanOrEqual(3);
    expect(r.actions).toEqual(expect.arrayContaining(["continue", "carry", "repeat"]));
  });
  it("меньше половины — советует повторить день", () => {
    const r = reviewSession(doMain(build(), 0.2), EXERCISE_BY_ID, { profile: p, dayName: "Спина + бицепс" });
    expect(r.verdict).toBe("short");
    expect(r.recommended).toBe("repeat");
    expect(r.advice[0]).toContain("Спина + бицепс");
    expect(r.missedGroups.length).toBeGreaterThan(0);
  });
  it("слишком долгая тренировка — совет по времени", () => {
    const r = reviewSession({ ...doMain(build(), 1), endedAt: 150 * 60000 }, EXERCISE_BY_ID, { profile: p, plannedMin: 90 });
    expect(r.advice.some((a) => a.includes("150 мин"))).toBe(true);
  });
});

import { overloadHint } from "../src/domain/overload";
import { groupLoad, underloaded } from "../src/domain/balance";
import { buildPrompt, detectMinutes, detectTargets, localPlan, parsePlan } from "../src/domain/planner";

describe("прогрессия веса", () => {
  const bench = EXERCISE_BY_ID.bench_press;
  it("все подходы на верхней границе — прибавить шаг", () => {
    const h = overloadHint(bench, [newSet({ weight: 70, reps: 8, done: true }), newSet({ weight: 70, reps: 8, done: true })], 6, 8);
    expect(h?.kind).toBe("increase");
    expect(h?.weight).toBe(72.5);
  });
  it("большинство ниже нижней границы — держать вес", () => {
    expect(overloadHint(bench, [newSet({ weight: 70, reps: 5, done: true }), newSet({ weight: 70, reps: 4, done: true })], 6, 8)?.kind).toBe("hold");
  });
  it("в диапазоне — добирать повторы", () => {
    expect(overloadHint(bench, [newSet({ weight: 70, reps: 7, done: true })], 6, 8)?.kind).toBe("reps");
  });
  it("прибавленный вес подставляется, но не для упражнений с проблемной зоной", () => {
    const prev = session("x", 1000, "lat_pulldown", [[50, 12], [50, 12], [50, 12]]);
    const se = makeSessionExercise({ exercise: EXERCISE_BY_ID.lat_pulldown, block: "main", sets: 3, repsMin: 10, repsMax: 12, restSec: 90, profile: { ...userProfile(), problemZones: [] }, sessions: [prev] });
    expect(se.sets[0].weight).toBe(55);
    const prevB = session("y", 1000, "bench_press", [[70, 8], [70, 8]]);
    const b = makeSessionExercise({ exercise: bench, block: "main", sets: 2, repsMin: 6, repsMax: 8, restSec: 90, profile: userProfile(), sessions: [prevB] });
    expect(b.sets[0].weight).toBe(70);
  });
});

describe("баланс за неделю", () => {
  it("учитывает добавленные вне плана упражнения и вспомогательные мышцы", () => {
    const now = 10 * 86400000;
    const s = session("a", now - 86400000, "triceps_pushdown", [[30, 12], [30, 12], [30, 12]]);
    const load = groupLoad([s], EXERCISE_BY_ID, userProfile(), now);
    expect(load.find((l) => l.group === "Руки")?.sets).toBe(3);
    expect(underloaded(load).map((l) => l.group)).toContain("Ноги");
    const old = session("b", now - 9 * 86400000, "back_squat", [[80, 5]]);
    expect(groupLoad([old], EXERCISE_BY_ID, userProfile(), now).find((l) => l.group === "Ноги")?.sets).toBe(0);
  });
});

describe("тренировка по запросу", () => {
  const p = userProfile();
  const load = groupLoad([], EXERCISE_BY_ID, p);
  it("ключевые слова → группы, время → объём", () => {
    const plan = localPlan("спина и ноги, 80 минут", p, EXERCISES, EXERCISE_BY_ID, load);
    const groups = plan.items.filter((i) => i.block === "main").map((i) => EXERCISE_BY_ID[i.exerciseId].primary.map((m) => m));
    expect(plan.title).toBe("Спина + Ноги");
    expect(groups.flat()).toEqual(expect.arrayContaining(["lats"]));
    expect(groups.flat().some((m) => ["quads", "glutes", "hamstrings"].includes(m))).toBe(true);
    expect(detectMinutes("на 40 минут")).toBe(40);
  });
  it("отдельные мышцы: «грудь и трицепс» — именно трицепс, а не любые руки", () => {
    const plan = localPlan("Грудь и трицепс", p, EXERCISES, EXERCISE_BY_ID, load);
    expect(plan.title).toBe("Грудь + Трицепс");
    const main = plan.items.filter((i) => i.block === "main").map((i) => EXERCISE_BY_ID[i.exerciseId]);
    expect(main.some((e) => e.primary.includes("triceps"))).toBe(true);
    expect(main.some((e) => e.primary.includes("biceps"))).toBe(false);
    expect(main.some((e) => e.primary.includes("chest"))).toBe(true);
  });
  it("«предплечья» не превращаются в плечи, «бицепс бедра» — не бицепс", () => {
    expect(detectTargets("предплечья").map((t) => (t === "light" ? t : t.label))).toEqual(["Предплечья"]);
    expect(detectTargets("бицепс бедра и икры").map((t) => (t === "light" ? t : t.label))).toEqual(["Бицепс бедра", "Икры"]);
    expect(detectTargets("короткая на руки").map((t) => (t === "light" ? t : t.label))).toEqual(["Руки"]);
    expect(detectTargets("спина, кор").map((t) => (t === "light" ? t : t.label))).toEqual(["Спина", "Пресс"]);
  });
  it("икры находятся", () => {
    const plan = localPlan("хочу икры", p, EXERCISES, EXERCISE_BY_ID, load);
    expect(plan.items.filter((i) => EXERCISE_BY_ID[i.exerciseId].primary.includes("calves")).length).toBeGreaterThanOrEqual(2);
  });
  it("в запрос к Claude не попадают вес и заметки", () => {
    const prompt = buildPrompt("спина", { ...p, weightKg: 79.4, problemZones: [{ id: "z", zone: "shoulder", side: "left", note: "секретная заметка", limitsHeavy: true }] }, EXERCISES, load);
    expect(prompt).not.toContain("79.4");
    expect(prompt).not.toContain("секретная заметка");
    expect(prompt).toContain("Плечо (левое)");
    expect(prompt).not.toMatch(/circuit_5_10_15/);
  });
  it("ответ Claude проверяется: чужие id отбрасываются, числа ограничиваются", () => {
    const plan = parsePlan({ title: "Тест", items: [{ id: "made_up", sets: 3 }, { id: "constructor", sets: 3 }, { id: "bench_press", sets: 99, repsMin: 12, repsMax: 6, restSec: 9999 }, { id: "plank", sets: 2, durationSec: 5000 }] }, EXERCISE_BY_ID)!;
    expect(plan.items.map((i) => i.exerciseId)).toEqual(["bench_press", "plank"]);
    expect(plan.items[0]).toMatchObject({ sets: 8, repsMin: 6, repsMax: 12, restSec: 300 });
    expect(plan.items[1].durationSec).toBe(900);
    expect(parsePlan({ items: [{ id: "cat_cow" }] }, EXERCISE_BY_ID)).toBeNull();
    expect(parsePlan("text", EXERCISE_BY_ID)).toBeNull();
  });
});

import { parsePhotoResult } from "../src/domain/photo";
import { bestDayFor, effectiveDay } from "../src/domain/tweaks";
import { MAP_MUSCLES } from "../src/ui/BodyMap";
import { registerCustom, sanitizeCustom } from "../src/data/custom";

describe("фото тренажёра", () => {
  it("берёт только упражнения из каталога и проверяет новые", () => {
    const r = parsePhotoResult(
      {
        machine: "Тренажёр для жима ногами",
        confidence: "high",
        exercises: [{ id: "leg_press" }, { id: "nope" }, "leg_press_calf_raise", { id: "__proto__" }],
        newExercises: [
          { name: "Жим ногами одной ногой", primary: ["quads", "glutes", "bogus"], pattern: "squat", tracking: "weight_reps", technique: "Описание" },
          { name: "", primary: ["quads"] },
          { name: "Без мышц", primary: [] },
          { name: "Жим ногами", primary: ["quads"] },
        ],
      },
      EXERCISE_BY_ID,
    )!;
    expect(r.exerciseIds).toEqual(["leg_press", "leg_press_calf_raise"]);
    expect(r.newExercises.length).toBe(1);
    expect(r.newExercises[0]).toMatchObject({ primary: ["quads", "glutes"], equipment: ["machine"], review: "check" });
    expect(r.newExercises[0].id.startsWith("custom_")).toBe(true);
    expect(parsePhotoResult({ confidence: "low", exercises: [] }, EXERCISE_BY_ID)).toBeNull();
  });
  it("свои упражнения регистрируются в каталоге один раз, мусор отбрасывается", () => {
    const ex = sanitizeCustom({ name: "Тест", primary: ["calves"] }, "custom_test1234")!;
    const before = EXERCISES.length;
    registerCustom([ex, ex, { id: "custom_bad", name: "x" }, { id: "bench_press", name: "Подмена", primary: ["chest"] }]);
    expect(EXERCISES.length).toBe(before + 1);
    expect(EXERCISE_BY_ID.custom_test1234.name).toBe("Тест");
    expect(EXERCISE_BY_ID.bench_press.name).toBe("Жим штанги лёжа");
  });
});

describe("правки программы", () => {
  const recomp = PROGRAMS.find((x) => x.id === "recomp_back_chest")!;
  const split = PROGRAMS.find((x) => x.id === "split_back_chest_shoulders")!;
  it("добавленные упражнения встают перед заминкой, подходы меняются", () => {
    const day = recomp.days[0];
    const benchItem = day.items.find((i) => i.exerciseId === "bench_press")!;
    const eff = effectiveDay(day, {
      extras: { [day.id]: [{ id: "x-1", exerciseId: "back_extension", block: "main", sets: 3, repsMin: 10, repsMax: 15, restSec: 60 }] },
      overrides: { [benchItem.id]: { sets: 5, repsMin: 12, repsMax: 4 } },
    });
    const i = eff.items.findIndex((x) => x.id === "x-1");
    expect(eff.items[i + 1].block).toBe("cooldown");
    expect(eff.items.find((x) => x.id === benchItem.id)).toMatchObject({ sets: 5, repsMin: 4, repsMax: 12 });
    expect(day.items.find((x) => x.id === benchItem.id)!.sets).toBe(4); // шаблон не меняется
  });
  it("мусор в правках из облака не ломает день", () => {
    const day = recomp.days[0];
    const eff = effectiveDay(day, { extras: { [day.id]: [null as never, { id: 5 } as never] }, overrides: { x: { sets: "много" as never } } });
    expect(eff.items.length).toBe(day.items.length);
  });
  it("подходящий день для упражнения по мышцам", () => {
    const names = (id: string) => split.days[bestDayFor(split, EXERCISE_BY_ID[id], EXERCISE_BY_ID)].name;
    expect(names("back_extension")).toBe("Спина + бицепс");
    expect(names("pec_deck")).toBe("Грудь + трицепс");
    expect(names("leg_press")).toBe("Плечи + ноги + предплечья");
    expect(names("db_shrug")).not.toBe("Грудь + трицепс");
  });
  it("у каждой мышцы на схеме есть хотя бы 2 упражнения", () => {
    for (const m of MAP_MUSCLES) expect(EXERCISES.filter((e) => e.primary.includes(m)).length, m).toBeGreaterThanOrEqual(2);
  });
});

import { emphasisOf, emphasisLine } from "../src/domain/emphasis";

describe("упор тренировки", () => {
  const split = PROGRAMS.find((x) => x.id === "split_back_chest_shoulders")!;
  it("день спины — упор на спину, день груди — на грудь", () => {
    const back = emphasisOf(split.days[0].items, EXERCISE_BY_ID);
    const chest = emphasisOf(split.days[1].items, EXERCISE_BY_ID);
    expect(back.groups[0].group).toBe("Спина");
    expect(back.main).toContain("lats");
    expect(chest.groups[0].group).toBe("Грудь");
    expect(chest.main).toContain("chest");
    expect(emphasisLine(chest)).toMatch(/^грудь/);
  });
  it("разминка и заминка не считаются", () => {
    const e = emphasisOf([{ exerciseId: "band_pull_apart", sets: 2, block: "warmup" }, { exerciseId: "plank", sets: 3, block: "main" }], EXERCISE_BY_ID);
    expect(e.groups.map((g) => g.group)).toEqual(["Кор"]);
  });
});

import { liftSummaries } from "../src/domain/lifts";
import { readiness, lightenSession, sleepHours } from "../src/domain/recovery";
import { dailyTargets, mealTotals, parseFoodResult, buildFoodPrompt } from "../src/domain/nutrition";
import { dueReminders } from "../src/domain/reminders";
import { weekSummary, latestWeight } from "../src/domain/weekly";
import { nextWorkoutHints } from "../src/domain/advice";
import { PREHAB } from "../src/data/seed/prehab";
import { emptyDay, defaultReminders, dayId } from "../src/data/defaults";

describe("рабочие веса", () => {
  it("последний, лучший, изменение и совет на следующий раз", () => {
    const a = session("a", 1000, "bench_press", [[60, 8], [60, 8]]);
    const b = session("b", 2000, "bench_press", [[62.5, 8], [62.5, 8]]);
    const [l] = liftSummaries([a, b], EXERCISE_BY_ID);
    expect(l.last.weight).toBe(62.5);
    expect(l.delta).toBe(2.5);
    expect(l.bestWeight).toBe(62.5);
    expect(l.points.length).toBe(2);
    expect(l.next?.kind).toBe("increase");
    expect(l.next?.weight).toBe(65);
  });
  it("подсказки к следующей тренировке; с проблемной зоной — осторожно", () => {
    const b = session("b", 2000, "bench_press", [[62.5, 8], [62.5, 8]]);
    const items = [{ id: "i", exerciseId: "bench_press", block: "main" as const, sets: 3, repsMin: 6, repsMax: 8, restSec: 90 }];
    const lifts = new Map(liftSummaries([b], EXERCISE_BY_ID).map((l) => [l.exerciseId, l]));
    expect(nextWorkoutHints(items, lifts, EXERCISE_BY_ID, { ...userProfile(), problemZones: [] })[0].text).toContain("65 кг");
    expect(nextWorkoutHints(items, lifts, EXERCISE_BY_ID, userProfile())[0].text).toContain("если плечо не беспокоит");
  });
});

describe("восстановление", () => {
  const ck = (v: number) => ({ at: 0, energy: v, soreness: v, mood: v, stress: v });
  it("уровни готовности", () => {
    expect(readiness(ck(5), { bed: "23:00", wake: "07:30", hours: 8.5, quality: 5 })!.level).toBe("high");
    expect(readiness(ck(3), { bed: "01:00", wake: "07:00", hours: 6, quality: 3 })!.level).toBe("medium");
    expect(readiness(ck(1), { bed: "03:00", wake: "07:00", hours: 4, quality: 1 })!.level).toBe("low");
    expect(readiness(null, null)).toBeNull();
  });
  it("сон через полночь и облегчённая тренировка", () => {
    expect(sleepHours("23:30", "07:10")).toBeCloseTo(7.7, 1);
    expect(sleepHours("01:00", "09:00")).toBe(8);
    const s = buildSessionFromProgram({ program: PROGRAMS[0], dayIndex: 0, profile: userProfile(), sessions: [session("x", 1, "bench_press", [[70, 8]])], exerciseById: EXERCISE_BY_ID, all: EXERCISES });
    const light = lightenSession(s);
    const bench = light.exercises.find((e) => e.exerciseId === "bench_press")!;
    expect(bench.targetSets).toBe(3);
    expect(bench.sets[0].weight).toBe(62.5);
    expect(light.exercises.find((e) => e.block === "warmup")!.targetSets).toBe(s.exercises.find((e) => e.block === "warmup")!.targetSets);
  });
});

describe("питание", () => {
  const p = { ...userProfile(), sex: "male" as const, birthYear: 2000, heightCm: 185 };
  it("ориентиры: нужны вес, рост, возраст, пол", () => {
    expect(dailyTargets({ ...p, sex: null }, 79, false).missing).toContain("пол");
    const t = dailyTargets(p, 79, false, 2026).targets!;
    // BMR = 790 + 1156.25 − 130 + 5 = 1821; × 1.375 × 0.9 ≈ 2250
    expect(t.kcal).toBeGreaterThan(2150);
    expect(t.kcal).toBeLessThan(2350);
    expect(t.protein).toBe(158);
    expect(t.protein * 4 + t.fat * 9 + t.carbs * 4).toBeLessThanOrEqual(t.kcal + 4);
    expect(dailyTargets(p, 79, true).targets!.water).toBeGreaterThan(t.water);
  });
  it("диапазон калорий и проверка ответа Claude", () => {
    const r = parseFoodResult({
      title: "Плов и салат",
      uncertainty: 0.2,
      items: [
        { name: "Плов", grams: 300, kcal100: 180, p100: 6, f100: 8, c100: 22 },
        { name: "Салат", grams: 150, kcal100: 900, p100: 1, f100: 3, c100: 4 },
        { name: "Мусор", grams: 100, p100: 80, f100: 30, c100: 20 },
        { name: "", grams: 10, p100: 1, f100: 1, c100: 1 },
      ],
    })!;
    expect(r.items.length).toBe(2);
    expect(r.items[1].kcal100).toBe(Math.round(1 * 4 + 3 * 9 + 4 * 4)); // калорийность поправлена по БЖУ
    const t = mealTotals(r);
    expect(t.kcal).toBeCloseTo(540 + r.items[1].kcal100 * 1.5, 0);
    expect(t.kcalMin).toBeCloseTo(t.kcal * 0.8, 0);
    expect(parseFoodResult({ items: [] })).toBeNull();
    expect(buildFoodPrompt("плов", false)).not.toMatch(/вес тела|79/);
  });
});

describe("дневник, напоминания, неделя", () => {
  it("проверка дневника из облака", () => {
    const d = { ...emptyDay("2026-11-09"), updatedAt: 5, water: [{ at: 1, ml: 300 }] };
    expect(sanitizeDay(d)?.water).toEqual([{ at: 1, ml: 300 }]);
    expect(sanitizeDay({ ...d, id: "nope" })).toBeNull();
    expect(sanitizeDay({ ...d, water: [{ at: 1, ml: 99999 }] })?.water).toEqual([]);
    expect(sanitizeDay({ ...d, meals: [{ id: "m", at: 1, title: "x", items: [{ name: "a", grams: 1, kcal100: 5000, p100: 1, f100: 1, c100: 1 }], uncertainty: 0.2 }] })?.meals).toEqual([]);
  });
  it("напоминания о воде и тренировке", () => {
    const noon = new Date(2026, 10, 9, 13, 0).getTime();
    const day = { ...emptyDay(dayId(noon)), water: [{ at: noon - 3 * 3600000, ml: 300 }] };
    const due = dueReminders(defaultReminders(), day, [session("s", noon - 6 * 86400000, "bench_press", [[60, 5]])], noon);
    expect(due.map((d) => d.kind)).toEqual(expect.arrayContaining(["water", "workout", "checkin"]));
    const night = new Date(2026, 10, 9, 23, 30).getTime();
    expect(dueReminders(defaultReminders(), day, [], night).some((d) => d.kind === "water")).toBe(false);
  });
  it("недельная сводка и последний вес", () => {
    const now = new Date(2026, 10, 12, 12).getTime();
    const s = session("w", now - 86400000, "bench_press", [[60, 8], [60, 8]]);
    const days = { [dayId(now)]: { ...emptyDay(dayId(now)), sleep: { bed: "23:00", wake: "07:00", hours: 8, quality: 4 }, body: { weightKg: 78.5 } } };
    const w = weekSummary([s], days, userProfile(), EXERCISE_BY_ID, 0, now);
    expect(w.workouts).toBe(1);
    expect(w.sets).toBe(2);
    expect(w.sleepAvg).toBe(8);
    expect(latestWeight(days, { ...userProfile(), weightKg: 80 })).toBe(78.5);
  });
  it("профилактика: все упражнения есть в каталоге и встают в разминку", () => {
    for (const i of PREHAB) for (const st of [...i.mobility, ...i.activation, ...i.strength]) expect(EXERCISE_BY_ID[st.exerciseId], `${i.id}:${st.exerciseId}`).toBeDefined();
    const s = buildSessionFromProgram({ program: PROGRAMS[0], dayIndex: 0, profile: { ...userProfile(), prehabIssue: "shoulder_click" }, sessions: [], exerciseById: EXERCISE_BY_ID, all: EXERCISES });
    const wy = s.exercises.find((e) => e.exerciseId === "wall_slide")!;
    expect(wy.block).toBe("warmup");
    expect(s.exercises.indexOf(wy)).toBeLessThan(s.exercises.findIndex((e) => e.block === "main"));
  });
});

import { sanitizeDay } from "../src/data/validate";
import { cleanDishes, cleanReminders } from "../src/data/defaults";

describe("исправления по ревью", () => {
  it("одна ошибка в дне не стирает весь день при синхронизации и импорте", () => {
    const bad = {
      ...emptyDay("2026-11-09"),
      updatedAt: 5,
      water: [{ at: 1, ml: 300 }, { at: 2, ml: 99999 }],
      body: { weightKg: 800, armL: 36.5 },
      meals: [
        { id: "m1", at: 1, type: "lunch", title: "Плов", uncertainty: 0.2, items: [{ name: "Плов", grams: 300, kcal100: 180, p100: 6, f100: 8, c100: 22 }] },
        { id: "m2", at: 2, type: "??", title: "Кастрюля", uncertainty: 0.2, items: [{ name: "Суп", grams: 6000, kcal100: 50, p100: 2, f100: 1, c100: 5 }] },
        { id: "m3", at: 3, type: "hack", title: "Салат", uncertainty: 9, items: [{ name: "Салат", grams: 150, kcal100: 40, p100: 1, f100: 3, c100: 3 }] },
      ],
    };
    const d = sanitizeDay(bad)!;
    expect(d.water).toEqual([{ at: 1, ml: 300 }]);
    expect(d.body).toEqual({ armL: 36.5 });
    expect(d.meals.map((m) => m.id)).toEqual(["m1", "m3"]);
    expect(d.meals[1]).toMatchObject({ type: "snack", uncertainty: 0.25 });
    expect(sanitizeDay({ id: "x", updatedAt: 1 })).toBeNull();
  });
  it("CSV: формулы экранируются, числа с запятой", async () => {
    const { cell } = await import("../src/data/backup");
    expect(cell('=HYPERLINK("http://x","a")')).toBe('"\'=HYPERLINK(""http://x"",""a"")"');
    expect(cell("+7")).toBe("'+7");
    expect(cell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(cell("Жим; лёжа")).toBe('"Жим; лёжа"');
    expect(cell(72.5)).toBe("72,5");
    expect(cell(-3)).toBe("-3");
    expect(cell(null)).toBe("");
  });
  it("напоминания: окно через полночь, день отдыха", () => {
    const r = { ...defaultReminders(), activeFrom: "10:00", activeTo: "01:00", workoutGapDays: 3 };
    const late = new Date(2026, 10, 9, 0, 30).getTime();
    const day = { ...emptyDay(dayId(late)), water: [{ at: late - 5 * 3600000, ml: 300 }] };
    expect(dueReminders(r, day, [], late).some((d) => d.kind === "water")).toBe(true);
    const s = session("s", late - 5 * 86400000, "bench_press", [[60, 5]]);
    expect(dueReminders(r, day, [s], late).some((d) => d.kind === "workout")).toBe(true);
    expect(dueReminders(r, { ...day, rest: true }, [s], late).some((d) => d.kind === "workout")).toBe(false);
  });
  it("рабочие веса: без разминки, без смешения кг и повторов", () => {
    const warm = { ...session("w", 3000, "face_pull", [[5, 15]]) };
    warm.exercises[0].block = "warmup";
    expect(liftSummaries([warm], EXERCISE_BY_ID).length).toBe(0);
    const bw = session("a", 1000, "pull_up", [[null, 10]]);
    const weighted = session("b", 2000, "pull_up", [[10, 6]]);
    const [l] = liftSummaries([bw, weighted], EXERCISE_BY_ID);
    expect(l.metric).toBe("weight");
    expect(l.series).toEqual([{ x: 2000, y: 10 }]);
    expect(l.delta).toBe(0);
  });
  it("сохранённые блюда и напоминания из облака чистятся", () => {
    const dishes = cleanDishes([{ id: "d", name: "Ок", items: [{ name: "a", grams: 100, kcal100: 100, p100: 5, f100: 5, c100: 5 }], uses: 1, uncertainty: 0.2 }, { id: "x", name: "Плохое", items: [{ name: "b", grams: 1, kcal100: 99999, p100: 1, f100: 1, c100: 1 }] }, null, "мусор"]);
    expect(dishes.map((d) => d.id)).toEqual(["d"]);
    const r = cleanReminders({ waterEveryMin: -5, activeFrom: "99:99", workoutGapDays: null, checkin: "да" });
    expect(r).toMatchObject({ waterEveryMin: 120, activeFrom: "09:00", workoutGapDays: null, checkin: true });
  });
});

import { dayId as dayOf, shiftDay, isLateNight } from "../src/data/defaults";
import { napHint, napMinutes } from "../src/domain/recovery";
import { mealTypeByTime } from "../src/domain/nutrition";
import { sleepPattern } from "../src/domain/weekly";
import { hhmm, fmtMinutes } from "../src/domain/format";

describe("режим дня: граница дня и дневной сон", () => {
  const at = (h: number, m = 0, d = 10) => new Date(2026, 10, d, h, m).getTime();
  it("перекус после полуночи до границы дня — во вчерашний день", () => {
    expect(dayOf(at(1, 30), 5)).toBe("2026-11-09");
    expect(dayOf(at(4, 59), 5)).toBe("2026-11-09");
    expect(dayOf(at(5, 0), 5)).toBe("2026-11-10");
    expect(dayOf(at(1, 30), 0)).toBe("2026-11-10");
    expect(isLateNight(at(2), 5)).toBe(true);
    expect(isLateNight(at(12), 5)).toBe(false);
    expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("ночью — перекус, а не завтрак", () => {
    expect(mealTypeByTime(at(1, 30))).toBe("snack");
    expect(mealTypeByTime(at(8))).toBe("breakfast");
  });
  it("граница дня в настройках проверяется", () => {
    expect(cleanReminders({ dayEndHour: 3 }).dayEndHour).toBe(3);
    expect(cleanReminders({ dayEndHour: 9 }).dayEndHour).toBe(5);
    expect(cleanReminders(null).dayEndHour).toBe(5);
  });
  it("дневной сон: проверка, готовность, подсказка", () => {
    const d = sanitizeDay({ ...emptyDay("2026-11-10"), updatedAt: 1, naps: [{ at: at(14), min: 40 }, { at: at(15), min: 9999 }, { min: 20 }] })!;
    expect(d.naps).toEqual([{ at: at(14), min: 40 }]);
    expect(sanitizeDay({ ...emptyDay("2026-11-10"), updatedAt: 1 })!.naps).toBeUndefined();
    expect(napMinutes(d)).toBe(40);
    const night = { bed: "03:00", wake: "08:00", hours: 5, quality: 3 };
    expect(readiness(null, night, 90)!.score).toBeGreaterThan(readiness(null, night)!.score);
    // Больше 2 часов днём не добавляет готовности.
    expect(readiness(null, night, 300)!.score).toBe(readiness(null, night, 120)!.score);
    expect(napHint({ at: at(13, 20), min: 20 })).toBeNull();
    expect(napHint({ at: at(16), min: 90 })).toMatch(/^Длинный/);
    expect(napHint({ at: at(20), min: 30 })).toMatch(/^Вечерний/);
  });
  it("режим сна за неделю: средний отбой через полночь, поздние отбои, дневной сон", () => {
    const day = (id: string, bed: string, naps: { at: number; min: number }[] = []) => ({ ...emptyDay(id), sleep: { bed, wake: "09:00", hours: 7, quality: 3 }, naps });
    const p = sleepPattern([day("2026-11-09", "23:30"), day("2026-11-10", "02:30", [{ at: at(15), min: 60 }])]);
    expect(hhmm(p.bedAvg!)).toBe("01:00");
    expect(p.lateNights).toBe(1);
    expect(p.napDays).toBe(1);
    expect(fmtMinutes(p.napMin)).toBe("1 ч");
    expect(fmtMinutes(90)).toBe("1 ч 30 мин");
  });
});
