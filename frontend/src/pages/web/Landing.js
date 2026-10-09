import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Download, Globe2, Landmark, ShieldCheck, Smartphone, Users, Zap } from "lucide-react";
import { useMarketStats, useSparklines, useTickers } from "@/hooks/useMarket";
import { CoinIcon, Logo } from "@/components/common/Brand";
import { Change, Sparkline } from "@/components/common/Bits";
import { fmtCompact, fmtPrice } from "@/lib/format";
import { HERO_IMG } from "@/lib/assets";
import { BACKEND_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

function TickerStrip() {
  const { data = [] } = useTickers();
  const items = data.slice(0, 14);
  return (
    <div className="relative overflow-hidden border-y border-[#1a2232] bg-[#0b0f19]/80 backdrop-blur" data-testid="landing-ticker-strip">
      <div className="flex w-max animate-ticker">
        {[...items, ...items].map((t, i) => (
          <Link key={`${t.symbol}${i}`} to={`/trade/${t.symbol}`} className="flex items-center gap-3 px-6 py-3 border-r border-[#1a2232] hover:bg-[#111827]">
            <CoinIcon symbol={t.base} className="w-6 h-6" />
            <div className="text-xs"><div className="text-gray-400">{t.base}</div><div className="font-num text-white">${fmtPrice(t.price)}</div></div>
            <Change value={t.change} className="text-xs" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function Hero() {
  const { data: s } = useMarketStats();
  const nav = useNavigate();
  const stats = [
    [fmtCompact(s?.volume_24h), "24h Spot Volume"], [s ? `${s.pairs}` : "—", "Live Trading Pairs"],
    [s ? fmtCompact(s.total_market_cap) : "—", "Global Market Cap"], ["24/7", "Matching Engine"],
  ];
  return (
    <section className="relative overflow-hidden grain" data-testid="landing-hero">
      <img src={HERO_IMG} alt="" className="absolute inset-0 w-full h-full object-cover object-right opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0f19] via-[#0b0f19]/85 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0b0f19] to-transparent" />
      <div className="relative px-6 lg:px-16 pt-20 pb-16 max-w-7xl">
        <div className="eyebrow text-[#f59e0b] flex items-center gap-2 rise"><span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />Global Crypto Exchange</div>
        <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold tracking-tight leading-[1.02] mt-5 rise" style={{ animationDelay: ".08s" }}>
          A Smarter Way<br />to <span className="text-[#f59e0b]">Trade Crypto</span>
        </h1>
        <p className="text-base md:text-lg text-gray-300 mt-6 max-w-md rise" style={{ animationDelay: ".16s" }}>Global markets. Powerful tools.<br />A brighter tomorrow.</p>
        <div className="flex gap-3 mt-9 rise" style={{ animationDelay: ".24s" }}>
          <button data-testid="hero-get-started" onClick={() => nav("/register")} className="btn-orange h-12 px-7 rounded-lg flex items-center gap-2 glow-orange">Get Started <ArrowRight className="w-4 h-4" /></button>
          <button data-testid="hero-view-markets" onClick={() => nav("/markets")} className="btn-ghost h-12 px-7 rounded-lg">View Markets</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-14 max-w-2xl rise" style={{ animationDelay: ".32s" }}>
          {stats.map(([v, l]) => <div key={l} data-testid={`hero-stat-${l.toLowerCase().replace(/\s/g, "-")}`}><div className="text-2xl font-bold font-num">{v}</div><div className="text-xs text-gray-400 mt-1">{l}</div></div>)}
        </div>
        <div className="grid md:grid-cols-3 gap-6 mt-14 max-w-3xl">
          {[[ShieldCheck, "Bank-Grade Security", "Your assets, our priority."], [Globe2, "Global Liquidity", "Deep markets, tight spreads."], [Users, "Trusted Worldwide", "Regulated and transparent."]].map(([I, t, d]) => (
            <div key={t} className="flex gap-3 items-start"><I className="w-8 h-8 text-[#60a5fa] shrink-0" strokeWidth={1.4} /><div><div className="text-sm font-semibold">{t}</div><div className="text-xs text-gray-400">{d}</div></div></div>
          ))}
        </div>
      </div>
    </section>
  );
}

const TABS = [["hot", "Hot"], ["gainers", "Top Gainers"], ["losers", "Top Losers"], ["volume", "24h Volume"], ["meme", "Meme Hub"]];

function MarketPreview() {
  const [tab, setTab] = useState("hot");
  const { data = [] } = useTickers();
  const { data: spark = {} } = useSparklines();
  const sorted = {
    hot: data, gainers: [...data].sort((a, b) => b.change - a.change), losers: [...data].sort((a, b) => a.change - b.change),
    volume: [...data].sort((a, b) => b.quote_volume - a.quote_volume), meme: data.filter((t) => t.categories.includes("meme")),
  }[tab].slice(0, 8);
  return (
    <section className="px-6 lg:px-16 py-20">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div><div className="eyebrow text-[#f59e0b]">Live Markets</div><h2 className="text-3xl lg:text-4xl font-bold mt-2">Trade the world's top assets</h2></div>
        <div className="flex gap-1 panel p-1">{TABS.map(([k, l]) => <button key={k} data-testid={`landing-tab-${k}`} onClick={() => setTab(k)} className={cn("tab-pill", tab === k && "tab-pill-active text-[#f59e0b]")}>{l}</button>)}</div>
      </div>
      <div className="panel overflow-hidden" data-testid="landing-market-table">
        {sorted.map((t, i) => (
          <div key={t.symbol} className="grid grid-cols-[32px_1.3fr_1fr_0.8fr_1fr_140px_100px] items-center px-5 py-3.5 border-b border-[#1a2232] last:border-0 row-hover">
            <span className="text-gray-500 font-num text-sm">{i + 1}</span>
            <span className="flex items-center gap-3"><CoinIcon symbol={t.base} className="w-8 h-8" /><span><div className="font-semibold">{t.base}</div><div className="text-xs text-gray-500">{t.name}</div></span></span>
            <span className="font-num">${fmtPrice(t.price)}</span>
            <Change value={t.change} className="text-sm" />
            <span className="font-num text-sm text-gray-400">{fmtCompact(t.quote_volume)}</span>
            <Sparkline data={spark[t.symbol]} width={120} height={34} />
            <Link to={`/trade/${t.symbol}`} data-testid={`landing-trade-${t.symbol}`} className="text-xs btn-ghost rounded-md px-4 py-1.5 justify-self-end">Trade</Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function Liquidity() {
  const { data: s } = useMarketStats();
  const cards = [
    [Landmark, fmtCompact(s?.total_market_cap), "Total crypto market cap", s?.market_cap_change],
    [Zap, fmtCompact(s?.volume_24h), "24h volume across listed pairs"],
    [Globe2, s?.btc_dominance ? `${s.btc_dominance.toFixed(1)}%` : "—", "Bitcoin dominance"],
    [Users, s ? `${s.gainers} / ${s.losers}` : "—", "Gainers vs losers (24h)"],
  ];
  return (
    <section className="px-6 lg:px-16 pb-20">
      <div className="eyebrow text-[#f59e0b]">Global Liquidity</div>
      <h2 className="text-3xl lg:text-4xl font-bold mt-2 mb-8">Real-time market depth, everywhere</h2>
      <div className="grid md:grid-cols-4 gap-4">
        {cards.map(([I, v, l, ch]) => (
          <div key={l} className="panel p-6 hover:border-[#f59e0b55]" style={{ transition: "border-color .2s" }}>
            <I className="w-6 h-6 text-[#f59e0b]" strokeWidth={1.5} />
            <div className="text-3xl font-bold font-num mt-6">{v}</div>
            <div className="text-xs text-gray-400 mt-1 flex gap-2">{l}{ch != null && <Change value={ch} />}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Trust() {
  const items = [
    ["Cold-storage custody", "The majority of client assets sit in multi-signature cold wallets; hot wallets are capped by a treasury ratio set by the risk desk."],
    ["Withdrawal review", "Every withdrawal passes a treasury approval matrix with 2FA, address and daily-limit controls before broadcast."],
    ["Real-time risk engine", "Positions are marked to live prices every 3 seconds with automated TP/SL, margin calls and liquidations."],
  ];
  return (
    <section className="px-6 lg:px-16 pb-20 grid lg:grid-cols-[1fr_1.2fr] gap-10 items-center">
      <div>
        <div className="eyebrow text-[#f59e0b]">Trust & Security</div>
        <h2 className="text-3xl lg:text-4xl font-bold mt-2">Built like a bank.<br />Moves like a startup.</h2>
        <div className="flex gap-3 mt-8">
          <Link to="/mobile" data-testid="landing-mobile-cta" className="btn-orange rounded-lg h-11 px-5 flex items-center gap-2"><Smartphone className="w-4 h-4" />Mobile App</Link>
          <a href={`${BACKEND_URL}/api/download/source`} data-testid="landing-download-source" className="btn-ghost rounded-lg h-11 px-5 flex items-center gap-2"><Download className="w-4 h-4" />Download Source</a>
        </div>
      </div>
      <div className="space-y-3">
        {items.map(([t, d], i) => (
          <div key={t} className="panel p-5 flex gap-4"><span className="font-num text-[#f59e0b] text-sm">0{i + 1}</span><div><div className="font-semibold">{t}</div><div className="text-sm text-gray-400 mt-1">{d}</div></div></div>
        ))}
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div data-testid="landing-page">
      <Hero />
      <TickerStrip />
      <MarketPreview />
      <Liquidity />
      <Trust />
      <footer className="border-t border-[#1a2232] px-6 lg:px-16 py-10 flex flex-wrap justify-between gap-6 text-xs text-gray-500">
        <Logo sub="TRADE · INVEST · BUILD A BRIGHTER TOMORROW" />
        <div>Market data: Binance public API & CoinGecko. Balances are paper-trading funds.</div>
      </footer>
    </div>
  );
}
