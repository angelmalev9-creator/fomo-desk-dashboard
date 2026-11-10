(() => {
  "use strict";

  const STORAGE_KEY = "fomoDeskGistId";
  const POLL_MS = 75_000;
  const STALE_MS = 3 * 60 * 1000;
  const ZONE = "Europe/Sofia";

  const el = {
    setup: document.getElementById("setup"),
    banner: document.getElementById("banner"),
    app: document.getElementById("app"),
    kpis: document.getElementById("kpis"),
    agents: document.getElementById("agents"),
    funnel: document.getElementById("funnel"),
    rejects: document.getElementById("rejects"),
    open: document.getElementById("open-table"),
    closed: document.getElementById("closed-table"),
    feed: document.getElementById("feed"),
    freshness: document.getElementById("freshness"),
    nightSub: document.getElementById("night-sub"),
    modeBadge: document.getElementById("mode-badge"),
  };

  let equityChart = null;
  let lastData = null;
  let lastFetchOkAt = null;
  let gistId = null;
  let pollTimer = null;
  let tickTimer = null;

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function readGistId() {
    const raw = (location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(raw.includes("=") ? raw : "");
    let id = params.get("g");
    if (!id && /^[a-f0-9]{32}$/i.test(raw)) id = raw;
    if (id) {
      id = id.trim();
      try { localStorage.setItem(STORAGE_KEY, id); } catch (_) {}
      return id;
    }
    try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
  }

  function clsPnl(v) {
    if (v == null || Number.isNaN(Number(v))) return "neu";
    if (Number(v) > 0) return "pos";
    if (Number(v) < 0) return "neg";
    return "neu";
  }

  function ageLabel(ms) {
    if (ms == null || Number.isNaN(ms)) return "—";
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s} с`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} мин`;
    const h = Math.floor(m / 60);
    return `${h} ч ${m % 60} мин`;
  }

  function parseTs(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function fmtSofia(value, withDate) {
    const d = value instanceof Date ? value : parseTs(value);
    if (!d) return "—";
    const opts = withDate
      ? { timeZone: ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }
      : { timeZone: ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
    return new Intl.DateTimeFormat("bg-BG", opts).format(d);
  }

  function money(v, fallback) {
    if (v == null || Number.isNaN(Number(v))) return fallback ?? "—";
    const n = Number(v);
    const sign = n < 0 ? "-" : "";
    return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function coinAnchor(row) {
    const label = escapeHtml(row.label || row.symbol || row.name || row.mint || "монета");
    const url = row.fomo_url;
    if (url && typeof url === "string" && url.startsWith("https://fomo.family/")) {
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    return label;
  }

  function empty(title, text) {
    return `<div class="empty"><b>${escapeHtml(title)}</b>${escapeHtml(text)}</div>`;
  }

  function showBanner(text, isError) {
    if (!text) {
      el.banner.classList.add("hidden");
      el.banner.textContent = "";
      return;
    }
    el.banner.classList.remove("hidden");
    el.banner.classList.toggle("error", !!isError);
    el.banner.textContent = text;
  }

  function updateFreshness() {
    if (!lastData) return;
    const gen = parseTs(lastData.generated_at);
    if (!gen) {
      el.freshness.textContent = "Няма време на снимката";
      return;
    }
    const age = Date.now() - gen.getTime();
    el.freshness.classList.toggle("stale", age > STALE_MS);
    el.freshness.classList.remove("err");
    const src = lastFetchOkAt ? ` · страницата обнови в ${fmtSofia(lastFetchOkAt)}` : "";
    el.freshness.innerHTML = `Последно обновяване преди <strong>${escapeHtml(ageLabel(age))}</strong> <span>(${escapeHtml(lastData.generated_at_sofia || fmtSofia(gen, true) + " (Europe/Sofia)")})</span>${escapeHtml(src)}`;
    if (age > STALE_MS) {
      showBanner("Данните са остарели с повече от 3 минути. Провери дали gist_push работи.", false);
    }
  }

  function renderKpis(data) {
    const h = data.header || {};
    const t = data.totals || {};
    const ticket = h.ticket || {};
    const start = Number(h.start_stack);
    const cur = Number(h.current_stack);
    const nightPnl = (Number.isFinite(start) && Number.isFinite(cur)) ? cur - start : t.total_pnl_usd;
    const mode = (h.mode || "PAPER").toUpperCase();
    el.modeBadge.className = "badge " + (mode === "LIVE" ? "live" : "paper");
    el.modeBadge.innerHTML = `<span class="dot"></span>${escapeHtml(mode)}`;
    const nightBit = h.night_in_progress ? "нощта тече" : "нощта е приключена";
    const started = h.started_at_sofia || "—";
    el.nightSub.textContent = `Нощ ${h.night_id ?? "—"} · ${nightBit} · старт ${started}`;

    const wr = t.win_rate_pct;
    const wrText = wr == null ? "—" : `${wr}%`;
    const wrSub = t.closed_count ? `${t.wins} печалби / ${t.losses} загуби` : "все още няма сделки";
    const ticketMsg = ticket.bumped
      ? (ticket.message || `билет $${ticket.ticket_usd} (под минимума на стека)`)
      : `билет ${money(ticket.ticket_usd)} · ${ticket.stack_pct}% от стека`;

    el.kpis.innerHTML = [
      kpi("Режим", escapeHtml(mode), nightBit, mode === "LIVE" ? "neg" : "neu"),
      kpi("Стек", escapeHtml(h.current_stack_display || money(cur)), `старт ${escapeHtml(h.start_stack_display || money(start))}`, "neu"),
      kpi("P&amp;L за нощта", escapeHtml(money(nightPnl)), ticketMsg, clsPnl(nightPnl), "span2"),
      kpi("Дял печалби", escapeHtml(wrText), wrSub, wr == null ? "neu" : (wr >= 50 ? "pos" : "neg")),
      kpi("Отворени", escapeHtml(String(t.open_count ?? 0)), t.open_count ? "активни позиции" : "няма отворени", "neu"),
    ].join("");
  }

  function kpi(label, value, sub, tone, extra) {
    return `<article class="card ${extra || ""}"><h2>${label}</h2><div class="kpi-value ${tone}">${value}</div><div class="kpi-sub">${escapeHtml(sub)}</div></article>`;
  }

  function renderAgents(data) {
    const list = data.heartbeats || [];
    if (!list.length) {
      el.agents.innerHTML = `<span class="pill missing"><i></i>Няма сигнали от агенти</span>`;
      return;
    }
    el.agents.innerHTML = list.map((h) => {
      const st = h.status || "missing";
      const age = h.age_s == null ? "няма сигнал" : `преди ${ageLabel(h.age_s * 1000)}`;
      return `<span class="pill ${escapeHtml(st)}"><i></i><b>${escapeHtml(h.agent)}</b><span class="ago">${escapeHtml(h.label || st)} · ${escapeHtml(age)}</span></span>`;
    }).join("");
  }

  function renderFunnel(data) {
    const p = data.pipeline || {};
    const aud = p.auditor || {};
    const execN = (data.totals?.open_count || 0) + (data.totals?.closed_count || 0);
    const steps = [
      ["Скенер", p.migrations_count ?? 0, `${p.scans_pass ?? 0} минали · ${p.scans_kill ?? 0} отрязани · ${p.scans_wait ?? 0} чакат`],
      ["Одитор", aud.mints ?? 0, `${aud.passed_count ?? 0} минали · ${aud.rejected_count ?? 0} отхвърлени · ${aud.pending_count ?? 0} чакат`],
      ["Анализатор", (p.verdicts_count ?? 0) + (p.analyst_skips_count ?? 0), `${p.analyst_rejects_count ?? 0} отказа · ${p.analyst_skips_count ?? 0} пропуска`],
      ["Изпълнител", execN, `${data.totals?.open_count ?? 0} отворени · ${data.totals?.closed_count ?? 0} затворени`],
    ];
    el.funnel.innerHTML = steps.map(([name, n, bits]) =>
      `<div class="funnel-step"><div class="name">${escapeHtml(name)}</div><div class="n">${escapeHtml(String(n))}</div><div class="bits">${escapeHtml(bits)}</div></div>`
    ).join("");

    const reasons = [];
    for (const m of p.migrations || []) {
      const sc = m.scan;
      if (sc && (sc.verdict === "kill" || sc.verdict === "wait")) {
        reasons.push({ row: m, why: `Скенер: ${sc.reason || sc.verdict}` });
      }
    }
    for (const r of aud.rejected || []) {
      reasons.push({ row: r, why: `Одитор · слой ${r.failed_layer ?? "?"} ${r.failed_layer_name || ""}: ${r.failed_value || ""}` });
    }
    for (const r of p.analyst_rejects || []) {
      reasons.push({ row: r, why: `Анализатор: ${r.reason || "отказ"}` });
    }
    for (const r of p.analyst_skips || []) {
      reasons.push({ row: r, why: `Пропуск: ${r.reason || r.until_label || ""}` });
    }
    if (!reasons.length) {
      el.rejects.innerHTML = `<div class="empty">Няма записани откази в тази нощ, или потокът още е празен.</div>`;
      return;
    }
    el.rejects.innerHTML = reasons.slice(-12).reverse().map((x) =>
      `<div class="reason"><span>${coinAnchor(x.row)}</span><span class="why">${escapeHtml(x.why)}</span></div>`
    ).join("");
  }

  function renderOpen(data) {
    const rows = data.open_positions || [];
    if (!rows.length) {
      el.open.innerHTML = empty("Няма отворени позиции", "Когато бюрото влезе в сделка, тук ще се вижда живият P&L.");
      return;
    }
    el.open.innerHTML = `<table><thead><tr>
      <th>Монета</th><th class="num">Размер</th><th class="num">Вход</th><th class="num">Сега</th>
      <th class="num">P&amp;L</th><th>Защита</th>
    </tr></thead><tbody>${rows.map((r) => {
      const rem = r.remaining_s == null ? "" : ` · остават ${ageLabel(r.remaining_s * 1000)}`;
      return `<tr>
        <td>${coinAnchor(r)}<div class="kpi-sub">${escapeHtml(r.opened_at_sofia || "")}</div></td>
        <td class="num">${escapeHtml(r.size_display || money(r.size_usd))}</td>
        <td class="num">${escapeHtml(r.entry_price_display || "—")}</td>
        <td class="num">${escapeHtml(r.last_price_display || "—")}</td>
        <td class="num ${clsPnl(r.unrealized_pnl_usd)}">${escapeHtml(r.unrealized_pnl_display || "—")}${r.unrealized_pnl_pct == null ? "" : ` <span>(${escapeHtml(String(r.unrealized_pnl_pct))}%)</span>`}</td>
        <td>${escapeHtml(r.trail_state || "")}${escapeHtml(rem)}</td>
      </tr>`;
    }).join("")}</tbody></table>`;
  }

  function renderClosed(data) {
    const rows = data.closed_trades || [];
    if (!rows.length) {
      el.closed.innerHTML = empty("Няма затворени сделки", "Таблицата ще се напълни след първата реална PAPER сделка. Не се показват примерни данни.");
      return;
    }
    el.closed.innerHTML = `<table><thead><tr>
      <th>Монета</th><th>Затворена</th><th class="num">Размер</th>
      <th class="num">Вход → изход</th><th class="num">P&amp;L</th><th>Причина</th>
    </tr></thead><tbody>${rows.map((r) => `<tr>
      <td>${coinAnchor(r)}</td>
      <td>${escapeHtml(r.closed_at_sofia || "—")}</td>
      <td class="num">${escapeHtml(money(r.size_usd))}</td>
      <td class="num">${escapeHtml(r.entry_price_display || "—")} → ${escapeHtml(r.exit_price_display || "—")}</td>
      <td class="num ${clsPnl(r.pnl_usd)}">${escapeHtml(r.pnl_display || money(r.pnl_usd))}${r.pnl_pct == null ? "" : ` (${escapeHtml(String(r.pnl_pct))}%)`}</td>
      <td>${escapeHtml(r.exit_reason || "—")}</td>
    </tr>`).join("")}</tbody></table>`;
  }

  function renderFeed(data) {
    const rows = (data.activity || []).slice().reverse();
    if (!rows.length) {
      el.feed.innerHTML = empty("Тихо засега", "Активността ще се появи при миграции, откази и сделки.");
      return;
    }
    el.feed.innerHTML = rows.map((a) => {
      const kind = (a.kind || "").toLowerCase();
      const title = a.fomo_url ? `${coinAnchor(a)} · ${escapeHtml(a.title || "")}` : escapeHtml(a.title || a.label || "събитие");
      return `<div class="item"><time>${escapeHtml(a.ts_sofia_short || fmtSofia(a.ts))}</time>
        <div><span class="kind ${escapeHtml(kind)}">${escapeHtml(a.kind || a.agent || "")}</span>
        <span class="title">${title}</span>
        <div class="sub">${escapeHtml(a.subtitle || a.value || "")}</div></div></div>`;
    }).join("");
  }

  function equityPoints(data) {
    const h = data.header || {};
    const start = Number(h.start_stack);
    if (!Number.isFinite(start)) return [];
    const points = [];
    const t0 = parseTs(h.started_at) || parseTs(data.generated_at);
    if (t0) points.push({ t: t0, y: start, label: "старт" });
    let eq = start;
    const closed = (data.closed_trades || []).slice().sort((a, b) => {
      const ta = parseTs(a.closed_at)?.getTime() ?? 0;
      const tb = parseTs(b.closed_at)?.getTime() ?? 0;
      return ta - tb;
    });
    for (const tr of closed) {
      if (tr.pnl_usd == null) continue;
      eq = eq + Number(tr.pnl_usd);
      const t = parseTs(tr.closed_at);
      if (t) points.push({ t, y: eq, label: tr.label || "" });
    }
    const now = parseTs(data.generated_at);
    const cur = Number(h.current_stack);
    if (now && Number.isFinite(cur)) {
      const last = points[points.length - 1];
      if (!last || last.t.getTime() !== now.getTime()) {
        points.push({ t: now, y: cur, label: "сега" });
      }
    }
    return points;
  }

  function renderEquity(data) {
    const pts = equityPoints(data);
    const ctx = document.getElementById("equity");
    if (!ctx || typeof Chart === "undefined") return;
    const labels = pts.map((p) => fmtSofia(p.t, false));
    const values = pts.map((p) => p.y);
    const up = values.length >= 2 ? values[values.length - 1] >= values[0] : true;
    const color = up ? "#3ddc84" : "#ff5c6c";
    const dataset = {
      label: "Стек ($)",
      data: values,
      borderColor: color,
      backgroundColor: up ? "rgba(61,220,132,0.12)" : "rgba(255,92,108,0.12)",
      fill: true,
      tension: 0.25,
      pointRadius: values.length <= 8 ? 3 : 0,
      pointHoverRadius: 5,
      borderWidth: 2,
    };
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex;
              return pts[i] ? `${fmtSofia(pts[i].t, true)} (Europe/Sofia)` : "";
            },
            label: (item) => money(item.raw),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#8b97a8", maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
          grid: { color: "rgba(255,255,255,0.04)" },
        },
        y: {
          ticks: { color: "#8b97a8", callback: (v) => "$" + Number(v).toFixed(0) },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
      },
    };
    if (equityChart) {
      equityChart.data.labels = labels;
      equityChart.data.datasets[0] = dataset;
      equityChart.update("none");
    } else {
      equityChart = new Chart(ctx, { type: "line", data: { labels, datasets: [dataset] }, options });
    }
  }

  function render(data) {
    lastData = data;
    el.setup.classList.add("hidden");
    el.app.classList.remove("hidden");
    // Clear stale banner if data is fresh; updateFreshness will re-add if needed.
    const gen = parseTs(data.generated_at);
    if (gen && Date.now() - gen.getTime() <= STALE_MS) showBanner("", false);
    renderKpis(data);
    renderAgents(data);
    renderFunnel(data);
    renderOpen(data);
    renderClosed(data);
    renderFeed(data);
    renderEquity(data);
    updateFreshness();
  }

  async function fetchViaApi(id) {
    const url = `https://api.github.com/gists/${encodeURIComponent(id)}?ts=${Date.now()}`;
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (res.status === 403 || res.status === 429) {
      const err = new Error("rate-limited");
      err.code = res.status;
      throw err;
    }
    if (!res.ok) throw new Error(`gist ${res.status}`);
    const body = await res.json();
    const file = (body.files && (body.files["fomo-desk.json"] || Object.values(body.files)[0])) || null;
    if (!file) throw new Error("gist няма файл");
    const text = file.content || (file.raw_url ? await (await fetch(file.raw_url + (file.raw_url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" })).text() : null);
    if (!text) throw new Error("празен gist");
    return JSON.parse(text);
  }

  async function fetchViaRaw(id) {
    const url = `https://gist.githubusercontent.com/angelmalev9-creator/${encodeURIComponent(id)}/raw/fomo-desk.json?t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`raw ${res.status}`);
    return res.json();
  }

  async function load() {
    if (!gistId) return;
    try {
      let data;
      try {
        data = await fetchViaApi(gistId);
      } catch (e) {
        if (e && (e.code === 403 || e.code === 429 || /rate/i.test(String(e.message)))) {
          data = await fetchViaRaw(gistId);
        } else {
          throw e;
        }
      }
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
    gistId = readGistId();
    if (!gistId) {
      el.setup.classList.remove("hidden");
      el.app.classList.add("hidden");
      return;
    }
    el.setup.classList.add("hidden");
    el.app.classList.remove("hidden");
    load();
    pollTimer = setInterval(load, POLL_MS);
    tickTimer = setInterval(updateFreshness, 1000);
  }

  window.addEventListener("hashchange", () => {
    const next = readGistId();
    if (next && next !== gistId) {
      gistId = next;
      load();
    }
  });

  start();
})();
