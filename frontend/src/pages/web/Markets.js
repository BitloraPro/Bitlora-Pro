import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDownUp, Search, Star } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMarketStats, useSparklines, useTickers } from "@/hooks/useMarket";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { CoinIcon } from "@/components/common/Brand";
import { Change, Empty, Sparkline } from "@/components/common/Bits";
import { fmtCompact, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export const FILTERS = [["all", "All"], ["watchlist", "Watchlist"], ["layer1", "Layer 1"], ["layer2", "Layer 2"], ["defi", "DeFi"], ["ai", "AI"], ["meme", "Memes"], ["new", "New Listings"], ["gainers", "Gainers"], ["losers", "Losers"]];

export function filterTickers(data, filter, q, watchlist = []) {
  let rows = data.filter((t) => (t.base + t.name).toLowerCase().includes(q.toLowerCase()));
  if (filter === "watchlist") rows = rows.filter((t) => watchlist.includes(t.symbol));
  else if (filter === "gainers") rows = rows.filter((t) => t.change > 0).sort((a, b) => b.change - a.change);
  else if (filter === "losers") rows = rows.filter((t) => t.change < 0).sort((a, b) => a.change - b.change);
  else if (filter !== "all") rows = rows.filter((t) => t.categories.includes(filter));
  return rows;
}

function useMarketRows({ data, mkt, filter, q, sort, watchlist }) {
  return useMemo(() => {
    const scoped = mkt === "futures" ? data.filter((t) => t.futures) : data;
    const filtered = filterTickers(scoped, filter, q, watchlist || []);
    if (filter === "gainers" || filter === "losers") return filtered;
    return [...filtered].sort((a, b) => ((a[sort.k] ?? 0) - (b[sort.k] ?? 0)) * sort.dir);
  }, [data, mkt, filter, q, sort, watchlist]);
}

function StatCard({ label, value, change, spark }) {
  return (
    <div className="panel px-5 py-4 flex items-center gap-6 min-w-[240px]">
      <div><div className="text-xl font-bold font-num">{value}</div><div className="text-[11px] text-gray-400">{label}</div>{change != null && <Change value={change} className="text-xs" />}</div>
      {spark && <Sparkline data={spark} width={100} height={36} />}
    </div>
  );
}

function SortTh({ k, label, sort, setSort, className }) {
  return (
    <th className={cn("th cursor-pointer select-none hover:text-gray-300", className)} onClick={() => setSort({ k, dir: sort.k === k ? -sort.dir : -1 })} data-testid={`sort-${k}`}>
      <span className="inline-flex items-center gap-1">{label}<ArrowDownUp className={cn("w-3 h-3", sort.k === k && "text-[#f59e0b]")} /></span>
    </th>
  );
}

export default function Markets() {
  const [params] = useSearchParams();
  const { user, refresh } = useAuth();
  const qc = useQueryClient();
  const [mkt, setMkt] = useState("spot");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState(params.get("q") || "");
  const [sort, setSort] = useState({ k: "market_cap", dir: -1 });
  const { data = [] } = useTickers();
  const { data: spark = {} } = useSparklines();
  const { data: s } = useMarketStats();
  const rows = useMarketRows({ data, mkt, filter, q, sort, watchlist: user?.watchlist });
  const toggleWatch = async (sym) => { if (!user) return; await api.post(`/account/watchlist/${sym}`); await refresh(); qc.invalidateQueries({ queryKey: ["overview"] }); };
  return (
    <div className="px-4 lg:px-8 py-8 max-w-[1500px] mx-auto" data-testid="markets-page">
      <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
        <div><h1 className="text-4xl font-bold">Crypto Markets</h1><p className="text-gray-400 text-sm mt-1">Explore {data.length} assets. Real-time data. Global liquidity.</p></div>
        <div className="flex flex-wrap gap-3">
          <StatCard label="Total Market Cap" value={fmtCompact(s?.total_market_cap)} change={s?.market_cap_change} spark={spark.BTCUSDT} />
          <StatCard label="24h Volume" value={fmtCompact(s?.volume_24h)} spark={spark.ETHUSDT} />
          <StatCard label="Trading Pairs" value={s ? `${s.pairs}` : "—"} spark={spark.SOLUSDT} />
        </div>
      </div>
      <div className="flex items-center gap-2 mb-4">
        {[["spot", "Spot Markets"], ["futures", "Futures Markets"]].map(([k, l]) => (
          <button key={k} data-testid={`markets-tab-${k}`} onClick={() => setMkt(k)} className={cn("px-4 h-9 rounded-lg text-sm border", mkt === k ? "border-[#f59e0b] text-[#f59e0b]" : "border-transparent text-gray-400")}>{l}</button>
        ))}
        <label className="ml-auto flex items-center input-dark h-9 px-3 w-64"><Search className="w-4 h-4 text-gray-500" /><input data-testid="markets-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search coin" className="bg-transparent outline-none ml-2 text-sm w-full" /></label>
      </div>
      <div className="flex gap-2 flex-wrap mb-4">
        {FILTERS.map(([k, l]) => (
          <button key={k} data-testid={`markets-filter-${k}`} onClick={() => setFilter(k)} className={cn("px-3 h-7 rounded-md text-xs border", filter === k ? "bg-[#f59e0b] text-[#0b0f19] border-[#f59e0b] font-semibold" : "border-[#1f2937] text-gray-400 hover:text-white")}>{l}</button>
        ))}
      </div>
      <div className="panel overflow-x-auto scrollbar-thin">
        <table className="w-full" data-testid="markets-table">
          <thead><tr className="border-b border-[#1f2937]">
            <th className="th w-8" /><th className="th">#</th><th className="th">Pair</th>
            <SortTh k="price" label="Price" sort={sort} setSort={setSort} /><SortTh k="change" label="24h Change" sort={sort} setSort={setSort} />
            <SortTh k="high" label="24h High" sort={sort} setSort={setSort} /><SortTh k="quote_volume" label="24h Volume" sort={sort} setSort={setSort} />
            <SortTh k="market_cap" label="Market Cap" sort={sort} setSort={setSort} /><th className="th">Last 24h</th><th className="th text-right">Action</th>
          </tr></thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.symbol} className="border-b border-[#151d2e] row-hover" data-testid={`market-row-${t.symbol}`}>
                <td className="td"><button data-testid={`watch-${t.symbol}`} onClick={() => toggleWatch(t.symbol)} title={user ? "Watchlist" : "Log in to use watchlist"}><Star className={cn("w-4 h-4", user?.watchlist?.includes(t.symbol) ? "fill-[#f59e0b] text-[#f59e0b]" : "text-gray-600")} /></button></td>
                <td className="td text-gray-500 font-num">{i + 1}</td>
                <td className="td"><span className="flex items-center gap-3"><CoinIcon symbol={t.base} className="w-7 h-7" /><span><div className="font-semibold">{t.base}{mkt === "futures" && <span className="text-gray-500 text-xs">USDT Perp</span>}</div><div className="text-xs text-gray-500">{t.name}</div></span></span></td>
                <td className="td font-num">${fmtPrice(t.price)}</td>
                <td className="td"><Change value={t.change} /></td>
                <td className="td font-num text-gray-400 text-xs">{fmtPrice(t.high)} / {fmtPrice(t.low)}</td>
                <td className="td font-num">{fmtCompact(t.quote_volume)}</td>
                <td className="td font-num">{fmtCompact(t.market_cap)}</td>
                <td className="td"><Sparkline data={spark[t.symbol]} width={110} height={30} /></td>
                <td className="td text-right"><Link data-testid={`market-trade-${t.symbol}`} to={mkt === "futures" ? `/futures/${t.symbol}` : `/trade/${t.symbol}`} className="text-xs btn-ghost rounded-md px-4 py-1.5">Trade</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty text={filter === "watchlist" && !user ? "Log in to build your watchlist" : "No assets match your filters"} />}
      </div>
    </div>
  );
}
