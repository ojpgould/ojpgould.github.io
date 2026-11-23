// Arranges the garden on the home page: as a list, as cards, as a plot of two
// measures the visitor picks, or as a growth chart of every revision. The
// list is already in the page, so without this script the notes still show.
(function () {
  const box = document.getElementById("gArrange"), view = document.getElementById("gView"), dataEl = document.getElementById("gData");
  if (!box || !view || !dataEl) return;
  const notes = JSON.parse(dataEl.textContent);
  const KEY = "portfolio-garden";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = (iso) => (iso ? Date.parse(iso + "T00:00:00Z") / 864e5 : 0);
  const nice = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const revisions = (n) => Math.max(0, n.dates.length - 1);
  const when = (n) => (n.dates.length > 1 ? `Last tended ${nice(n.last)}` : n.first ? `Planted ${nice(n.first)}` : "");
  const pill = (n) => `<span class="status" title="${esc(n.about)}">${esc(n.label)}</span>`;

  const SORTS = {
    recent: ["Most recently changed first", (a, b) => day(b.last) - day(a.last)],
    newest: ["Newest first", (a, b) => day(b.first) - day(a.first)],
    oldest: ["Oldest first", (a, b) => day(a.first) - day(b.first)],
    revised: ["Most revised first", (a, b) => revisions(b) - revisions(a)],
    settled: ["Most settled first", (a, b) => b.rank - a.rank],
    longest: ["Longest first", (a, b) => b.words - a.words],
    az: ["A to Z", () => 0],
  };
  // The measures a plot can use for each direction.
  const MEASURES = {
    first: { name: "When it was first written", value: (n) => day(n.first), date: true },
    last: { name: "When it last changed", value: (n) => day(n.last), date: true },
    revised: { name: "How many times it has been revised", value: revisions },
    words: { name: "How long it is, in words", value: (n) => n.words },
    status: { name: "How settled it is", value: (n) => n.rank, steps: [...new Map(notes.map((n) => [n.rank, n.label])).entries()].sort((a, b) => a[0] - b[0]) },
  };
  const HELP = {
    list: "Every note, one under another, in the order you choose.",
    cards: "Every note as a card. Notes that have been revised more often get bigger cards.",
    plot: "Each dot is a note, placed by the two measures you choose. Bigger dots are longer notes. Lines join notes that link to each other: point at a note to pick out its links.",
    growth: "One row per note. Each dot is a day the note was changed, running from the day it was first written (the hollow dot) to its latest change.",
  };

  let state = { view: "list", sort: "recent", x: "first", y: "revised", links: true };
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && HELP[s.view]) state = { ...state, ...s }; } catch {}
  // Plot and Growth are only offered once there are enough notes to compare,
  // so a view saved earlier may not be on offer now.
  if (!box.querySelector(`[data-view="${state.view}"]`)) state.view = "list";
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

  const fill = (sel, entries, value) => { sel.innerHTML = entries.map(([k, label]) => `<option value="${k}"${k === value ? " selected" : ""}>${esc(label)}</option>`).join(""); };
  const sortSel = document.getElementById("gSort"), xSel = document.getElementById("gX"), ySel = document.getElementById("gY"), linkBox = document.getElementById("gLinks");
  fill(sortSel, Object.entries(SORTS).map(([k, v]) => [k, v[0]]), state.sort);
  fill(xSel, Object.entries(MEASURES).map(([k, v]) => [k, v.name]), state.x);
  fill(ySel, Object.entries(MEASURES).map(([k, v]) => [k, v.name]), state.y);
  linkBox.checked = state.links;

  const sorted = () => [...notes].sort((a, b) => SORTS[state.sort][1](a, b) || a.title.localeCompare(b.title));

  function list() {
    return `<ul class="notes">${sorted().map((n) => `<li><a class="title" href="notes/${n.slug}.html">${esc(n.title)}</a>${pill(n)}<p>${n.summary}</p><p class="when">${when(n)}</p></li>`).join("")}</ul>`;
  }

  function cards() {
    const size = (n) => (revisions(n) >= 5 ? 3 : revisions(n) >= 2 ? 2 : 1);
    return `<div class="cards">${sorted().map((n) => `<a class="card size-${size(n)}" href="notes/${n.slug}.html">${pill(n)}<h3>${esc(n.title)}</h3><p>${n.summary}</p><p class="when">${when(n)}. ${revisions(n) ? `Revised ${revisions(n)} ${revisions(n) === 1 ? "time" : "times"}` : "Not revised yet"}, ${n.words} words.</p></a>`).join("")}</div>`;
  }

  // Tick marks for one axis: month starts for dates, named steps for status,
  // round numbers otherwise.
  function ticks(m, lo, hi) {
    if (m.steps) return m.steps.map(([v, label]) => [v, label]);
    if (m.date) {
      const out = [], start = new Date(lo * 864e5), d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      while (d.getTime() / 864e5 <= hi) { out.push([d.getTime() / 864e5, `${MONTHS[d.getUTCMonth()]}${d.getUTCMonth() === 0 ? " " + d.getUTCFullYear() : ""}`]); d.setUTCMonth(d.getUTCMonth() + 1); }
      // Within a single month there is no month start to mark, so name the day in the middle.
      if (!out.length) { const mid = Math.round((lo + hi) / 2); out.push([mid, nice(new Date(mid * 864e5).toISOString().slice(0, 10))]); }
      return out;
    }
    const span = hi - lo || 1, raw = span / 5, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = Math.max(1, [1, 2, 5, 10].map((k) => k * mag).find((k) => k >= raw));
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push([v, String(Math.round(v))]);
    return out;
  }
  const range = (m) => {
    const vals = notes.map(m.value);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (m.steps) return [lo - 0.5, hi + 0.5];
    if (m.date) return [lo - 4, hi + 4];
    // Counts are whole numbers, so the axis always spans at least 1.
    if (hi - lo < 1) hi = lo + 1;
    const pad = (hi - lo) * 0.08;
    return [Math.max(0, lo - pad), hi + pad];
  };

  function plot() {
    const W = Math.max(320, view.clientWidth), H = Math.round(Math.min(520, Math.max(340, W * 0.6)));
    const L = 52, R = 24, T = 16, B = 52;
    const mx = MEASURES[state.x], my = MEASURES[state.y];
    const [x0, x1] = range(mx), [y0, y1] = range(my);
    const sx = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R), sy = (v) => H - B - ((v - y0) / (y1 - y0 || 1)) * (H - T - B);
    // Notes that land on the same spot are spread apart a little.
    const seen = {}, pos = {};
    notes.forEach((n) => {
      let x = sx(mx.value(n)), y = sy(my.value(n));
      const k = `${Math.round(x / 14)}:${Math.round(y / 14)}`, c = (seen[k] = (seen[k] || 0) + 1) - 1;
      if (c) { const a = c * 2.4; x += Math.cos(a) * 12 * Math.sqrt(c); y += Math.sin(a) * 12 * Math.sqrt(c); }
      pos[n.slug] = { x, y, r: 4 + Math.sqrt(n.words) * 0.45 };
    });
    // Labels go to the right of each dot, or to the left, above or below
    // when that would overlap a label already placed.
    const boxes = [];
    const label = (n) => {
      const p = pos[n.slug], w = n.title.length * 6.6, h = 14;
      const tries = [[p.x + p.r + 5, p.y + 4, "start"], [p.x - p.r - 5, p.y + 4, "end"], [p.x, p.y - p.r - 6, "middle"], [p.x, p.y + p.r + 15, "middle"]];
      for (const [tx, ty, anchor] of tries) {
        const left = anchor === "start" ? tx : anchor === "end" ? tx - w : tx - w / 2;
        const b = [left, ty - h + 3, left + w, ty + 3];
        if (b[0] < L + 2 || b[2] > W - 2 || b[1] < 2 || b[3] > H - B - 2) continue;
        if (!boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) { boxes.push(b); return `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}">${esc(n.title)}</text>`; }
      }
      return "";
    };
    const order = [...notes].sort((a, b) => b.words - a.words);
    const xt = ticks(mx, x0, x1), yt = ticks(my, y0, y1);
    const links = state.links ? notes.flatMap((n) => n.links.filter((s) => pos[s]).map((s) => `<line class="link" data-a="${n.slug}" data-b="${s}" x1="${pos[n.slug].x.toFixed(1)}" y1="${pos[n.slug].y.toFixed(1)}" x2="${pos[s].x.toFixed(1)}" y2="${pos[s].y.toFixed(1)}"/>`)) : [];
    return `<div class="plot" id="gPlot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`A plot of the notes: ${mx.name.toLowerCase()} across, ${my.name.toLowerCase()} up. The same notes are in the list view.`)}">
<g class="grid">${xt.map(([v]) => `<line x1="${sx(v)}" x2="${sx(v)}" y1="${T}" y2="${H - B}" stroke-dasharray="2 4"/>`).join("")}${yt.map(([v]) => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke-dasharray="2 4"/>`).join("")}</g>
<g class="axis"><line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/>
${xt.map(([v, t]) => `<text x="${sx(v)}" y="${H - B + 17}" text-anchor="middle">${esc(t)}</text>`).join("")}
${yt.map(([v, t]) => `<text x="${L - 8}" y="${sy(v) + 4}" text-anchor="end">${esc(t)}</text>`).join("")}
<text class="name" x="${(L + W - R) / 2}" y="${H - 10}" text-anchor="middle">${esc(mx.name)}</text>
<text class="name" transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(my.name)}</text></g>
<g>${links.join("")}</g>
${order.map((n) => `<a class="dot" href="notes/${n.slug}.html" data-slug="${n.slug}"><title>${esc(`${n.title}. ${n.label}. ${when(n)}.`)}</title><circle cx="${pos[n.slug].x.toFixed(1)}" cy="${pos[n.slug].y.toFixed(1)}" r="${pos[n.slug].r.toFixed(1)}"/>${label(n)}</a>`).join("")}
</svg></div>`;
  }

  function growth() {
    const all = notes.flatMap((n) => n.dates.map(day)).filter(Boolean);
    if (!all.length) return list();
    const lo = Math.min(...all) - 3, hi = Math.max(...all) + 3, at = (iso) => (((day(iso) - lo) / (hi - lo)) * 100).toFixed(2);
    const tk = ticks({ date: true }, lo, hi).map(([v, t]) => `<span style="left:${(((v - lo) / (hi - lo)) * 100).toFixed(2)}%">${esc(t)}</span>`).join("");
    return `<div class="gscale" aria-hidden="true"><span></span><div class="ticks">${tk}</div></div><ul class="growth">${sorted().map((n) => {
      const first = n.dates[0], last = n.dates[n.dates.length - 1];
      return `<li><a class="title" href="notes/${n.slug}.html">${esc(n.title)}</a><div class="track" role="img" aria-label="${esc(`First written ${nice(first)}, changed ${revisions(n)} ${revisions(n) === 1 ? "time" : "times"} since`)}"><span class="life" style="left:${at(first)}%;width:${(at(last) - at(first)).toFixed(2)}%"></span>${n.dates.map((d, i) => `<span class="rev${i === 0 ? " first" : ""}" style="left:${at(d)}%" title="${esc(`${i === 0 ? "First written" : "Revised"} ${nice(d)}`)}"></span>`).join("")}</div></li>`;
    }).join("")}</ul>`;
  }

  const DRAW = { list, cards, plot, growth };
  function render() {
    box.dataset.view = state.view;
    box.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
    document.getElementById("gHelp").textContent = HELP[state.view];
    view.innerHTML = DRAW[state.view]();
    const p = document.getElementById("gPlot");
    if (p) {
      const lightUp = (slug) => {
        p.classList.toggle("lit", !!slug);
        const near = new Set([slug]);
        p.querySelectorAll(".link").forEach((l) => { const on = l.dataset.a === slug || l.dataset.b === slug; l.classList.toggle("on", on); if (on) { near.add(l.dataset.a); near.add(l.dataset.b); } });
        p.querySelectorAll(".dot").forEach((d) => d.classList.toggle("on", near.has(d.dataset.slug)));
      };
      p.querySelectorAll(".dot").forEach((d) => {
        ["mouseenter", "focus"].forEach((e) => d.addEventListener(e, () => lightUp(d.dataset.slug)));
        ["mouseleave", "blur"].forEach((e) => d.addEventListener(e, () => lightUp(null)));
      });
    }
    save();
  }

  box.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { state.view = b.dataset.view; render(); }));
  sortSel.addEventListener("change", () => { state.sort = sortSel.value; render(); });
  xSel.addEventListener("change", () => { state.x = xSel.value; render(); });
  ySel.addEventListener("change", () => { state.y = ySel.value; render(); });
  linkBox.addEventListener("change", () => { state.links = linkBox.checked; render(); });
  let wait;
  window.addEventListener("resize", () => { if (state.view !== "plot") return; clearTimeout(wait); wait = setTimeout(render, 120); });
  box.hidden = false;
  render();
})();
