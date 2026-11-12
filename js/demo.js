/* Clearly fake sample data for #demo=1 only. Never mixed with real gist data.
   No FOMO links here: real coin links only ever come from the desk (links.py). */
(() => {
  "use strict";
  function build() {
    const now = Date.now(), H = 3600e3;
    const start = now - 8 * H;
    const iso = (t) => new Date(t).toISOString();
    const names = ["DEMOCAT", "DEMOFROG", "DEMODOG", "DEMOMOON", "DEMOAPE", "DEMOPEPE", "DEMOBONK", "DEMOWIF", "DEMOGOAT",
      "DEMOFISH", "DEMOBIRD", "DEMOKING", "DEMOZERO", "DEMOSUN", "DEMOSTAR", "DEMOJET", "DEMOLION", "DEMOOWL"];
    const pct = [34, -6, 52, 18, -6, 71, 22, -5.8, 44, 12, -6.1, 63, 27, 9, 38, -6, 48, 21];
    const handles = ["demo_trader_A", "demo_trader_B", "demo_trader_C", null];
    const reason = (p) => (p <= -5.5 ? "stop" : p < 10 ? "timeout" : "trail");
    let stack = 200; const trades = []; const series = [[iso(start), 200]];
    names.forEach((n, i) => {
      const opened = start + i * 25 * 60e3 + 4 * 60e3, closed = opened + (14 + ((i * 9) % 30)) * 60e3;
      const size = Math.round(stack * 0.22 * 100) / 100;
      const pnl = Math.round((size * pct[i] / 100 - size * 0.012) * 100) / 100;
      // a few points while open, for a lively curve
      for (let k = 1; k <= 4; k++) series.push([iso(opened + ((closed - opened) * k) / 5), Math.round((stack + pnl * (k / 5) * (0.7 + 0.3 * Math.sin(k + i))) * 100) / 100]);
      stack = Math.round((stack + pnl) * 100) / 100;
      series.push([iso(closed), stack]);
      const h = handles[i % 4];
      trades.push({ mint: "DEMO" + i, label: n, symbol: n, name: `${n} (пример)`, fomo_url: null, opened_at: iso(opened), closed_at: iso(closed),
        size_usd: size, pnl_usd: pnl, pnl_pct: Math.round((pnl / size) * 1000) / 10, exit_reason: reason(pct[i]),
        source_label: h ? `копие от ${h}` : null, copy_handle: h });
    });
    const openPos = [
      { label: "DEMOMAX", symbol: "DEMOMAX", fomo_url: null, size_usd: 62.4, unrealized_pnl_usd: 3.68, unrealized_pnl_pct: 5.9, trail_active: true, opened_at: iso(now - 13 * 60e3), source_label: "копие от demo_trader_A" },
      { label: "DEMOGAT", symbol: "DEMOGAT", fomo_url: null, size_usd: 48.1, unrealized_pnl_usd: 1.97, unrealized_pnl_pct: 4.1, trail_active: true, opened_at: iso(now - 38 * 60e3), source_label: null },
    ];
    const unreal = openPos.reduce((a, p) => a + p.unrealized_pnl_usd, 0);
    const eq = Math.round((stack + unreal) * 100) / 100;
    series.push([iso(now), eq]);
    const feed = [];
    openPos.forEach((p) => feed.push({ ...p, side: "buy", ts: p.opened_at, mc_usd: 30000 + p.size_usd * 600 }));
    trades.forEach((t) => { feed.push({ ...t, side: "buy", ts: t.opened_at, mc_usd: 25000 + t.size_usd * 300 }); feed.push({ ...t, side: "sell", ts: t.closed_at }); });
    feed.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    const wins = trades.filter((t) => t.pnl_usd >= 0);
    const per = {};
    trades.forEach((t) => { if (!t.copy_handle) return; const p = per[t.copy_handle] || (per[t.copy_handle] = { handle: t.copy_handle, closed: 0, open: 0, pnl_usd: 0 }); p.closed++; p.pnl_usd = Math.round((p.pnl_usd + t.pnl_usd) * 100) / 100; });
    const hbs = ["main", "scanner", "auditor", "analyst", "executor", "risk", "telegram", "copywatch"].map((a) => ({ agent: a, status: "ok", ts: iso(now - 20e3), last_action: a === "auditor" ? "DEMOSUN · слой 9: ok" : null }));
    const scanItems = [
      { label: "DEMOMILLY", symbol: "DEMOMILLY", state: "pass", score: 87 }, { label: "DEMOGETTA", symbol: "DEMOGETTA", state: "pass", score: 94 },
      { label: "DEMOTOMMI", symbol: "DEMOTOMMI", state: "pass", score: 80 }, { label: "DEMORUG", symbol: "DEMORUG", state: "kill", liq_display: "$7.4K" },
    ].map((x, i) => ({ ...x, fomo_url: null, ts: iso(now - i * 90e3) }));
    return {
      demo: true, generated_at: iso(now), timezone: "Europe/Sofia",
      header: { mode: "PAPER", night_id: 1, session_first_night_id: 1, started_at: iso(start), start_stack: 200, current_stack: stack,
        ticket: { ticket_usd: Math.round(stack * 0.08 * 100) / 100, ticket_pct_of_stack: 8, stack_pct: 8, bumped: false, min_ticket_usd: 47.5 },
        risk: { stop_pct: 6, trail_start_pct: 20, trail_pct: 12, timeout_h: 3 } },
      heartbeats: hbs, open_positions: openPos, closed_trades: trades,
      session: { start_stack: 200, current_stack: stack, equity_now: eq, change_usd: Math.round((eq - 200) * 100) / 100, change_pct: Math.round(((eq - 200) / 2) * 100) / 100,
        multiplier: eq / 200, trades: trades.length, wins: wins.length, losses: trades.length - wins.length, stops: trades.filter((t) => t.exit_reason === "stop").length,
        green_pct: Math.round((wins.length / trades.length) * 1000) / 10, best: trades.slice().sort((a, b) => b.pnl_usd - a.pnl_usd).slice(0, 5), replay: trades },
      equity_series: series, feed,
      scanner: { status: "ok", state_label: "сканира", min_liq_display: "$40.0K", scans_count: 142, kills_count: 118, pass_count: 24, liq_kills_recent: 96, last_scan_ts: iso(now - 40e3), items: scanItems },
      copy: { traders: ["demo_trader_A", "demo_trader_B", "demo_trader_C"].map((h, i) => ({ handle: h, active: true, rank: i + 1, profile_url: null })), per_trader: Object.values(per).sort((a, b) => b.pnl_usd - a.pnl_usd) },
      pipeline: { scans_count: 142, scans_kill: 118, scans_pass: 24, verdicts_count: 22, auditor: { passed_count: 20, rejected_count: 4 } },
      controls: { bot_username: null, sellall_url: null, entries_paused: false, quiet: { on: false } },
    };
  }
  window.FOMO_DEMO = { build };
})();
