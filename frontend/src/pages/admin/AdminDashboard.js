import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, BarChart2, CircleDollarSign, Flame, UserCheck, Users } from "lucide-react";
import { Kpi, PageHead, useAdmin } from "@/components/layout/AdminLayout";
import { StatusBadge, Empty } from "@/components/common/Bits";
import { Change } from "@/components/common/Bits";
import { CoinIcon } from "@/components/common/Brand";
import { Table } from "@/components/trade/Tables";
import { fmtCompact, fmtPrice, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const RANGES = [[7, "7D"], [30, "30D"], [90, "3M"], [365, "1Y"]];
const tooltipStyle = { background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 };

export function RangeTabs({ value, onChange, testid = "range" }) {
  return <div className="flex gap-1">{RANGES.map(([d, l]) => <button key={d} data-testid={`${testid}-${l}`} onClick={() => onChange(d)} className={cn("tab-pill font-num", value === d && "tab-pill-active text-[#f59e0b]")}>{l}</button>)}</div>;
}

function VolumeChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260} initialDimension={{ width: 600, height: 260 }}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f59e0b" stopOpacity={0.45} /><stop offset="1" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
          <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b82f6" stopOpacity={0.45} /><stop offset="1" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid stroke="#1f2937" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => fmtCompact(v)} axisLine={false} tickLine={false} width={60} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtCompact(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="spot" name="Spot Volume" stroke="#f59e0b" fill="url(#gs)" strokeWidth={2} />
        <Area type="monotone" dataKey="futures" name="Futures Volume" stroke="#3b82f6" fill="url(#gf)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function UsersChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260} initialDimension={{ width: 600, height: 260 }}>
      <BarChart data={data}>
        <CartesianGrid stroke="#1f2937" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#1f293755" }} />
        <Bar dataKey="new_users" name="New Users" fill="#3b82f6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopMarkets() {
  const [m, setM] = useState("spot");
  const { data = [] } = useAdmin("top", "/admin/top-markets", { market: m });
  return (
    <div className="panel p-5">
      <div className="flex justify-between items-center mb-3"><div className="font-semibold">Top Markets by Volume</div>
        <div className="flex gap-1">{["spot", "futures"].map((k) => <button key={k} data-testid={`top-markets-${k}`} onClick={() => setM(k)} className={cn("tab-pill capitalize", m === k && "bg-[#f59e0b] text-[#0b0f19]")}>{k}</button>)}</div></div>
      {data.length ? data.slice(0, 6).map((r, i) => (
        <div key={r.symbol} className="grid grid-cols-[20px_1fr_auto_64px_80px] gap-3 items-center py-2 text-sm border-b border-[#1a2232] last:border-0">
          <span className="text-gray-500 font-num">{i + 1}</span>
          <span className="flex items-center gap-2"><CoinIcon symbol={r.symbol.replace("USDT", "")} className="w-5 h-5" />{r.symbol.replace("USDT", "/USDT")}</span>
          <span className="font-num text-xs">{fmtPrice(r.price)}</span><Change value={r.change} className="text-xs" />
          <span className="font-num text-xs text-right">{fmtCompact(r.platform_volume)}</span>
        </div>
      )) : <Empty text="No trading activity yet" />}
    </div>
  );
}

function Health() {
  const { data = [] } = useAdmin("health", "/admin/health", undefined, 8000);
  return (
    <div className="panel p-5" data-testid="system-health">
      <div className="font-semibold mb-3">System Health</div>
      {data.map((s) => (
        <div key={s.name} className="flex items-center justify-between py-2 border-b border-[#1a2232] last:border-0">
          <div><div className="text-sm">{s.name}</div><div className="text-[11px] text-gray-500">{s.detail}{s.latency_ms != null && ` · ${s.latency_ms}ms`}</div></div>
          <span className="flex items-center gap-2 text-xs capitalize"><span className={cn("w-2 h-2 rounded-full", s.status === "healthy" ? "bg-[#10b981]" : s.status === "degraded" ? "bg-[#f59e0b]" : "bg-[#ef4444]")} /><span className={s.status === "healthy" ? "text-up" : s.status === "degraded" ? "text-[#f59e0b]" : "text-down"}>{s.status}</span></span>
        </div>
      ))}
    </div>
  );
}

function Activities() {
  const { data = [] } = useAdmin("acts", "/admin/activities", { limit: 8 }, 8000);
  return (
    <div className="panel p-5">
      <div className="font-semibold mb-3">Recent Security Logs</div>
      {data.length ? (
        <Table testid="admin-recent-activities" head={["Time", "Type", "Details", "Status"]}>
          {data.map((a) => (
            <tr key={a.id} className="border-b border-[#151d2e]">
              <td className="td text-xs font-num text-gray-400">{fmtTime(a.created_at, false)}</td><td className="td text-xs">{a.type}</td>
              <td className="td text-xs text-gray-400 max-w-[180px] truncate">{a.email} {a.details}</td><td className="td"><StatusBadge status={a.status} /></td>
            </tr>
          ))}
        </Table>
      ) : <Empty />}
    </div>
  );
}

export default function AdminDashboard() {
  const [days, setDays] = useState(30);
  const { data: s } = useAdmin("stats", "/admin/stats", { days }, 15000);
  const { data: vol = [] } = useAdmin("volume", "/admin/volume", { days }, 30000);
  return (
    <div data-testid="admin-dashboard">
      <PageHead title="Dashboard" sub="Welcome back, Admin. Here's what's happening on Bitlora Pro today."><RangeTabs value={days} onChange={setDays} testid="dashboard-range" /></PageHead>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi testid="kpi-total-users" icon={Users} label="Total Users" value={s?.total_users?.toLocaleString() ?? "—"} change={s?.users_change} />
        <Kpi testid="kpi-active-traders" icon={UserCheck} label="Active Traders" value={s?.active_traders?.toLocaleString() ?? "—"} change={s?.active_change} tone="green" />
        <Kpi testid="kpi-deposits" icon={ArrowDownToLine} label="Total Deposits" value={fmtCompact(s?.deposits)} change={s?.deposits_change} />
        <Kpi testid="kpi-withdrawals" icon={ArrowUpFromLine} label="Total Withdrawals" value={fmtCompact(s?.withdrawals)} change={s?.withdrawals_change} tone="blue" />
        <Kpi testid="kpi-spot-volume" icon={BarChart2} label="Spot Volume" value={fmtCompact(s?.spot_volume)} change={s?.spot_volume_change} />
        <Kpi testid="kpi-futures-volume" icon={Flame} label="Futures Volume" value={fmtCompact(s?.futures_volume)} change={s?.futures_volume_change} />
        <Kpi testid="kpi-revenue" icon={CircleDollarSign} label="Total Revenue (fees)" value={fmtCompact(s?.revenue)} change={s?.revenue_change} tone="green" />
        <Kpi testid="kpi-alerts" icon={AlertTriangle} label="Active Alerts" value={s?.alerts?.total ?? "—"} sub={s && `${s.alerts.high} High · ${s.alerts.medium} Medium · ${s.kyc_pending} KYC · ${s.pending_withdrawals} withdrawals`} tone="red" />
      </div>
      <div className="grid xl:grid-cols-[1.6fr_1fr] gap-4 mt-4">
        <div className="panel p-5"><div className="font-semibold mb-2">Trading Volume (USD) — Spot vs Futures</div><VolumeChart data={vol} /></div>
        <div className="panel p-5"><div className="font-semibold mb-2">User Growth</div><UsersChart data={vol} /></div>
      </div>
      <div className="grid xl:grid-cols-3 gap-4 mt-4"><Activities /><TopMarkets /><Health /></div>
    </div>
  );
}
