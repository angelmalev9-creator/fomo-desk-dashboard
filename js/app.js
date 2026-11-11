(() => {
  "use strict";

  const STORAGE_KEY = "fomoDeskGistId";
  const POLL_MS = 75_000;
  const STALE_MS = 3 * 60 * 1000;
  const ZONE = "Europe/Sofia";
  const $ = (id) => document.getElementById(id);

  const el = {
    setup: $("setup"), banner: $("banner"), app: $("app"), demoBanner: $("demo-banner"),
    freshness: $("freshness"), nightSub: $("night-sub"), modeBadge: $("mode-badge"),
    liveBadge: $("live-badge"), quietBadge: $("quiet-badge"), pausedBadge: $("paused-badge"),
    balValue: $("bal-value"), balChange: $("bal-change"), heroSide: $("hero-side"), equityNote: $("equity-note"),
    agents: $("agents"), openList: $("open-list"), fills: $("fills"), funnel: $("funnel"), rejects: $("rejects"),
    feed: $("feed"), closed: $("closed-table"),
    stopBar: $("stop-bar"), stopBtn: $("stop-btn"), stopNote: $("stop-note"),
  };

  let equityChart = null, replayChart = null;
  let lastData = null, lastFetchOkAt = null, gistId = null, demo = false;
  let currentView = "desk";
  let confettiShown = false;

  // ------------------------------------------------------------ helpers
  function escapeHtml(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function hashParams() {
    const raw = (location.hash || "").replace(/^#/, "");
    return new URLSearchParams(raw.includes("=") ? raw : "");
  }
  function readGistId() {
    const raw = (location.hash || "").replace(/^#/, "");
    let id = hashParams().get("g");
    if (!id && /^[a-f0-9]{32}$/i.test(raw)) id = raw;
    if (id) {
      id = id.trim();
      try { localStorage.setItem(STORAGE_KEY, id); } catch (_) {}
      return id;
    }
    try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
  }
  const clsPnl = (v) => (v == null || Number.isNaN(Number(v)) ? "neu" : Number(v) > 0 ? "pos" : Number(v) < 0 ? "neg" : "neu");
  function ageLabel(ms) {
    if (ms == null || Number.isNaN(ms)) return "—";
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s} с`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} мин`;
    return `${Math.floor(m / 60)} ч ${m % 60} мин`;
  }
  function parseTs(v) { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
  function fmtSofia(value, withDate) {
    const d = value instanceof Date ? value : parseTs(value);
    if (!d) return "—";
    const opts = withDate
      ? { timeZone: ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
      : { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: false };
    return new Intl.DateTimeFormat("bg-BG", opts).format(d);
  }
  function money(v, fallback) {
    if (v == null || Number.isNaN(Number(v))) return fallback ?? "—";
    const n = Number(v);
    return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function signedMoney(v) { const n = Number(v) || 0; return `${n >= 0 ? "+" : "-"}${money(Math.abs(n))}`; }
  function signedPct(v) { if (v == null) return "—"; const n = Number(v); return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }
  function coinAnchor(row, text) {
    const label = escapeHtml(text || row.label || row.symbol || row.name || row.mint || "монета");
    const url = row.fomo_url;
    if (url && typeof url === "string" && url.startsWith("https://fomo.family/") && url.includes("r=savipww")) {
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    return label;
  }
  const empty = (title, text) => `<div class="empty"><b>${escapeHtml(title)}</b>${escapeHtml(text)}</div>`;
  const REASON = { stop: "стоп", trail: "trail", timeout: "таймаут", pulled: "изтеглена ликвидност", sellall: "спри и продай" };
  function showBanner(text, isError) {
    if (!text) { el.banner.classList.add("hidden"); el.banner.textContent = ""; return; }
    el.banner.classList.remove("hidden");
    el.banner.classList.toggle("error", !!isError);
    el.banner.textContent = text;
  }
  function tween(node, from, to, ms, fmt) {
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ------------------------------------------------------------ header / freshness
  function updateFreshness() {
    if (!lastData) return;
    if (demo) {
      el.freshness.textContent = "Демо режим · измислени данни";
      el.liveBadge.className = "badge demo";
      el.liveBadge.innerHTML = "DEMO";
      return;
    }
    const gen = parseTs(lastData.generated_at);
    if (!gen) { el.freshness.textContent = "Няма време на снимката"; return; }
    const age = Date.now() - gen.getTime();
    const stale = age > STALE_MS;
    el.liveBadge.className = "badge " + (stale ? "live-stale" : "live-ok");
    el.liveBadge.innerHTML = stale ? `<span class="dot"></span>ОСТАРЯЛО` : `<span class="dot pulse"></span>НА ЖИВО`;
    el.freshness.classList.toggle("stale", stale);
    el.freshness.innerHTML = `Обновено преди <strong>${escapeHtml(ageLabel(age))}</strong> · ${escapeHtml(fmtSofia(gen, true))} (Europe/Sofia)`;
    if (stale) showBanner("Данните са остарели с повече от 3 минути. Компютърът на бюрото може да е замръзнал или gist_push да е спрял.", false);
  }

  function renderHeader(data) {
    const h = data.header || {};
    const c = data.controls || {};
    const mode = (h.mode || "PAPER").toUpperCase();
    el.modeBadge.className = "badge " + (mode === "LIVE" ? "live" : "paper");
    el.modeBadge.innerHTML = `<span class="dot"></span>${escapeHtml(mode)}`;
    const q = c.quiet || {};
    el.quietBadge.classList.toggle("hidden", !q.on);
    el.quietBadge.textContent = q.on ? `ТИХ РЕЖИМ · ${q.held || 0} задържани` : "";
    el.pausedBadge.classList.toggle("hidden", !c.entries_paused);
    const nightBit = h.night_in_progress ? "нощта тече" : "нощта е приключена";
    el.nightSub.textContent = demo ? "Демо · измислена сесия" : `Нощ ${h.night_id ?? "—"} · ${nightBit} · старт ${fmtSofia(h.started_at, true)}`;
  }

  // ------------------------------------------------------------ desk view
  function sessionOf(data) {
    const s = data.session || {};
    const h = data.header || {};
    const start = Number(s.start_stack ?? h.start_stack ?? 200);
    const cur = Number(s.current_stack ?? h.current_stack ?? start);
    return { ...s, start, cur, change: cur - start, pct: start ? (cur - start) / start * 100 : 0, mult: start ? cur / start : 1 };
  }

  let shownBal = null;
  function renderHero(data) {
    const s = sessionOf(data);
    const from = shownBal == null ? s.start : shownBal;
    tween(el.balValue, from, s.cur, shownBal == null ? 900 : 600, money);
    shownBal = s.cur;
    el.balChange.className = "hero-change " + clsPnl(s.change);
    el.balChange.textContent = `${signedMoney(s.change)} · ${signedPct(s.pct)} · ×${s.mult.toFixed(2)} от ${money(s.start)} старт`;
    const t = data.totals || {};
    const eq = s.equity_now != null && Math.abs(s.equity_now - s.cur) >= 0.01 ? `<div><span>С отворените</span><b>${escapeHtml(money(s.equity_now))}</b></div>` : "";
    el.heroSide.innerHTML = `
      <div><span>Сделки</span><b>${escapeHtml(String(s.trades ?? t.closed_count ?? 0))}</b></div>
      <div><span>Зелени</span><b>${s.green_pct == null ? "—" : escapeHtml(s.green_pct + "%")}</b></div>
      <div><span>Отворени</span><b>${escapeHtml(String(t.open_count ?? 0))}</b></div>${eq}`;
  }

  function seriesPoints(data) {
    const pts = (data.equity_series || []).map(([ts, v]) => ({ t: parseTs(ts), y: Number(v) })).filter((p) => p.t && Number.isFinite(p.y));
    const s = sessionOf(data);
    const now = parseTs(data.generated_at);
    if (now && (!pts.length || pts[pts.length - 1].t < now)) pts.push({ t: now, y: Number(s.equity_now ?? s.cur) });
    return pts;
  }

  function chartOptions(pts, animate) {
    return {
      responsive: true, maintainAspectRatio: false, animation: animate ? { duration: 350 } : false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: (items) => { const p = pts[items[0]?.dataIndex]; return p ? `${fmtSofia(p.t, true)} (Europe/Sofia)` : ""; },
          label: (item) => money(item.raw),
        } },
      },
      scales: {
        x: { ticks: { color: "#8b97a8", maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "#8b97a8", callback: (v) => "$" + Number(v).toFixed(0) }, grid: { color: "rgba(255,255,255,0.05)" } },
      },
    };
  }
  function dataset(values) {
    const up = values.length >= 2 ? values[values.length - 1] >= values[0] : true;
    return {
      data: values, borderColor: up ? "#3ddc84" : "#ff5c6c",
      backgroundColor: up ? "rgba(61,220,132,0.12)" : "rgba(255,92,108,0.12)",
      fill: true, tension: 0.25, pointRadius: values.length <= 20 ? 2.5 : 0, pointHoverRadius: 5, borderWidth: 2,
    };
  }

  function renderEquity(data) {
    const pts = seriesPoints(data);
    const ctx = $("equity");
    if (!ctx || typeof Chart === "undefined") return;
    const span = pts.length > 1 ? pts[pts.length - 1].t - pts[0].t : 0;
    const labels = pts.map((p) => fmtSofia(p.t, span > 20 * 3600 * 1000));
    const values = pts.map((p) => p.y);
    const flat = values.every((v) => Math.abs(v - values[0]) < 0.005);
    el.equityNote.textContent = flat
      ? "Кривата е равна, защото още няма затворени сделки. Тя се движи с реалния PAPER стек и отворените позиции."
      : `${pts.length} точки · стек плюс текущата стойност на отворените позиции`;
    if (equityChart) {
      equityChart.data.labels = labels;
      equityChart.data.datasets[0] = dataset(values);
      equityChart.options = chartOptions(pts, false);
      equityChart.update("none");
    } else {
      equityChart = new Chart(ctx, { type: "line", data: { labels, datasets: [dataset(values)] }, options: chartOptions(pts, false) });
    }
  }

  function renderAgents(data) {
    const list = (data.heartbeats || []).filter((h) => h.agent !== "main");
    if (!list.length) { el.agents.innerHTML = empty("Няма сигнали от агенти", "Бюрото още не е записало heartbeat."); return; }
    const main = (data.heartbeats || []).find((h) => h.agent === "main");
    const order = ["scanner", "auditor", "analyst", "executor", "risk", "telegram"];
    list.sort((a, b) => order.indexOf(a.agent) - order.indexOf(b.agent));
    const NAME = { scanner: "Scanner", auditor: "Auditor", analyst: "Analyst", executor: "Executor", risk: "Risk", telegram: "Telegram" };
    const paused = (data.controls?.paused_agents || []).map((x) => String(x).toLowerCase());
    el.agents.innerHTML = list.map((h) => {
      let st = h.status || "missing";
      let label = st === "ok" ? "работи" : st === "stale" ? "изостава" : st === "down" ? "спрял" : "няма сигнал";
      if (paused.includes(h.agent)) { st = "stale"; label = "на пауза"; }
      const age = h.age_s == null ? "" : `сигнал преди ${ageLabel(h.age_s * 1000)}`;
      const last = h.last_action ? `${h.last_action_sofia ? h.last_action_sofia + " · " : ""}${h.last_action}` : "още няма действие тази сесия";
      return `<div class="agent ${escapeHtml(st)}">
        <div class="agent-top"><i></i><b>${escapeHtml(NAME[h.agent] || h.agent)}</b><span class="state">${escapeHtml(label)}</span></div>
        <div class="role">${escapeHtml(h.role || "")}</div>
        <div class="last">${escapeHtml(last)}</div>
        <div class="age">${escapeHtml(age)}</div>
      </div>`;
    }).join("") + (main && main.status !== "ok" && !demo ? `<div class="agent down"><div class="agent-top"><i></i><b>main.py</b><span class="state">${escapeHtml(main.label || "")}</span></div><div class="last">Процесът не е подал сигнал скоро.</div></div>` : "");
  }

  function renderOpen(data) {
    const rows = data.open_positions || [];
    if (!rows.length) { el.openList.innerHTML = empty("Няма отворени позиции", "Когато бюрото влезе в PAPER сделка, тук ще се вижда живият P&L."); return; }
    el.openList.innerHTML = rows.map((r) => {
      const rem = r.remaining_s == null ? "" : ` · таймаут след ${ageLabel(r.remaining_s * 1000)}`;
      return `<div class="pos-row">
        <div class="pos-main"><div class="pos-name">${coinAnchor(r)}</div>
          <div class="pos-sub">${escapeHtml(r.size_display || money(r.size_usd))} · вход ${escapeHtml(r.entry_price_display || "—")} · сега ${escapeHtml(r.last_price_display || "—")}</div>
          <div class="pos-sub">${escapeHtml(r.trail_state || "")}${escapeHtml(rem)}</div></div>
        <div class="pos-pnl ${clsPnl(r.unrealized_pnl_usd)}">${escapeHtml(r.unrealized_pnl_usd == null ? "—" : signedMoney(r.unrealized_pnl_usd))}
          <span>${r.unrealized_pnl_pct == null ? "" : escapeHtml(signedPct(r.unrealized_pnl_pct))}</span></div>
      </div>`;
    }).join("");
  }

  function renderFills(data) {
    const rows = data.fills || [];
    if (!rows.length) { el.fills.innerHTML = empty("Още няма сделки", "Покупките и продажбите в PAPER ще се появяват тук."); return; }
    el.fills.innerHTML = rows.slice(0, 12).map((f) => {
      const sell = f.side === "sell";
      const right = sell ? `<span class="${clsPnl(f.pnl_usd)}">${escapeHtml(signedMoney(f.pnl_usd))}</span>` : `<span class="muted">${escapeHtml(money(f.size_usd))}</span>`;
      const why = sell && f.exit_reason ? ` · ${REASON[f.exit_reason] || f.exit_reason}` : "";
      return `<div class="fill"><time>${escapeHtml(fmtSofia(f.ts, false))}</time>
        <span class="side ${sell ? "sell" : "buy"}">${sell ? "продажба" : "покупка"}</span>
        <span class="fname">${coinAnchor(f)}<small>${escapeHtml(why)}</small></span>${right}</div>`;
    }).join("");
  }

  function renderFunnel(data) {
    const p = data.pipeline || {};
    const aud = p.auditor || {};
    const execN = (data.totals?.open_count || 0) + (data.totals?.closed_count || 0);
    const steps = [
      ["Скенер", p.migrations_count ?? 0, `${p.scans_pass ?? 0} минали · ${p.scans_kill ?? 0} отрязани`],
      ["Одитор", aud.mints ?? 0, `${aud.passed_count ?? 0} минали · ${aud.rejected_count ?? 0} отхвърлени`],
      ["Анализатор", (p.verdicts_count ?? 0) + (p.analyst_skips_count ?? 0), `${p.analyst_rejects_count ?? 0} отказа`],
      ["Изпълнител", execN, `${data.totals?.open_count ?? 0} отв. · ${data.totals?.closed_count ?? 0} затв.`],
    ];
    el.funnel.innerHTML = steps.map(([name, n, bits]) =>
      `<div class="funnel-step"><div class="name">${escapeHtml(name)}</div><div class="n">${escapeHtml(String(n))}</div><div class="bits">${escapeHtml(bits)}</div></div>`).join("");
    const reasons = [];
    for (const m of p.migrations || []) {
      const sc = m.scan;
      if (sc && (sc.verdict === "kill" || sc.verdict === "wait")) reasons.push({ row: m, why: `Скенер: ${sc.reason || sc.verdict}` });
    }
    for (const r of aud.rejected || []) reasons.push({ row: r, why: `Одитор · слой ${r.failed_layer ?? "?"} ${r.failed_layer_name || ""}: ${r.failed_value || ""}` });
    for (const r of p.analyst_rejects || []) reasons.push({ row: r, why: `Анализатор: ${r.reason || "отказ"}` });
    if (!reasons.length) { el.rejects.innerHTML = demo ? "" : `<div class="empty">Няма записани откази в тази нощ.</div>`; return; }
    el.rejects.innerHTML = reasons.slice(-8).reverse().map((x) =>
      `<div class="reason"><span>${coinAnchor(x.row)}</span><span class="why">${escapeHtml(x.why)}</span></div>`).join("");
  }

  function renderFeed(data) {
    const rows = (data.activity || []).slice().reverse();
    if (!rows.length) { el.feed.innerHTML = empty("Тихо засега", demo ? "В демото няма поток от събития." : "Активността ще се появи при миграции, откази и сделки."); return; }
    el.feed.innerHTML = rows.map((a) => {
      const title = a.fomo_url ? `${coinAnchor(a)} · ${escapeHtml(a.title || "")}` : escapeHtml(a.title || a.label || "събитие");
      return `<div class="item"><time>${escapeHtml(a.ts_sofia_short || fmtSofia(a.ts))}</time>
        <div><span class="kind ${escapeHtml((a.kind || "").toLowerCase())}">${escapeHtml(a.kind || a.agent || "")}</span>
        <span class="title">${title}</span><div class="sub">${escapeHtml(a.subtitle || a.value || "")}</div></div></div>`;
    }).join("");
  }

  function renderClosed(data) {
    const rows = data.closed_trades || [];
    if (!rows.length) { el.closed.innerHTML = empty("Няма затворени сделки", "Таблицата ще се напълни след първата реална PAPER сделка. Не се показват примерни данни."); return; }
    el.closed.innerHTML = `<table><thead><tr><th>Монета</th><th>Затворена</th><th class="num">Размер</th><th class="num">P&amp;L</th><th>Причина</th></tr></thead><tbody>${
      rows.slice().reverse().map((r) => `<tr><td>${coinAnchor(r)}</td><td>${escapeHtml(fmtSofia(r.closed_at, true))}</td>
      <td class="num">${escapeHtml(money(r.size_usd))}</td>
      <td class="num ${clsPnl(r.pnl_usd)}">${escapeHtml(signedMoney(r.pnl_usd))}${r.pnl_pct == null ? "" : ` (${escapeHtml(signedPct(r.pnl_pct))})`}</td>
      <td>${escapeHtml(REASON[r.exit_reason] || r.exit_reason || "—")}</td></tr>`).join("")}</tbody></table>`;
  }

  function renderStop(data) {
    const c = data.controls || {};
    el.stopBar.classList.remove("hidden");
    if (demo) {
      el.stopBtn.href = "#";
      el.stopBtn.removeAttribute("target");
      el.stopBtn.onclick = (e) => { e.preventDefault(); alert("Демо: в истинския изглед този бутон отваря Telegram бота, който иска потвърждение."); };
      el.stopNote.textContent = "Демо. В истинския изглед отваря Telegram бота и иска потвърждение.";
      return;
    }
    el.stopBtn.onclick = null;
    const url = c.sellall_url;
    if (url && /^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=sellall$/.test(url)) {
      el.stopBtn.href = url;
      el.stopBtn.setAttribute("target", "_blank");
      el.stopBtn.classList.remove("disabled");
      const n = data.totals?.open_count || 0;
      el.stopNote.textContent = `Отваря Telegram (@${c.bot_username}). Там потвърждаваш с бутон. Само PAPER · ${n} отворени.`;
    } else {
      el.stopBtn.href = "#";
      el.stopBtn.classList.add("disabled");
      el.stopNote.textContent = "Няма линк към бота в данните. Напиши /sellall на бота в Telegram.";
    }
  }

  // ------------------------------------------------------------ replay
  const rp = { idx: 0, playing: false, timer: null, speed: 1, trades: [], shownPnl: 0, built: false };
  function replayTrades(data) {
    return ((data.session || {}).replay || []).slice().sort((a, b) => (a.closed_at < b.closed_at ? -1 : 1));
  }
  function buildReplay(data) {
    rp.trades = replayTrades(data);
    const s = sessionOf(data);
    const n = rp.trades.length;
    $("rp-empty").innerHTML = n ? "" : empty("Още няма затворени сделки за повторение",
      demo ? "" : "Повторението ще оживее след първата PAPER сделка. Отвори демото с &demo=1 в адреса, за да видиш как изглежда.");
    $("rp-play").disabled = !n;
    resetReplay(s.start);
    rp.built = true;
  }
  function resetReplay(start) {
    clearTimeout(rp.timer);
    rp.idx = 0; rp.playing = false; rp.shownPnl = 0;
    $("rp-play").textContent = "▶ Пусни";
    $("rp-pnl").textContent = "$0.00";
    $("rp-pnl").className = "replay-pnl neu";
    $("rp-popups").innerHTML = "";
    const st = start ?? sessionOf(lastData || {}).start;
    $("rp-bal").textContent = `Стек ${money(st)}`;
    updateProgress();
    drawReplayChart(st);
    renderBoard([]);
  }
  function updateProgress() {
    const n = rp.trades.length;
    $("rp-bar").style.width = n ? `${(rp.idx / n) * 100}%` : "0%";
    $("rp-count").textContent = `${rp.idx} от ${n} сделки`;
    const t = rp.trades[rp.idx - 1];
    $("rp-time").textContent = t ? `${fmtSofia(t.closed_at, true)} (Europe/Sofia)` : "—";
  }
  function drawReplayChart(start) {
    const ctx = $("rp-chart");
    if (!ctx || typeof Chart === "undefined") return;
    const pts = [{ t: parseTs(rp.trades[0]?.opened_at) || new Date(), y: start }];
    let eq = start;
    for (let i = 0; i < rp.idx; i++) { eq += Number(rp.trades[i].pnl_usd) || 0; pts.push({ t: parseTs(rp.trades[i].closed_at), y: eq }); }
    const labels = pts.map((p) => fmtSofia(p.t, false));
    const values = pts.map((p) => Math.round(p.y * 100) / 100);
    if (replayChart) {
      replayChart.data.labels = labels;
      replayChart.data.datasets[0] = dataset(values);
      replayChart.options = chartOptions(pts, true);
      replayChart.update();
    } else {
      replayChart = new Chart(ctx, { type: "line", data: { labels, datasets: [dataset(values)] }, options: chartOptions(pts, true) });
    }
  }
  function renderBoard(trades, target) {
    const node = target || $("rp-board");
    const best = trades.slice().sort((a, b) => b.pnl_usd - a.pnl_usd).slice(0, 5);
    if (!best.length) { node.innerHTML = empty("Още няма", target ? "Няма затворени сделки в тази сесия." : "Пусни повторението, за да се пълни класацията."); return; }
    node.innerHTML = best.map((t, i) => `<div class="board-row"><span class="rank">${i + 1}</span>
      <span class="bname">${coinAnchor(t, t.label)}<small>${escapeHtml(REASON[t.exit_reason] || t.exit_reason || "")} · ${escapeHtml(fmtSofia(t.closed_at, false))}</small></span>
      <span class="${clsPnl(t.pnl_usd)}">${escapeHtml(signedMoney(t.pnl_usd))}<small>${t.pnl_pct == null ? "" : escapeHtml(signedPct(t.pnl_pct))}</small></span></div>`).join("");
  }
  function popup(t) {
    const box = $("rp-popups");
    const d = document.createElement("div");
    d.className = "popup " + (t.pnl_usd >= 0 ? "pos" : "neg");
    d.innerHTML = `<b>${escapeHtml(t.label)}</b> ${escapeHtml(signedMoney(t.pnl_usd))}<small>${escapeHtml(REASON[t.exit_reason] || "")}</small>`;
    box.prepend(d);
    while (box.children.length > (innerWidth < 560 ? 2 : 4)) box.lastChild.remove();
    setTimeout(() => d.classList.add("fade"), 1800 / rp.speed);
  }
  function stepReplay() {
    if (!rp.playing) return;
    if (rp.idx >= rp.trades.length) {
      rp.playing = false;
      $("rp-play").textContent = "▶ Пусни";
      if ((sessionOf(lastData).change || 0) > 0) confetti();
      return;
    }
    const t = rp.trades[rp.idx];
    rp.idx += 1;
    const s = sessionOf(lastData);
    const prev = rp.shownPnl;
    rp.shownPnl = rp.trades.slice(0, rp.idx).reduce((a, x) => a + (Number(x.pnl_usd) || 0), 0);
    const node = $("rp-pnl");
    node.className = "replay-pnl " + clsPnl(rp.shownPnl);
    tween(node, prev, rp.shownPnl, 650 / rp.speed, (v) => signedMoney(v));
    $("rp-bal").textContent = `Стек ${money(s.start + rp.shownPnl)} · ×${((s.start + rp.shownPnl) / s.start).toFixed(2)}`;
    popup(t);
    updateProgress();
    drawReplayChart(s.start);
    renderBoard(rp.trades.slice(0, rp.idx));
    rp.timer = setTimeout(stepReplay, 1100 / rp.speed);
  }
  $("rp-play").addEventListener("click", () => {
    if (!rp.trades.length) return;
    if (rp.playing) { rp.playing = false; clearTimeout(rp.timer); $("rp-play").textContent = "▶ Продължи"; return; }
    if (rp.idx >= rp.trades.length) resetReplay();
    rp.playing = true;
    $("rp-play").textContent = "❚❚ Пауза";
    stepReplay();
  });
  $("rp-restart").addEventListener("click", () => resetReplay());
  $("rp-speed").addEventListener("click", () => {
    rp.speed = rp.speed === 1 ? 2 : rp.speed === 2 ? 4 : 1;
    $("rp-speed").textContent = `${rp.speed}×`;
  });

  // ------------------------------------------------------------ recap
  function renderRecap(data) {
    const s = sessionOf(data);
    $("rc-bal").textContent = money(s.cur);
    $("rc-bal").className = "recap-bal " + clsPnl(s.change);
    $("rc-from").textContent = `от ${money(s.start)} старт · ${signedMoney(s.change)} (${signedPct(s.pct)})`;
    $("rc-mult").textContent = `×${s.mult.toFixed(2)}`;
    $("rc-mult").className = "recap-mult " + clsPnl(s.change);
    const best = (s.best || [])[0];
    const stat = (k, v, tone) => `<div class="stat"><span>${escapeHtml(k)}</span><b class="${tone || ""}">${escapeHtml(v)}</b></div>`;
    $("rc-stats").innerHTML = [
      stat("Сделки", String(s.trades ?? 0)),
      stat("Зелени", s.green_pct == null ? "—" : `${s.green_pct}%`, s.green_pct == null ? "" : s.green_pct >= 50 ? "pos" : "neg"),
      stat("Червени стопове", String(s.stops ?? 0), s.stops ? "neg" : ""),
      stat("Печалби / загуби", `${s.wins ?? 0} / ${s.losses ?? 0}`),
      stat("Най-добра", best ? `${best.label} ${signedMoney(best.pnl_usd)}` : "—", best ? "pos" : ""),
      stat("Отворени сега", String(data.totals?.open_count ?? 0)),
    ].join("");
    $("rc-empty").innerHTML = s.trades ? "" : empty("Сесията още няма сделки", "Обобщението е честно: стекът е непроменен, защото бюрото не е затворило нито една PAPER сделка.");
    renderBoard(s.best || [], $("rc-best"));
  }

  // ------------------------------------------------------------ confetti
  function confetti() {
    const cv = $("confetti");
    const ctx = cv.getContext("2d");
    cv.width = innerWidth; cv.height = innerHeight;
    cv.style.display = "block";
    const colors = ["#3ddc84", "#f0b429", "#6aa6ff", "#9b8cff", "#ff5c6c", "#e8eef6"];
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5,
      vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, r: 4 + Math.random() * 5,
      c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
    }));
    const t0 = performance.now();
    const frame = (t) => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
      }
      if (t - t0 < 3200) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, cv.width, cv.height); cv.style.display = "none"; }
    };
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ views
  function setView(v) {
    currentView = v;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    ["desk", "replay", "recap"].forEach((x) => $("view-" + x).classList.toggle("hidden", x !== v));
    if (v === "replay" && lastData && !rp.built) buildReplay(lastData);
    if (v === "replay" && replayChart) replayChart.resize();
    if (v === "recap" && lastData) {
      renderRecap(lastData);
      if (!confettiShown && sessionOf(lastData).change > 0) { confettiShown = true; confetti(); }
    }
    const p = hashParams();
    p.set("v", v);
    history.replaceState(null, "", "#" + p.toString());
  }
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  // ------------------------------------------------------------ render / load
  function render(data) {
    const firstTrades = lastData ? replayTrades(lastData).length : -1;
    lastData = data;
    el.setup.classList.add("hidden");
    el.app.classList.remove("hidden");
    const gen = parseTs(data.generated_at);
    if (demo || (gen && Date.now() - gen.getTime() <= STALE_MS)) showBanner("", false);
    renderHeader(data);
    renderHero(data);
    renderEquity(data);
    renderAgents(data);
    renderOpen(data);
    renderFills(data);
    renderFunnel(data);
    renderFeed(data);
    renderClosed(data);
    renderStop(data);
    renderRecap(data);
    // rebuild replay only when the set of trades changed and it is not playing
    if (!rp.playing && (firstTrades !== replayTrades(data).length || !rp.built)) {
      rp.built = false;
      if (currentView === "replay") buildReplay(data);
    }
    updateFreshness();
  }

  async function fetchViaApi(id) {
    const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(id)}?ts=${Date.now()}`, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (res.status === 403 || res.status === 429) { const err = new Error("rate-limited"); err.code = res.status; throw err; }
    if (!res.ok) throw new Error(`gist ${res.status}`);
    const body = await res.json();
    const file = (body.files && (body.files["fomo-desk.json"] || Object.values(body.files)[0])) || null;
    if (!file) throw new Error("gist няма файл");
    let text = file.content;
    if (!text || file.truncated) text = await (await fetch(file.raw_url, { cache: "no-store" })).text();
    return JSON.parse(text);
  }
  async function fetchViaRaw(id) {
    const res = await fetch(`https://gist.githubusercontent.com/angelmalev9-creator/${encodeURIComponent(id)}/raw/fomo-desk.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`raw ${res.status}`);
    return res.json();
  }
  async function load() {
    if (demo || !gistId) return;
    try {
      let data;
      try { data = await fetchViaApi(gistId); }
      catch (e) {
        if (e && (e.code === 403 || e.code === 429 || /rate/i.test(String(e.message)))) data = await fetchViaRaw(gistId);
        else throw e;
      }
      if (data && data.demo) throw new Error("demo data in gist");
      lastFetchOkAt = new Date();
      render(data);
    } catch (e) {
      el.freshness.classList.add("err");
      el.freshness.textContent = "Неуспешно зареждане на данните";
      showBanner("Таблото не успя да прочете данните от Gist. Провери линка #g=… и че gist_push работи.", true);
      el.app.classList.remove("hidden");
    }
  }

  function start() {
    const p = hashParams();
    demo = p.get("demo") === "1";
    gistId = readGistId();
    el.demoBanner.classList.toggle("hidden", !demo);
    document.body.classList.toggle("is-demo", demo);
    $("demo-exit").href = gistId ? `#g=${gistId}` : "#";
    $("demo-exit").addEventListener("click", () => setTimeout(() => location.reload(), 30));
    if (demo) {
      el.setup.classList.add("hidden");
      render(window.FOMO_DEMO.build());
    } else if (!gistId) {
      el.setup.classList.remove("hidden");
      el.app.classList.add("hidden");
      return;
    } else {
      load();
      setInterval(load, POLL_MS);
    }
    setInterval(updateFreshness, 1000);
    const v = p.get("v");
    if (v && ["desk", "replay", "recap"].includes(v)) setView(v);
  }

  window.addEventListener("hashchange", () => {
    const p = hashParams();
    if ((p.get("demo") === "1") !== demo) { location.reload(); return; }
    const next = readGistId();
    if (!demo && next && next !== gistId) { gistId = next; load(); }
  });

  start();
})();
