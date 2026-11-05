import React, { useEffect, useRef, useState } from "react";
import { EXERCISES, EXERCISE_BY_ID } from "../../data/catalog";
import { capability } from "../../data/runtime";
import { updateMeta } from "../../data/store";
import { MUSCLES } from "../../data/seed/labels";
import { useNav } from "../../app/nav";
import { getDraft, updateDraft } from "../../app/draft";
import { prepareCustom } from "../../app/actions";
import { buildPhotoPrompt, compressImage, parsePhotoResult, type PhotoResult } from "../../domain/photo";
import { Note, TopBar, toast } from "../../ui/kit";
import { Icon } from "../../ui/icons";
import { newItem } from "./Preview";

type SampleFn = { json: (input: string, opts?: Record<string, unknown>) => Promise<unknown> };

const CONF = { high: ["good", "уверенно"], medium: ["", "скорее всего"], low: ["warn", "не уверен"] } as const;

export function PhotoScreen() {
  const nav = useNav();
  const fileRef = useRef<HTMLInputElement>(null);
  const ctl = useRef<AbortController | null>(null);
  const [img, setImg] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PhotoResult | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => () => {
    if (img) URL.revokeObjectURL(img.url);
  }, [img]);

  const onFile = async (f: File) => {
    setError(null);
    setResult(null);
    if (!f.type.startsWith("image/")) return setError("Нужен файл с фото.");
    if (f.size > 25 * 1024 * 1024) return setError("Фото слишком большое.");
    try {
      const blob = await compressImage(f);
      setImg({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("Не удалось открыть фото. Попробуй другое.");
    }
  };

  const recognize = async () => {
    if (!img) return;
    const sample = await capability<SampleFn>("sample");
    if (!sample) return setError("Распознавание работает только в приложении внутри Claude.");
    setBusy(true);
    setError(null);
    ctl.current = new AbortController();
    try {
      const raw = await sample.json(buildPhotoPrompt(EXERCISES), { images: [img.blob], signal: ctl.current.signal, modelTier: "default" });
      const r = parsePhotoResult(raw, EXERCISE_BY_ID);
      if (!r || (!r.exerciseIds.length && !r.newExercises.length)) {
        setError(r?.note || "Не получилось распознать тренажёр. Сфотографируй его целиком, при хорошем свете.");
      } else {
        setResult(r);
        setPicked(new Set([...r.exerciseIds, ...r.newExercises.map((e) => e.id)]));
      }
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code !== "cancelled")
        setError(
          code === "not_granted"
            ? "Доступ к Claude не разрешён."
            : code === "images_unavailable" || code === "image_rejected"
              ? "Claude не принял фото. Попробуй другое."
              : code === "rate_limited"
                ? "Лимит запросов к Claude исчерпан, попробуй позже."
                : "Claude сейчас недоступен. Попробуй позже.",
        );
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    const fresh = result.newExercises.filter((e) => picked.has(e.id));
    if (fresh.length) await updateMeta((m) => ({ ...m, customExercises: [...(m.customExercises ?? []), ...fresh] }));
    const ids = [...result.exerciseIds, ...fresh.map((e) => e.id)].filter((id) => picked.has(id));
    if (!ids.length) return toast("Ничего не выбрано");
    if (!getDraft()) prepareCustom(result.machine);
    updateDraft((s) => {
      const items = ids.filter((id) => !s.exercises.some((e) => e.exerciseId === id)).map((id) => newItem(id));
      const cd = s.exercises.findIndex((e) => e.block === "cooldown");
      const list = s.exercises.slice();
      list.splice(cd < 0 ? list.length : cd, 0, ...items);
      return { ...s, exercises: list };
    });
    toast(`Добавлено: ${ids.length}`);
    nav.backThen(() => nav.push({ name: "preview" }));
  };

  const saveOnly = async () => {
    const fresh = result?.newExercises.filter((e) => picked.has(e.id)) ?? [];
    if (!fresh.length) return toast("Новых упражнений не выбрано");
    await updateMeta((m) => ({ ...m, customExercises: [...(m.customExercises ?? []), ...fresh] }));
    toast("Сохранено в библиотеку");
  };

  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <>
      <TopBar title="Тренажёр по фото" onBack={nav.back} />
      <div className="screen">
        <p className="dim">Сфотографируй тренажёр целиком — приложение определит, что это, и предложит упражнения на нём.</p>
        <input
          ref={fileRef}
          id="photo-file"
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
        {img ? (
          <img src={img.url} alt="Фото тренажёра" className="photo-preview" />
        ) : (
          <button className="empty" onClick={() => fileRef.current?.click()} style={{ alignItems: "center", width: "100%" }}>
            <Icon name="camera" size={28} />
            <b>Сделать или выбрать фото</b>
          </button>
        )}
        <div className="grid-2">
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="camera" size={18} /> {img ? "Другое фото" : "Фото"}
          </button>
          <button className="btn primary" onClick={recognize} disabled={!img || busy}>
            <Icon name="spark" size={18} /> Распознать
          </button>
        </div>
        {busy && (
          <div className="card tight">
            <p className="small">Claude смотрит на фото… обычно 10–40 секунд</p>
            <button className="btn" onClick={() => ctl.current?.abort()}>
              Остановить
            </button>
          </div>
        )}
        {error && <Note kind="warn">{error}</Note>}
        {result && (
          <section className="section">
            <div className="section-head">
              <h2>{result.machine}</h2>
              <span className={"pill " + CONF[result.confidence][0]}>{CONF[result.confidence][1]}</span>
            </div>
            {result.note && <p className="small dim">{result.note}</p>}
            <div className="list">
              {[...result.exerciseIds.map((id) => EXERCISE_BY_ID[id]), ...result.newExercises].map((e) => (
                <label key={e.id} className="list-item">
                  <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} />
                  <div className="grow">
                    <div className="row">
                      <span className="title">{e.name}</span>
                      {e.id.startsWith("custom_") && <span className="pill warn">новое — проверь</span>}
                    </div>
                    <div className="sub">{e.primary.map((m) => MUSCLES[m].name).join(", ")}</div>
                  </div>
                </label>
              ))}
            </div>
            {result.newExercises.length > 0 && <p className="xs muted">Новые упражнения описал Claude по фото — технику стоит проверить по видео или с тренером. Они сохранятся в библиотеке с пометкой «проверить».</p>}
            <button className="btn primary big block" onClick={apply}>
              <Icon name="plus" size={18} /> Добавить в тренировку
            </button>
            {result.newExercises.length > 0 && (
              <button className="btn block" onClick={saveOnly}>
                Только сохранить новые в библиотеку
              </button>
            )}
          </section>
        )}
        <Note>Фото уменьшается и очищается от метаданных (в том числе геолокации) на телефоне, затем отправляется в Claude только для распознавания.</Note>
      </div>
    </>
  );
}
