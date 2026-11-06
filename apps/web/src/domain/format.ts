const dayFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });
const shortFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const monthFmt = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

export const fmtDay = (ms: number) => capitalize(dayFmt.format(ms));
export const fmtShort = (ms: number) => shortFmt.format(ms).replace(".", "");
export const fmtMonth = (ms: number) => capitalize(monthFmt.format(ms));
export const fmtTime = (ms: number) => timeFmt.format(ms);

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 1:05 / 12:40 / 1:02:03 */
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return (h ? `${h}:` : "") + `${mm}:${String(sec).padStart(2, "0")}`;
}

export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} мин`;
  return `${Math.floor(min / 60)} ч ${min % 60} мин`;
}

export function fmtKg(kg: number | null | undefined): string {
  if (kg == null) return "—";
  return `${Number.isInteger(kg) ? kg : kg.toFixed(kg * 10 === Math.round(kg * 10) ? 1 : 2).replace(/0$/, "")}`.replace(".", ",");
}

export function fmtTonnage(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1).replace(".", ",")} т`;
  return `${Math.round(kg)} кг`;
}

/** Склонение: plural(3, ["подход", "подхода", "подходов"]) */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** Разбор числа из поля ввода: принимает запятую, пустое → null. */
export function parseNum(input: string): number | null {
  const t = input.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function startOfWeek(ms: number): number {
  const d = new Date(ms);
  const day = (d.getDay() + 6) % 7; // понедельник = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
