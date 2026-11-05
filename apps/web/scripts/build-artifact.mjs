// Собирает один HTML-фрагмент для публикации артефактом (платформа сама оборачивает его в <html><body>).
// Шрифты встраиваются как data: URI — никаких внешних запросов, кроме React с cdnjs.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const fs = (p) => join(root, "node_modules/@fontsource", p);

const FONTS = [
  ["Golos Text", 400, "golos-text/files/golos-text-cyrillic-400-normal.woff2", "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"],
  ["Golos Text", 400, "golos-text/files/golos-text-latin-400-normal.woff2", "U+0000-00FF,U+2000-206F,U+2190-21FF,U+2212"],
  ["Golos Text", 600, "golos-text/files/golos-text-cyrillic-600-normal.woff2", "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"],
  ["Golos Text", 600, "golos-text/files/golos-text-latin-600-normal.woff2", "U+0000-00FF,U+2000-206F,U+2190-21FF,U+2212"],
  ["Unbounded", 700, "unbounded/files/unbounded-cyrillic-700-normal.woff2", "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"],
  ["Unbounded", 700, "unbounded/files/unbounded-latin-700-normal.woff2", "U+0000-00FF,U+2000-206F,U+2212"],
  ["JetBrains Mono", 500, "jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2", "U+0000-00FF,U+2000-206F,U+2212"],
  ["JetBrains Mono", 700, "jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2", "U+0000-00FF,U+2000-206F,U+2212"],
];

const fontCss = FONTS.map(
  ([family, weight, file, range]) =>
    `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${readFileSync(fs(file)).toString("base64")}) format("woff2");unicode-range:${range}}`,
).join("\n");

const cssFile = readdirSync(dist).find((f) => f.endsWith(".css"));
const css = cssFile ? readFileSync(join(dist, cssFile), "utf8") : "";
const js = readFileSync(join(dist, "app.js"), "utf8").replace(/<\/script/gi, "<\\/script");

const REACT = "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js";
const REACT_DOM = "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js";

const head = `<title>Подход</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#0e1214">
<meta name="description" content="Личный дневник тренировок: программы, библиотека упражнений, ведение подходов и история.">`;

const fragment = (react, reactDom) => `${head}
<style>
${fontCss}
${css}
</style>
<div id="root"></div>
<script src="${react}"></script>
<script src="${reactDom}"></script>
<script>
${js}
</script>
`;

writeFileSync(join(dist, "fitness.html"), fragment(REACT, REACT_DOM));

// Локальная версия для тестов: полный документ, React из node_modules.
mkdirSync(join(dist, "vendor"), { recursive: true });
copyFileSync(join(root, "node_modules/react/umd/react.production.min.js"), join(dist, "vendor/react.js"));
copyFileSync(join(root, "node_modules/react-dom/umd/react-dom.production.min.js"), join(dist, "vendor/react-dom.js"));
writeFileSync(
  join(dist, "local.html"),
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${fragment("vendor/react.js", "vendor/react-dom.js")}</body></html>`,
);

const size = readFileSync(join(dist, "fitness.html")).length;
console.log(`fitness.html: ${(size / 1024).toFixed(0)} KB`);
