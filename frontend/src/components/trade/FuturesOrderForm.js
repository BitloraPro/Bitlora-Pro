import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { useTicker, useWallet } from "@/hooks/useMarket";
import { useAction } from "@/hooks/useAction";
import { fmtAmount, fmtPrice, priceStep } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LoginGate, NumField, PctButtons } from "./SpotOrderForm";

export const MAX_LEV = 20;

export function LeverageControl({ mode, setMode, lev, setLev }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid grid-cols-2 bg-[#0f172a] rounded-lg p-1 border border-[#1f2937]">
          {["cross", "isolated"].map((m) => (
            <button key={m} data-testid={`futures-mode-${m}`} onClick={() => setMode(m)} className={cn("text-xs h-7 rounded-md capitalize", mode === m ? "bg-[#1f2937] text-[#f59e0b]" : "text-gray-400")}>{m}</button>
          ))}
        </div>
        <div className="flex items-center justify-center rounded-lg border border-[#f59e0b55] text-[#f59e0b] font-num text-sm" data-testid="futures-leverage-value">{lev}x</div>
      </div>
      <Slider data-testid="futures-leverage-slider" min={1} max={MAX_LEV} step={1} value={[lev]} onValueChange={(v) => setLev(v[0])} />
      <div className="flex justify-between text-[10px] text-gray-500 font-num">{[1, 5, 10, 15, 20].map((x) => <button key={x} onClick={() => setLev(x)} data-testid={`futures-lev-${x}`}>{x}x</button>)}</div>
    </div>
  );
}

export function futuresQuote({ avail = 0, type, last = 0, price, size, lev }) {
  const px = type === "market" ? last || 0 : Number(price) || 0;
  return {
    avail,
    cost: ((Number(size) || 0) * px) / lev,
    maxSize: px ? (avail * lev) / px : 0,
    liqLong: px * (1 - 1 / lev + 0.005),
    liqShort: px * (1 + 1 / lev - 0.005),
  };
}

function TpSlFields({ tp, setTp, sl, setSl }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumField label="TP" value={tp} onChange={setTp} suffix="" testid="futures-tp-input" />
      <NumField label="SL" value={sl} onChange={setSl} suffix="" testid="futures-sl-input" />
    </div>
  );
}

function QuoteSummary({ cost, maxSize, liqLong, liqShort, base }) {
  const row = (label, value, cls = "text-gray-300") => (
    <>
      <div>{label} <span className={cls}>{value}</span></div>
      <div className="text-right">{label} <span className={cls}>{value}</span></div>
    </>
  );
  return (
    <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 font-num" data-testid="futures-quote-summary">
      {row("Cost", `${fmtPrice(cost)} USDT`)}
      {row("Max", `${fmtAmount(maxSize, 4)} ${base}`)}
      <div>Est. Liq <span className="text-down">{fmtPrice(liqLong)}</span></div><div className="text-right">Est. Liq <span className="text-down">{fmtPrice(liqShort)}</span></div>
    </div>
  );
}

export function FuturesOrderForm({ symbol, compact = false, picked }) {
  const base = symbol.replace("USDT", "");
  const t = useTicker(symbol);
  const { data: w } = useWallet();
  const { run, busy } = useAction();
  const [mode, setMode] = useState("cross");
  const [lev, setLev] = useState(20);
  const [type, setType] = useState("limit");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [tpsl, setTpsl] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [reduce, setReduce] = useState(false);
  const ready = !!t;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) setPrice(String(t.price.toFixed(priceStep(t.price)))); }, [symbol, ready]);
  useEffect(() => { if (picked) setPrice(String(picked)); }, [picked]);
  const { avail, cost, maxSize, liqLong, liqShort } = futuresQuote({ avail: w?.futures.free, type, last: t?.price, price, size, lev });
  const submit = (side) =>
    run(() => api.post("/futures/order", { symbol, side, type, size: Number(size), leverage: lev, margin_mode: mode, price: type === "market" ? null : Number(price), tp: tpsl && tp ? Number(tp) : null, sl: tpsl && sl ? Number(sl) : null, reduce_only: reduce }),
      (r) => `${side === "long" ? "Long" : "Short"} ${fmtAmount(size)} ${base} @ ${lev}x — ${r.data.status}`).then((r) => r && setSize(""));
  return (
    <div className="space-y-3" data-testid="futures-order-form">
      <LeverageControl mode={mode} setMode={setMode} lev={lev} setLev={setLev} />
      <div className="flex gap-1">
        {["limit", "market"].map((k) => <button key={k} data-testid={`futures-type-${k}`} onClick={() => setType(k)} className={cn("tab-pill capitalize", type === k && "tab-pill-active text-[#f59e0b]")}>{k}</button>)}
      </div>
      <div className="flex justify-between text-[11px] text-gray-500"><span>Available</span><span className="font-num text-gray-300" data-testid="futures-available">{fmtAmount(avail, 2)} USDT</span></div>
      <NumField label="Price" value={type === "market" ? "" : price} onChange={setPrice} suffix="USDT" testid="futures-price-input" disabled={type === "market"} />
      <NumField label="Size" value={size} onChange={setSize} suffix={base} testid="futures-size-input" />
      <PctButtons onPick={(f) => setSize((maxSize * f * 0.995).toFixed(4))} testid="futures-pct" />
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <label className="flex items-center gap-2"><Checkbox data-testid="futures-tpsl-toggle" checked={tpsl} onCheckedChange={(v) => setTpsl(!!v)} />TP/SL</label>
        <label className="flex items-center gap-2"><Checkbox data-testid="futures-reduce-only" checked={reduce} onCheckedChange={(v) => setReduce(!!v)} />Reduce Only</label>
      </div>
      {tpsl && <TpSlFields tp={tp} setTp={setTp} sl={sl} setSl={setSl} />}
      <LoginGate>
        <div className="grid grid-cols-2 gap-2">
          <button data-testid="futures-open-long" disabled={busy || !Number(size)} onClick={() => submit("long")} className="h-10 rounded-lg bg-[#10b981] hover:bg-[#0ea371] text-white font-semibold text-sm disabled:opacity-50">Open Long</button>
          <button data-testid="futures-open-short" disabled={busy || !Number(size)} onClick={() => submit("short")} className="h-10 rounded-lg bg-[#ef4444] hover:bg-[#dc3a3a] text-white font-semibold text-sm disabled:opacity-50">Open Short</button>
        </div>
      </LoginGate>
      {!compact && <QuoteSummary cost={cost} maxSize={maxSize} liqLong={liqLong} liqShort={liqShort} base={base} />}
    </div>
  );
}
