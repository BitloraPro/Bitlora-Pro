import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { Activity, ArrowLeftRight, BarChart3, Bell, LayoutDashboard, LogOut, Search, Settings, ShieldAlert, Users, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/common/Brand";
import { get } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  ["/admin", "Dashboard", LayoutDashboard], ["/admin/users", "Users & KYC", Users], ["/admin/treasury", "Wallet & Treasury", Wallet],
  ["/admin/risk", "Futures & Risk", Activity], ["/admin/security", "Security & Compliance", ShieldAlert], ["/admin/settings", "System Configuration", Settings],
];

export const useAdmin = (key, url, params, ms = 10000) => useQuery({ queryKey: ["admin", key, params], queryFn: () => get(url, params), refetchInterval: ms, placeholderData: (p) => p });

export function PageHead({ title, sub, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div><h1 className="text-3xl font-bold tracking-tight">{title}</h1><p className="text-sm text-gray-400 mt-1">{sub}</p></div>
      <div className="flex gap-2 items-center">{children}</div>
    </div>
  );
}

export function Kpi({ icon: I, label, value, change, sub, tone = "orange", testid }) {
  const tones = { orange: "bg-[#f59e0b1a] text-[#f59e0b]", green: "bg-up text-up", red: "bg-down text-down", blue: "bg-[#3b82f61a] text-[#60a5fa]" };
  return (
    <div className="panel p-5 flex gap-4 items-center" data-testid={testid}>
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", tones[tone])}><I className="w-5 h-5" /></div>
      <div className="min-w-0">
        <div className="text-xs text-gray-400">{label}</div>
        <div className="text-2xl font-bold font-num truncate">{value}</div>
        {change != null && <div className={cn("text-[11px] font-num", change >= 0 ? "text-up" : "text-down")}>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% <span className="text-gray-500">vs prev. period</span></div>}
        {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
      </div>
    </div>
  );
}

function Header() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const { data: s } = useAdmin("stats", "/admin/stats", { days: 30 }, 15000);
  return (
    <header className="h-16 border-b border-[#1a2232] flex items-center gap-4 px-6 sticky top-0 bg-[#0b0f19]/90 backdrop-blur-xl z-30">
      <form onSubmit={(e) => { e.preventDefault(); nav(`/admin/users?q=${encodeURIComponent(q)}`); }} className="flex items-center input-dark h-10 px-3 w-96 max-w-full">
        <Search className="w-4 h-4 text-gray-500" /><input data-testid="admin-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users by email, name or UID…" className="bg-transparent outline-none ml-2 text-sm w-full" />
      </form>
      <div className="ml-auto flex items-center gap-4">
        <Link to="/" data-testid="admin-live-exchange" className="flex items-center gap-2 text-xs border border-[#f59e0b66] text-[#f59e0b] rounded-lg px-3 h-9"><ArrowLeftRight className="w-4 h-4" />Live Exchange</Link>
        <Link to="/admin/risk" className="relative text-gray-400" data-testid="admin-alerts-bell"><Bell className="w-5 h-5" />{s?.alerts?.total > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#ef4444] text-[9px] text-white flex items-center justify-center">{s.alerts.total}</span>}</Link>
        <div className="flex items-center gap-2"><span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#f59e0b] to-[#b45309] flex items-center justify-center font-bold text-[#0b0f19]">{user.name[0]}</span><div className="text-xs leading-tight"><div className="font-semibold">{user.name}</div><div className="text-gray-500">Super Admin</div></div></div>
        <button data-testid="admin-logout" onClick={async () => { await logout(); nav("/login"); }} className="text-gray-500 hover:text-[#ef4444]"><LogOut className="w-4 h-4" /></button>
      </div>
    </header>
  );
}

export default function AdminLayout() {
  const { user } = useAuth();
  if (user === null) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <div className="min-h-screen flex items-center justify-center text-gray-400" data-testid="admin-forbidden">Admin access required. <Link to="/" className="text-[#f59e0b] ml-2">Back to exchange</Link></div>;
  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex" data-testid="admin-layout">
      <aside className="w-64 shrink-0 border-r border-[#1a2232] h-screen sticky top-0 flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-[#1a2232]"><Logo sub="Admin Panel" /></div>
        <nav className="p-3 space-y-1 flex-1">
          {NAV.map(([to, l, I]) => (
            <NavLink key={to} to={to} end={to === "/admin"} data-testid={`admin-nav-${l.split(" ")[0].toLowerCase()}`}
              className={({ isActive }) => cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-[#111827]", isActive && "bg-[#f59e0b] text-[#0b0f19] font-semibold hover:bg-[#f59e0b] hover:text-[#0b0f19]")}>
              <I className="w-4 h-4" />{l}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 m-3 panel text-xs text-gray-400"><BarChart3 className="w-4 h-4 text-[#f59e0b] mb-2" />Powerful tools. Real-time insights. Every figure is computed live from the exchange ledger.</div>
      </aside>
      <div className="flex-1 min-w-0"><Header /><main className="p-6"><Outlet /></main></div>
    </div>
  );
}
