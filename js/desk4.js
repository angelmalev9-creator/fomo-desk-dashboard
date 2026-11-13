/* Grok Bot · 4 agents dashboard. Live view = real PAPER data from the desk's private gist (#g=…).
   #demo=1 = clearly labeled simulation (js/demo4.js), never mixed with real data.
   FOMO links come only from the desk (links.py) and are used exactly as given. */
(() => {
  "use strict";
  const STORAGE_KEY = "fomoDeskGistId";
  const POLL_MS = 5_000, PAUSE_MS = 2 * 60_000, STALE_MS = 3 * 60_000, STALL_S = 180;
  const $ = (id) => document.getElementById(id);
  const COLORS = { sniper: "#f97316", momentum: "#3b82f6", dip: "#14b8a6", whale: "#8b5cf6", desk: "#9ca3af" };
  const NAMES = { sniper: "Sniper", momentum: "Momentum", dip: "Dip Hunter", whale: "Whale Tail", desk: "Desk" };
  const ICONS = {
    target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="#fff" stroke="none"/></svg>',
    radar: '<svg viewBox="0 0 24 24"><path d="M3 6l6 7 4-4 8 9"/><path d="M15 18h6v-6"/></svg>',
    whale: '<svg viewBox="0 0 24 24"><path d="M3 9c3-3 6 3 9 0s6 3 9 0"/><path d="M3 15c3-3 6 3 9 0s6 3 9 0"/></svg>',
  };
  let gistId = null, demo = false, data = null, shownBal = null, balAnim = null, seenEvents = null, lastOk = null;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  const fmt = (v, d = 2) => Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const smoney = (v) => (num(v) == null ? "—" : (v < 0 ? "-" : "+") + "$" + fmt(v));
  const spct = (v, d = 1) => (num(v) == null ? "—" : (v < 0 ? "-" : "+") + Math.abs(v).toFixed(d) + "%");
  function px(v) { const n = num(v); if (n == null) return "—"; if (n >= 1) return n.toFixed(4); if (n >= 0.01) return n.toFixed(5); return n.toPrecision(5); }
  function hue(s) { let h = 0; for (const c of String(s || "?")) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  function coinIco(sym) {
    const s = String(sym || "?").replace(/^\$/, ""), h = hue(s);
    return `<span class="coin" style="background:radial-gradient(circle at 35% 30%,hsl(${h} 85% 66%),hsl(${h} 70% 42%))">${esc(s.slice(0, 1).toUpperCase())}</span>`;
  }
  function rel(ts) {
    const t = new Date(ts).getTime(); if (!t) return "—";
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return s + "s"; const m = Math.floor(s / 60); if (m < 60) return m + "m";
    const h = Math.floor(m / 60); if (h < 24) return h + "h"; return Math.floor(h / 24) + "d";
  }

  // ------------------------------------------------------------ balance (ticking)
  function setBalance(target) {
    if (shownBal == null) shownBal = target;
    const from = shownBal, dur = 900; let t0 = null;
    cancelAnimationFrame(balAnim);
    const step = (t) => {
      if (t0 == null) t0 = t;
      const k = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
      shownBal = from + (target - from) * e;
      const [i, c] = fmt(shownBal).split(".");
      $("balance").innerHTML = `<span class="b-int">$${i}</span><span class="b-cents">.${c}</span>`;
      if (k < 1) balAnim = requestAnimationFrame(step);
    };
    balAnim = requestAnimationFrame(step);
  }

  // ------------------------------------------------------------ charts
  function eqLine(series, start) {
    const svg = $("eq-line"), W = 400, H = 70;
    const vals = (series || []).map((p) => num(p[1])).filter((v) => v != null);
    if (vals.length < 2) { svg.innerHTML = `<line x1="0" y1="${H - 4}" x2="${W}" y2="${H - 4}" stroke="#bbf7d0" stroke-width="2" stroke-dasharray="4 5"/>`; return; }
    const lo = Math.min(...vals, start ?? Infinity), hi = Math.max(...vals, start ?? -Infinity), span = hi - lo || 1;
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - 6 - ((v - lo) / span) * (H - 14)]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const up = vals[vals.length - 1] >= (start ?? vals[0]);
    const col = up ? "#22c55e" : "#ef4444";
    const last = pts[pts.length - 1];
    svg.innerHTML = `<defs><linearGradient id="eqg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      <path d="${d} L${W} ${H} L0 ${H} Z" fill="url(#eqg)"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="4" fill="#fff" stroke="${col}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
  }
  function mini(series, color) {
    const W = 200, H = 44;
    if (!series || series.length < 2) {
      let s = ""; for (let i = 0; i < 22; i++) s += `<rect x="${i * 9.2}" y="${H / 2 - 2}" width="6" height="4" rx="1.5" fill="#e5e7eb"/>`;
      return `<svg class="mini" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${s}</svg>`;
    }
    const lo = Math.min(...series, 0), hi = Math.max(...series, 0), span = hi - lo || 1;
    const n = series.length, y = (v) => H - 4 - ((v - lo) / span) * (H - 10);
    let dots = "";
    series.forEach((v, i) => {
      const x = (i / (n - 1)) * (W - 6), up = i === 0 || v >= series[i - 1];
      dots += `<rect x="${x.toFixed(1)}" y="${(y(v) - 2).toFixed(1)}" width="5" height="4" rx="1.2" fill="${up ? "#22c55e" : "#ef4444"}"/>`;
    });
    const zero = y(0);
    const lastX = W - 6, lastY = y(series[n - 1]);
    const area = series[n - 1] >= 0 ? `<rect x="${(W * 0.62).toFixed(1)}" y="${lastY.toFixed(1)}" width="${(lastX - W * 0.62 + 5).toFixed(1)}" height="${Math.max(0, zero - lastY).toFixed(1)}" fill="#22c55e" opacity=".12"/>` : "";
    return `<svg class="mini" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${zero}" y2="${zero}" stroke="#eef0f2" stroke-dasharray="3 4"/>${area}${dots}</svg>`;
  }
  function ring(frac, color, spin) {
    const r = 9, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0));
    return `<svg class="ring" viewBox="0 0 24 24"><circle cx="12" cy="12" r="${r}" fill="none" stroke="#eceef1" stroke-width="3"/>
      <circle cx="12" cy="12" r="${r}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 12 12)">${spin ? '<animateTransform attributeName="transform" type="rotate" from="-90 12 12" to="270 12 12" dur="2.4s" repeatCount="indefinite"/>' : ""}</circle></svg>`;
  }

  // ------------------------------------------------------------ render
  // ------------------------------------------------------------ live agent status
  const tsAgo = (ts) => (ts ? `<span data-rel="${esc(ts)}">${rel(ts)}</span>` : "—");
  function hm(ts) { const d = new Date(ts); if (!ts || Number.isNaN(d.getTime())) return "—"; return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sofia", hour: "2-digit", minute: "2-digit", hour12: false }).format(d); }
  function hbAge(a) { const s = num(a.hb_age_s); if (s == null) return "—"; const real = s + Math.max(0, (Date.now() - genMs()) / 1000); return rel(new Date(Date.now() - real * 1000).toISOString()); }
  function genMs() { const t = data && new Date(data.generated_at).getTime(); return t || Date.now(); }
  function liveLine1(a) {
    const L = a.live || {};
    if (L.kind === "market") {
      if (L.phase === "checking") return `checking ${L.checked || 0}/${L.candidates || 0} candidates of ${L.scanning || 0}`;
      return `scanned ${L.scanning || 0} · ${L.candidates || 0} candidates · ${L.checked || 0} checked`;
    }
    if (L.kind === "sniper") return `waiting room ${L.waiting || 0} · last migration ${hm(L.last_migration_ts)}`;
    if (L.kind === "whale") return `watching ${L.wallets || 0} wallets`;
    return a.scan_text || "scanning";
  }
  function liveLine2(a) {
    const L = a.live || {}, last = L.last;
    const vcls = (v) => (v === "bought" || v === "copied" ? "g" : v === "pass" || v === "skip" || v === "kill" ? "why" : "why");
    let h = "";
    if (L.kind === "market") {
      if (last) h += `<div>last <b>${esc(last.symbol)}</b> <span class="${vcls(last.verdict)}">${esc(last.reason)}</span> · ${tsAgo(last.ts)}</div>`;
      else if ((L.top_reasons || []).length) h += `<div>${L.top_reasons.map(([k, v]) => `${esc(k)} ${v}`).join(" · ")}</div>`;
      h += `<div class="mut2">cycle ${tsAgo(L.done_ts || L.cycle_ts)} ago · every 60s</div>`;
    } else if (L.kind === "sniper") {
      if (last) h += `<div>last <b>${esc(last.symbol)}</b> <span class="why">${esc(last.verdict)} · ${esc(last.reason)}</span> · ${tsAgo(last.ts)}</div>`;
      h += `<div class="mut2">PumpPortal stream · audits each migration</div>`;
    } else if (L.kind === "whale") {
      h += `<div>last wallet tx ${tsAgo(L.last_tx_ts)} ago</div>`;
      if (last) h += `<div class="mut2">${esc(last.handle)} ${esc(last.side || "")} ${esc(last.symbol)} → ${esc(last.reason)} · ${tsAgo(last.ts)}</div>`;
    }
    return h;
  }
  function renderAgents(d4) {
    const grid = $("grid");
    const html = (d4.agents || []).map((a) => {
      const p = (a.positions || [])[0];
      const frac = a.sleeve_usd ? (a.sleeve_used_usd || 0) / a.sleeve_usd : 0;
      const tot = num(a.pnl_usd) ?? 0;
      const totCls = Math.abs(tot) < 0.005 ? "neu" : tot > 0 ? "" : "neg";
      let mid, chart;
      if (p) {
        const pct = num(p.pnl_pct);
        const sym = String(p.symbol || "?");
        const coin = p.fomo_url ? `<a class="ag-coin" href="${esc(p.fomo_url)}" target="_blank" rel="noopener">${esc(sym)}</a>` : `<span class="ag-coin">${esc(sym)}</span>`;
        mid = `${coinIco(sym)}${coin}<span class="ag-size">$${fmt(num(p.size_usd) || 0)}${p.size_sol ? " · " + esc(p.size_sol) + " SOL" : ""}</span><span class="pct ${pct != null && pct < 0 ? "neg" : ""}" data-tw="pct:${esc(a.key)}" data-v="${pct ?? ""}">${pct == null ? "…" : spct(pct)}</span>`;
        chart = mini(p.series, a.color);
      } else {
        const off = a.state === "off";
        if (off) mid = `<span class="scan">Off (flag)</span><span class="idle off">off</span>`;
        else if (a.stalled) mid = `<span class="scan">No heartbeat ${hbAge(a)}</span><span class="idle off">stalled</span>`;
        else mid = `<span class="scanning"><i></i>${esc(liveLine1(a))}</span>`;
        chart = off || a.stalled ? mini(null) : `<div class="live2">${liveLine2(a)}</div>`;
      }
      const extra = (a.positions || []).length > 1 ? `<span class="more">+${a.positions.length - 1} more open</span>` : "";
      const live = `<span class="more" data-hb="${esc(a.key)}">${p ? "live " + smoney(p.pnl_usd) + " · " : ""}hb ${hbAge(a)}</span>`;
      return `<article class="card agent ${a.stalled ? "stalled" : ""}" data-k="${esc(a.key)}">
        <div class="ag-head"><span class="ag-ico" style="background:${esc(a.color)}">${ICONS[a.icon] || ""}</span>
          <div><div class="ag-name">${esc(a.name)}</div><div class="ag-sub">${esc(a.sub)}</div></div>${ring(p ? frac : 0.25, p ? a.color : a.stalled ? "#ef4444" : a.color, !p && a.state !== "off" && !a.stalled)}</div>
        <div class="ag-mid">${mid}</div>${chart}
        <div class="ag-foot"><span class="wl">${a.wins || 0}W · ${a.losses || 0}L ${extra} ${live}</span><span class="tot ${totCls}" data-tw="usd:${esc(a.key)}" data-v="${tot}">${smoney(tot)}</span></div>
      </article>`;
    }).join("");
    grid.innerHTML = html;
    tween(grid);
  }
  const twPrev = {};
  function tween(root) {
    root.querySelectorAll("[data-tw]").forEach((el) => {
      const key = el.getAttribute("data-tw"), to = num(el.getAttribute("data-v"));
      if (to == null) return;
      const from = twPrev[key]; twPrev[key] = to;
      if (from == null || Math.abs(from - to) < 1e-9) return;
      const isPct = key.startsWith("pct:"), t0 = performance.now(), dur = 1200;
      const f = (t) => {
        const k = Math.min(1, (t - t0) / dur), v = from + (to - from) * (1 - Math.pow(1 - k, 3));
        el.textContent = isPct ? spct(v) : smoney(v);
        if (k < 1 && el.isConnected) requestAnimationFrame(f);
      };
      el.classList.add("tick"); setTimeout(() => el.classList.remove("tick"), 700);
      requestAnimationFrame(f);
    });
  }
  const seenActs = new Set();
  function actLine(a, isNew) {
    const col = COLORS[a.agent] || COLORS.desk, who = NAMES[a.agent] || a.agent;
    const title = String(a.title || ""), parts = title.split(" ");
    const verbRaw = (parts.shift() || "").toLowerCase(), coin = parts.join(" ");
    const val = String(a.value || ""), neg = /^-|−/.test(val);
    let verb = verbRaw, vc = "g";
    if (a.kind === "stopped") { verb = "stopped"; vc = "r"; }
    else if (a.kind === "sold") { verb = "sold"; vc = neg ? "r" : "g"; }
    else if (a.kind === "bought") { verb = "bought"; }
    else if (a.kind === "rejected" || a.kind === "skipped") { verb = "skipped"; vc = "why"; }
    else if (a.kind === "scan") { verb = "scanned"; vc = "why"; }
    let sub = String(a.subtitle || ""); const i = sub.indexOf(" · "); if (i > 0 && i < 14) sub = sub.slice(i + 3);
    const valHtml = val && !/^(skip|scan)/i.test(val) ? ` · <span class="${neg ? "r" : vc === "why" ? "why" : "g"}">${esc(val)}</span>` : "";
    return `<li class="${isNew ? "new" : ""}"><span class="dot" style="background:${col}"></span><span class="t" data-rel="${esc(a.ts)}">${rel(a.ts)}</span><span class="txt"><span class="who" style="color:${col}">${esc(who)}</span> <span class="${vc}">${esc(verb)}</span> ${esc(coin)}${valHtml}${sub ? ` · <span class="why">${esc(sub)}</span>` : ""}</span></li>`;
  }
  function renderActivity(d4) {
    const acts = (d4.activity || []).slice().reverse().slice(0, 14);
    $("act-list").innerHTML = acts.length ? acts.map((x) => actLine(x, !seenActs.has(x.id) && seenActs.size > 0)).join("") : `<li class="act-empty">Agents warming up… no activity yet this session.</li>`;
    acts.forEach((x) => seenActs.add(x.id));
    const s = d4.stats || {};
    $("act-sum").textContent = s.trades ? `${s.wins} wins · ${s.trades - s.wins} losses` : "booting…";
  }
  function renderGoal(g, mult) {
    const nodes = g.nodes || [1.25, 1.5, 2, 3, 4, 5], m = num(mult) ?? 1;
    const pos = (x) => { // piecewise even spacing between 1x .. last node
      const pts = [1, ...nodes]; if (x <= 1) return 0;
      for (let i = 1; i < pts.length; i++) if (x <= pts[i]) return ((i - 1) + (x - pts[i - 1]) / (pts[i] - pts[i - 1])) / (pts.length - 1) * 100;
      return 100;
    };
    $("goal-title").textContent = `Goal: ${g.x || 2}×`;
    const reached = m >= (g.x || 2);
    $("goal-right").innerHTML = reached ? `<span class="done">✅ Done</span> • ${m.toFixed(2)}× now`
      : g.next ? `next ${g.next}× • $${fmt(Math.max(0, num(g.to_go) || 0))} to go` : `${m.toFixed(2)}× now`;
    const fill = Math.max(0, Math.min(100, pos(m)));
    let h = `<div class="gb-track"></div><div class="gb-fill" style="width:${fill}%"></div>`;
    nodes.forEach((n) => {
      const left = pos(n), done = m >= n, target = n === (g.x || 2) && !done;
      h += `<span class="gb-node ${done ? "done" : ""} ${target ? "target" : ""}" style="left:${left}%"></span><span class="gb-lbl ${done ? "" : "no"}" style="left:${left}%">${n}×</span>`;
    });
    h += `<span class="gb-now" style="left:${Math.max(4, Math.min(96, fill))}%">${m.toFixed(2)}×</span>`;
    $("goal-bar").innerHTML = h;
  }
  function renderTicker(items) {
    const box = $("ticker");
    if (!items || !items.length) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    const one = items.map((t) => {
      const ch = num(t.ch24);
      return `<span class="tk">${coinIco(t.symbol)}${esc(t.symbol)} <span class="px">${px(t.price)}</span>${ch == null ? "" : `<span class="ch ${ch < 0 ? "neg" : ""}">${spct(ch)}</span>`}</span>`;
    }).join("");
    $("ticker-track").innerHTML = one + one; // doubled for a seamless loop
  }
  function toast(e) {
    const z = $("toast-zone"), col = COLORS[e.agent] || "#111";
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<span class="ti" style="background:${col}">${ICONS[{ sniper: "target", momentum: "bolt", dip: "radar", whale: "whale" }[e.agent]] || ""}</span>
      <div><div class="tt">${esc(e.text)}</div><div class="ts">${demo ? "DEMO · simulated" : "PAPER · real market price"}</div></div><span class="tv ${e.good ? "" : "neg"}">${esc(e.value || "")}</span>`;
    z.appendChild(el); setTimeout(() => el.remove(), 4800);
    const card = document.querySelector(`.agent[data-k="${e.agent}"]`);
    if (card && e.kind !== "bought") {
      const chip = document.createElement("span"); chip.className = "chip" + (e.good ? "" : " neg"); chip.textContent = e.value || "";
      card.appendChild(chip); setTimeout(() => chip.remove(), 2700);
      if (e.good) { const ck = document.createElement("span"); ck.className = "check"; ck.textContent = "✓"; card.appendChild(ck); setTimeout(() => ck.remove(), 2600); }
      card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1300);
    }
  }
  function events(list) {
    const ids = (list || []).map((e) => e.id);
    if (seenEvents == null) { seenEvents = new Set(ids); return; } // first load: no replay of old banners
    const fresh = (list || []).filter((e) => !seenEvents.has(e.id)).reverse();
    fresh.slice(-3).forEach((e, i) => setTimeout(() => toast(e), i * 1600));
    ids.forEach((id) => seenEvents.add(id));
  }
  function liveState() {
    const el = $("live");
    if (demo) { el.className = "live"; $("live-t").textContent = "Demo"; return; }
    const gen = data && new Date(data.generated_at).getTime();
    const age = gen ? Date.now() - gen : Infinity;
    const main = ((data && data.heartbeats) || []).find((h) => h.agent === "main");
    const paused = age > PAUSE_MS;
    document.body.classList.toggle("is-paused", paused);
    const pb = $("paused");
    if (paused) {
      el.className = "live stale"; $("live-t").textContent = "Paused";
      pb.innerHTML = `<b>Desk paused</b> · last update ${rel(data.generated_at)} ago (${hm(data.generated_at)} Sofia). The box sleeps now and then; the page catches up by itself when it wakes.`;
      pb.classList.remove("hidden");
    } else {
      pb.classList.add("hidden");
      if (main && main.status !== "ok") { el.className = "live down"; $("live-t").textContent = "Down"; }
      else { el.className = "live"; $("live-t").textContent = "Live"; }
    }
    const lat = lastFetchAt ? Math.round((Date.now() - lastFetchAt) / 1000) : null;
    $("foot-time").textContent = gen ? `desk data ${rel(data.generated_at)} old · page checked ${lat == null ? "—" : lat + "s"} ago · times Europe/Sofia` : "";
  }
  function tickRel() {
    document.querySelectorAll("[data-rel]").forEach((e) => { e.textContent = rel(e.getAttribute("data-rel")); });
    liveState();
  }

  function render(d) {
    data = d; const d4 = d.desk4;
    $("app").classList.remove("hidden"); $("err").classList.add("hidden");
    if (!d4) { $("err").textContent = "The desk has not published the 4-agent data yet (old gist schema). Waiting for gist_push…"; $("err").classList.remove("hidden"); return; }
    const eq = d4.equity || {}, m = num(eq.mult) ?? 1;
    const mode = demo ? "DEMO" : String(d4.mode || "PAPER").toUpperCase();
    $("mode-word").textContent = mode;
    $("mult-top-v").textContent = m.toFixed(2) + "×";
    const mb = $("mult-btn"); const prev = mb.textContent; mb.textContent = m.toFixed(2) + "×"; mb.classList.toggle("neg", m < 1);
    if (prev !== mb.textContent) { mb.classList.add("bump"); setTimeout(() => mb.classList.remove("bump"), 250); }
    $("eq-label").textContent = `Equity • started with $${fmt(num(eq.start) || 0, 0)}`;
    setBalance(num(eq.value) || 0);
    const pr = $("profit"); pr.textContent = `${smoney(eq.profit)} (${Math.round(num(eq.profit_pct) || 0)}%)`; pr.classList.toggle("neg", (num(eq.profit) || 0) < 0);
    const s = d4.stats || {};
    $("stats").textContent = s.trades ? `${s.trades} trades · ${s.win_pct}% win` : "Agents warming up...";
    const st = $("streak"); st.classList.toggle("hidden", !(s.streak > 1)); st.textContent = `🔥 ${s.streak}`;
    eqLine(d4.series, num(eq.start));
    renderTicker(d4.ticker);
    renderAgents(d4); renderActivity(d4); renderGoal(d4.goal || {}, m);
    $("foot-mode").textContent = demo ? "DEMO · simulated numbers, nothing real" : "PAPER only · no real orders · real market prices, the desk's own PAPER fills";
    events(d4.events);
    liveState();
  }

  // ------------------------------------------------------------ loading
  let apiLeft = null;
  async function viaApi(id, name) {
    const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(id)}?ts=${Date.now()}`, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
    apiLeft = num(res.headers.get("x-ratelimit-remaining"));
    if (res.status === 403 || res.status === 429) { const e = new Error("rate"); e.code = res.status; throw e; }
    if (!res.ok) throw new Error("gist " + res.status);
    const body = await res.json();
    const file = (body.files && (body.files[name || "fomo-desk.json"] || body.files["fomo-desk.json"] || Object.values(body.files)[0])) || null;
    if (!file) throw new Error("no file");
    let text = file.content;
    if (!text || file.truncated) text = await (await fetch(file.raw_url, { cache: "no-store" })).text();
    return JSON.parse(text);
  }
  async function viaRaw(id) {
    const res = await fetch(`https://gist.githubusercontent.com/angelmalev9-creator/${encodeURIComponent(id)}/raw/fomo-desk.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("raw " + res.status);
    return res.json();
  }
  let lastFetchAt = null, loading = false, failN = 0, lastApiAt = 0;
  async function rawFile(id, name) {
    const res = await fetch(`https://gist.githubusercontent.com/angelmalev9-creator/${encodeURIComponent(id)}/raw/${name}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) { const e = new Error("raw " + res.status); e.code = res.status; throw e; }
    return res.json();
  }
  async function load() {
    if (loading) return; loading = true;
    try {
      let d;
      // raw CDN can lag up to ~1 min; the API is always fresh but allows only 60 calls/h per viewer,
      // so use it at most every 2 min (and only while it has quota left).
      const useApi = Date.now() - lastApiAt > 120_000 && (apiLeft == null || apiLeft > 15);
      if (useApi) { lastApiAt = Date.now(); try { d = await viaApi(gistId, "fomo-live.json"); } catch (_) { d = null; } }
      if (!d) try { d = await rawFile(gistId, "fomo-live.json"); }
      catch (e) { try { d = await rawFile(gistId, "fomo-desk.json"); } catch (e2) { d = await viaApi(gistId); } }
      if (d && d.demo) throw new Error("demo data in gist");
      lastFetchAt = Date.now(); failN = 0;
      const newer = !data || !data.generated_at || new Date(d.generated_at) > new Date(data.generated_at);
      if (newer) render(d); else liveState();
    } catch (e) {
      failN++;
      $("app").classList.remove("hidden");
      if (failN >= 3) { $("err").textContent = "Could not read the desk data. Check the #g=… link and that gist_push is running."; $("err").classList.remove("hidden"); }
    } finally { loading = false; }
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
    document.body.classList.toggle("is-demo", demo);
    $("demo-banner").classList.toggle("hidden", !demo);
    $("demo-exit").href = gistId ? `#g=${gistId}` : "#";
    $("demo-exit").addEventListener("click", () => setTimeout(() => location.reload(), 30));
    if (demo) { window.FOMO_DEMO4.run(render); }
    else if (!gistId) { $("setup").classList.remove("hidden"); return; }
    else {
      load(); setInterval(load, POLL_MS);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
    }
    setInterval(() => { if (data && data.desk4) tickRel(); }, 1000);
  }
  window.addEventListener("hashchange", () => {
    const p = params();
    if ((p.get("demo") === "1") !== demo) { location.reload(); return; }
    const n = readGist(); if (!demo && n && n !== gistId) { gistId = n; load(); }
  });
  start();
})();
