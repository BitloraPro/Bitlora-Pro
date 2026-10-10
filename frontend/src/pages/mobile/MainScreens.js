import { useState } from "react";
import { ArrowRight, Bell, Menu, Search } from "lucide-react";
import { usePhone } from "@/components/mobile/PhoneFrame";
import { useAuth } from "@/context/AuthContext";
import { useSparklines, useTickers, useWallet } from "@/hooks/useMarket";
import { CoinIcon, Logo } from "@/components/common/Brand";
import { Change, Sparkline } from "@/components/common/Bits";
import { useWalletDialogs } from "@/components/wallet/WalletDialogs";
import { fmtCompact, fmtPrice, fmtUsd } from "@/lib/format";
import { MOBILE_COIN_IMG } from "@/lib/assets";
import { cn } from "@/lib/utils";

export function MHeader({ title }) {
  const { go } = usePhone();
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <button onClick={() => go("menu")} data-testid="m-open-menu" className="flex items-center gap-2">{title || <Logo />}</button>
      <div className="flex gap-3 text-gray-300"><button onClick={() => go("market")}><Search className="w-[18px] h-[18px]" /></button><Bell className="w-[18px] h-[18px]" /><button onClick={() => go("menu")}><Menu className="w-[18px] h-[18px]" /></button></div>
    </div>
  );
}

export function Welcome() {
  const { go } = usePhone();
  const { user } = useAuth();
  return (
    <div className="relative h-[575px] flex flex-col px-6 pt-4 pb-8" data-testid="m-welcome">
      <img src={MOBILE_COIN_IMG} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0f19] via-transparent to-[#0b0f19]" />
      <div className="relative text-center">
        <Logo className="justify-center" size="text-2xl" />
        <h1 className="text-[26px] font-bold leading-tight mt-5">A Smarter Way<br />to Trade Crypto</h1>
        <p className="text-xs text-gray-300 mt-2">Global markets. Powerful tools.<br />A brighter tomorrow.</p>
      </div>
      <div className="relative mt-auto">
        <div className="flex justify-center gap-1.5 mb-5"><span className="w-5 h-1.5 rounded-full bg-[#f59e0b]" />{[1, 2, 3].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-500" />)}</div>
        <button data-testid="m-get-started" onClick={() => go(user ? "home" : "signup")} className="w-full h-12 rounded-2xl btn-orange flex items-center justify-center gap-2 glow-orange">Get Started <ArrowRight className="w-4 h-4" /></button>
        <div className="text-center text-[11px] text-gray-400 mt-4 tracking-wide">Trade · Invest · Build</div>
      </div>
    </div>
  );
}

function MiniCard({ t, spark, onClick }) {
  return (
    <button onClick={onClick} className="panel p-2.5 text-left" data-testid={`m-top-card-${t.base}`}>
      <CoinIcon symbol={t.base} className="w-6 h-6" />
      <div className="text-xs font-semibold mt-1.5">{t.base}</div>
      <div className="font-num text-[11px]">${fmtPrice(t.price)}</div>
      <Change value={t.change} className="text-[10px]" />
      <Sparkline data={spark} width={74} height={18} className="mt-1" />
    </button>
  );
}

export function MHome() {
  const { go } = usePhone();
  const { user } = useAuth();
  const { data = [] } = useTickers();
  const { data: spark = {} } = useSparklines();
  const { data: w } = useWallet();
  const dialogs = useWalletDialogs();
  const top = data.slice(0, 9);
  return (
    <div className="pb-4" data-testid="m-home">
      <MHeader />
      <div className="px-4 space-y-3">
        {user ? (
          <div className="panel p-3"><div className="text-[11px] text-gray-400">Hi {user.name.split(" ")[0]}, total balance</div><div className="text-xl font-bold font-num" data-testid="m-home-balance">{fmtUsd(w?.total_usd)}</div></div>
        ) : (
          <div className="grid grid-cols-2 gap-2"><button data-testid="m-home-login" onClick={() => go("login")} className="h-9 rounded-lg btn-ghost text-sm">Login</button><button data-testid="m-home-signup" onClick={() => go("signup")} className="h-9 rounded-lg btn-orange text-sm">Sign Up</button></div>
        )}
        <div className="relative rounded-xl overflow-hidden h-28 panel">
          <img src={MOBILE_COIN_IMG} alt="" className="absolute right-0 top-0 h-full w-1/2 object-cover opacity-80" />
          <div className="relative p-3"><div className="text-base font-bold leading-tight">Trade Global<br />Trade Smarter</div><div className="text-[10px] text-gray-400 mt-1.5 max-w-[150px]">Access {data.length}+ cryptocurrencies with low fees and live order books.</div></div>
        </div>
        {user && (
        <div className="grid grid-cols-2 gap-2">
          <button data-testid="m-home-deposit" onClick={() => (user ? dialogs.open("deposit") : go("login"))} className="h-12 rounded-xl bg-[#1d4ed8] text-white text-left px-3"><div className="text-xs font-semibold">Deposit</div><div className="text-[9px] opacity-80">Fund your account</div></button>
          <button data-testid="m-home-withdraw" onClick={() => (user ? dialogs.open("withdraw") : go("login"))} className="h-12 rounded-xl bg-[#b45309] text-white text-left px-3"><div className="text-xs font-semibold">Withdraw</div><div className="text-[9px] opacity-80">Withdraw anytime</div></button>
        </div>
        )}
        <div className="flex justify-between items-center"><div className="text-sm font-semibold">Top 9 Markets</div><button onClick={() => go("market")} className="text-[11px] text-gray-400">View All →</button></div>
        <div className="grid grid-cols-3 gap-2">{top.slice(0, 3).map((t) => <MiniCard key={t.symbol} t={t} spark={spark[t.symbol]} onClick={() => go("trade", t.symbol)} />)}</div>
        <div>
          {top.slice(3).map((t, i) => (
            <button key={t.symbol} onClick={() => go("trade", t.symbol)} className="w-full grid grid-cols-[16px_20px_1fr_auto_52px] gap-2 items-center py-1.5 text-xs">
              <span className="text-gray-500 font-num">{i + 4}</span><CoinIcon symbol={t.base} className="w-4 h-4" /><span className="text-left">{t.base}</span>
              <span className="font-num">${fmtPrice(t.price)}</span><Change value={t.change} className="text-[10px] text-right" />
            </button>
          ))}
        </div>
      </div>
      {dialogs.node}
    </div>
  );
}

const MTABS = [["spot", "Spot"], ["future", "Future"], ["meme", "Meme"], ["gainers", "Gainers"]];

export function MMarket() {
  const { go } = usePhone();
  const [tab, setTab] = useState("spot");
  const [q, setQ] = useState("");
  const { data = [] } = useTickers();
  const { data: spark = {} } = useSparklines();
  let rows = data.filter((t) => t.base.toLowerCase().includes(q.toLowerCase()));
  if (tab === "future") rows = rows.filter((t) => t.futures);
  if (tab === "meme") rows = rows.filter((t) => t.categories.includes("meme"));
  if (tab === "gainers") rows = [...rows].sort((a, b) => b.change - a.change);
  return (
    <div data-testid="m-market">
      <MHeader />
      <div className="px-4">
        <div className="grid grid-cols-4 bg-[#111827] rounded-lg p-1 border border-[#1f2937]">
          {MTABS.map(([k, l]) => <button key={k} data-testid={`m-market-tab-${k}`} onClick={() => setTab(k)} className={cn("h-7 rounded-md text-xs", tab === k ? "bg-[#1f2937] text-white font-semibold" : "text-gray-400")}>{l}</button>)}
        </div>
        <label className="flex items-center input-dark h-8 px-3 mt-2"><Search className="w-3.5 h-3.5 text-gray-500" /><input data-testid="m-market-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search coin" className="bg-transparent outline-none ml-2 text-xs w-full" /></label>
        <div className="grid grid-cols-[1fr_72px_auto] text-[10px] text-gray-500 py-2 mt-1"><span># Coin</span><span>Last 24h</span><span className="text-right">Price / 24h</span></div>
        {rows.map((t, i) => (
          <button key={t.symbol} data-testid={`m-market-row-${t.base}`} onClick={() => go(tab === "future" ? "futures" : "trade", t.symbol)} className="w-full grid grid-cols-[1fr_72px_auto] items-center py-2 border-b border-[#151d2e] text-left">
            <span className="flex items-center gap-2"><span className="text-[10px] text-gray-500 w-3 font-num">{i + 1}</span><CoinIcon symbol={t.base} className="w-6 h-6" /><span><div className="text-xs font-semibold">{t.base}</div><div className="text-[9px] text-gray-500">{fmtCompact(t.market_cap)}</div></span></span>
            <Sparkline data={spark[t.symbol]} width={64} height={22} />
            <span className="text-right"><div className="font-num text-xs">${fmtPrice(t.price)}</div><Change value={t.change} className="text-[10px]" /></span>
          </button>
        ))}
      </div>
    </div>
  );
}
