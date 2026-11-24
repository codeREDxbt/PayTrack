/**
 * Builds docs/report/PayTrack_Project_Report.pdf from the Markdown source.
 *
 *   node docs/report/generate_pdf.mjs
 *
 * Steps: Markdown -> HTML (marked, via npx) -> print-ready A4 document ->
 * PDF via a headless Chromium/Edge DevTools session (which allows a page-number
 * footer, unlike the --print-to-pdf command line). No project dependencies.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const source = path.join(here, 'PayTrack_Project_Report.md');
const htmlOut = path.join(here, 'PayTrack_Project_Report.html');
const pdfOut = path.join(here, 'PayTrack_Project_Report.pdf');
const bodyFile = path.join(os.tmpdir(), `paytrack-report-body-${process.pid}.html`);

execFileSync('npx', ['--yes', 'marked@15', '-i', source, '-o', bodyFile], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const body = fs.readFileSync(bodyFile, 'utf8');

// Everything before the first <h2> is the cover; give it its own page.
const firstH2 = body.indexOf('<h2');
const cover = firstH2 === -1 ? '' : body.slice(0, firstH2);
const rest = firstH2 === -1 ? body : body.slice(firstH2);

const css = `
@page { size: A4; margin: 20mm 18mm 22mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0; color: #1f2937; background: #fff;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 10.5pt; line-height: 1.55;
}
.cover { height: 245mm; display: flex; flex-direction: column; justify-content: center;
  text-align: center; break-after: page; }
.cover h1 { font-size: 27pt; line-height: 1.2; margin: 0 0 6mm; color: #12263f;
  border: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
.cover p { font-size: 12pt; color: #475569; margin: 0 0 12mm; text-align: center; }
.cover table { margin: 0 auto; border: 0; font-size: 10.5pt; width: auto; }
.cover table td, .cover table th { border: 0; background: none; padding: 1.6mm 4mm; }
.cover table, .cover table * { border: 0 !important; background: none !important; }
.cover thead { display: none; }
.cover table td:first-child { text-align: right; color: #64748b; white-space: nowrap; }
.cover table td:last-child { text-align: left; font-weight: 600; color: #12263f; }
.cover .rule { width: 40mm; height: 3px; background: #1d4ed8; margin: 10mm auto 0; }

h2 { font-family: 'Segoe UI', Arial, sans-serif; font-size: 15pt; color: #12263f;
  margin: 10mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 1.5px solid #dbe3ee;
  break-after: avoid; break-before: auto; }
h2 + p, h3 + p { break-before: avoid; }
h3 { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11.5pt; color: #1d4ed8;
  margin: 6mm 0 1.5mm; break-after: avoid; }
p { margin: 0 0 2.6mm; text-align: justify; hyphens: auto; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.1mm; }
strong { color: #0f172a; }
code { font-family: Consolas, 'Courier New', monospace; font-size: 9pt;
  background: #f1f5f9; border-radius: 2px; padding: 0.2mm 1mm; }
pre { background: #f8fafc; border: 1px solid #dbe3ee; border-left: 3px solid #1d4ed8;
  border-radius: 3px; padding: 3mm 4mm; margin: 0 0 4mm; overflow: visible;
  break-inside: avoid; }
pre code { background: none; padding: 0; font-size: 8.2pt; line-height: 1.35; }
table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9.2pt;
  font-family: 'Segoe UI', Arial, sans-serif; break-inside: auto; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { border: 1px solid #d5dde8; padding: 1.8mm 2.4mm; text-align: left; vertical-align: top; }
th { background: #eaf0f8; color: #12263f; font-weight: 600; }
tbody tr:nth-child(even) td { background: #fafcff; }
blockquote { margin: 0 0 4mm; padding: 2mm 4mm; border-left: 3px solid #cbd5e1;
  background: #f8fafc; color: #475569; font-size: 9.8pt; }
blockquote p { margin: 0; }
hr { border: 0; border-top: 1px solid #e2e8f0; margin: 6mm 0; }
a { color: #1d4ed8; text-decoration: none; }
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>PayTrack — Final Project Report</title>
<style>${css}</style>
</head>
<body>
<section class="cover">${cover}<div class="rule"></div></section>
${rest}
</body>
</html>
`;

fs.writeFileSync(htmlOut, html, 'utf8');

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = fs.existsSync(edge) ? edge : fs.existsSync(chrome) ? chrome : null;
if (!browser) throw new Error('No Edge or Chrome found for PDF printing.');

const port = 9333 + Math.floor(Math.random() * 400);
const profile = path.join(os.tmpdir(), `paytrack-pdf-profile-${process.pid}`);
const child = spawn(browser, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--disable-extensions',
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetSocket() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* browser still starting */
    }
    await sleep(250);
  }
  throw new Error('Headless browser did not expose a page target.');
}

const fileUrl = `file:///${htmlOut.replace(/\\/g, '/')}`;
const ws = new WebSocket(await targetSocket());
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const events = new Map();
ws.addEventListener('message', (msg) => {
  const data = JSON.parse(msg.data);
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    data.error ? reject(new Error(data.error.message)) : resolve(data.result);
  } else if (data.method && events.has(data.method)) {
    events.get(data.method)();
    events.delete(data.method);
  }
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function once(method) {
  return new Promise((resolve) => events.set(method, resolve));
}

try {
  await send('Page.enable');
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: fileUrl });
  await loaded;

  const footer = `<div style="width:100%;padding:0 18mm;font-family:Segoe UI,Arial,sans-serif;
    font-size:8pt;color:#64748b;display:flex;justify-content:space-between;">
    <span>PayTrack — Final Project Report</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;

  const { data } = await send('Page.printToPDF', {
    printBackground: true,
    paperWidth: 8.27,
    paperHeight: 11.69,
    marginTop: 0.79,
    marginBottom: 0.87,
    marginLeft: 0.71,
    marginRight: 0.71,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: footer,
  });

  fs.writeFileSync(pdfOut, Buffer.from(data, 'base64'));
  console.log(`Wrote ${htmlOut}`);
  console.log(`Wrote ${pdfOut}`);
} finally {
  ws.close();
  child.kill();
  // Windows keeps the profile directory locked for a moment after exit.
  for (let i = 0; i < 10; i++) {
    try {
      fs.rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      await sleep(300);
    }
  }
}
