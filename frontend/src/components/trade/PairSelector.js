import { useState } from "react";
import { ChevronDown, Search, Star } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTickers } from "@/hooks/useMarket";
import { CoinIcon } from "@/components/common/Brand";
import { Change } from "@/components/common/Bits";
import { fmtPrice } from "@/lib/format";

export function PairSelector({ symbol, onSelect, futures = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data = [] } = useTickers();
  const list = data.filter((t) => (!futures || t.futures) && (t.base + t.name).toLowerCase().includes(q.toLowerCase()));
  const base = symbol.replace("USDT", "");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger data-testid="pair-selector" className="flex items-center gap-2 hover:opacity-90">
        <CoinIcon symbol={base} className="w-8 h-8" />
        <div className="text-left">
          <div className="font-bold text-lg leading-none flex items-center gap-1">{futures ? `${symbol} Perpetual` : `${base}/USDT`}<ChevronDown className="w-4 h-4 text-gray-500" /></div>
          <div className="text-[11px] text-gray-500">{data.find((t) => t.symbol === symbol)?.name}</div>
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0 bg-[#111827] border-[#1f2937] text-gray-100">
        <div className="p-2 border-b border-[#1f2937] flex items-center gap-2 px-3"><Search className="w-4 h-4 text-gray-500" />
          <input autoFocus data-testid="pair-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="bg-transparent outline-none text-sm py-1.5 w-full" />
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {list.map((t) => (
            <button key={t.symbol} data-testid={`pair-option-${t.symbol}`} onClick={() => { onSelect(t.symbol); setOpen(false); }} className="w-full grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2 hover:bg-[#1a2232] text-sm">
              <span className="flex items-center gap-2"><Star className="w-3 h-3 text-gray-600" /><CoinIcon symbol={t.base} className="w-5 h-5" />{t.base}<span className="text-gray-500 text-xs">/USDT</span></span>
              <span className="font-num text-xs">{fmtPrice(t.price)}</span>
              <Change value={t.change} className="text-xs w-14 text-right" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function StatItem({ label, value, className = "" }) {
  return (
    <div className="leading-tight">
      <div className="text-[10px] text-gray-500 whitespace-nowrap">{label}</div>
      <div className={`font-num text-xs text-gray-200 whitespace-nowrap ${className}`}>{value}</div>
    </div>
  );
}
