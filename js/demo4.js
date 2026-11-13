/* #demo=1 only: a SIMULATED run that mimics the video's animation. Made-up coins and numbers,
   no FOMO links, never mixed with the real desk data. */
(() => {
  "use strict";
  const AG = [
    { key: "sniper", name: "Sniper", icon: "target", color: "#f97316", sub: "fresh migrations", scan: 523, size: 0.24 },
    { key: "momentum", name: "Momentum", icon: "bolt", color: "#3b82f6", sub: "volume breakouts", scan: 487, size: 0.24 },
    { key: "dip", name: "Dip Hunter", icon: "radar", color: "#14b8a6", sub: "−30% wicks", scan: 664, size: 0.24 },
    { key: "whale", name: "Whale Tail", icon: "whale", color: "#8b5cf6", sub: "smart wallets", scan: 4, size: 0.2 },
  ];
  const COINS = ["$DEMOCAT", "$DEMOFROG", "$DEMODOG", "$DEMOAPE", "$DEMOWIF", "$DEMOBONK", "$DEMOPEPE", "$DEMOMOON"];
  const WHY = { sniper: "bought 38s after launch", momentum: "broke the 1h high", dip: "−34% wick, bids stepping in", whale: "copied a top wallet" };
  const iso = (t) => new Date(t).toISOString();
  const r = (a, b) => a + Math.random() * (b - a);

  function run(render) {
    const START = 2324;
    let cash = START, tick = 0, id = 1, evId = 1;
    const st = {}; AG.forEach((a) => (st[a.key] = { w: 0, l: 0, pnl: 0, pos: null }));
    const series = [[iso(Date.now()), START]], acts = [], evs = [];
    let streak = 0, trades = 0, wins = 0;
    const act = (agent, kind, title, subtitle, value) => { acts.push({ id: id++, ts: iso(Date.now()), agent, kind, title, subtitle, value }); if (acts.length > 30) acts.shift(); };

    function step() {
      tick++;
      AG.forEach((a) => {
        const s = st[a.key];
        if (!s.pos) {
          if (Math.random() < 0.18) {
            const sym = COINS[Math.floor(Math.random() * COINS.length)];
            const size = Math.round(cash * a.size * 100) / 100;
            s.pos = { symbol: sym, size_usd: size, size_sol: (size / 160).toFixed(1), series: [0], drift: r(0.004, 0.05), age: 0 };
            act(a.key, "bought", `Bought ${sym}`, `${a.name} · ${(size / 160).toFixed(1)} SOL · ${WHY[a.key]}`, `$${size.toFixed(2)}`);
            evs.unshift({ id: "d" + evId++, ts: iso(Date.now()), agent: a.key, kind: "bought", good: true, text: `${a.name} bought ${sym}`, value: `$${size.toFixed(0)}` });
          } else if (Math.random() < 0.08) {
            act(a.key, "skipped", `Skipped $DEMO${Math.floor(r(10, 99))}`, `${a.name} · ${["top 10 hold 61%", "dev sold", "LP not burned", "sellers lead"][Math.floor(r(0, 4))]}`, "skip");
          }
          return;
        }
        const p = s.pos; p.age++;
        const last = p.series[p.series.length - 1];
        p.series.push(Math.max(-0.012, last + p.drift * r(-0.6, 1.6)));
        const pct = p.series[p.series.length - 1];
        if (p.age > r(5, 12) || pct <= -0.01) {
          const pnl = Math.round(p.size_usd * (pct - 0.036) * 100) / 100;
          cash += pnl; s.pnl += pnl; trades++;
          if (pnl >= 0) { s.w++; wins++; streak++; } else { s.l++; streak = 0; }
          const reason = pct <= -0.01 ? "1% stop" : pct > 0.3 ? "target hit" : "trailing stop";
          act(a.key, pnl >= 0 ? "sold" : "stopped", `Sold ${p.symbol}`, `${a.name} · ${reason}`, `${pnl >= 0 ? "+" : "-"}$${Math.abs(pnl).toFixed(2)} · ${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(0)}%`);
          evs.unshift({ id: "d" + evId++, ts: iso(Date.now()), agent: a.key, kind: "sold", good: pnl >= 0,
            text: `${a.name} sold ${p.symbol} ${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(0)}% • held ${p.age * 2}s`, value: `${pnl >= 0 ? "+" : "-"}$${Math.abs(pnl).toFixed(0)}` });
          s.pos = null;
        }
      });
      if (evs.length > 8) evs.length = 8;
      let unreal = 0;
      const agents = AG.map((a) => {
        const s = st[a.key], p = s.pos;
        const u = p ? Math.round(p.size_usd * p.series[p.series.length - 1] * 100) / 100 : 0; unreal += u;
        return { key: a.key, name: a.name, icon: a.icon, color: a.color, sub: a.sub, enabled: true, state: p ? "in_trade" : "idle",
          scan_text: a.key === "whale" ? "Watching 4 wallets" : `Scanning ${a.scan + Math.floor(r(-20, 20))} pairs`,
          hb_age_s: Math.floor(r(1, 20)), stalled: false,
          live: { kind: "market", phase: "waiting", scanning: a.scan, candidates: Math.floor(r(1, 6)), checked: Math.floor(r(0, 4)), done_ts: iso(Date.now() - r(1, 50) * 1000),
            last: { symbol: "$DEMO" + Math.floor(r(10, 99)), verdict: "pass", reason: ["under the 1h high (-0.4%)", "sellers lead", "top 10 hold 61%", "no volume spike"][Math.floor(r(0, 4))], ts: iso(Date.now() - r(2, 40) * 1000) } },
          sleeve_usd: cash / 4, sleeve_used_usd: p ? p.size_usd : 0, wins: s.w, losses: s.l, pnl_usd: Math.round((s.pnl + u) * 100) / 100,
          positions: p ? [{ symbol: p.symbol, size_usd: p.size_usd, size_sol: p.size_sol, pnl_usd: u, pnl_pct: p.series[p.series.length - 1] * 100, series: p.series.slice(-40) }] : [] };
      });
      const value = Math.round((cash + unreal) * 100) / 100, mult = value / START;
      series.push([iso(Date.now()), value]); if (series.length > 160) series.shift();
      const nodes = [1.25, 1.5, 2, 3, 4, 5], next = nodes.find((n) => n > mult);
      render({
        demo_view: true, generated_at: iso(Date.now()), heartbeats: [{ agent: "main", status: "ok" }],
        desk4: {
          mode: "DEMO", label: "DEMO 4 agents", agents,
          equity: { start: START, value, profit: value - START, profit_pct: (value / START - 1) * 100, mult },
          stats: { trades, wins, win_pct: trades ? Math.round((wins / trades) * 100) : null, streak },
          goal: { x: 2, nodes, next, to_go: next ? next * START - value : 0, mult },
          ticker: [["$DEMOJUP", 0.42], ["$DEMOPUMP", 0.0052], ["$DEMOTRUMP", 2.11], ["$DEMOBONK", 0.0000041], ["$DEMOWIF", 0.235]].map(([s, p]) => ({ symbol: s, price: p * (1 + r(-0.01, 0.01)), ch24: r(-5, 40) })),
          events: evs.slice(), activity: acts.slice(), series: series.slice(),
        },
      });
    }
    step();
    setInterval(step, 1400);
  }
  window.FOMO_DEMO4 = { run };
})();
