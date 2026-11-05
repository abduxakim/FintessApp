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
import { buildPrompt, detectMinutes, localPlan, parsePlan } from "../src/domain/planner";

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
