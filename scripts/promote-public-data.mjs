#!/usr/bin/env node
// Копирует свежий агрегат (data/working) в published + корень репо для сайта и GitHub Pages.
// Запуск только когда готовы обновить публичный рейтинг: npm run promote-public-data
import fs from "node:fs";
import path from "node:path";
import { validatePublicData } from "../build/validate.mjs";
import {
  WORKING_DATA_JSON,
  PUBLISHED_DATA_JSON,
  PUBLIC_DATA_JSON,
  copyPublicBundle,
  workingDataExists,
} from "../shared/public-data.mjs";

function main() {
  if (!workingDataExists()) {
    console.error("[promote-public-data] Нет data/working/data.json — сначала npm run build-data");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(WORKING_DATA_JSON, "utf8"));
  validatePublicData(data);

  copyPublicBundle(WORKING_DATA_JSON, PUBLISHED_DATA_JSON);
  copyPublicBundle(WORKING_DATA_JSON, PUBLIC_DATA_JSON);

  console.log("[promote-public-data] OK:");
  console.log("  " + path.relative(process.cwd(), PUBLISHED_DATA_JSON));
  console.log("  " + path.relative(process.cwd(), PUBLIC_DATA_JSON));
  console.log("Дальше: npm run publish → залить publish/ на estaterating.ru; git commit + push — обновит GitHub Pages.");
}

main();
