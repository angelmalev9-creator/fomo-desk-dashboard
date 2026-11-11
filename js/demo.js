/* Clearly fake sample data for #demo=1 only. Never mixed with real gist data.
   No FOMO links here: real coin links only ever come from the desk (links.py). */
(() => {
  "use strict";
  function build() {
    const now = Date.now();
    const start = now - 8 * 3600 * 1000;
    const names = ["DEMOCAT", "DEMOFROG", "DEMODOG", "DEMOMOON", "DEMOAPE", "DEMOPEPE", "DEMOBONK", "DEMOWIF",
      "DEMOSHIB", "DEMOGOAT", "DEMOELON", "DEMOMEME", "DEMOFISH", "DEMOBIRD", "DEMOKING", "DEMOZERO"];
    // fixed pattern so the demo looks the same every time
    const pnlPct = [18.2, -6.1, 34.5, 12.0, -6.0, 61.3, 8.4, -5.9, 22.7, 3.1, -6.2, 41.0, 15.5, -4.8, 27.9, 9.6];
    const reasons = (p) => (p <= -5.5 ? "stop" : p < 5 ? "timeout" : "trail");
    let stack = 200;
    const trades = [];
    const series = [[new Date(start).toISOString(), 200]];
    names.forEach((n, i) => {
      const opened = start + i * 28 * 60 * 1000 + 3 * 60 * 1000;
      const closed = opened + (12 + (i * 7) % 40) * 60 * 1000;
      const size = Math.max(47.5, Math.round(stack * 0.08 * 100) / 100);
      const pnl = Math.round((size * pnlPct[i] / 100 - 1.71) * 100) / 100;
      stack = Math.round((stack + pnl) * 100) / 100;
      trades.push({ label: n, name: `${n} (пример)`, fomo_url: null, opened_at: new Date(opened).toISOString(),
        closed_at: new Date(closed).toISOString(), size_usd: size, pnl_usd: pnl,
        pnl_pct: Math.round(pnl / size * 10000) / 100, exit_reason: reasons(pnlPct[i]) });
      series.push([new Date(closed).toISOString(), stack]);
    });
    series.push([new Date(now).toISOString(), stack]);
    const wins = trades.filter((t) => t.pnl_usd >= 0);
    const best = trades.slice().sort((a, b) => b.pnl_usd - a.pnl_usd).slice(0, 5);
    const iso = (ms) => new Date(ms).toISOString();
    const hb = (agent, role, txt, age) => ({ agent, role, status: "ok", label: "жив", age_s: age,
      ts: iso(now - age * 1000), last_action: txt, last_action_ts: iso(now - age * 1000) });
    const openPos = [{ label: "DEMOLAST (пример)", fomo_url: null, size_usd: 52.4, size_display: "$52.40",
      entry_price_display: "$0.000412", last_price_display: "$0.000451", unrealized_pnl_usd: 3.12,
      unrealized_pnl_display: "$3.12", unrealized_pnl_pct: 5.95, trail_state: "стоп (trail още не е тръгнал)",
      remaining_s: 9000, opened_at: iso(now - 25 * 60 * 1000) }];
    const closedRows = trades.map((t) => ({ label: t.name, fomo_url: null, closed_at: t.closed_at,
      closed_at_sofia: null, size_usd: t.size_usd, pnl_usd: t.pnl_usd, pnl_pct: t.pnl_pct,
      exit_reason: t.exit_reason, opened_at: t.opened_at }));
    const fills = [];
    trades.slice(-8).forEach((t) => {
      fills.push({ ts: t.closed_at, side: "sell", label: t.name, size_usd: t.size_usd, pnl_usd: t.pnl_usd, exit_reason: t.exit_reason });
      fills.push({ ts: t.opened_at, side: "buy", label: t.name, size_usd: t.size_usd });
    });
    fills.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    return {
      demo: true,
      generated_at: iso(now),
      generated_at_sofia: null,
      header: { mode: "PAPER", night_id: 0, night_in_progress: true, started_at: iso(start),
        start_stack: 200, current_stack: stack, ticket: {} },
      heartbeats: [
        hb("scanner", "Скенер · нови миграции", "пусна DEMOLAST · liq $64K", 12),
        hb("auditor", "Одитор · 9 проверки", "DEMOLAST · 9/9 ok", 40),
        hb("analyst", "Анализатор · оценка", "DEMOLAST · оценка 78 · да", 44),
        hb("executor", "Изпълнител · размер и вход", "DEMOLAST · bought · $52.40", 60),
        hb("risk", "Риск · стоп и trail", "следи 1 отворени", 8),
        hb("telegram", "Telegram · команди", null, 15),
      ],
      open_positions: openPos,
      closed_trades: closedRows,
      totals: { open_count: 1, closed_count: trades.length, wins: wins.length, losses: trades.length - wins.length },
      pipeline: { migrations_count: 84, scans_pass: 19, scans_kill: 61, scans_wait: 4,
        auditor: { mints: 19, passed_count: 17, rejected_count: 2, pending_count: 0, rejected: [] },
        verdicts_count: 17, analyst_skips_count: 0, analyst_rejects_count: 0, migrations: [], analyst_rejects: [], analyst_skips: [] },
      activity: [],
      equity_series: series,
      session: { start_stack: 200, current_stack: stack, equity_now: stack + 3.12,
        change_usd: Math.round((stack - 200) * 100) / 100, change_pct: Math.round((stack - 200) / 2 * 100) / 100,
        multiplier: stack / 200, trades: trades.length, wins: wins.length, losses: trades.length - wins.length,
        stops: trades.filter((t) => t.exit_reason === "stop").length,
        green_pct: Math.round(wins.length / trades.length * 1000) / 10, best, replay: trades },
      controls: { sellall_url: null, entries_paused: false, quiet: { on: true, held: 23 } },
      fills,
    };
  }
  window.FOMO_DEMO = { build };
})();
