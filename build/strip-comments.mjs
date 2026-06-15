// Удаление комментариев из текстовых артефактов publish (исходники не меняются).

/** @param {string} out */
function canStartRegex(out) {
  const trimmed = out.replace(/\s+$/, "");
  if (!trimmed) return true;
  const ch = trimmed.slice(-1);
  if ("([{=:,;!&|?+-~%^<>".includes(ch)) return true;
  if (/\b(return|case|throw|else|do|typeof|void|delete|new|in|instanceof)\s*$/i.test(trimmed)) {
    return true;
  }
  return false;
}

/** @param {string} code */
export function stripJsComments(code) {
  let out = "";
  let i = 0;
  const len = code.length;
  while (i < len) {
    const c = code[i];
    const c2 = code[i + 1];
    if (c === "/" && c2 === "/") {
      i += 2;
      while (i < len && code[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < len - 1 && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "/" && canStartRegex(out)) {
      out += c;
      i++;
      while (i < len) {
        if (code[i] === "\\") {
          out += code[i] + (code[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += code[i];
        if (code[i] === "/") {
          i++;
          while (i < len && /[gimsuy]/i.test(code[i])) {
            out += code[i];
            i++;
          }
          break;
        }
        i++;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      out += c;
      i++;
      while (i < len) {
        if (code[i] === "\\") {
          out += code[i] + (code[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += code[i];
        if (code[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return collapseBlankLines(out);
}

/** @param {string} css */
export function stripCssComments(css) {
  let out = "";
  let i = 0;
  const len = css.length;
  while (i < len) {
    const c = css[i];
    const c2 = css[i + 1];
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < len - 1 && !(css[i] === "*" && css[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      out += c;
      i++;
      while (i < len) {
        if (css[i] === "\\") {
          out += css[i] + (css[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += css[i];
        if (css[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return collapseBlankLines(out);
}

/** @param {string} html */
export function stripHtmlComments(html) {
  return collapseBlankLines(html.replace(/<!--[\s\S]*?-->/g, ""));
}

/** @param {string} svg */
export function stripSvgComments(svg) {
  return stripHtmlComments(svg);
}

/** @param {string} text */
function collapseBlankLines(text) {
  return text
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+/, "");
}

/** @param {string} filePath @param {string} content */
export function stripCommentsForFile(filePath, content) {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (ext === ".html") return stripHtmlComments(content);
  if (ext === ".css") return stripCssComments(content);
  if (ext === ".js" || ext === ".mjs") return stripJsComments(content);
  if (ext === ".svg") return stripSvgComments(content);
  return content;
}

/** Проверка: в publish не должно остаться комментариев. */
export function findRemainingComments(filePath, content) {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  const hits = [];
  if (ext === ".html" || ext === ".svg") {
    if (/<!--[\s\S]*?-->/.test(content)) hits.push("HTML comment");
  }
  if (ext === ".css" && /\/\*/.test(content)) hits.push("CSS block comment");
  if ((ext === ".js" || ext === ".mjs") && (/\/\*[\s\S]*?\*\//.test(content) || /^\s*\/\//m.test(content))) {
    hits.push("JS comment");
  }
  return hits;
}
