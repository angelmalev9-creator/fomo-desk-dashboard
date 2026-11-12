(() => {
  "use strict";
  const STORAGE_KEY = "fomoDeskGistId";
  const POLL_MS = 60_000;
  const STALE_MS = 3 * 60 * 1000;
  const ZONE = "Europe/Sofia";
  const $ = (id) => document.getElementById(id);
  const RANGES = { "1h": 3600e3, "4h": 4 * 3600e3, "12h": 12 * 3600e3, "1d": 24 * 3600e3, "1w": 7 * 24 * 3600e3, all: Infinity };
  const MARKS = [2, 5, 10, 20, 50, 100];

  let data = null, lastOkAt = null, gistId = null, demo = false, view = "desk", range = "12h", feedAll = false;

  // ------------------------------------------------------------ helpers
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  const cls = (v) => (num(v) == null || Math.abs(v) < 0.005 ? "neu" : v > 0 ? "pos" : "neg");
  const ts = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
  function money(v, d = 2) { const n = num(v); if (n == null) return "—"; return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  const smoney = (v) => (num(v) == null ? "—" : (v < 0 ? "−" : "+") + money(v));
  const spct = (v, d = 1) => (num(v) == null ? "—" : (v < 0 ? "−" : "+") + Math.abs(v).toFixed(d) + "%");
  function hm(v, withDate) {
    const d = v instanceof Date ? v : ts(v); if (!d) return "—";
    const o = withDate ? { timeZone: ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false } : { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: false };
    return new Intl.DateTimeFormat("bg-BG", o).format(d).replace(" г.", "");
  }
  function ago(ms) { if (ms == null) return "—"; const s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return `${s} с`; const m = Math.floor(s / 60); if (m < 60) return `${m} мин`; return `${Math.floor(m / 60)} ч ${m % 60} мин`; }
  function dur(ms) { const m = Math.max(0, Math.round(ms / 60000)); return `${Math.floor(m / 60)}ч ${String(m % 60).padStart(2, "0")}м`; }
  function hue(s) { let h = 0; for (const c of String(s || "?")) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  function avatar(label, size) {
    const h = hue(label), l = String(label || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, size > 20 ? 2 : 1).toUpperCase() || "?";
    return { bg: `radial-gradient(circle at 35% 30%, hsl(${h} 90% 72%), hsl(${h} 75% 48%))`, l };
  }
  // FOMO links come only from the desk (links.py); used exactly as given.
  const coin = (row, text, klass) => row && row.fomo_url
    ? `<a class="${klass || ""}" href="${esc(row.fomo_url)}" target="_blank" rel="noopener">${esc(text)}</a>`
    : `<span class="${klass || ""}">${esc(text)}</span>`;
  const sym = (r) => String((r && (r.symbol || r.label || r.name)) || (r && r.mint ? r.mint.slice(0, 6) : "?")).replace(/\s*\(.*\)$/, "");
  function banner(text, err) { const b = $("banner"); b.textContent = text || ""; b.classList.toggle("hidden", !text); b.classList.toggle("err", !!err); }
  const EXIT = { stop: "стоп", trail: "trail", timeout: "време", trader_sold: "трейдърът продаде", sellall: "продай всичко", manual: "ръчно" };

  // ------------------------------------------------------------ header
  function renderHeader() {
    const h = data.header || {}, s = data.session || {}, c = data.controls || {};
    const gen = ts(data.generated_at);
    const fresh = demo || (gen && Date.now() - gen.getTime() <= STALE_MS);
    const main = (data.heartbeats || []).find((x) => x.agent === "main");
    const pill = $("live-pill");
    if (demo) { pill.className = "pill demo"; $("live-text").textContent = "Демо"; }
    else if (!fresh) { pill.className = "pill stale"; $("live-text").textContent = "Остаряло"; }
    else if (main && main.status !== "ok") { pill.className = "pill down"; $("live-text").textContent = "Спряло"; }
    else { pill.className = "pill live"; $("live-text").textContent = "На живо"; }
    const opens = (data.open_positions || []).length;
    const nightNo = h.session_first_night_id ?? h.night_id;
    $("sub-line").innerHTML = demo ? `<b>Демо сесия</b> · пример` :
      `PumpPortal + копиране · <b>нощ ${esc(nightNo ?? "—")}</b> от ${esc(hm(h.started_at, true))} · ${opens} отворени`;
    $("mode-pill").textContent = String(h.mode || "PAPER").toUpperCase();
    $("demo-pill").classList.toggle("hidden", !demo);
    $("quiet-pill").classList.toggle("hidden", !(c.quiet && c.quiet.on));
    $("paused-pill").classList.toggle("hidden", !c.entries_paused);

    const eq = num(s.equity_now) ?? num(h.current_stack) ?? 0;
    const start = num(s.start_stack) ?? num(h.start_stack) ?? 200;
    const ch = eq - start, pct = start ? (ch / start) * 100 : 0, mult = start ? eq / start : 1;
    tweenText($("bal-value"), eq, (v) => money(v));
    const k = cls(ch);
    $("bal-change").innerHTML = `<span class="${k}">${k === "neg" ? "▼" : "▲"} ${money(ch)} (${Math.abs(pct).toLocaleString("en-US", { maximumFractionDigits: 2 })}%)</span>`;
    const m = $("bal-mult"); m.textContent = mult.toFixed(2) + "×"; m.className = "mult " + (mult > 1.0001 ? "" : mult < 0.9999 ? "neg" : "neu");

    const st = $("stop-btn");
    if (c.sellall_url && !demo) { st.href = c.sellall_url; st.classList.remove("off"); }
    else { st.removeAttribute("href"); st.classList.add("off"); }
    $("stop-note").textContent = demo ? "В демото бутонът е изключен." :
      `Отваря Telegram (@${c.bot_username || "бота"}). Там потвърждаваш с бутон. Само PAPER · ${opens} отворени.`;
  }
  const prevVal = new WeakMap();
  function tweenText(node, to, fmt) {
    const from = prevVal.get(node); prevVal.set(node, to);
    if (from == null || from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) { node.textContent = fmt(to); return; }
    const t0 = performance.now(), ms = 900;
    const step = (t) => { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); node.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // ------------------------------------------------------------ equity chart
  function series() {
    const pts = (data.equity_series || []).map(([t, v]) => [ts(t), num(v)]).filter((p) => p[0] && p[1] != null);
    const now = demo ? (pts.length ? pts[pts.length - 1][0] : new Date()) : (ts(data.generated_at) || new Date());
    const span = RANGES[range];
    let from = span === Infinity ? (pts[0] ? pts[0][0] : now) : new Date(now.getTime() - span);
    const before = pts.filter((p) => p[0] < from);
    let inR = pts.filter((p) => p[0] >= from);
    if (before.length) inR.unshift([from, before[before.length - 1][1]]);
    if (!inR.length && pts.length) inR = [[from, pts[pts.length - 1][1]]];
    const last = inR.length ? inR[inR.length - 1][1] : num((data.session || {}).equity_now) ?? 200;
    inR.push([now, num((data.session || {}).equity_now) ?? last]);
    return { pts: inR, from, now };
  }
  function renderChart() {
    const svg = $("equity"), W = svg.clientWidth || 600, H = svg.clientHeight || 250;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const { pts, from, now } = series();
    const start = num((data.session || {}).start_stack) ?? 200;
    const vals = pts.map((p) => p[1]);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    // keep small moves visually small: the y-span is never tighter than 8% of the value
    const minSpan = Math.abs(hi) * 0.08, mid = (hi + lo) / 2;
    if (hi - lo < minSpan) { lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
    const pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
    const t0 = from.getTime(), t1 = Math.max(now.getTime(), t0 + 1);
    const top = 26, bot = H - 18;
    const X = (t) => ((t - t0) / (t1 - t0)) * W;
    const Y = (v) => bot - ((v - lo) / (hi - lo)) * (bot - top);
    // step line (balance moves at fills), smooth enough with many points
    let d = "";
    pts.forEach((p, i) => { const x = X(p[0].getTime()).toFixed(1), y = Y(p[1]).toFixed(1); d += i ? ` L${x},${y}` : `M${x},${y}`; });
    const area = `${d} L${W},${H} L0,${H} Z`;
    const up = vals[vals.length - 1] >= vals[0];
    const col = up ? "#3ddc68" : "#ff5a5f";
    let marks = "";
    for (const m of MARKS) {
      const lvl = start * m; if (lvl > hi) break;
      const hit = pts.find((p) => p[1] >= lvl); if (!hit) continue;
      const x = X(hit[0].getTime()), y = Y(hit[1]);
      marks += `<circle cx="${x}" cy="${y}" r="4.5" fill="#f5c84c"/><text class="mk" x="${x - 8}" y="${y - 2}" text-anchor="end">${m}×</text>`;
    }
    const base = start >= lo && start <= hi ? `<line x1="0" x2="${W}" y1="${Y(start)}" y2="${Y(start)}" stroke="#2c5a4a" stroke-dasharray="3 5"/><text x="${W - 6}" y="${Y(start) - 5}" text-anchor="end" fill="#4f7d6c" font-size="10">старт ${money(start, 0)}</text>` : "";
    const lx = X(pts[pts.length - 1][0].getTime()), ly = Y(pts[pts.length - 1][1]);
    svg.innerHTML = `<defs><linearGradient id="eqg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity="${up ? .28 : .16}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      ${base}<path d="${area}" fill="url(#eqg)"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>${marks}
      <circle cx="${lx}" cy="${ly}" r="4" fill="#fff"/><circle cx="${lx}" cy="${ly}" r="9" fill="#fff" opacity=".15"/>`;
    const s = data.session || {}, h = data.header || {};
    const nightStart = ts(h.started_at);
    $("chart-tl").textContent = demo ? "◉ демо · примерна нощ" : `◉ бюрото работи · ${nightStart ? dur(Date.now() - nightStart.getTime()) : "—"} тази нощ`;
    const nightPct = vals[0] ? ((vals[vals.length - 1] - vals[0]) / vals[0]) * 100 : 0;
    const tr = $("chart-tr"); tr.textContent = `${range === "all" ? "всичко" : "период"} ${spct(nightPct, 2)}`; tr.className = "chart-tr" + (nightPct < -0.005 ? " neg" : "");
    const ticks = [];
    for (let i = 1; i <= 4; i++) ticks.push(`<span>${hm(new Date(t0 + ((t1 - t0) * i) / 5), range === "1w" || range === "all")}</span>`);
    $("chart-x").innerHTML = ticks.join("");
  }

  // ------------------------------------------------------------ agents
  function hb(agent) { return (data.heartbeats || []).find((x) => x.agent === agent) || {}; }
  function stRow(status, text) { const k = status === "ok" ? "" : status === "warn" ? "warn" : "down"; return `<div class="ag-st ${k}"><i></i>${esc(text)}</div>`; }
  function av(label) { const a = avatar(label, 18); return `<span class="av" style="background:${a.bg}">${esc(a.l)}</span>`; }
  function renderAgents() {
    const sc = data.scanner || {}, cp = data.copy || {}, h = data.header || {};
    const opens = data.open_positions || [];
    const risk = h.risk || {}, tk = h.ticket || {};
    const cards = [];
    // Scanner
    const items = (sc.items || []).slice(0, 4);
    const scRows = items.length ? items.map((i) => {
      const badge = i.score != null ? `<span class="sc-badge">${esc(Math.round(i.score))}</span>`
        : i.state === "kill" ? `<span class="sc-badge kill">${esc(i.liq_display ? "liq " + i.liq_display : (i.reason || "отказ").slice(0, 12))}</span>`
        : i.state === "pass" ? `<span class="sc-badge">мина</span>` : `<span class="sc-badge wait">чака</span>`;
      return `<div class="ag-row">${av(sym(i))}${coin(i, sym(i), "nm")}${badge}</div>`;
    }).join("") : `<div class="ag-empty">Чака нова миграция от PumpPortal.</div>`;
    const scLast = sc.last_scan_ts ? `последно ${hm(sc.last_scan_ts)} · ` : "";
    cards.push(`<div class="ag"><div class="ag-h"><span class="ag-ico sc">⌕</span>Скенер</div>${stRow(sc.status, sc.state_label || "—")}${scRows}
      <div class="ag-foot">${esc(scLast)}${esc(sc.scans_count ?? 0)} проверени · праг ликв. ${esc(sc.min_liq_display || "$40K")}</div></div>`);
    // Copy
    const traders = (cp.traders || []).filter((t) => t.active);
    const per = cp.per_trader || [];
    const lastCopy = (data.feed || []).find((f) => f.source_label && f.side === "buy");
    const cpRows = per.slice(0, 3).map((p) => `<div class="ag-row">${av(p.handle)}<span class="nm" style="text-transform:none">${esc(p.handle)}</span><span class="${cls(p.pnl_usd)}">${esc(smoney(p.pnl_usd))}</span></div>`).join("")
      || traders.slice(0, 3).map((t) => `<div class="ag-row">${av(t.handle)}<a class="nm" style="text-transform:none" href="${esc(t.profile_url)}" target="_blank" rel="noopener">${esc(t.handle)}</a><span class="muted">#${esc(t.rank ?? "—")}</span></div>`).join("");
    const cpHb = hb("copywatch");
    cards.push(`<div class="ag"><div class="ag-h"><span class="ag-ico cp">⇄</span>Копиране</div>${stRow(cpHb.status, `следи ${traders.length} трейдъри`)}${cpRows}
      <div class="ag-foot">${lastCopy ? `последно: ${esc(sym(lastCopy))} · ${esc(hm(lastCopy.ts))}` : "още няма копие тази нощ"} · $10 на покупка</div></div>`);
    // Exit / Risk
    const rk = hb("risk");
    const exRows = opens.slice(0, 3).map((p) => `<div class="ag-row">${av(sym(p))}${coin(p, sym(p), "nm")}<span class="${cls(p.unrealized_pnl_pct)}">${esc(spct(p.unrealized_pnl_pct))}</span></div>`).join("")
      || `<div class="ag-empty">Няма отворени позиции. Стоп −${esc(risk.stop_pct ?? 6)}%, trail тръгва от +${esc(risk.trail_start_pct ?? 20)}%.</div>`;
    const trailing = opens.filter((p) => p.trail_active).length;
    cards.push(`<div class="ag"><div class="ag-h"><span class="ag-ico ex">⇥</span>Изход</div>${stRow(rk.status, opens.length ? `${opens.length} отворени · ${trailing} trail` : "дебне")}${exRows}
      <div class="ag-chip">trail ${esc(risk.trail_pct ?? 12)}% · стоп ${esc(risk.stop_pct ?? 6)}%</div></div>`);
    // Sizer
    const ex = hb("executor");
    cards.push(`<div class="ag"><div class="ag-h"><span class="ag-ico sz">◎</span>Размер</div>${stRow(ex.status, "готов")}
      <div class="ag-big">${esc(money(tk.ticket_usd))}</div><div class="ag-kv"><span>на вход</span><b>${esc((tk.ticket_pct_of_stack ?? 0).toFixed ? tk.ticket_pct_of_stack.toFixed(1) : tk.ticket_pct_of_stack)}% от стека</b></div>
      <div class="ag-kv"><span>стек</span><b>${esc(money(h.current_stack))}</b></div><div class="ag-kv"><span>копие</span><b>$10.00</b></div>
      <div class="ag-foot">${tk.bumped ? `вдигнат до минимум ${esc(money(tk.min_ticket_usd))}` : `${esc(tk.stack_pct ?? 8)}% от стека`}</div></div>`);
    // Auditor + Analyst (compact)
    const au = hb("auditor"), an = hb("analyst"), p = data.pipeline || {}, a = p.auditor || {};
    cards.push(`<div class="ag"><div class="ag-h"><span class="ag-ico au">✓</span>Одит</div>${stRow(au.status === "ok" && an.status === "ok" ? "ok" : (au.status === "down" || an.status === "down") ? "down" : "warn", "9 проверки + оценка")}
      <div class="ag-kv"><span>минали</span><b>${esc(a.passed_count ?? 0)}</b></div><div class="ag-kv"><span>отхвърлени</span><b>${esc(a.rejected_count ?? 0)}</b></div>
      <div class="ag-kv"><span>оценени</span><b>${esc(p.verdicts_count ?? 0)}</b></div><div class="ag-foot">${esc(au.last_action || "чака монета от скенера")}</div></div>`);
    $("agents").innerHTML = cards.join("");
    const core = ["scanner", "auditor", "analyst", "executor", "risk", "copywatch", "telegram"];
    const ok = core.filter((x) => hb(x).status === "ok").length;
    $("running").textContent = demo ? `${core.length} работят` : `${ok} работят`;
    $("agents-pager").innerHTML = cards.map((_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("");
  }
  $("agents").addEventListener("scroll", (e) => {
    const n = e.target.children.length; if (!n) return;
    const i = Math.round(e.target.scrollLeft / (e.target.scrollWidth / n));
    [...$("agents-pager").children].forEach((d, j) => d.classList.toggle("on", j === i));
  }, { passive: true });

  // ------------------------------------------------------------ feed
  function feedRow(f) {
    const label = sym(f), a = avatar(label, 46), sell = f.side === "sell";
    const verb = sell ? "Продаде" : "Купи";
    const sub = [f.source_label ? `<span class="src">${esc(f.source_label)}</span>` : "бюрото", esc(hm(f.ts, !sameDay(f.ts)))].join(" · ");
    const right = sell
      ? `<div class="fv"><span class="pnlchip ${cls(f.pnl_usd)}">${esc(smoney(f.pnl_usd))}</span></div><div class="fm">${esc(EXIT[f.exit_reason] || f.exit_reason || "")}${f.pnl_pct != null ? " · " + esc(spct(f.pnl_pct)) : ""}</div>`
      : `<div class="fv">${esc(money(f.size_usd))}</div><div class="fm">${f.mc_usd ? esc(money(f.mc_usd, 0)) + " MC" : esc(f.price_display || "")}</div>`;
    return `<div class="fi"><div class="fav" style="background:${a.bg}">${esc(a.l)}<span class="side ${sell ? "sell" : ""}">${sell ? "↘" : "↗"}</span></div>
      <div class="fb"><div class="ft">${esc(verb)} ${coin(f, label.toUpperCase())}</div><div class="fs">${sub}</div></div><div class="fr">${right}</div></div>`;
  }
  function sameDay(v) { const d = ts(v); return d && hm(d, true).slice(0, 5) === hm(new Date(), true).slice(0, 5); }
  function renderFeed() {
    const rows = data.feed || [];
    $("feed-all").textContent = feedAll ? "По-малко" : "Виж всички";
    $("feed-all").classList.toggle("hidden", rows.length <= 5);
    $("feed").innerHTML = rows.length ? rows.slice(0, feedAll ? 30 : 5).map(feedRow).join("")
      : `<div class="empty"><b>Още няма сделки</b>Скенерът и копирането работят. Първата PAPER покупка ще се появи тук.</div>`;
  }
  $("feed-all").addEventListener("click", () => { feedAll = !feedAll; renderFeed(); });

  // ------------------------------------------------------------ replay
  const rp = { trades: [], i: 0, timer: null, t0: 0, t1: 0, start: 200 };
  function buildReplay() {
    const s = data.session || {}, h = data.header || {};
    const sessStart = ts(h.started_at);
    let trades = (s.replay || []).filter((t) => t.closed_at).sort((a, b) => (a.closed_at < b.closed_at ? -1 : 1));
    if (sessStart && !demo) trades = trades.filter((t) => ts(t.closed_at) >= sessStart);
    rp.trades = trades;
    rp.t0 = (sessStart || (trades[0] ? ts(trades[0].opened_at) : new Date())).getTime();
    rp.t1 = demo && trades.length ? ts(trades[trades.length - 1].closed_at).getTime() + 20 * 60e3 : (ts(data.generated_at) || new Date()).getTime();
    const before = (s.replay || []).filter((t) => ts(t.closed_at) && ts(t.closed_at).getTime() < rp.t0).reduce((a, t) => a + (num(t.pnl_usd) || 0), 0);
    rp.start = (num(s.start_stack) ?? 200) + before;
    $("rp-night").textContent = demo ? "демо нощ" : `нощ ${h.session_first_night_id ?? h.night_id ?? "—"}`;
    $("rp-span").textContent = `${hm(new Date(rp.t0), true)} → ${hm(new Date(rp.t1), true)} · ${dur(rp.t1 - rp.t0)} будно бюро`;
    stopReplay(); rp.i = trades.length; drawReplay();
  }
  function curvePoint(p) { // gentle S path across the stage, evening (top) to morning (bottom)
    const x = 255 + 105 * Math.sin(p * Math.PI * 1.6) * (1 - p * 0.3), y = 30 + p * 360; return [x, y];
  }
  function drawReplay() {
    const done = rp.trades.slice(0, rp.i), total = rp.trades.length;
    const pnl = done.reduce((a, t) => a + (num(t.pnl_usd) || 0), 0);
    const tNow = rp.i >= total ? rp.t1 : ts(rp.trades[Math.max(0, rp.i - 1)]?.closed_at)?.getTime() ?? rp.t0;
    const prog = rp.i === 0 ? 0 : Math.min(1, (tNow - rp.t0) / Math.max(1, rp.t1 - rp.t0));
    const big = $("rp-pnl"); big.textContent = (pnl < 0 ? "−" : "+") + money(pnl); big.className = "rp-big " + (Math.abs(pnl) < 0.005 ? "neu" : pnl > 0 ? "" : "neg");
    const last = done[done.length - 1];
    $("rp-sub").textContent = `${done.length} продажби` + (last ? ` · последна ${hm(last.closed_at)} · ${sym(last)}` : " · тиха нощ засега");
    // path
    const N = 80; let all = "", seg = "";
    for (let k = 0; k <= N; k++) { const [x, y] = curvePoint(k / N); all += (k ? " L" : "M") + x.toFixed(1) + "," + y.toFixed(1); if (k / N <= prog) seg += (k ? " L" : "M") + x.toFixed(1) + "," + y.toFixed(1); }
    const dots = done.map((t) => { const p = Math.min(1, (ts(t.closed_at).getTime() - rp.t0) / Math.max(1, rp.t1 - rp.t0)); const [x, y] = curvePoint(p); const off = (num(t.pnl_usd) >= 0 ? 1 : -1) * 22;
      return `<circle cx="${x + off}" cy="${y}" r="6" fill="none" stroke="${num(t.pnl_usd) >= 0 ? "#3ddc68" : "#ff5a5f"}" stroke-width="2"/>`; }).join("");
    const [hx, hy] = curvePoint(prog), [sx, sy] = curvePoint(0), [ex, ey] = curvePoint(1);
    $("rp-path").innerHTML = `<path d="${all}" fill="none" class="path-todo" stroke-width="1.5" stroke-dasharray="2 5"/><path d="${seg}" fill="none" class="path-done" stroke-width="3" stroke-linecap="round"/>${dots}
      <circle cx="${sx}" cy="${sy}" r="5" fill="#000" stroke="#fff" stroke-width="2"/><text x="${sx + 12}" y="${sy + 4}" fill="#fff" font-size="12" font-weight="700">СТАРТ</text><text x="${sx + 12}" y="${sy + 18}" fill="#8a9199" font-size="10">${esc(hm(new Date(rp.t0)))}</text>
      <circle cx="${ex}" cy="${ey}" r="5" fill="#000" stroke="#fff" stroke-width="2"/><text x="${ex + 12}" y="${ey + 4}" fill="#fff" font-size="12" font-weight="700">${demo ? "КРАЙ" : "СЕГА"}</text><text x="${ex + 12}" y="${ey + 18}" fill="#8a9199" font-size="10">${esc(hm(new Date(rp.t1)))}</text>
      <circle cx="${hx}" cy="${hy}" r="9" fill="#5ea2ff" opacity=".25"/><circle cx="${hx}" cy="${hy}" r="5" fill="#fff"/>`;
    $("rp-chip-v").textContent = money(rp.start + pnl);
    $("rp-chip-t").textContent = hm(new Date(tNow));
    let bal = rp.start; const pts = [[0, bal]]; done.forEach((t, k) => { bal += num(t.pnl_usd) || 0; pts.push([k + 1, bal]); });
    const vs = pts.map((p) => p[1]), lo = Math.min(...vs), hi = Math.max(...vs) + 0.0001, n = Math.max(1, pts.length - 1);
    $("rp-spark").innerHTML = `<path d="${pts.map((p, k) => `${k ? "L" : "M"}${(p[0] / n) * 200},${36 - ((p[1] - lo) / (hi - lo)) * 30}`).join(" ")}" fill="none" stroke="#3ddc68" stroke-width="2"/>`;
    $("rp-bar").style.width = (prog * 100).toFixed(1) + "%";
    $("rp-clock").textContent = `${hm(new Date(tNow))} · повторение`;
    $("rp-count").textContent = `${done.length} от ${total}`;
    $("rp-list").innerHTML = done.length ? done.slice().reverse().map((t) => feedRow({ ...t, side: "sell", ts: t.closed_at, source_label: t.source_label })).join("")
      : `<div class="empty"><b>${total ? "Натисни „Пусни“" : "Още няма затворени сделки тази нощ"}</b>${total ? "Сделките ще се появят една по една." : "Повторението оживява след първата продажба. Отвори демото с #demo=1, за да видиш как изглежда."}</div>`;
    $("rp-play").textContent = rp.timer ? "❚❚ Пауза" : "▶ Пусни";
  }
  function stopReplay() { if (rp.timer) clearInterval(rp.timer); rp.timer = null; }
  $("rp-play").addEventListener("click", () => {
    if (rp.timer) { stopReplay(); drawReplay(); return; }
    if (rp.i >= rp.trades.length) rp.i = 0;
    rp.timer = setInterval(() => { rp.i++; if (rp.i >= rp.trades.length) stopReplay(); drawReplay(); }, 900);
    drawReplay();
  });
  $("rp-restart").addEventListener("click", () => { stopReplay(); rp.i = 0; drawReplay(); });

  // ------------------------------------------------------------ recap
  function renderRecap() {
    const s = data.session || {}, h = data.header || {}, p = data.pipeline || {}, sc = data.scanner || {}, cp = data.copy || {};
    $("recap-span").textContent = demo ? "Демо сесия" : `Нощ ${h.session_first_night_id ?? h.night_id} · от ${hm(h.started_at, true)} · ${h.restarts_in_session ? h.restarts_in_session + " рестарта, една нощ" : "без рестарт"}`;
    const st = (k, v, sm, c) => `<div class="st"><span>${esc(k)}</span><b class="${c || ""}">${esc(v)}</b>${sm ? `<small>${esc(sm)}</small>` : ""}</div>`;
    $("recap-stats").innerHTML = [
      st("P&L общо", smoney(s.change_usd), spct(s.change_pct, 2), cls(s.change_usd)),
      st("Стек", money(s.current_stack), `старт ${money(s.start_stack)}`),
      st("Сделки", s.trades ?? 0, `${s.wins ?? 0} зелени · ${s.losses ?? 0} червени`),
      st("Стопове", s.stops ?? 0, s.green_pct != null ? `${s.green_pct}% зелени` : "—"),
    ].join("");
    const per = cp.per_trader || [];
    $("recap-copy").innerHTML = per.length ? per.map((t) => { const a = avatar(t.handle, 46);
      return `<div class="fi"><div class="fav" style="background:${a.bg}">${esc(a.l)}</div><div class="fb"><div class="ft">${esc(t.handle)}</div><div class="fs">${esc(t.closed)} затворени · ${esc(t.open)} отворени</div></div><div class="fr"><div class="fv ${cls(t.pnl_usd)}">${esc(smoney(t.pnl_usd))}</div></div></div>`; }).join("")
      : `<div class="empty">Още няма копирани сделки. Следят се ${esc((cp.traders || []).filter((t) => t.active).length)} трейдъри.</div>`;
    const total = Math.max(1, sc.scans_count || p.scans_count || 0);
    const fun = (k, v, red) => `<div class="fun"><span>${esc(k)}</span><span class="bar"><i class="${red ? "red" : ""}" style="width:${Math.min(100, (v / total) * 100)}%"></i></span><b>${esc(v)}</b></div>`;
    $("recap-funnel").innerHTML = fun("Проверени", sc.scans_count ?? p.scans_count ?? 0) + fun(`Ликв. < ${sc.min_liq_display || "$40K"}`, sc.liq_kills_recent ?? 0, true)
      + fun("Отрязани общо", sc.kills_count ?? p.scans_kill ?? 0, true) + fun("Минали скенера", sc.pass_count ?? p.scans_pass ?? 0) + fun("Минали одита", (p.auditor || {}).passed_count ?? 0);
    const best = s.best || [];
    $("recap-best").innerHTML = best.length ? best.map((t) => feedRow({ ...t, side: "sell", ts: t.closed_at })).join("") : `<div class="empty">Няма затворени сделки.</div>`;
  }

  // ------------------------------------------------------------ views / share
  function setView(v) {
    view = v;
    ["desk", "replay", "recap"].forEach((k) => $("view-" + k).classList.toggle("hidden", k !== v));
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    $("top-title").textContent = v === "desk" ? "Trading Desk" : v === "replay" ? "Повторение" : "Обобщение";
    if (v === "desk" && data) renderChart();
    if (v === "replay" && data) buildReplay();
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll(".tab,[data-go]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view || b.dataset.go)));
  $("back-btn").addEventListener("click", () => setView("desk"));
  $("ranges").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; range = b.dataset.r; [...$("ranges").children].forEach((x) => x.classList.toggle("on", x === b)); renderChart(); });
  $("share-btn").addEventListener("click", async () => {
    if (!data) return;
    const s = data.session || {};
    // Shares a text summary only — never the private #g= link.
    const text = `FOMO бюро · ${demo ? "DEMO" : "PAPER"}: ${money(s.equity_now)} (${smoney(s.change_usd)}, ${(num(s.multiplier) || 1).toFixed(2)}×) · ${s.trades ?? 0} сделки`;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); banner("Обобщението е копирано (без линка към данните).", false); setTimeout(() => banner(""), 2500); } } catch (_) {}
  });
  window.addEventListener("resize", () => { if (data && view === "desk") renderChart(); });

  // ------------------------------------------------------------ load
  function freshness() {
    const f = $("freshness");
    if (!data) return;
    if (demo) { f.textContent = "Демо · примерни данни, нищо не е истинско"; return; }
    const gen = ts(data.generated_at);
    f.classList.toggle("err", !gen || Date.now() - gen.getTime() > STALE_MS);
    f.textContent = `Данни отпреди ${ago(gen ? Date.now() - gen.getTime() : null)} · ${hm(gen, true)} (Europe/Sofia) · опресняване на ${POLL_MS / 1000} с`;
    if (gen && Date.now() - gen.getTime() > STALE_MS) banner("Данните са остарели с повече от 3 минути. Компютърът на бюрото може да е замръзнал.", false);
  }
  function render(d) {
    data = d;
    $("setup").classList.add("hidden"); $("app").classList.remove("hidden");
    const gen = ts(d.generated_at);
    if (demo || (gen && Date.now() - gen.getTime() <= STALE_MS)) banner("");
    renderHeader(); renderChart(); renderAgents(); renderFeed(); renderRecap();
    if (view === "replay" && !rp.timer) buildReplay();
    freshness();
  }
  async function viaApi(id) {
    const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(id)}?ts=${Date.now()}`, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (res.status === 403 || res.status === 429) { const e = new Error("rate"); e.code = res.status; throw e; }
    if (!res.ok) throw new Error(`gist ${res.status}`);
    const body = await res.json();
    const file = (body.files && (body.files["fomo-desk.json"] || Object.values(body.files)[0])) || null;
    if (!file) throw new Error("no file");
    let text = file.content;
    if (!text || file.truncated) text = await (await fetch(file.raw_url, { cache: "no-store" })).text();
    return JSON.parse(text);
  }
  async function viaRaw(id) {
    const res = await fetch(`https://gist.githubusercontent.com/angelmalev9-creator/${encodeURIComponent(id)}/raw/fomo-desk.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`raw ${res.status}`);
    return res.json();
  }
  async function load() {
    if (demo || !gistId) return;
    try {
      let d;
      try { d = await viaApi(gistId); } catch (e) { if (e && (e.code === 403 || e.code === 429)) d = await viaRaw(gistId); else throw e; }
      if (d && d.demo) throw new Error("demo data in gist");
      lastOkAt = new Date(); render(d);
    } catch (e) {
      $("app").classList.remove("hidden");
      banner("Таблото не успя да прочете данните. Провери линка #g=… и че gist_push работи.", true);
    }
  }
  function params() { const raw = (location.hash || "").replace(/^#/, ""); return new URLSearchParams(raw.includes("=") ? raw : ""); }
  function readGist() {
    const raw = (location.hash || "").replace(/^#/, "");
    let id = params().get("g"); if (!id && /^[a-f0-9]{32}$/i.test(raw)) id = raw;
    if (id) { id = id.trim(); try { localStorage.setItem(STORAGE_KEY, id); } catch (_) {} return id; }
    try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
  }
  function start() {
    const p = params();
    demo = p.get("demo") === "1";
    gistId = readGist();
    $("demo-banner").classList.toggle("hidden", !demo);
    document.body.classList.toggle("is-demo", demo);
    $("demo-exit").href = gistId ? `#g=${gistId}` : "#";
    $("demo-exit").addEventListener("click", () => setTimeout(() => location.reload(), 30));
    const v = p.get("v");
    if (demo) render(window.FOMO_DEMO.build());
    else if (!gistId) { $("setup").classList.remove("hidden"); $("app").classList.add("hidden"); return; }
    else { load(); setInterval(load, POLL_MS); }
    setInterval(freshness, 1000);
    if (v && ["desk", "replay", "recap"].includes(v)) setView(v);
  }
  window.addEventListener("hashchange", () => {
    const p = params();
    if ((p.get("demo") === "1") !== demo) { location.reload(); return; }
    const n = readGist(); if (!demo && n && n !== gistId) { gistId = n; load(); }
  });
  start();
})();
