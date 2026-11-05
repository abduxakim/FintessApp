import { describe, expect, it } from "vitest";
import { e1rm, setVolume, weightForReps, setReps } from "../src/domain/strength";
import { computeRecords, lastPerformance, sessionPRs } from "../src/domain/history";
import { alternatives, isAvailable, zoneCaution } from "../src/domain/availability";
import { recommendPrograms } from "../src/domain/recommend";
import { advanceEnrollment, baselineWeight, buildSessionFromProgram, finalizeSession, newSet, suggestedReps } from "../src/domain/session";
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
  it("завершение убирает невыполненные подходы и пустые упражнения", () => {
    const s = buildSessionFromProgram({ program, dayIndex: 1, profile: p, sessions: [], exerciseById: EXERCISE_BY_ID, all: EXERCISES });
    s.exercises[1].sets[0] = { ...s.exercises[1].sets[0], done: true, reps: 10 };
    const f = finalizeSession(s, 9999);
    expect(f.exercises.length).toBe(1);
    expect(f.exercises[0].sets.length).toBe(1);
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
