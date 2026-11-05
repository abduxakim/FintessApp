import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

export function TopBar({ title, onBack, actions }: { title: React.ReactNode; onBack?: () => void; actions?: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const scroller = ref.current?.closest(".workout") ?? window;
    const onScroll = () => setScrolled(((scroller as Window).scrollY ?? (scroller as HTMLElement).scrollTop ?? 0) > 4);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header ref={ref} className={"topbar" + (scrolled ? " scrolled" : "")}>
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="Назад">
          <Icon name="back" />
        </button>
      )}
      <h1>{title}</h1>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Sheet({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Подтверждение внутри страницы (системные confirm() в артефакте не работают). */
export function Confirm({ title, text, confirmLabel, danger, onConfirm, onClose }: { title: string; text?: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose}>
      {text && <p className="dim">{text}</p>}
      <div className="grid-2">
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
        <button
          className={"btn " + (danger ? "danger" : "primary")}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

export function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={"chip" + (on ? " on" : "")} aria-pressed={!!on} onClick={onClick}>
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, id }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; id?: string }) {
  return (
    <div className="seg" role="radiogroup" id={id}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Числовое поле: принимает запятую, сохраняет на blur, чтобы не дёргать хранилище на каждый символ. */
export function NumField({ id, label, value, onChange, suffix, placeholder, step }: { id: string; label: string; value: number | null | undefined; onChange: (v: number | null) => void; suffix?: string; placeholder?: string; step?: "int" | "dec" }) {
  const [text, setText] = useState(value == null ? "" : String(value).replace(".", ","));
  useEffect(() => setText(value == null ? "" : String(value).replace(".", ",")), [value]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-suffix">
        <input
          id={id}
          className="input num"
          inputMode={step === "int" ? "numeric" : "decimal"}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ""))}
          onBlur={() => {
            const t = text.trim().replace(",", ".");
            if (!t) return onChange(null);
            const n = Number(t);
            if (Number.isFinite(n) && n >= 0 && n < 10000) onChange(step === "int" ? Math.round(n) : Math.round(n * 100) / 100);
            else setText(value == null ? "" : String(value));
          }}
        />
        {suffix && <span>{suffix}</span>}
      </div>
    </div>
  );
}

export function Note({ kind, children }: { kind?: "warn" | "info"; children: React.ReactNode }) {
  return (
    <div className={"note" + (kind === "warn" ? " warn" : "")}>
      <Icon name={kind === "warn" ? "alert" : "info"} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function MedicalNote() {
  return (
    <Note kind="warn">
      Приложение не заменяет врача. Если появилась боль, онемение или состояние ухудшается — прекрати упражнение и обратись к специалисту (спортивному врачу или физиотерапевту).
    </Note>
  );
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
const toastListeners = new Set<(t: string | null) => void>();
export function toast(text: string) {
  toastListeners.forEach((l) => l(text));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastListeners.forEach((l) => l(null)), 2600);
}
export function ToastHost() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    toastListeners.add(setT);
    return () => {
      toastListeners.delete(setT);
    };
  }, []);
  return t ? (
    <div className="toast" role="status">
      {t}
    </div>
  ) : null;
}
