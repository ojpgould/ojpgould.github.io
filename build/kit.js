// Drawing code for the site: copied from the design jig by export-kit.mjs.
// Edit the jig, not this file, then export again.
const APPS = [{"id":"marginalia","name":"Marginalia"},{"id":"mood","name":"Mood"},{"id":"mesocene","name":"Mesocene"},{"id":"lazer","name":"Lazer"},{"id":"glider","name":"Glider"}];
const SHAPES = [{"id":"rows","name":"1. Rows","about":"Each app on its own row: icon on the left, words on the right."},{"id":"alternate","name":"2. Alternating","about":"Like rows, but the icon swaps sides from one app to the next."},{"id":"centred","name":"3. Centred","about":"Each app centred under its icon, like a product launch page."},{"id":"cards","name":"4. Cards","about":"The apps as cards in a grid, with the icon at the top of each."},{"id":"list","name":"5. List","about":"A tight list like an app store: small icons, and the longer description left out."}];
const GROUPS = [{"title":"Colours","params":[["bgHue",0,360],["bgSat",0,100],["bgL",80,100],["darkL",0,25],["accHue",0,360],["accSat",0,100],["accL",20,80]]},{"title":"Text","params":[["font",1,5],["titleSize",24,72],["nameSize",18,56],["bodySize",13,22]]},{"title":"Icons","params":[["iconSize",48,240],["iconShadow",0,100],["dock",0,1]]},{"title":"Boxes and spacing","params":[["box",0,100],["radius",0,32],["gap",8,120],["width",600,1280],["kind",0,1],["rules",0,1]]}];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${clamp(s, 0, 100)}%,${clamp(l, 0, 100)}%,${a})`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Plain text with [words](https://address) turned into links; everything
// else is escaped, so typing in a box can never break the page.
const inline = (s) => esc(s).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);

// Colour arithmetic for keeping text readable (the WCAG contrast formula).
const hslRgb = (h, s, l) => {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};
const relLum = (c) => { const t = (x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * t(c[0]) + 0.7152 * t(c[1]) + 0.0722 * t(c[2]); };
const contrast = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const whiteOver = (base, alpha) => base.map((c) => c * (1 - alpha) + alpha);
// Returns the lightness to use for a text colour: the chosen one if it already
// reads at 4.5 to 1 (the WCAG AA level for ordinary text) against every
// surface it sits on, otherwise moved darker on a light page or lighter on a
// dark page, one step at a time, until it does. Hue and saturation are kept.
function readable(h, s, l, surfaces, darkPage) {
  for (let x = l; x >= 0 && x <= 100; x += darkPage ? 1 : -1) {
    if (surfaces.every((b) => contrast(hslRgb(h, s, x), b) >= 4.6)) return x;
  }
  return darkPage ? 100 : 0;
}

const FONTS = [
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  "ui-serif, 'New York', Georgia, 'Times New Roman', serif",
  "ui-rounded, 'SF Pro Rounded', -apple-system, 'Segoe UI', sans-serif",
  "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
];

function css(shapeId, v) {
  const k = v.box / 100;
  const lbg = hslRgb(v.bgHue, v.bgSat, v.bgL), lsurf = [lbg, whiteOver(lbg, 0.3 + 0.7 * k)];
  const dbg = hslRgb(v.bgHue, v.bgSat * 0.4, v.darkL), dsurf = [dbg, whiteOver(dbg, 0.02 + 0.07 * k)];
  const light = {
    bg: hsl(v.bgHue, v.bgSat, v.bgL), fg: hsl(v.bgHue, Math.min(v.bgSat, 20), 11), muted: hsl(v.bgHue, 7, readable(v.bgHue, 7, 42, lsurf, false)),
    line: hsl(v.bgHue, 15, 25, 0.04 + 0.16 * k), card: `rgba(255,255,255,${(0.3 + 0.7 * k).toFixed(2)})`, accent: hsl(v.accHue, v.accSat, readable(v.accHue, v.accSat, v.accL, lsurf, false)),
  };
  const dark = {
    bg: hsl(v.bgHue, v.bgSat * 0.4, v.darkL), fg: hsl(v.bgHue, 10, 93), muted: hsl(v.bgHue, 6, readable(v.bgHue, 6, 64, dsurf, true)),
    line: hsl(v.bgHue, 10, 80, 0.06 + 0.14 * k), card: `rgba(255,255,255,${(0.02 + 0.07 * k).toFixed(3)})`, accent: hsl(v.accHue, v.accSat, readable(v.accHue, v.accSat, Math.min(85, v.accL + 20), dsurf, true)),
  };
  const tok = (t) => `--bg:${t.bg};--fg:${t.fg};--muted:${t.muted};--line:${t.line};--card:${t.card};--accent:${t.accent};`;
  // Every layout follows the icon slider across its whole range; the list and
// cards layouts scale it down to fit their narrower spaces.
  const icon = shapeId === "list" ? Math.round(v.iconSize * 0.4) : shapeId === "cards" ? Math.round(v.iconSize * 0.6) : shapeId === "alternate" ? Math.round(v.iconSize * 1.2) : v.iconSize;
  const sh = (v.iconShadow / 100) * 0.35;
  const g = v.gap, r = v.radius, b = v.bodySize, rule = v.rules ? "1px solid var(--line)" : "0";
  const base = `
html { background: ${light.bg}; }
@media (prefers-color-scheme: dark) { html { background: ${dark.bg}; } }
body { margin: 0; }
.site { ${tok(light)} container-type: inline-size; min-height: 100vh; background: var(--bg); color: var(--fg); font: ${b}px/1.55 ${FONTS[v.font - 1]}; -webkit-font-smoothing: antialiased; }
@media (prefers-color-scheme: dark) { .site:not([data-theme="light"]) { ${tok(dark)} } }
.site[data-theme="dark"] { ${tok(dark)} }
.site * { box-sizing: border-box; }
.site a { color: var(--accent); text-decoration: none; }
.site a:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
.page { max-width: ${v.width}px; margin: 0 auto; padding: 0 24px; }
header { padding: 72px 0 ${Math.max(24, Math.round(g * 0.7))}px; text-align: center; }
header h1 { font-size: ${v.titleSize}px; line-height: 1.1; letter-spacing: -0.02em; margin: 0 0 14px; font-weight: 700; }
header p { color: var(--muted); font-size: ${b + 2}px; max-width: 600px; margin: 0 auto; }
.dock { display: inline-flex; gap: 18px; padding: 14px 20px; margin-top: 36px; border: 1px solid var(--line); border-radius: ${r * 2}px; background: var(--card); }
.dock a { display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.dock img { width: 56px; height: 56px; }
img.pad { padding: 9%; }
.icon { width: ${icon}px; height: ${icon}px; display: block; filter: drop-shadow(0 ${Math.round(icon / 16)}px ${Math.round(icon / 9)}px rgba(0,0,0,${sh.toFixed(2)})); }
.kind { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); margin: 0 0 6px; }
.product h2 { font-size: ${v.nameSize}px; letter-spacing: -0.015em; margin: 0 0 4px; line-height: 1.15; }
.tag { font-size: ${Math.round(b * 1.22)}px; margin: 0 0 16px; font-weight: 500; }
.what { margin: 0 0 18px; max-width: 620px; }
.inspired { display: flex; gap: 12px; align-items: baseline; max-width: 620px; margin: 0; padding: 12px 16px; border-radius: ${r}px; background: var(--card); border: 1px solid var(--line); font-size: ${b - 2}px; color: var(--muted); }
.inspired b { color: var(--fg); font-weight: 600; white-space: nowrap; }
.product { padding: ${g}px 0; border-top: ${rule}; }
footer { border-top: ${rule}; padding: 32px 0 64px; color: var(--muted); font-size: 14px; text-align: center; }
`;
  const lay = {
    rows: `.product { display: grid; grid-template-columns: ${icon}px 1fr; gap: 40px; align-items: start; }`,
    alternate: `.product { display: grid; grid-template-columns: ${icon}px 1fr; gap: 48px; align-items: center; }
.product:nth-child(even) { grid-template-columns: 1fr ${icon}px; }
.product:nth-child(even) .icon { order: 2; }`,
    centred: `.product { text-align: center; }
.product .icon { margin: 0 auto 24px; }
.what { margin-left: auto; margin-right: auto; }
.inspired { display: inline-flex; text-align: left; }`,
    cards: `.apps { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: ${Math.round(g / 2)}px; padding: ${Math.round(g / 2)}px 0; border-top: ${rule}; }
.product { padding: 24px; border: 1px solid var(--line); border-radius: ${r}px; background: var(--card); }
.product .icon { margin-bottom: 18px; }
.inspired { flex-direction: column; gap: 2px; background: none; border: 0; padding: 0; }`,
    list: `.product { display: grid; grid-template-columns: 64px 1fr; gap: 20px; align-items: center; padding: ${Math.round(g / 3)}px 0; }
.product h2 { font-size: ${Math.min(v.nameSize, 26)}px; }
.tag { font-size: ${b}px; margin: 0 0 4px; }
.what { display: none; }
.inspired { display: block; background: none; border: 0; padding: 0; }
.inspired b { margin-right: 8px; }`,
  }[shapeId];
  const narrow = `
@container (max-width: 680px) {
  header { padding: 48px 0 28px; }
  header h1 { font-size: ${Math.min(v.titleSize, 32)}px; }
  header p { font-size: ${b}px; }
  .dock { gap: 10px; padding: 10px 12px; }
  .dock img { width: 44px; height: 44px; }
  .dock span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  ${shapeId === "list" ? ".product { grid-template-columns: 48px 1fr; gap: 14px; } .product .icon { width: 48px; height: 48px; }"
    : `.product, .product:nth-child(even) { grid-template-columns: 1fr; gap: 18px; }
  .product:nth-child(even) .icon { order: 0; }
  .icon { width: ${Math.min(icon, 104)}px; height: ${Math.min(icon, 104)}px; }
  .product h2 { font-size: ${Math.min(v.nameSize, 28)}px; }
  .inspired { flex-direction: column; gap: 2px; }`}
}`;
  return base + lay + narrow + (v.kind ? "" : "\n.kind { display: none; }");
}
function draw(shapeId, v, size, idp) {
  const icon = (a, cls) => `<img class="${cls}${a.pad ? " pad" : ""}" src="icons/${a.id}.png" alt="${cls === "icon" ? esc(a.name) + " icon" : ""}">`;
  const dock = v.dock ? `<nav class="dock">${APPS.map((a) => `<a href="#${a.id}">${icon(a, "")}<span>${esc(a.name)}</span></a>`).join("")}</nav>` : "";
  const section = (a) => `<section class="product" id="${a.id}">
${icon(a, "icon")}
<div>
<p class="kind">${esc(v[a.id + "_kind"])}</p>
<h2>${esc(a.name)}</h2>
<p class="tag">${inline(v[a.id + "_tag"])}</p>
<p class="what">${inline(v[a.id + "_what"])}</p>
<p class="inspired"><b>Inspired by</b><span>${inline(v[a.id + "_insp"])}</span></p>
</div>
</section>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(v.title)}</title>
<style>${css(shapeId, v)}
</style>
</head>
<body>
<div class="site layout-${shapeId}">
<div class="page">
<header>
<h1>${esc(v.title)}</h1>
<p>${inline(v.intro)}</p>
${dock}
</header>
<div class="apps">
${APPS.map(section).join("\n")}
</div>
<footer>${inline(v.footer)}</footer>
</div>
</div>
</body>
</html>`;
}
