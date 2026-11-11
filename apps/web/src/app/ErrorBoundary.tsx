import React from "react";
import { exportToFile } from "../data/backup";

/** Ошибка рендера не должна оставлять пустой экран: даём перезагрузить и выгрузить данные. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null; json: string | null }> {
  state = { error: null as Error | null, json: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error, json: null };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app">
        <div className="screen" style={{ paddingTop: 32 }}>
          <h1 className="hero-title">Что-то пошло не так</h1>
          <p className="dim">Данные сохранены на устройстве и в облаке. Перезагрузи страницу. Если ошибка повторяется — сделай экспорт и напиши, что произошло.</p>
          <p className="xs muted num">{String(this.state.error.message).slice(0, 200)}</p>
          <div className="grid-2">
            <button className="btn primary" onClick={() => location.reload()}>
              Перезагрузить
            </button>
            <button
              className="btn"
              onClick={async () => {
                const r = await exportToFile();
                if (!r.ok) this.setState({ json: r.json });
              }}
            >
              Экспорт данных
            </button>
          </div>
          {this.state.json && <textarea className="textarea num xs" readOnly rows={8} value={this.state.json} aria-label="Данные для копирования" />}
        </div>
      </div>
    );
  }
}
