import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTicker, useWallet } from "@/hooks/useMarket";
import { useAction } from "@/hooks/useAction";
import { fmtAmount, fmtPrice, priceStep } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPES = [["limit", "Limit"], ["market", "Market"], ["stop_limit", "Stop-Limit"]];

export function NumField({ label, value, onChange, suffix, testid, disabled }) {
  return (
    <label className={cn("flex items-center input-dark px-3 h-10 gap-2", disabled && "opacity-60")}>
      <span className="text-xs text-gray-500 w-16 shrink-0">{label}</span>
      <input data-testid={testid} disabled={disabled} type="number" inputMode="decimal" step="any" value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-transparent flex-1 min-w-0 text-right font-num text-sm outline-none" placeholder="0.00" />
      <span className="text-xs text-gray-400 w-10 text-right">{suffix}</span>
    </label>
  );
}

export function PctButtons({ onPick, testid }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {[25, 50, 75, 100].map((p) => (
        <button key={p} data-testid={`${testid}-${p}`} onClick={() => onPick(p / 100)} className="text-[11px] py-1 rounded border border-[#1f2937] text-gray-400 hover:border-[#f59e0b] hover:text-[#f59e0b] font-num">{p}%</button>
      ))}
    </div>
  );
}

export function LoginGate({ children }) {
  const { user } = useAuth();
  if (user) return children;
  return (
    <div className="flex gap-2">
      <Link to="/login" data-testid="trade-login-link" className="flex-1 btn-orange rounded-lg h-10 flex items-center justify-center text-sm">Log In</Link>
      <Link to="/register" className="flex-1 btn-ghost rounded-lg h-10 flex items-center justify-center text-sm">Sign Up</Link>
    </div>
  );
}

export function SpotSide({ symbol, side, type, price, setPrice, stop, setStop, compact }) {
  const base = symbol.replace("USDT", "");
  const t = useTicker(symbol);
  const { data: w } = useWallet();
  const { run, busy } = useAction();
  const [amount, setAmount] = useState("");
  const asset = side === "buy" ? "USDT" : base;
  const avail = w?.spot.find((a) => a.asset === asset)?.free || 0;
  const execPrice = type === "market" ? t?.price : Number(price);
  const total = Number(amount || 0) * (execPrice || 0);
  const pick = (f) => setAmount(side === "buy" ? ((avail * f) / (execPrice || 1) * 0.999).toFixed(6) : (avail * f).toFixed(6));
  const submit = () =>
    run(() => api.post("/spot/order", { symbol, side, type, amount: Number(amount), price: type === "market" ? null : Number(price), stop_price: type === "stop_limit" ? Number(stop) : null }),
      (r) => `${side === "buy" ? "Buy" : "Sell"} ${fmtAmount(amount)} ${base} — ${r.data.status}`).then((r) => r && setAmount(""));
  return (
    <div className="space-y-2.5" data-testid={`spot-form-${side}`}>
      <div className="flex justify-between text-[11px] text-gray-500"><span>Available</span><span className="font-num text-gray-300" data-testid={`spot-available-${side}`}>{fmtAmount(avail, 6)} {asset}</span></div>
      {type === "stop_limit" && <NumField label="Stop" value={stop} onChange={setStop} suffix="USDT" testid={`spot-stop-input-${side}`} />}
      <NumField label="Price" value={type === "market" ? "" : price} onChange={setPrice} suffix="USDT" testid={`spot-price-input-${side}`} disabled={type === "market"} />
      <NumField label="Amount" value={amount} onChange={setAmount} suffix={base} testid={`spot-amount-input-${side}`} />
      <PctButtons onPick={pick} testid={`spot-pct-${side}`} />
      {!compact && <div className="flex justify-between text-[11px] text-gray-500"><span>Total</span><span className="font-num text-gray-300">{fmtPrice(total)} USDT</span></div>}
      <LoginGate>
        <button data-testid={`spot-submit-${side}`} disabled={busy || !Number(amount)} onClick={submit}
          className={cn("w-full h-10 rounded-lg font-semibold text-sm text-white disabled:opacity-50", side === "buy" ? "bg-[#10b981] hover:bg-[#0ea371]" : "bg-[#ef4444] hover:bg-[#dc3a3a]")}>
          {busy ? "Placing…" : `${side === "buy" ? "Buy" : "Sell"} ${base}`}
        </button>
      </LoginGate>
    </div>
  );
}

export function SpotOrderForm({ symbol, picked, compact = false }) {
  const t = useTicker(symbol);
  const [type, setType] = useState("limit");
  const [price, setPrice] = useState("");
  const [stop, setStop] = useState("");
  const [side, setSide] = useState("buy");
  const ready = !!t;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) setPrice(String(t.price.toFixed(priceStep(t.price)))); }, [symbol, ready]);
  useEffect(() => { if (picked) setPrice(String(picked)); }, [picked]);
  const props = { symbol, type, price, setPrice, stop, setStop, compact };
  return (
    <div className="space-y-3">
      {compact && (
        <div className="grid grid-cols-2 gap-1 bg-[#0f172a] p-1 rounded-lg">
          {["buy", "sell"].map((s) => (
            <button key={s} data-testid={`spot-side-${s}`} onClick={() => setSide(s)} className={cn("h-8 rounded-md text-sm font-semibold capitalize", side === s ? (s === "buy" ? "bg-[#10b981] text-white" : "bg-[#ef4444] text-white") : "text-gray-400")}>{s}</button>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        {TYPES.map(([k, l]) => (
          <button key={k} data-testid={`spot-type-${k}`} onClick={() => setType(k)} className={cn("tab-pill", type === k && "tab-pill-active text-[#f59e0b]")}>{l}</button>
        ))}
      </div>
      {compact ? <SpotSide side={side} {...props} /> : (
        <div className="grid grid-cols-2 gap-5"><SpotSide side="buy" {...props} /><SpotSide side="sell" {...props} /></div>
      )}
    </div>
  );
}
