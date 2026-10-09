import { useState } from "react";
import { Activity, AlertTriangle, Layers, Skull } from "lucide-react";
import { Kpi, PageHead, useAdmin } from "@/components/layout/AdminLayout";
import { Empty, StatusBadge } from "@/components/common/Bits";
import { Table } from "@/components/trade/Tables";
import { api } from "@/lib/api";
import { fmtAmount, fmtCompact, fmtPct, fmtPrice, fmtTime, upDown } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePatch } from "./AdminUsers";

function Positions({ rows }) {
  if (!rows.length) return <Empty text="No open positions" />;
  return (
    <Table testid="risk-positions" head={["User", "Pair", "Side", "Size", "Entry", "Mark", "Liq. Price", "Margin Ratio", "PnL (ROE)", "Risk"]}>
      {rows.map((p) => (
        <tr key={p.id} className="row-hover border-b border-[#151d2e]">
          <td className="td text-xs">{p.email}</td><td className="td">{p.symbol}</td>
          <td className={cn("td capitalize", p.side === "long" ? "text-up" : "text-down")}>{p.side} {p.leverage}x</td>
          <td className="td font-num">{fmtAmount(p.size, 4)}</td><td className="td font-num">{fmtPrice(p.entry_price)}</td><td className="td font-num">{fmtPrice(p.mark_price)}</td>
          <td className="td font-num text-[#f59e0b]">{fmtPrice(p.liq_price)}</td><td className="td font-num">{p.margin_ratio.toFixed(2)}%</td>
          <td className={cn("td font-num", upDown(p.unrealized_pnl))}>{fmtPrice(p.unrealized_pnl)} ({fmtPct(p.roe)})</td><td className="td"><StatusBadge status={p.risk} /></td>
        </tr>
      ))}
    </Table>
  );
}

function Liquidations({ rows }) {
  if (!rows.length) return <Empty text="No liquidations recorded" />;
  return (
    <Table testid="risk-liquidations" head={["Time", "User", "Pair", "Side", "Size", "Entry", "Liq. Price", "Notional", "Loss"]}>
      {rows.map((l) => (
        <tr key={l.id} className="row-hover border-b border-[#151d2e]">
          <td className="td text-xs font-num text-gray-400">{fmtTime(l.created_at)}</td><td className="td text-xs">{l.email}</td><td className="td">{l.symbol}</td>
          <td className={cn("td capitalize", l.side === "long" ? "text-up" : "text-down")}>{l.side} {l.leverage}x</td><td className="td font-num">{fmtAmount(l.size, 4)}</td>
          <td className="td font-num">{fmtPrice(l.entry_price)}</td><td className="td font-num">{fmtPrice(l.liq_price)}</td><td className="td font-num">{fmtCompact(l.notional)}</td><td className="td font-num text-down">{fmtPrice(l.loss)}</td>
        </tr>
      ))}
    </Table>
  );
}

function Alerts({ rows }) {
  const patch = usePatch();
  if (!rows.length) return <Empty text="No risk alerts" />;
  return (
    <Table testid="risk-alerts" head={["Time", "Level", "Type", "Message", "Status", ""]}>
      {rows.map((a) => (
        <tr key={a.id} className="row-hover border-b border-[#151d2e]">
          <td className="td text-xs font-num text-gray-400">{fmtTime(a.created_at)}</td><td className="td"><StatusBadge status={a.level} /></td><td className="td text-sm">{a.type}</td>
          <td className="td text-xs text-gray-300 max-w-[380px] truncate">{a.message}</td><td className="td"><StatusBadge status={a.status} /></td>
          <td className="td">{a.status === "open" && <button data-testid={`alert-resolve-${a.id}`} onClick={() => patch(() => api.post(`/admin/risk/alerts/${a.id}/resolve`), "Alert resolved")} className="text-xs btn-ghost rounded px-3 py-1">Resolve</button>}</td>
        </tr>
      ))}
    </Table>
  );
}

function Adl({ rows }) {
  if (!rows.length) return <Empty text="ADL queue is empty (no profitable positions)" />;
  return (
    <Table testid="risk-adl" head={["Rank", "User", "Pair", "Side", "Leverage", "ROE"]}>
      {rows.map((r) => (
        <tr key={r.id} className="row-hover border-b border-[#151d2e]">
          <td className="td font-num text-[#f59e0b]">#{r.rank}</td><td className="td text-xs">{r.email}</td><td className="td">{r.symbol}</td>
          <td className={cn("td capitalize", r.side === "long" ? "text-up" : "text-down")}>{r.side}</td><td className="td font-num">{r.leverage}x</td><td className="td font-num text-up">{fmtPct(r.roe)}</td>
        </tr>
      ))}
    </Table>
  );
}

export default function AdminRisk() {
  const [tab, setTab] = useState("positions");
  const { data: r } = useAdmin("risk", "/admin/risk", undefined, 5000);
  const alerts = r?.alerts || [];
  const high = alerts.filter((a) => a.level === "high" && a.status !== "resolved").length;
  const longPct = r && r.open_interest_usd ? (r.long_usd / r.open_interest_usd) * 100 : 50;
  const tabs = [["positions", "Open Positions", <Positions rows={r?.positions || []} />], ["liquidations", "Liquidation History", <Liquidations rows={r?.liquidations || []} />], ["alerts", "Risk Alerts", <Alerts rows={alerts} />], ["adl", "ADL Queue", <Adl rows={r?.adl_queue || []} />]];
  return (
    <div data-testid="admin-risk">
      <PageHead title="Futures & Risk Monitoring" sub="Open interest, margin health, liquidation logs and auto-deleverage ranking — marked to live prices every 5s." />
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi testid="risk-open-interest" icon={Layers} label="Total Open Interest" value={fmtCompact(r?.open_interest_usd)} sub={r && `Unrealized PnL ${fmtCompact(r.unrealized_pnl)}`} />
        <Kpi testid="risk-positions-count" icon={Activity} label="Total Positions" value={r?.positions_count ?? "—"} tone="blue" />
        <Kpi testid="risk-liquidations-24h" icon={Skull} label="Liquidations (24h)" value={fmtCompact(r?.liquidations_24h_usd)} tone="red" />
        <Kpi testid="risk-alerts-count" icon={AlertTriangle} label="Risk Alerts" value={alerts.filter((a) => a.status !== "resolved").length} sub={`${high} High`} tone="red" />
      </div>
      <div className="panel p-5 mt-4">
        <div className="flex justify-between text-xs mb-2"><span className="text-up font-num">Long {fmtCompact(r?.long_usd)} ({longPct.toFixed(1)}%)</span><span className="text-gray-400">Long / Short Ratio</span><span className="text-down font-num">Short {fmtCompact(r?.short_usd)} ({(100 - longPct).toFixed(1)}%)</span></div>
        <div className="h-2 rounded-full bg-[#ef4444] overflow-hidden"><div className="h-full bg-[#10b981]" style={{ width: `${longPct}%`, transition: "width .6s" }} /></div>
      </div>
      <div className="panel mt-4">
        <div className="flex gap-1 px-4 pt-3 border-b border-[#1f2937]">
          {tabs.map(([k, l]) => <button key={k} data-testid={`risk-tab-${k}`} onClick={() => setTab(k)} className={cn("px-3 py-2 text-sm border-b-2 -mb-px", tab === k ? "border-[#f59e0b] text-white" : "border-transparent text-gray-400")}>{l}</button>)}
        </div>
        {tabs.find((t) => t[0] === tab)[2]}
      </div>
    </div>
  );
}
