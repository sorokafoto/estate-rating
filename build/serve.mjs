// Минимальный статический сервер для локального просмотра. Запуск: npm run serve
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.join(__dirname, ".."));
const PORT = process.env.PORT || 4321;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const DENY_SEGMENTS = new Set(["private", "node_modules", ".git", "build"]);
const DENY_FILES = /^\.env/i;

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' mailto:",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function resolvePublicPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const rel = decoded === "/" ? "/index.html" : decoded;
  const filePath = path.resolve(ROOT, "." + rel);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) return null;

  const relFromRoot = path.relative(ROOT, filePath);
  const parts = relFromRoot.split(path.sep);
  if (parts.some((p) => DENY_SEGMENTS.has(p))) return null;
  if (parts.some((p) => DENY_FILES.test(p))) return null;

  return filePath;
}

http
  .createServer((req, res) => {
    const filePath = resolvePublicPath(req.url || "/");
    if (!filePath) {
      res.writeHead(403, SECURITY_HEADERS);
      return res.end("Forbidden");
    }

    fs.readFile(filePath, (err, buf) => {
      if (err) {
        res.writeHead(404, SECURITY_HEADERS);
        return res.end("Not found");
      }
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        "Content-Type": TYPES[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(buf);
    });
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}`));
