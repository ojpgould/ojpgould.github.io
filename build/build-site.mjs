// Builds the whole site into one folder: the home page (the tools and the
// list of notes), one page per note, the shared look script and the icons.
// It uses no packages beyond node itself.
//
//   node build/build-site.mjs _site
//
// Run it from the repository's top folder. Each note's planted and tended
// dates come from the git history of its Markdown file, so the history needs
// to be present (on GitHub the checkout step fetches all of it).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";

const outDir = process.argv[2];
if (!outDir) { console.error("Usage: node build/build-site.mjs <output folder>"); process.exit(2); }

const REPO = process.env.GITHUB_REPOSITORY || "ojpgould/ojpgould.github.io";
const BRANCH = "main";
const kitText = readFileSync("build/kit.js", "utf8");
const kit = new Function(`${kitText}; return { APPS, SHAPES, GROUPS, css, draw, esc, inline };`)();
const saved = JSON.parse(readFileSync("build/settings.json", "utf8"));
const LOOK_KEYS = kit.GROUPS.flatMap((g) => g.params.map((p) => p[0]));
const pick = (v) => Object.fromEntries(LOOK_KEYS.map((k) => [k, v[k]]));
const mineShape = kit.SHAPES.some((s) => s.id === saved.shape) ? saved.shape : kit.SHAPES[0].id;
const esc = kit.esc;

// ---- the three looks -------------------------------------------------------

const MINIMAL = {
  ...pick(saved),
  bgHue: 0, bgSat: 0, bgL: 100, darkL: 7, accHue: 0, accSat: 0, accL: 38,
  font: 1, titleSize: 40, nameSize: 28, bodySize: 17, iconSize: 88, iconShadow: 0, dock: 0,
  box: 0, radius: 0, gap: 44, width: 760, kind: 1, rules: 1,
};
const LOOKS = { minimal: { shape: "rows", v: MINIMAL }, mine: { shape: mineShape, v: pick(saved) } };

const YOURS = [
  ["bgHue", "Background colour, as a position around the colour wheel", 0, 360],
  ["bgSat", "How much colour the background has (0 is grey or white)", 0, 100],
  ["accHue", "Colour of the links and small labels, around the colour wheel", 0, 360],
  ["bodySize", "How big the ordinary text is, in px", 13, 22],
  ["iconSize", "How big the app icons are, in px", 48, 240],
];
const FONT_NAMES = ["Plain", "Serif", "Rounded", "Typewriter", "JetBrains Mono"];
const READING = [
  ["large", "Make all the text larger"],
  ["contrast", "Use black or white text for the strongest contrast"],
  ["spacing", "Add more space between letters, words and lines"],
  ["underline", "Underline every link"],
];

// ---- notes -----------------------------------------------------------------

// In order from least to most settled. The order is used when sorting.
const STATUS = {
  early: ["Early", "An early thought, likely to change a lot."],
  developing: ["Developing", "Taking shape, still being worked on."],
  mature: ["Mature", "Well developed. It may still change, but not much."],
};
const STATUS_KEYS = Object.keys(STATUS);

function frontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return { meta, body: text.slice(m[0].length) };
}

// Dates of every commit that changed the file, newest first. Empty when the
// file has not been committed yet (a local preview).
function history(file) {
  try {
    const out = execFileSync("git", ["log", "--follow", "--format=%as", "--", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\n").filter(Boolean);
  } catch { return []; }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

const notes = existsSync("notes") ? readdirSync("notes").filter((f) => f.endsWith(".md")).sort().map((f) => {
  const slug = basename(f, ".md");
  const { meta, body } = frontMatter(readFileSync(join("notes", f), "utf8"));
  const dates = history(join("notes", f));
  const planted = meta.planted || dates[dates.length - 1] || "";
  return { slug, meta, file: `notes/${f}`, title: meta.title || slug, status: STATUS[meta.status] ? meta.status : STATUS_KEYS[0], summary: meta.summary || "", body, dates, planted, tended: dates.length > 1 ? dates[0] : planted };
}) : [];
const bySlug = Object.fromEntries(notes.map((n) => [n.slug, n]));
for (const n of notes) n.pinned = /^(true|yes)$/i.test(n.meta.pinned || "");
// Pinned notes (About me, About this page) are linked from the top of the
// page instead of being listed in the garden.
const pinned = notes.filter((n) => n.pinned), growing = notes.filter((n) => !n.pinned);

// ---- a small Markdown reader ----------------------------------------------
// Headings, paragraphs, lists, quotes, code, links, images, bold, italics and
// [[note-name]] or [[note-name|words]] links between notes. Anything else is
// shown as plain text, and everything is escaped, so a note can never break
// the page.

const SAFE_URL = /^(https?:\/\/|\.\.?\/|#|[\w-]+\.html)/;
function inlineMd(text, from) {
  const keep = [];
  const hold = (html) => `\u0000${keep.push(html) - 1}\u0000`;
  let s = text.replace(/`([^`]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => SAFE_URL.test(url) ? hold(`<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy">`) : m);
  s = s.replace(/\[\[([\w-]+)(?:\|([^\]]+))?\]\]/g, (_, slug, words) => {
    const n = bySlug[slug];
    if (n) from.add(slug);
    return n ? hold(`<a href="${slug}.html">${esc(words || n.title)}</a>`) : hold(`<span class="missing" title="No note with this name yet">${esc(words || slug)}</span>`);
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, words, url) => SAFE_URL.test(url) ? hold(`<a href="${esc(url)}">${esc(words)}</a>`) : m);
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]);
}

function markdown(src, from) {
  const lines = src.replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("```")) {
      const code = []; i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { const n = h[1].length + 1; out.push(`<h${n}>${inlineMd(h[2], from)}</h${n}>`); i++; continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    if (line.startsWith(">")) {
      const q = [];
      while (i < lines.length && lines[i].startsWith(">")) q.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${markdown(q.join("\n"), from)}</blockquote>`); continue;
    }
    const ordered = /^\d+\.\s+/.test(line);
    if (ordered || /^[-*]\s+/.test(line)) {
      const pat = ordered ? /^\d+\.\s+/ : /^[-*]\s+/, items = [];
      while (i < lines.length && pat.test(lines[i])) items.push(lines[i++].replace(pat, ""));
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((t) => `<li>${inlineMd(t, from)}</li>`).join("")}</${tag}>`); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|```|[-*]\s|\d+\.\s)/.test(lines[i])) para.push(lines[i++].trim());
    if (!para.length) para.push(lines[i++].trim());
    out.push(`<p>${inlineMd(para.join(" "), from)}</p>`);
  }
  return out.join("\n");
}

for (const n of notes) { n.linksTo = new Set(); n.html = markdown(n.body, n.linksTo); }
for (const n of notes) n.words = n.body.replace(/[#>*`\[\]()_-]/g, " ").split(/\s+/).filter(Boolean).length;
for (const n of notes) n.linkedFrom = notes.filter((o) => o.linksTo.has(n.slug));

// ---- shared pieces ----------------------------------------------------------

const UI_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const extraCss = `
.looks { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 4px; padding: 14px 16px 0; }
.looks button, .panel button { font: 14px/1 ${UI_FONT}; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: 999px; padding: 8px 14px; cursor: pointer; }
.looks button[aria-pressed="true"], .panel button[aria-pressed="true"] { color: var(--bg); background: var(--fg); border-color: var(--fg); }
.looks button:focus-visible, .panel button:focus-visible, .panel input:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.looks .looks-set { display: flex; flex-wrap: wrap; gap: 4px; }
.looks .readset { padding-left: 12px; margin-left: 8px; border-left: 1px solid var(--line); }
#yours, #reading { display: none; position: fixed; z-index: 10; top: 16px; right: 16px; bottom: 16px; width: 320px; min-height: 0; overflow-y: auto; padding: 16px 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--bg); box-shadow: 0 12px 40px rgba(0,0,0,0.22); font: 14px/1.4 ${UI_FONT}; color: var(--fg); container-type: normal; letter-spacing: normal; word-spacing: normal; }
#reading { bottom: auto; }
#yours.open, #reading.open { display: block; }
.panel p.help { margin: 0 0 12px; color: var(--muted); }
#yours .row { display: grid; grid-template-columns: 1fr; gap: 10px; }
#yours label { display: flex; flex-direction: column; gap: 4px; }
#yours input[type=range] { width: 100%; accent-color: var(--accent); }
#yours .choices { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 12px; }
#yours .choices button { padding: 6px 10px; }
#yours .label { margin: 8px 0 0; }
#yoursText { width: 100%; height: 90px; margin-top: 10px; font: 11px/1.4 ui-monospace, Menlo, monospace; color: var(--fg); background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 6px; box-sizing: border-box; }
html[data-page="note"] #yours .layout-part { display: none; }
#reading label { display: flex; gap: 10px; align-items: flex-start; padding: 6px 0; cursor: pointer; }
#reading input[type=checkbox] { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--accent); flex: none; }
.panel .foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
@media (min-width: 1000px) { html[data-panel="open"] .site { padding-right: 352px; } }
@media (max-width: 999px) {
  #yours, #reading { top: auto; left: 0; right: 0; bottom: 0; width: auto; max-height: 42vh; border-radius: 14px 14px 0 0; border-bottom: 0; }
  #yours .row { grid-template-columns: 1fr 1fr; gap: 10px 20px; }
  html[data-panel="open"] .site { padding-bottom: 44vh; }
}
@media (max-width: 600px) { #yours .row { grid-template-columns: 1fr; } }

/* Links between the two sections, and the list of notes on the home page. */
.sections { display: flex; justify-content: center; gap: 20px; margin-top: 22px; font-size: 15px; }
.garden-empty { color: var(--muted); font-style: italic; }
.garden { border-top: 1px solid var(--line); padding: 48px 0; }
.garden-title { font-size: 1.9em; letter-spacing: -0.015em; margin: 0 0 6px; line-height: 1.15; }
.garden-intro { color: var(--muted); margin: 0 0 20px; max-width: 620px; }
.notes { list-style: none; margin: 0; padding: 0; }
.notes li { padding: 16px 0; border-top: 1px solid var(--line); }
.notes li:first-child { border-top: 0; }
.notes .title { font-size: 1.2em; font-weight: 600; margin-right: 10px; }
.notes p { margin: 4px 0 0; }
.notes .when { color: var(--muted); font-size: 0.85em; }
.status { display: inline-block; vertical-align: 2px; font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--accent); border: 1px solid var(--line); border-radius: 999px; padding: 3px 9px; }

.shed { padding: 8px 0 4px; }
.shed .garden-intro { margin-bottom: 8px; }
.shed .dock { margin: 18px 0 0; }
.sections { flex-wrap: wrap; }

/* The arrangements of the garden: list, cards, plot and growth. */
.arrange { margin: 0 0 22px; font: 14px/1.4 ${UI_FONT}; }
.arrange .views { display: inline-flex; flex-wrap: wrap; gap: 4px; margin: 0 16px 10px 0; }
.arrange button { font: 14px/1 ${UI_FONT}; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: 999px; padding: 8px 14px; cursor: pointer; }
.arrange button[aria-pressed="true"] { color: var(--bg); background: var(--fg); border-color: var(--fg); }
.arrange .opts { display: inline-flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; vertical-align: top; }
.arrange label { display: inline-flex; gap: 6px; align-items: center; color: var(--muted); }
.arrange select { font: 14px ${UI_FONT}; color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; }
.arrange input[type=checkbox] { accent-color: var(--accent); width: 16px; height: 16px; margin: 0; }
.arrange :is(button, select, input):focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.arrange .viewhelp { margin: 6px 0 0; color: var(--muted); }
.arrange[data-view="plot"] .for-sort, .arrange:not([data-view="plot"]) .for-plot { display: none; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); grid-auto-flow: dense; gap: 14px; }
.garden a.card { display: flex; flex-direction: column; gap: 6px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); color: var(--fg); text-decoration: none; }
.garden a.card:hover { border-color: var(--accent); }
.card:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.card h3 { margin: 4px 0 0; font-size: 1.1em; line-height: 1.25; color: var(--accent); }
.card p { margin: 0; font-size: 0.92em; color: var(--fg); }
.card .when { color: var(--muted); font-size: 0.8em; margin-top: auto; padding-top: 6px; }
.card .status { align-self: flex-start; }
.card.size-2 { grid-column: span 2; }
.card.size-3 { grid-column: span 2; }
.card.size-3 h3 { font-size: 1.45em; }
.card.size-3 p { font-size: 1em; }
@media (max-width: 520px) { .card.size-2, .card.size-3 { grid-column: auto; grid-row: auto; } }
.plot svg { display: block; width: 100%; height: auto; overflow: visible; font-family: ${UI_FONT}; }
.plot .axis line, .plot .grid line { stroke: var(--line); }
.plot .axis text { fill: var(--muted); font-size: 12px; }
.plot .axis .name { fill: var(--muted); font-size: 13px; }
.plot .link { stroke: var(--muted); stroke-opacity: 0.35; stroke-width: 1.2; transition: stroke-opacity 0.15s; }
.plot .dot circle { fill: var(--accent); fill-opacity: 0.8; stroke: var(--bg); stroke-width: 2; }
.plot .dot text { fill: var(--fg); font-size: 12.5px; }
.plot .dot:focus-visible circle, .plot .dot:hover circle { fill-opacity: 1; stroke: var(--fg); }
.plot .dot:focus { outline: none; }
.plot.lit .link { stroke-opacity: 0.08; }
.plot.lit .link.on { stroke-opacity: 0.9; stroke: var(--accent); stroke-width: 2; }
.plot.lit .dot:not(.on) { opacity: 0.35; }
.growth { list-style: none; margin: 0; padding: 0; }
.gscale, .growth li { display: grid; grid-template-columns: minmax(150px, 30%) 1fr; gap: 14px; align-items: center; }
.growth li { padding: 9px 0; border-top: 1px solid var(--line); }
.gscale { color: var(--muted); font: 12px ${UI_FONT}; padding-bottom: 6px; }
.gscale .ticks { position: relative; height: 16px; }
.gscale .ticks span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.growth .title { font-weight: 600; line-height: 1.25; }
.growth .track { position: relative; height: 22px; }
.growth .track::before { content: ""; position: absolute; left: 0; right: 0; top: 50%; border-top: 1px dashed var(--line); }
.growth .life { position: absolute; top: calc(50% - 2px); height: 4px; border-radius: 2px; background: var(--accent); opacity: 0.35; }
.growth .rev { position: absolute; top: 50%; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; border-radius: 50%; background: var(--accent); border: 2px solid var(--bg); box-sizing: content-box; }
.growth .rev.first { background: var(--bg); border-color: var(--accent); }
@media (max-width: 600px) { .gscale, .growth li { grid-template-columns: 1fr; gap: 4px; } .gscale > :first-child { display: none; } }

/* A note's own page. */
.crumb { padding: 28px 0 0; margin: 0; font-size: 15px; }
.note { max-width: 680px; margin: 0 auto; padding: 28px 0 40px; }
.note h1 { font-size: clamp(30px, 6vw, 44px); line-height: 1.15; letter-spacing: -0.015em; margin: 12px 0 10px; }
.note .when { color: var(--muted); font-size: 14px; margin: 0 0 32px; }
.note .body h2 { font-size: 1.45em; margin: 1.7em 0 0.4em; line-height: 1.25; }
.note .body h3, .note .body h4 { font-size: 1.15em; margin: 1.4em 0 0.3em; }
.note .body blockquote { margin: 1.2em 0; padding: 2px 0 2px 18px; border-left: 3px solid var(--line); color: var(--muted); }
.note .body code { font: 0.9em ui-monospace, 'SF Mono', Menlo, monospace; background: var(--card); border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; }
.note .body pre { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; overflow-x: auto; }
.note .body pre code { background: none; border: 0; padding: 0; }
.note .body img { max-width: 100%; border-radius: 8px; }
.note .body hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
.note .missing { color: var(--muted); border-bottom: 1px dashed var(--line); }
.linked { max-width: 680px; margin: 0 auto 40px; border-top: 1px solid var(--line); padding-top: 18px; }
.linked h2 { font-size: 15px; margin: 0 0 8px; color: var(--muted); font-weight: 600; }
.linked ul { margin: 0; padding-left: 20px; }

/* Reading options. They sit on top of whichever look is chosen. */
html[data-contrast] :is(.site, .panel) { --fg: #000; --muted: #000; --accent: #000; --line: rgba(0,0,0,0.55); }
@media (prefers-color-scheme: dark) { html[data-contrast] :is(.site, .panel):not([data-theme="light"]) { --fg: #fff; --muted: #fff; --accent: #fff; --line: rgba(255,255,255,0.6); } }
html[data-contrast] .site :is(p, li, footer) a { text-decoration: underline; }
html[data-spacing] .site { letter-spacing: 0.04em; word-spacing: 0.12em; }
html[data-spacing] .site :is(p, li, footer) { line-height: 1.9; }
html[data-spacing] .site .product, html[data-spacing] .site .what { text-align: left; }
html[data-underline] .site :is(p, li, footer) a { text-decoration: underline; text-underline-offset: 3px; }
html[data-large] .site .kind, html[data-large] .site .status { font-size: 15px; }
html[data-large] .site footer { font-size: 17px; }
html[data-large] .site .dock a { font-size: 14px; }
`;

const bar = `<div class="looks">
<div class="looks-set" role="group" aria-label="Choose how this page looks">
<button type="button" data-look="minimal" aria-pressed="false" title="A plain version with almost no colour">Minimal</button>
<button type="button" data-look="mine" aria-pressed="true" title="The page as I designed it">Mine</button>
<button type="button" data-look="yours" aria-pressed="false" title="Set the colours, text and layout yourself. Click again to bring the controls back after hiding them.">Yours</button>
</div>
<div class="looks-set readset" role="group" aria-label="Settings that make the page easier to read">
<button type="button" class="readbtn" id="readBtn" aria-expanded="false" aria-controls="reading" title="Settings that make the page easier to read: larger text, stronger contrast, more spacing and underlined links. They work with any look.">Easier to read</button>
</div>
</div>`;

const panels = `<div class="panel" id="yours" role="region" aria-label="Controls for your own look">
<p class="help">Change how this site looks. Your choice is saved in this browser only, and carries across every page.</p>
<div class="layout-part">
<p class="label">Layout of the tools on the home page</p>
<div class="choices" data-choice="shape">${kit.SHAPES.map((s) => `<button type="button" data-value="${s.id}" title="${esc(s.about)}">${esc(s.name.replace(/^\d+\.\s*/, ""))}</button>`).join("")}</div>
</div>
<p class="label">Typeface</p>
<div class="choices" data-choice="font">${FONT_NAMES.map((n, i) => `<button type="button" data-value="${i + 1}">${n}</button>`).join("")}</div>
<div class="row">${YOURS.map(([k, label, min, max]) => `<label>${label}<input type="range" data-key="${k}" min="${min}" max="${max}" step="1"></label>`).join("")}</div>
<div class="foot"><button type="button" id="fromMine">Start again from my design</button><button type="button" id="copyYours">Copy these settings</button><button type="button" id="hideYours">Hide these controls</button></div>
<textarea id="yoursText" readonly hidden aria-label="Your settings, as text you can copy"></textarea>
</div>
<div class="panel" id="reading" role="region" aria-label="Settings that make the page easier to read">
<p class="help">Make the site easier to read. These work with any look, and are saved in this browser only.</p>
${READING.map(([k, label]) => `<label><input type="checkbox" data-read="${k}">${label}</label>`).join("\n")}
<div class="foot"><span></span><button type="button" id="hideReading">Hide these options</button></div>
</div>`;

// The look script every page shares. It runs in the page's head, before the
// page is drawn, so the visitor's chosen look shows without a flash.
const lookJs = `// The look switcher and reading options, shared by every page.
${kitText}
const LOOKS = ${JSON.stringify(LOOKS)};
const READ_KEYS = ${JSON.stringify(READING.map((r) => r[0]))};
const KEY = "portfolio-look";
let state = { look: "mine", yours: null, reading: {} };
try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && (LOOKS[s.look] || s.look === "yours")) state = s; } catch {}
if (!state.yours) state.yours = JSON.parse(JSON.stringify(LOOKS.mine));
if (!state.reading) state.reading = {};
const media = (q) => { try { return matchMedia(q).matches; } catch { return false; } };
// High contrast follows the system setting until the visitor chooses for themselves.
function readOn(k) { return k === "contrast" && state.reading.contrast === undefined ? media("(prefers-contrast: more)") : !!state.reading[k]; }
function current() { return state.look === "yours" ? state.yours : LOOKS[state.look]; }
function apply() {
  const c = current();
  let v = c.v;
  if (readOn("large")) v = { ...v, bodySize: Math.round(v.bodySize * 1.25), nameSize: Math.round(v.nameSize * 1.15), titleSize: Math.round(v.titleSize * 1.1) };
  const el = document.getElementById("look");
  if (el) el.textContent = css(c.shape, v).replace(/\\.site(?![\\w-])/g, ":is(.site, .panel)") + (v.dock ? "" : "\\n.dock { display: none; }");
  const site = document.querySelector(".site");
  if (site) site.className = "site layout-" + c.shape;
  const root = document.documentElement;
  READ_KEYS.forEach((k) => { if (readOn(k)) root.setAttribute("data-" + k, ""); else root.removeAttribute("data-" + k); });
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}
apply();
document.addEventListener("DOMContentLoaded", () => {
  apply();
  const yours = document.getElementById("yours"), reading = document.getElementById("reading"), readBtn = document.getElementById("readBtn");
  if (!yours || !reading || !readBtn) return;
  const still = () => media("(prefers-reduced-motion: reduce)");
  const setOpen = (panel, open) => {
    [yours, reading].forEach((p) => p.classList.toggle("open", p === panel && open));
    readBtn.setAttribute("aria-expanded", String(panel === reading && open));
    if (open) document.documentElement.dataset.panel = "open"; else delete document.documentElement.dataset.panel;
    if (open && panel === yours) {
      const first = document.querySelector(".product, .note .body");
      if (first && first.getBoundingClientRect().top > window.innerHeight * 0.5) first.scrollIntoView({ behavior: still() ? "auto" : "smooth", block: "start" });
    }
  };
  const sync = () => {
    document.querySelectorAll(".looks [data-look]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.look === state.look)));
    const y = state.yours;
    yours.querySelectorAll("[data-key]").forEach((i) => { i.value = y.v[i.dataset.key]; });
    yours.querySelectorAll('[data-choice="shape"] button').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === y.shape)));
    yours.querySelectorAll('[data-choice="font"] button').forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.value) === y.v.font)));
    reading.querySelectorAll("[data-read]").forEach((i) => { i.checked = readOn(i.dataset.read); });
  };
  document.querySelectorAll(".looks [data-look]").forEach((b) => b.addEventListener("click", () => {
    state.look = b.dataset.look;
    if (state.look === "yours") setOpen(yours, true); else if (yours.classList.contains("open")) setOpen(yours, false);
    apply(); sync();
  }));
  yours.querySelectorAll("[data-key]").forEach((i) => i.addEventListener("input", () => { state.yours.v[i.dataset.key] = Number(i.value); apply(); }));
  yours.querySelectorAll('[data-choice="shape"] button').forEach((b) => b.addEventListener("click", () => { state.yours.shape = b.dataset.value; apply(); sync(); }));
  yours.querySelectorAll('[data-choice="font"] button').forEach((b) => b.addEventListener("click", () => { state.yours.v.font = Number(b.dataset.value); apply(); sync(); }));
  document.getElementById("fromMine").addEventListener("click", () => { state.yours = JSON.parse(JSON.stringify(LOOKS.mine)); apply(); sync(); });
  document.getElementById("hideYours").addEventListener("click", () => setOpen(yours, false));
  // Shows the current settings as text and copies them, so they can be kept or sent on.
  document.getElementById("copyYours").addEventListener("click", async (e) => {
    const box = document.getElementById("yoursText"), btn = e.currentTarget;
    box.value = JSON.stringify({ shape: state.yours.shape, ...state.yours.v });
    box.hidden = false; box.select();
    let copied = false;
    try { await navigator.clipboard.writeText(box.value); copied = true; } catch { try { copied = document.execCommand("copy"); } catch {} }
    btn.textContent = copied ? "Copied" : "Select the text below and copy it";
    setTimeout(() => { btn.textContent = "Copy these settings"; }, 2500);
  });
  reading.querySelectorAll("[data-read]").forEach((i) => i.addEventListener("change", () => { state.reading[i.dataset.read] = i.checked; apply(); }));
  readBtn.addEventListener("click", () => setOpen(reading, !reading.classList.contains("open")));
  document.getElementById("hideReading").addEventListener("click", () => { setOpen(reading, false); readBtn.focus(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.documentElement.dataset.panel) { setOpen(yours, false); readBtn.focus(); } });
  sync();
});
`;

// JetBrains Mono is served from this site (its licence is in fonts/OFL.txt).
// A browser only downloads it when a page actually uses it.
const fontFace = (root) => `@font-face { font-family: 'JetBrains Mono'; src: url('${root}fonts/JetBrainsMono.woff2') format('woff2'); font-weight: 100 800; font-display: swap; }\n`;

// Puts the shared look script and styles into a drawn page. Without
// JavaScript the page still shows "Mine", drawn into it at build time.
function finish(page, root, kind) {
  return page
    .replace("<html lang=\"en\">", `<html lang="en" data-page="${kind}">`)
    .replace("<style>", `<style id="look">`)
    .replace("</style>", `</style>\n<style>${fontFace(root)}${extraCss}</style>\n<script src="${root}look.js"></script>`)
    .replace(`<div class="page">`, `${bar}\n<div class="page">`)
    .replace("</body>", `${panels}\n</body>`);
}

const whenLine = (n) => {
  if (!n.dates.length) return `Planted ${n.planted ? nice(n.planted) : "recently"}. Not yet published, so it has no history yet.`;
  const tends = n.dates.length - 1;
  const planted = nice(n.planted || n.dates[n.dates.length - 1]);
  const history = `<a href="https://github.com/${REPO}/commits/${BRANCH}/${n.file}">See every version</a>`;
  return tends === 0 ? `Planted ${planted}. ${history}.`
    : `Planted ${planted}, tended ${tends} ${tends === 1 ? "time" : "times"}, last on ${nice(n.dates[0])}. ${history}.`;
};
const statusPill = (n) => `<span class="status" title="${esc(STATUS[n.status][1])}">${STATUS[n.status][0]}</span>`;

// ---- the home page -----------------------------------------------------------

const ordered = [...growing].sort((a, b) => (b.tended || "").localeCompare(a.tended || "") || a.title.localeCompare(b.title));
const listItem = (n) => `<li><a class="title" href="notes/${n.slug}.html">${esc(n.title)}</a>${statusPill(n)}
<p>${kit.inline(n.summary)}</p>
<p class="when">${n.dates.length > 1 ? `Last tended ${nice(n.tended)}` : `Planted ${n.planted ? nice(n.planted) : "recently"}`}</p></li>`;
// What the arrangements need to know about each note. The list is also drawn
// into the page here, so it works without JavaScript.
const gardenData = growing.map((n) => ({
  slug: n.slug, title: n.title, status: n.status, rank: STATUS_KEYS.indexOf(n.status), label: STATUS[n.status][0], about: STATUS[n.status][1],
  summary: kit.inline(n.summary), first: n.planted || "", last: n.tended || n.planted || "",
  dates: n.dates.length ? [...n.dates].reverse() : (n.planted ? [n.planted] : []), words: n.words, links: [...n.linksTo],
}));
// Plot and Growth compare notes with each other, so they are offered once
// there are at least 3 notes.
const MIN_FOR_CHARTS = 3;
const viewButtons = [["list", "List"], ["cards", "Cards"], ...(growing.length >= MIN_FOR_CHARTS ? [["plot", "Plot"], ["growth", "Growth"]] : [])]
  .map(([v, label], i) => `<button type="button" data-view="${v}" aria-pressed="${i === 0}">${label}</button>`).join("");
const garden = !growing.length ? `<section class="garden" id="garden">
<h2 class="garden-title">${esc(saved.notes_title || "Garden")}</h2>
<p class="garden-intro">${kit.inline(saved.notes_intro || "")}</p>
<p class="garden-empty">${kit.inline(saved.notes_empty || "Nothing planted yet.")}</p>
</section>` : `<section class="garden" id="garden">
<h2 class="garden-title">${esc(saved.notes_title || "Garden")}</h2>
<p class="garden-intro">${kit.inline(saved.notes_intro || "")}</p>
<div class="arrange" id="gArrange" hidden>
<div class="views" role="group" aria-label="How to arrange the notes">
${viewButtons}
</div>
<div class="opts">
<label class="for-sort">Order<select id="gSort"></select></label>
<label class="for-plot">Across<select id="gX"></select></label>
<label class="for-plot">Up<select id="gY"></select></label>
<label class="for-plot check"><input type="checkbox" id="gLinks" checked>Show links between notes</label>
</div>
<p class="viewhelp" id="gHelp"></p>
</div>
<div id="gView"><ul class="notes">
${ordered.map(listItem).join("\n")}
</ul></div>
<script type="application/json" id="gData">${JSON.stringify(gardenData).replace(/</g, "\\u003c")}</script>
</section>`;

const drawn = kit.draw(mineShape, saved, 0, "site");
const dockHtml = (drawn.match(/<nav class="dock">[\s\S]*?<\/nav>/) || [""])[0];
const sectionLinks = [`<a href="#shed">${esc(saved.shed_title || "Shed")}</a>`, `<a href="#garden">${esc(saved.notes_title || "Garden")}</a>`, ...pinned.map((n) => `<a href="notes/${n.slug}.html">${esc(n.title)}</a>`)].filter(Boolean).join("");
let home = drawn.replace(dockHtml, "")
  .replace(`<div class="apps">`, `<section class="shed" id="shed"><h2 class="garden-title">${esc(saved.shed_title || "Shed")}</h2>\n<p class="garden-intro">${kit.inline(saved.shed_intro || "")}</p>\n${dockHtml}</section>\n<div class="apps">`)
  .replace("</header>", `<nav class="sections" aria-label="Sections of this page">${sectionLinks}</nav>\n</header>`)
  .replace("<footer>", `${garden}\n<footer>`);
home = finish(home, "", "home").replace("</body>", `<script src="garden.js"></script>\n</body>`);

// ---- each note's page --------------------------------------------------------

const head = (title) => kit.draw(mineShape, saved, 0, "site").split("<body>")[0].replace(/<title>.*<\/title>/, `<title>${esc(title)}</title>`);
function notePage(n) {
  const linked = n.linkedFrom.length ? `<aside class="linked"><h2>Linked from</h2><ul>${n.linkedFrom.map((o) => `<li><a href="${o.slug}.html">${esc(o.title)}</a></li>`).join("")}</ul></aside>` : "";
  const page = `${head(`${n.title} | ${saved.title}`)}<body>
<div class="site layout-${mineShape}">
<div class="page">
<p class="crumb"><a href="../index.html">Back to ${esc(saved.title)}</a></p>
<article class="note">
${n.pinned ? "" : statusPill(n)}
<h1>${esc(n.title)}</h1>
<p class="when">${whenLine(n)}</p>
<div class="body">
${n.html}
</div>
</article>
${linked}
<footer>${kit.inline(saved.footer)}</footer>
</div>
</div>
</body>
</html>`;
  return finish(page, "../", "note");
}

// ---- write everything ----------------------------------------------------------

mkdirSync(join(outDir, "notes"), { recursive: true });
mkdirSync(join(outDir, "icons"), { recursive: true });
writeFileSync(join(outDir, "index.html"), home);
writeFileSync(join(outDir, "look.js"), lookJs);
copyFileSync("build/garden.js", join(outDir, "garden.js"));
for (const n of notes) writeFileSync(join(outDir, "notes", `${n.slug}.html`), notePage(n));
mkdirSync(join(outDir, "fonts"), { recursive: true });
for (const f of readdirSync("fonts")) copyFileSync(join("fonts", f), join(outDir, "fonts", f));
for (const f of readdirSync("icons")) copyFileSync(join("icons", f), join(outDir, "icons", f));
writeFileSync(join(outDir, ".nojekyll"), "");
console.log(`Built ${outDir}: the home page, ${notes.length} ${notes.length === 1 ? "note" : "notes"}, look.js and ${readdirSync("icons").length} icons.`);
