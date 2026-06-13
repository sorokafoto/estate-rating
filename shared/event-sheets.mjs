// Конфигурация листов событий в мастер-шаблоне / data/working/source.xlsx.

export const EVENT_SHEETS = [
  {
    name: "Events_sms_calls",
    aliases: ["events calls&sms", "events_sms_calls", "Events sms calls"],
    idPrefix: "E-SC-",
    dataStartRowHint: 2, // row 1 = headers, row 2 = data (legacy calls&sms)
  },
  {
    name: "Events_messengers",
    aliases: ["events messengers", "events_messengers", "Events messengers"],
    idPrefix: "E-M-",
    dataStartRowHint: 3, // row 1 = headers, row 2 = descriptions, row 3 = data
  },
];

/** Все канонические и legacy-имена для поиска листа. */
export function allSheetNames(sheetDef) {
  return [sheetDef.name, ...sheetDef.aliases];
}

function normSheetKey(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Найти листы событий в workbook по каноническим именам и aliases.
 * @param {string[]} workbookSheetNames
 * @returns {{ sheetName: string, def: typeof EVENT_SHEETS[0] }[]}
 */
export function resolveEventSheets(workbookSheetNames) {
  const names = workbookSheetNames ?? [];
  const byNorm = new Map(names.map((n) => [normSheetKey(n), n]));
  const found = [];

  for (const def of EVENT_SHEETS) {
    for (const candidate of allSheetNames(def)) {
      const actual = byNorm.get(normSheetKey(candidate));
      if (actual) {
        found.push({ sheetName: actual, def });
        break;
      }
    }
  }

  // Обратная совместимость: один неизвестный лист с events в имени
  if (!found.length && names.length) {
    const fallback = names.find((n) => /event/i.test(n));
    if (fallback) {
      const isMessenger = /messenger/i.test(fallback);
      found.push({
        sheetName: fallback,
        def: isMessenger ? EVENT_SHEETS[1] : EVENT_SHEETS[0],
      });
    }
  }

  return found;
}

/** idPrefix по имени листа (для match-скрипта и документации). */
export function idPrefixForSheet(sheetName) {
  const resolved = resolveEventSheets([sheetName]);
  if (resolved.length) return resolved[0].def.idPrefix;
  return /messenger/i.test(sheetName) ? "E-M-" : "E-SC-";
}
