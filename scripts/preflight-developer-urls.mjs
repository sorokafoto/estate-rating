#!/usr/bin/env node
// Pre-flight проверка URL застройщиков из legend перед циклом заявок.
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { readLegendCatalog, readApplicationsFromWorkbook } from "../build/source.mjs";
import { paths, PROJECT_ROOT, resolveDataPath, writeDataPath } from "../shared/paths.mjs";

const DEFAULT_SOURCE = resolveDataPath(paths.source());
const DEFAULT_OUTPUT = writeDataPath(
  path.join(PROJECT_ROOT, "data", "working", "preflight-urls.xlsx")
);
const FETCH_TIMEOUT_MS = 15000;

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, output: DEFAULT_OUTPUT, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source" && argv[i + 1]) args.source = argv[++i];
    else if ((argv[i] === "-o" || argv[i] === "--output") && argv[i + 1]) args.output = argv[++i];
    else if (argv[i] === "--dry-run") args.dryRun = true;
  }
  return args;
}

function normalizeUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/\//, "")}`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function buildDeveloperList(wb) {
  const legend = readLegendCatalog(wb);
  const apps = readApplicationsFromWorkbook(wb);
  const appsByDev = new Map();
  for (const app of apps) {
    const key = app.developer_id || app.developer_name;
    appsByDev.set(key, (appsByDev.get(key) ?? 0) + 1);
  }

  const byId = new Map();
  for (const row of legend) {
    byId.set(row.developer_id, {
      developer_id: row.developer_id,
      developer_name: row.developer_name,
      url: row.url,
      applications_sent: appsByDev.get(row.developer_id) ?? 0,
    });
  }
  for (const app of apps) {
    if (byId.has(app.developer_id)) continue;
    byId.set(app.developer_id, {
      developer_id: app.developer_id,
      developer_name: app.developer_name,
      url: app.url,
      applications_sent: appsByDev.get(app.developer_id) ?? 0,
    });
  }
  return [...byId.values()].sort((a, b) =>
    a.developer_name.localeCompare(b.developer_name, "ru")
  );
}

async function checkUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) {
    return { status: "empty_url", http_status: "", final_url: "", issue: "пустой URL" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let res = await fetch(normalized, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "IntrovertRatingPreflight/1.0" },
    });
    clearTimeout(timer);

    const finalUrl = res.url || normalized;
    const finalHost = hostOf(finalUrl);
    const originalHost = hostOf(normalized);

    let issue = "";
    if (!res.ok) issue = `HTTP ${res.status}`;
    else if (finalHost && originalHost && finalHost !== originalHost) {
      issue = `redirect:${originalHost}→${finalHost}`;
    }

    return {
      status: res.ok ? "ok" : "http_error",
      http_status: String(res.status),
      final_url: finalUrl,
      issue,
    };
  } catch (err) {
    clearTimeout(timer);
    const msg = err?.name === "AbortError" ? "timeout" : String(err.message ?? err);
    return { status: "fetch_error", http_status: "", final_url: normalized, issue: msg };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.source)) {
    console.error(`[preflight-urls] source не найден: ${args.source}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(args.source);
  const developers = buildDeveloperList(wb);

  const rows = [];
  for (const dev of developers) {
    const normalized = normalizeUrl(dev.url);
    if (args.dryRun) {
      rows.push({
        developer_id: dev.developer_id,
        developer_name: dev.developer_name,
        url: dev.url,
        normalized_url: normalized,
        applications_sent_q_prev: dev.applications_sent,
        check_status: "dry_run",
        http_status: "",
        final_url: "",
        issue: "",
        dry_run_ready: normalized ? "проверить вручную" : "нет URL",
      });
      continue;
    }

    const result = await checkUrl(dev.url);
    rows.push({
      developer_id: dev.developer_id,
      developer_name: dev.developer_name,
      url: dev.url,
      normalized_url: normalized,
      applications_sent_q_prev: dev.applications_sent,
      check_status: result.status,
      http_status: result.http_status,
      final_url: result.final_url,
      issue: result.issue,
      dry_run_ready: result.status === "ok" ? "да" : "нет",
    });
  }

  const failed = rows.filter((r) => r.check_status !== "ok" && r.check_status !== "dry_run");

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    outWb,
    XLSX.utils.aoa_to_sheet([
      ["поле", "описание"],
      ["dry_run_ready", "да — URL доступен (или dry-run: есть normalized_url)"],
      ["applications_sent_q_prev", "Заявок в прошлом цикле (0 = красный флаг, как ССК)"],
      ["issue", "redirect, timeout, HTTP error, пустой URL"],
    ]),
    "легенда"
  );
  XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(rows), "preflight");
  XLSX.writeFile(outWb, args.output);

  console.log(
    JSON.stringify(
      {
        output: args.output,
        developers: rows.length,
        failed: failed.length,
        zero_apps_prev: rows.filter((r) => r.applications_sent_q_prev === 0).length,
        dry_run: args.dryRun,
      },
      null,
      2
    )
  );
}

main();
