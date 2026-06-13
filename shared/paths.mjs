// Единый модуль путей к локальным выгрузкам (data/) с fallback на legacy private/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(path.join(__dirname, ".."));
export const LEGACY_PRIVATE_ROOT = path.join(PROJECT_ROOT, "private");
export const DATA_ROOT = process.env.DRR_DATA_ROOT
  ? path.resolve(process.env.DRR_DATA_ROOT)
  : path.join(PROJECT_ROOT, "data");

/** @param {...string} parts */
function dataJoin(...parts) {
  return path.join(DATA_ROOT, ...parts);
}

export const paths = {
  manifest: () => dataJoin("manifest.json"),
  manifestExample: () => dataJoin("manifest.example.json"),

  inboundMaster: () => dataJoin("inbound", "master"),
  inboundParsers: () => dataJoin("inbound", "parsers"),
  inboundTelecom: () => dataJoin("inbound", "telecom"),
  inboundManual: () => dataJoin("inbound", "manual"),

  phoneBook: () => dataJoin("reference", "developer_official_phones.xlsx"),
  spamBook: () => dataJoin("reference", "spam_book.xlsx"),
  smsMarkReference: () => dataJoin("reference", "sms_mark_reference.csv"),
  smsMarkReferenceXlsx: () => dataJoin("reference", "sms_mark_reference.xlsx"),

  source: () => dataJoin("working", "source.xlsx"),
  phoneRegistry: () => dataJoin("working", "phone_registry.json"),
  phonesToIdentify: () => dataJoin("working", "phones_to_identify.xlsx"),
  phonesToReview: () => dataJoin("working", "phones_to_review.csv"),
  spamPrefixCandidates: () => dataJoin("working", "spam_prefix_candidates.xlsx"),
  workingLogs: () => dataJoin("working", "logs"),

  seedIdentification: () =>
    dataJoin("inbound", "manual", "identification.xlsx"),
};

/**
 * Вернуть путь к файлу в data/, если он существует; иначе legacy private/<basename>.
 * @param {string} primaryAbsolute — полный путь в data/
 * @param {string} [legacyBasename] — имя файла в private/ (по умолчанию basename primary)
 */
export function resolveDataPath(primaryAbsolute, legacyBasename) {
  if (fs.existsSync(primaryAbsolute)) return primaryAbsolute;
  const base = legacyBasename ?? path.basename(primaryAbsolute);
  const legacy = path.join(LEGACY_PRIVATE_ROOT, base);
  if (fs.existsSync(legacy)) return legacy;
  return primaryAbsolute;
}

/** Как resolveDataPath, но для записи — всегда primary (data/). */
export function writeDataPath(primaryAbsolute) {
  return primaryAbsolute;
}

export function ensureDataDirs() {
  const dirs = [
    paths.inboundMaster(),
    paths.inboundParsers(),
    paths.inboundTelecom(),
    paths.inboundManual(),
    path.dirname(paths.phoneBook()),
    path.dirname(paths.source()),
    paths.workingLogs(),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
