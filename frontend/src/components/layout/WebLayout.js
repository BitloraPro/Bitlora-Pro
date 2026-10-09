import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, Download, LogOut, Search, Shield, Smartphone, User, Wallet } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/common/Brand";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BACKEND_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [["/", "Home"], ["/markets", "Market"], ["/trade/BTCUSDT", "Trade"], ["/futures/BTCUSDT", "Futures"], ["/account/assets", "Wallet"], ["/mobile", "Mobile App"]];

function UserMenu() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger data-testid="user-menu-trigger" className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-[#1f2937] hover:border-[#374151]">
        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#f59e0b] to-[#b45309] flex items-center justify-center text-xs font-bold text-[#0b0f19]">{user.name?.[0]}</span>
        <span className="text-sm hidden lg:block">{user.name}</span><ChevronDown className="w-3 h-3 text-gray-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-[#111827] border-[#1f2937] text-gray-200 w-52">
        <div className="px-2 py-2 text-xs text-gray-400">{user.email}<div className="font-num">UID {user.uid}</div></div>
        <DropdownMenuSeparator className="bg-[#1f2937]" />
        <DropdownMenuItem data-testid="menu-account" onClick={() => nav("/account")}><User className="w-4 h-4 mr-2" />Account</DropdownMenuItem>
        <DropdownMenuItem data-testid="menu-assets" onClick={() => nav("/account/assets")}><Wallet className="w-4 h-4 mr-2" />Assets</DropdownMenuItem>
        <DropdownMenuItem data-testid="menu-security" onClick={() => nav("/account/security")}><Shield className="w-4 h-4 mr-2" />Security</DropdownMenuItem>
        {user.role === "admin" && <DropdownMenuItem data-testid="menu-admin" onClick={() => nav("/admin")}><Shield className="w-4 h-4 mr-2 text-[#f59e0b]" />Admin Panel</DropdownMenuItem>}
        <DropdownMenuSeparator className="bg-[#1f2937]" />
        <DropdownMenuItem data-testid="logout-button" onClick={async () => { await logout(); nav("/"); }} className="text-[#ef4444]"><LogOut className="w-4 h-4 mr-2" />Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavSearch() {
  const [q, setQ] = useState("");
  const nav = useNavigate();
  return (
    <form onSubmit={(e) => { e.preventDefault(); nav(`/markets?q=${encodeURIComponent(q)}`); }} className="hidden xl:flex items-center input-dark h-9 px-3 w-56">
      <Search className="w-4 h-4 text-gray-500" />
      <input data-testid="nav-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search coins, pairs…" className="bg-transparent outline-none text-sm ml-2 w-full" />
    </form>
  );
}

export function WebNav() {
  const { user } = useAuth();
  return (
    <header className="h-14 border-b border-[#1a2232] bg-[#0b0f19]/90 backdrop-blur-xl sticky top-0 z-40">
      <div className="h-full px-4 lg:px-6 flex items-center gap-6">
        <Link to="/" data-testid="nav-logo"><Logo /></Link>
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"} data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
              className={({ isActive }) => cn("px-3 py-1.5 text-sm rounded-md text-gray-400 hover:text-white flex items-center gap-1", isActive && "text-white bg-[#151d2e]")}>
              {label === "Mobile App" && <Smartphone className="w-3.5 h-3.5" />}{label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <NavSearch />
          <a href={`${BACKEND_URL}/api/download/source`} data-testid="nav-download-source" className="hidden lg:flex items-center gap-1 text-xs text-gray-400 hover:text-[#f59e0b]"><Download className="w-4 h-4" />Source</a>
          {user ? (
            <>
              <Link to="/account/security" className="text-gray-400 hover:text-white"><Bell className="w-4 h-4" /></Link>
              <UserMenu />
            </>
          ) : user === false ? (
            <>
              <Link to="/login" data-testid="nav-login" className="text-sm px-4 h-8 flex items-center rounded-md btn-ghost">Log In</Link>
              <Link to="/register" data-testid="nav-signup" className="text-sm px-4 h-8 flex items-center rounded-md btn-orange">Sign Up</Link>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export default function WebLayout() {
  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100">
      <WebNav />
      <Outlet />
    </div>
  );
}
