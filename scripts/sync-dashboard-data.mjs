#!/usr/bin/env node
// Копирует свежий агрегат в developer-rating-dashboard (без влияния на публичный сайт).
import fs from "node:fs";
import path from "node:path";
import {
  WORKING_DATA_JSON,
  dashboardDataPaths,
  copyPublicBundle,
  workingDataExists,
} from "../shared/public-data.mjs";

function main() {
  if (!workingDataExists()) {
    console.error("[sync-dashboard-data] Нет data/working/data.json — сначала npm run build-data");
    process.exit(1);
  }

  const dash = dashboardDataPaths();
  if (!fs.existsSync(path.dirname(dash.json))) {
    console.error("[sync-dashboard-data] Не найден каталог дашборда: " + path.dirname(dash.json));
    process.exit(1);
  }

  copyPublicBundle(WORKING_DATA_JSON, dash.json);
  console.log("[sync-dashboard-data] OK → " + path.relative(process.cwd(), dash.json));
}

main();
