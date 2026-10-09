import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownToLine, ArrowLeft, ArrowLeftRight, ArrowUpFromLine, BarChart3, CandlestickChart, Eye, EyeOff, HelpCircle, History, Home, ListOrdered, LogOut, Repeat, Settings, Shield, User, Wallet, X } from "lucide-react";
import { usePhone } from "@/components/mobile/PhoneFrame";
import { useAuth } from "@/context/AuthContext";
import { useTransactions, useWallet } from "@/hooks/useMarket";
import { useWalletDialogs } from "@/components/wallet/WalletDialogs";
import { ForgotForm, LoginForm, RegisterForm } from "@/components/auth/AuthForms";
import { CoinIcon, Logo } from "@/components/common/Brand";
import { Donut, donutData } from "@/components/common/Donut";
import { Empty, StatusBadge } from "@/components/common/Bits";
import { fmtAmount, fmtPct, fmtTime, fmtUsd, upDown } from "@/lib/format";
import { MOBILE_COIN_IMG } from "@/lib/assets";
import { cn } from "@/lib/utils";

function AuthScreen({ title, sub, children, back = "home", decor }) {
  const { go } = usePhone();
  return (
    <div className="px-5 pt-2 pb-6 relative min-h-[575px]">
      {decor && <img src={MOBILE_COIN_IMG} alt="" className="absolute bottom-0 right-0 w-40 h-48 object-cover opacity-50 rounded-tl-full" />}
      <button onClick={() => go(back)} className="text-gray-300" data-testid="m-auth-back"><ArrowLeft className="w-5 h-5" /></button>
      <Logo className="justify-center mt-2" />
      <h2 className="text-xl font-bold text-center mt-4">{title}</h2>
      <p className="text-[11px] text-gray-400 text-center mt-1 mb-6">{sub}</p>
      <div className="relative">{children}</div>
    </div>
  );
}

const nav = (go) => (to) => go({ "/login": "login", "/register": "signup", "/forgot-password": "forgot" }[to] || "home");

export function MLogin() {
  const { go } = usePhone();
  return <AuthScreen title="Welcome Back" sub="Login to your account"><LoginForm onNavigate={nav(go)} onDone={() => go("home")} /></AuthScreen>;
}

export function MSignup() {
  const { go } = usePhone();
  return <AuthScreen title="Create Account" sub="Join Bitlora Pro today" back="welcome"><RegisterForm onNavigate={nav(go)} onDone={() => go("wallet")} /></AuthScreen>;
}

export function MForgot() {
  const { go } = usePhone();
  return <AuthScreen title="Forgot Password" sub="Enter your email and we'll send you a reset link." back="login" decor><ForgotForm onNavigate={nav(go)} /></AuthScreen>;
}

export function MWallet() {
  const { go } = usePhone();
  const { user } = useAuth();
  const { data: w } = useWallet();
  const { data: txs = [] } = useTransactions();
  const [hide, setHide] = useState(false);
  const [tab, setTab] = useState("assets");
  const dialogs = useWalletDialogs();
  if (!user) return <div className="p-6 text-center" data-testid="m-wallet-guest"><Wallet className="w-10 h-10 mx-auto text-[#f59e0b]" /><div className="mt-3 text-sm">Log in to view your wallet</div><button onClick={() => go("login")} className="mt-4 btn-orange rounded-lg h-10 px-6 text-sm">Login</button></div>;
  const pie = donutData((w?.spot || []).map((a) => ({ name: a.asset, value: a.usd })));
  const mask = (v) => (hide ? "••••••" : v);
  return (
    <div className="px-4 pb-4" data-testid="m-wallet">
      <div className="flex justify-between items-center py-2"><div className="text-lg font-bold">Wallet</div><Settings className="w-4 h-4 text-gray-400" /></div>
      <div className="panel p-4 flex justify-between items-center">
        <div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1">Total Balance <button onClick={() => setHide(!hide)} data-testid="m-wallet-hide">{hide ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}</button></div>
          <div className="text-2xl font-bold font-num" data-testid="m-wallet-total">{mask(fmtUsd(w?.total_usd))}</div>
          <div className="text-[10px] font-num text-gray-400">≈ {mask(fmtAmount(w?.total_btc, 5))} BTC <span className={upDown(w?.change_24h_pct || 0)}>{fmtPct(w?.change_24h_pct)}</span></div>
        </div>
        <Donut data={pie} size={64} thickness={9} />
      </div>
      <div className="grid grid-cols-4 gap-2 my-3">
        {[[ArrowDownToLine, "Deposit", () => dialogs.open("deposit")], [ArrowUpFromLine, "Withdraw", () => dialogs.open("withdraw")], [ArrowLeftRight, "Transfer", () => dialogs.open("transfer")], [History, "History", () => setTab("history")]].map(([I, l, fn]) => (
          <button key={l} data-testid={`m-wallet-${l.toLowerCase()}`} onClick={fn} className="flex flex-col items-center gap-1 text-[10px] text-gray-300"><span className="w-10 h-10 rounded-xl bg-[#111827] border border-[#1f2937] flex items-center justify-center"><I className="w-4 h-4 text-[#60a5fa]" /></span>{l}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 bg-[#111827] rounded-lg p-1 border border-[#1f2937] text-xs">
        {[["assets", "Assets"], ["futures", "Futures"], ["history", "History"]].map(([k, l]) => <button key={k} data-testid={`m-wallet-tab-${k}`} onClick={() => setTab(k)} className={cn("h-7 rounded-md", tab === k ? "bg-[#1f2937] text-white" : "text-gray-400")}>{l}</button>)}
      </div>
      {tab === "assets" && (w?.spot || []).map((a) => (
        <div key={a.asset} className="flex justify-between items-center py-2.5 border-b border-[#151d2e]">
          <span className="flex items-center gap-2"><CoinIcon symbol={a.asset} className="w-7 h-7" /><span><div className="text-xs font-semibold">{a.asset}</div><div className="text-[10px] text-gray-500">{a.name}</div></span></span>
          <span className="text-right font-num"><div className="text-xs">{mask(fmtAmount(a.total, 6))}</div><div className="text-[10px] text-gray-500">{mask(fmtUsd(a.usd))}</div></span>
        </div>
      ))}
      {tab === "futures" && (
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          {[["Equity", w?.futures.equity], ["Available", w?.futures.free], ["Position Margin", w?.futures.locked], ["Unrealized PnL", w?.futures.unrealized_pnl]].map(([l, v]) => <div key={l} className="panel p-3"><div className="text-[10px] text-gray-500">{l}</div><div className="font-num">{mask(fmtUsd(v))}</div></div>)}
        </div>
      )}
      {tab === "history" && (txs.length ? txs.slice(0, 15).map((t) => (
        <div key={t.id} className="flex justify-between items-center py-2 border-b border-[#151d2e] text-xs">
          <div><div className="capitalize">{t.type} {t.asset}</div><div className="text-[10px] text-gray-500 font-num">{fmtTime(t.created_at)}</div></div>
          <div className="text-right"><div className="font-num">{fmtAmount(t.amount)}</div><StatusBadge status={t.status} className="text-[9px]" /></div>
        </div>
      )) : <Empty />)}
      {dialogs.node}
    </div>
  );
}

export function MMenu() {
  const { go } = usePhone();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = [[Home, "Home", () => go("home")], [BarChart3, "Market", () => go("market")], [Repeat, "Trade", () => go("trade")], [CandlestickChart, "Futures", () => go("futures")], [Wallet, "Wallet", () => go("wallet")]];
  const items2 = [[ListOrdered, "Orders", () => navigate("/account/orders")], [User, "Profile", () => navigate("/account")], [Shield, "Security", () => navigate("/account/security")], [HelpCircle, "Support", () => navigate("/account/security")]];
  const Row = ([I, l, fn]) => <button key={l} data-testid={`m-menu-${l.toLowerCase()}`} onClick={fn} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-200 hover:bg-[#111827]"><I className="w-4 h-4 text-gray-400" />{l}</button>;
  return (
    <div className="px-4 pb-4 min-h-[575px]" data-testid="m-menu">
      <div className="flex justify-between items-center py-2"><Logo /><button onClick={() => go("home")} data-testid="m-menu-close"><X className="w-5 h-5 text-gray-400" /></button></div>
      {user ? (
        <div className="flex items-center gap-3 py-3"><span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#f59e0b] to-[#b45309] flex items-center justify-center font-bold text-[#0b0f19]">{user.name[0]}</span><div><div className="text-sm font-semibold">{user.name}</div><div className="text-[11px] text-gray-500">{user.email}</div></div></div>
      ) : <button onClick={() => go("login")} className="w-full my-3 h-10 btn-orange rounded-lg text-sm" data-testid="m-menu-login">Login / Sign Up</button>}
      <div className="border-t border-[#1a2232] pt-2">{items.map(Row)}</div>
      <div className="border-t border-[#1a2232] pt-2 mt-2">{items2.map(Row)}</div>
      {user && <button data-testid="m-menu-logout" onClick={async () => { await logout(); go("welcome"); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-[#ef4444]"><LogOut className="w-4 h-4" />Logout</button>}
    </div>
  );
}
