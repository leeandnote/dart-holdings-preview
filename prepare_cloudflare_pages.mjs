import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDaysArg = process.argv.find((arg) => arg.startsWith("--days="));
const publicDays = Number(publicDaysArg?.split("=")[1] || 90);
const siteDir = path.join(root, "site");
const distDir = path.join(root, "public_dist");
const deployDir = path.join(root, "deploy");

function firstValue(obj, names) {
  for (const name of names) {
    const value = obj?.[name];
    if (value !== undefined && value !== null && String(value) !== "") return String(value);
  }
  return "";
}

function removeDirSafe(target) {
  const resolvedRoot = path.resolve(root).toLowerCase();
  const resolvedTarget = path.resolve(target).toLowerCase();
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Refusing to delete outside project: ${target}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function makeCleanRoute(fileName, routeName) {
  const source = path.join(distDir, fileName);
  if (!fs.existsSync(source)) return;
  const routeDir = path.join(distDir, routeName);
  fs.mkdirSync(routeDir, { recursive: true });
  let html = fs.readFileSync(source, "utf8");
  html = html
    .replaceAll('href="assets/', 'href="/assets/')
    .replaceAll('src="assets/', 'src="/assets/')
    .replaceAll('href="styles.css"', 'href="/styles.css"')
    .replaceAll('src="data/', 'src="/data/')
    .replaceAll('src="app.js"', 'src="/app.js"')
    .replaceAll('href="disclaimer.html"', 'href="/disclaimer.html"')
    .replaceAll('href="privacy.html"', 'href="/privacy.html"')
    .replaceAll('href="terms.html"', 'href="/terms.html"')
    .replaceAll('href="contact.html"', 'href="/contact.html"');
  fs.writeFileSync(path.join(routeDir, "index.html"), html, "utf8");
}
if (!fs.existsSync(siteDir)) throw new Error(`site folder not found: ${siteDir}`);
removeDirSafe(distDir);
fs.mkdirSync(deployDir, { recursive: true });
fs.cpSync(siteDir, distDir, { recursive: true });
makeCleanRoute("5percent.html", "5percent");
makeCleanRoute("executives.html", "executives");
makeCleanRoute("contracts.html", "contracts");

const latestJsonPath = path.join(siteDir, "data", "latest.json");
if (fs.existsSync(latestJsonPath)) {
  const data = JSON.parse(fs.readFileSync(latestJsonPath, "utf8").replace(/^\uFEFF/, ""));
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const dateNames = ["\uC811\uC218\uC77C", "date", "reportDate", "\uC811\uC218\uC77C\uC790"];
  const codeNames = ["\uC885\uBAA9\uCF54\uB4DC", "stockCode", "code"];
  const maxDateText = rows
    .map((row) => firstValue(row, dateNames))
    .filter((value) => /^\d{8}$/.test(value))
    .sort()
    .at(-1);
  if (maxDateText) {
    const maxDate = new Date(`${maxDateText.slice(0, 4)}-${maxDateText.slice(4, 6)}-${maxDateText.slice(6, 8)}T00:00:00+09:00`);
    const cutoffDate = new Date(maxDate.getTime() - publicDays * 24 * 60 * 60 * 1000);
    const cutoff = `${cutoffDate.getFullYear()}${String(cutoffDate.getMonth() + 1).padStart(2, "0")}${String(cutoffDate.getDate()).padStart(2, "0")}`;
    const filteredRows = rows.filter((row) => {
      const date = firstValue(row, dateNames);
      return /^\d{8}$/.test(date) && date >= cutoff;
    });
    const usedCodes = new Set(filteredRows.map((row) => firstValue(row, codeNames)).filter(Boolean));
    const corps = Array.isArray(data.corps) ? data.corps : [];
    const filteredCorps = corps.filter((corp) => usedCodes.has(firstValue(corp, codeNames)));
    data.scope = `KOSPI/KOSDAQ recent ${publicDays} days public build`;
    data.bgnDe = cutoff;
    data.endDe = maxDateText;
    data.rows = filteredRows;
    data.corps = filteredCorps;
    console.log(`PUBLIC_DATA_ROWS=${filteredRows.length}`);
    console.log(`PUBLIC_DATA_RANGE=${cutoff}-${maxDateText}`);
  }
  const jsonText = JSON.stringify(data);
  const dataDir = path.join(distDir, "data");
  fs.writeFileSync(path.join(dataDir, "latest.json"), jsonText, "utf8");
  fs.writeFileSync(path.join(dataDir, "latest.js"), `window.__DART_DATA__ = ${jsonText};\n`, "utf8");
}

const files = walk(distDir);
const tooLarge = files
  .map((file) => ({ file, size: fs.statSync(file).size }))
  .filter((entry) => entry.size > 25 * 1024 * 1024);
if (tooLarge.length) {
  console.error("ERROR: Cloudflare Pages single-file 25MiB limit exceeded.");
  for (const entry of tooLarge) console.error(`${entry.size}\t${entry.file}`);
  process.exit(1);
}
if (files.length > 20000) {
  console.error(`ERROR: Cloudflare Pages Free file-count limit exceeded: ${files.length}`);
  process.exit(1);
}
const size = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
console.log(`PUBLIC_DIST=${distDir}`);
console.log(`FILES=${files.length}`);
console.log(`SIZE_MB=${(size / 1024 / 1024).toFixed(2)}`);






