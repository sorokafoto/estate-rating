// Пути публичного агрегата: working (свежая сборка) vs published (сайт / GitHub Pages).
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, paths, writeDataPath } from "./paths.mjs";
import { jsonForScript } from "../build/safe-json.mjs";

export const WORKING_DATA_JSON = writeDataPath(path.join(paths.source(), "..", "data.json"));
export const WORKING_DATA_JS = writeDataPath(path.join(paths.source(), "..", "data.js"));

export const PUBLISHED_DIR = path.join(PROJECT_ROOT, "data", "published");
export const PUBLISHED_DATA_JSON = path.join(PUBLISHED_DIR, "data.json");
export const PUBLISHED_DATA_JS = path.join(PUBLISHED_DIR, "data.js");

/** Корень репо — то, что видит GitHub Pages и npm run publish по умолчанию. */
export const PUBLIC_DATA_JSON = path.join(PROJECT_ROOT, "data.json");
export const PUBLIC_DATA_JS = path.join(PROJECT_ROOT, "data.js");

const DASHBOARD_DIR = path.resolve(PROJECT_ROOT, "..", "developer-rating-dashboard");

export function dashboardDataPaths() {
  return {
    json: path.join(DASHBOARD_DIR, "data.json"),
    js: path.join(DASHBOARD_DIR, "data.js"),
  };
}

export function readPublicJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, "utf8"));
}

export function writePublicBundle(absJsonPath, data) {
  const json = JSON.stringify(data, null, 2) + "\n";
  fs.mkdirSync(path.dirname(absJsonPath), { recursive: true });
  fs.writeFileSync(absJsonPath, json, "utf8");
  const jsPath = absJsonPath.replace(/\.json$/i, ".js");
  fs.writeFileSync(jsPath, "window.APP_DATA = " + jsonForScript(data) + ";\n", "utf8");
  return { jsonPath: absJsonPath, jsPath };
}

export function copyPublicBundle(fromJson, toJson) {
  const data = readPublicJson(fromJson);
  return writePublicBundle(toJson, data);
}

export function workingDataExists() {
  return fs.existsSync(WORKING_DATA_JSON);
}

export function publishedDataExists() {
  return fs.existsSync(PUBLISHED_DATA_JSON);
}
