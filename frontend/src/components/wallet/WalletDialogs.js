import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, get } from "@/lib/api";
import { useAction } from "@/hooks/useAction";
import { useAuth } from "@/context/AuthContext";
import { useTickers, useWallet } from "@/hooks/useMarket";
import { fmtAmount } from "@/lib/format";
import { CoinIcon } from "@/components/common/Brand";
import { NumField } from "@/components/trade/SpotOrderForm";

function AssetSelect({ value, onChange, testid }) {
  const { data = [] } = useTickers();
  const assets = ["USDT", ...data.map((t) => t.base)];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testid} className="input-dark h-10"><SelectValue /></SelectTrigger>
      <SelectContent className="bg-[#111827] border-[#1f2937] text-white max-h-72">
        {assets.map((a) => <SelectItem key={a} value={a}><span className="flex items-center gap-2"><CoinIcon symbol={a} className="w-4 h-4" />{a}</span></SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function useAddress(asset, network, open) {
  const [info, setInfo] = useState(null);
  useEffect(() => { if (open) get(`/wallet/address/${asset}`, network ? { network } : undefined).then(setInfo).catch(() => setInfo(null)); }, [asset, network, open]);
  return info;
}

function Shell({ open, onOpenChange, title, desc, children, testid }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111827] border-[#1f2937] text-white max-w-md" data-testid={testid}>
        <DialogHeader><DialogTitle className="text-lg">{title}</DialogTitle>{desc && <DialogDescription className="text-gray-400 text-xs">{desc}</DialogDescription>}</DialogHeader>
        <div className="space-y-3">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function DepositDialog({ open, onOpenChange, initial = "USDT" }) {
  const [asset, setAsset] = useState(initial);
  const [network, setNetwork] = useState(null);
  const [amount, setAmount] = useState("");
  const info = useAddress(asset, network, open);
  const { run, busy } = useAction();
  const copy = () => { navigator.clipboard?.writeText(info.address); toast.success("Address copied"); };
  return (
    <Shell open={open} onOpenChange={onOpenChange} title="Deposit Crypto" desc="Paper-trading network: confirmed deposits are credited instantly." testid="deposit-dialog">
      <AssetSelect value={asset} onChange={(a) => { setAsset(a); setNetwork(null); }} testid="deposit-asset-select" />
      {info && (
        <>
          <div className="flex gap-2 flex-wrap">{info.networks.map((n) => <button key={n} onClick={() => setNetwork(n)} className={`tab-pill border border-[#1f2937] ${info.network === n ? "tab-pill-active text-[#f59e0b]" : ""}`}>{n}</button>)}</div>
          <div className="flex gap-4 items-center panel-flat rounded-lg p-3">
            <div className="bg-white p-2 rounded"><QRCodeSVG value={info.address} size={88} /></div>
            <div className="min-w-0 flex-1">
              <div className="eyebrow mb-1">{asset} address · {info.network}</div>
              <div className="font-num text-xs break-all text-gray-200" data-testid="deposit-address">{info.address}</div>
              <button onClick={copy} className="mt-2 text-xs text-[#f59e0b] flex items-center gap-1"><Copy className="w-3 h-3" />Copy</button>
            </div>
          </div>
        </>
      )}
      <NumField label="Amount" value={amount} onChange={setAmount} suffix={asset} testid="deposit-amount-input" />
      <button data-testid="deposit-submit" disabled={busy || !Number(amount)} onClick={() => run(() => api.post("/wallet/deposit", { asset, amount: Number(amount), network: info?.network }), `Deposited ${amount} ${asset}`).then((r) => r && (setAmount(""), onOpenChange(false)))} className="w-full h-10 btn-orange rounded-lg disabled:opacity-50">Confirm Deposit</button>
    </Shell>
  );
}

export function WithdrawDialog({ open, onOpenChange, initial = "USDT" }) {
  const { user } = useAuth();
  const { data: w } = useWallet();
  const [asset, setAsset] = useState(initial);
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [code, setCode] = useState("");
  const info = useAddress(asset, null, open);
  const { run, busy } = useAction();
  const avail = w?.spot.find((a) => a.asset === asset)?.free || 0;
  const submit = () => run(() => api.post("/wallet/withdraw", { asset, amount: Number(amount), address, network: info?.network, code: code || null }), "Withdrawal submitted for review")
    .then((r) => r && (setAmount(""), setAddress(""), onOpenChange(false)));
  return (
    <Shell open={open} onOpenChange={onOpenChange} title="Withdraw Crypto" desc="Withdrawals are reviewed by the treasury desk before broadcast." testid="withdraw-dialog">
      <AssetSelect value={asset} onChange={setAsset} testid="withdraw-asset-select" />
      <input data-testid="withdraw-address-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={`Recipient ${asset} address (${info?.network || ""})`} className="input-dark w-full h-10 px-3 font-num text-xs" />
      <NumField label="Amount" value={amount} onChange={setAmount} suffix={asset} testid="withdraw-amount-input" />
      <div className="flex justify-between text-xs text-gray-500"><span>Available</span><button onClick={() => setAmount(String(avail))} className="font-num text-gray-300 hover:text-[#f59e0b]">{fmtAmount(avail)} {asset}</button></div>
      {user?.twofa_enabled && <input data-testid="withdraw-2fa-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Google Authenticator code" className="input-dark w-full h-10 px-3 font-num" maxLength={6} />}
      <div className="text-xs text-gray-500">Network fee: <span className="font-num text-gray-300">{fmtAmount(Number(amount || 0) * 0.001)} {asset}</span></div>
      <button data-testid="withdraw-submit" disabled={busy || !Number(amount) || address.length < 10} onClick={submit} className="w-full h-10 btn-orange rounded-lg disabled:opacity-50">Submit Withdrawal</button>
    </Shell>
  );
}

export function TransferDialog({ open, onOpenChange }) {
  const { data: w } = useWallet();
  const [from, setFrom] = useState("spot");
  const [amount, setAmount] = useState("");
  const { run, busy } = useAction();
  const to = from === "spot" ? "futures" : "spot";
  const avail = from === "spot" ? w?.spot.find((a) => a.asset === "USDT")?.free || 0 : w?.futures.free || 0;
  return (
    <Shell open={open} onOpenChange={onOpenChange} title="Transfer USDT" desc="Move margin between your Spot and Futures accounts." testid="transfer-dialog">
      <div className="flex items-center gap-2">
        <div className="flex-1 panel-flat rounded-lg p-3"><div className="eyebrow">From</div><div className="capitalize font-semibold">{from}</div></div>
        <button data-testid="transfer-swap" onClick={() => setFrom(to)} className="btn-ghost rounded-full w-9 h-9">⇄</button>
        <div className="flex-1 panel-flat rounded-lg p-3"><div className="eyebrow">To</div><div className="capitalize font-semibold">{to}</div></div>
      </div>
      <NumField label="Amount" value={amount} onChange={setAmount} suffix="USDT" testid="transfer-amount-input" />
      <div className="flex justify-between text-xs text-gray-500"><span>Available</span><button onClick={() => setAmount(String(avail))} className="font-num text-gray-300">{fmtAmount(avail, 2)} USDT</button></div>
      <button data-testid="transfer-submit" disabled={busy || !Number(amount)} onClick={() => run(() => api.post("/wallet/transfer", { asset: "USDT", amount: Number(amount), from_account: from, to_account: to }), "Transfer completed").then((r) => r && (setAmount(""), onOpenChange(false)))} className="w-full h-10 btn-orange rounded-lg disabled:opacity-50">Confirm Transfer</button>
    </Shell>
  );
}

export function useWalletDialogs() {
  const [open, setOpen] = useState(null);
  const node = (
    <>
      <DepositDialog open={open === "deposit"} onOpenChange={(o) => setOpen(o ? "deposit" : null)} />
      <WithdrawDialog open={open === "withdraw"} onOpenChange={(o) => setOpen(o ? "withdraw" : null)} />
      <TransferDialog open={open === "transfer"} onOpenChange={(o) => setOpen(o ? "transfer" : null)} />
    </>
  );
  return { open: setOpen, node };
}
