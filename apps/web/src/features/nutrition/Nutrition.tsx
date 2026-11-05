import React from "react";
import { TopBar } from "../../ui/kit";
import { Icon } from "../../ui/icons";

export function NutritionHome() {
  return (
    <>
      <TopBar title="Питание" />
      <div className="screen">
        <div className="empty">
          <Icon name="food" />
          <b>Появится на этапе 4</b>
          <span className="small">
            Фото или описание еды → Claude оценит калории и БЖУ с диапазоном. Ты сможешь поправить порции, а приложение посчитает дневную норму от твоей цели. Отдельный ключ и сервер не понадобятся: распознавание пойдёт через Claude внутри артефакта.
          </span>
        </div>
        <p className="small muted">Вода, сон и восстановление — этап 3.</p>
      </div>
    </>
  );
}
