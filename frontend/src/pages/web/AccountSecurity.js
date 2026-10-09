import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, KeyRound, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useAction } from "@/hooks/useAction";
import { useAccountOverview, useApiKeys } from "@/hooks/useMarket";
import { Empty, StatusBadge } from "@/components/common/Bits";
import { Table } from "@/components/trade/Tables";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtTime } from "@/lib/format";

function Card({ icon: I, title, desc, status, children, testid }) {
  return (
    <div className="panel p-6" data-testid={testid}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-[#f59e0b14] flex items-center justify-center"><I className="w-5 h-5 text-[#f59e0b]" /></div>
        <div className="flex-1"><div className="font-semibold flex items-center gap-2">{title}{status}</div><div className="text-xs text-gray-400 mt-0.5">{desc}</div></div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

const inputCls = "input-dark h-10 px-3 font-num";

function TwoFA() {
  const { user, refresh } = useAuth();
  const { run, busy } = useAction();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const done = async (r) => { if (r) { setSetup(null); setCode(""); await refresh(); } };
  return (
    <Card icon={ShieldCheck} title="Google Authenticator (2FA)" desc="Required for withdrawals and login once enabled." testid="security-2fa-card" status={<StatusBadge status={user.twofa_enabled ? "active" : "unverified"} />}>
      {user.twofa_enabled ? (
        <div className="flex gap-2"><input data-testid="2fa-disable-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} placeholder="6-digit code" className={inputCls} />
          <button data-testid="2fa-disable-btn" disabled={busy} onClick={() => run(() => api.post("/account/2fa/disable", { code }), "2FA disabled").then(done)} className="btn-ghost rounded-lg px-4 text-sm">Disable</button></div>
      ) : setup ? (
        <div className="flex gap-5 items-center">
          <div className="bg-white p-2 rounded"><QRCodeSVG value={setup.otpauth_url} size={120} data-testid="2fa-qr" /></div>
          <div className="space-y-2 flex-1">
            <div className="text-xs text-gray-400">Scan with Google Authenticator or enter key:</div>
            <div className="font-num text-xs break-all text-gray-200" data-testid="2fa-secret">{setup.secret}</div>
            <div className="flex gap-2"><input data-testid="2fa-enable-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} placeholder="6-digit code" className={inputCls} />
              <button data-testid="2fa-enable-btn" disabled={busy} onClick={() => run(() => api.post("/account/2fa/enable", { code }), "2FA enabled").then(done)} className="btn-orange rounded-lg px-4 text-sm">Verify</button></div>
          </div>
        </div>
      ) : <button data-testid="2fa-setup-btn" onClick={async () => setSetup((await api.post("/account/2fa/setup")).data)} className="btn-orange rounded-lg h-10 px-5 text-sm">Enable 2FA</button>}
    </Card>
  );
}

function EmailVerify() {
  const { user, refresh } = useAuth();
  const { run, busy } = useAction();
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState("");
  return (
    <Card icon={Mail} title="Email Verification" desc={user.email} testid="security-email-card" status={<StatusBadge status={user.email_verified ? "verified" : "unverified"} />}>
      {!user.email_verified && (sent ? (
        <div className="space-y-2">
          <div className="text-xs text-gray-400" data-testid="email-code-sent">We emailed a 6-digit code to <span className="text-gray-200">{sent.sent_to}</span>. It expires in 10 minutes. <button onClick={() => run(() => api.post("/account/email/send-code"), "New code sent").then((r) => r && setSent(r.data))} className="text-[#f59e0b]" data-testid="email-resend-code">Resend</button></div>
          <div className="flex gap-2"><input data-testid="email-code-input" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} placeholder="6-digit code" className={inputCls} />
            <button data-testid="email-verify-btn" disabled={busy} onClick={() => run(() => api.post("/account/email/verify", { code }), "Email verified").then((r) => r && refresh())} className="btn-orange rounded-lg px-4 text-sm">Verify</button></div>
        </div>
      ) : <button data-testid="email-send-code" onClick={() => run(() => api.post("/account/email/send-code"), "Verification code sent").then((r) => r && setSent(r.data))} className="btn-orange rounded-lg h-10 px-5 text-sm">Send Code</button>)}
    </Card>
  );
}

function PasswordCard() {
  const { run, busy } = useAction();
  const [f, setF] = useState({ current_password: "", new_password: "" });
  return (
    <Card icon={KeyRound} title="Login Password" desc="Use at least 8 characters." testid="security-password-card">
      <div className="flex gap-2 flex-wrap">
        <input type="password" data-testid="pw-current" placeholder="Current" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} className={inputCls} />
        <input type="password" data-testid="pw-new" placeholder="New password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} className={inputCls} />
        <button data-testid="pw-submit" disabled={busy} onClick={() => run(() => api.post("/account/password", f), "Password changed").then((r) => r && setF({ current_password: "", new_password: "" }))} className="btn-ghost rounded-lg px-4 text-sm">Update</button>
      </div>
    </Card>
  );
}

export function SecuritySection() {
  const { data: o } = useAccountOverview();
  return (
    <div className="space-y-4" data-testid="security-section">
      <div className="grid lg:grid-cols-2 gap-4"><TwoFA /><EmailVerify /></div>
      <PasswordCard />
      <div className="panel">
        <div className="px-4 py-3 text-sm font-semibold border-b border-[#1f2937]">Account Activity</div>
        {o?.activity?.length ? (
          <Table testid="security-activity-table" head={["Time", "Event", "Details", "IP", "Status"]}>
            {o.activity.map((a) => (
              <tr key={a.id} className="row-hover border-b border-[#151d2e]">
                <td className="td text-xs font-num text-gray-400">{fmtTime(a.created_at)}</td><td className="td">{a.type}</td>
                <td className="td text-xs text-gray-400 max-w-[260px] truncate">{a.details}</td><td className="td font-num text-xs">{a.ip}</td><td className="td"><StatusBadge status={a.status} /></td>
              </tr>
            ))}
          </Table>
        ) : <Empty />}
      </div>
    </div>
  );
}

export function ApiSection() {
  const { data = [] } = useApiKeys();
  const { run, busy } = useAction();
  const [label, setLabel] = useState("");
  const [perms, setPerms] = useState(["read"]);
  const [ips, setIps] = useState("");
  const [created, setCreated] = useState(null);
  const toggle = (p) => setPerms(perms.includes(p) ? perms.filter((x) => x !== p) : [...perms, p]);
  const create = () => run(() => api.post("/account/api-keys", { label, permissions: perms, ip_whitelist: ips.split(",").map((s) => s.trim()).filter(Boolean) }), "API key created")
    .then((r) => { if (r) { setCreated(r.data); setLabel(""); } });
  const copy = (v) => { navigator.clipboard?.writeText(v); toast.success("Copied"); };
  return (
    <div className="space-y-4" data-testid="api-section">
      <Card icon={KeyRound} title="Create API Key" desc="Keys authenticate programmatic trading. Secrets are shown once." testid="api-create-card">
        <div className="grid md:grid-cols-[1fr_1fr_auto] gap-2">
          <input data-testid="api-label-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Trading bot)" className="input-dark h-10 px-3" />
          <input data-testid="api-ip-input" value={ips} onChange={(e) => setIps(e.target.value)} placeholder="IP whitelist (comma separated)" className="input-dark h-10 px-3 font-num" />
          <button data-testid="api-create-btn" disabled={busy || label.length < 2} onClick={create} className="btn-orange rounded-lg px-5 text-sm disabled:opacity-50">Create</button>
        </div>
        <div className="flex gap-5 mt-3 text-xs text-gray-300">
          {["read", "spot", "futures", "withdraw"].map((p) => <label key={p} className="flex items-center gap-2 capitalize"><Checkbox data-testid={`api-perm-${p}`} checked={perms.includes(p)} onCheckedChange={() => toggle(p)} />{p}</label>)}
        </div>
        {created && (
          <div className="mt-4 panel-flat rounded-lg p-3 text-xs space-y-1.5" data-testid="api-created-secret">
            <div className="text-[#f59e0b]">Store your secret now — it will not be shown again.</div>
            {[["API Key", created.api_key], ["Secret", created.secret]].map(([l, v]) => <div key={l} className="flex gap-2 items-center"><span className="w-14 text-gray-500">{l}</span><span className="font-num break-all flex-1">{v}</span><button onClick={() => copy(v)}><Copy className="w-3 h-3" /></button></div>)}
          </div>
        )}
      </Card>
      <div className="panel">
        <div className="px-4 py-3 text-sm font-semibold border-b border-[#1f2937]">Your API Keys ({data.length})</div>
        {data.length ? (
          <Table testid="api-keys-table" head={["Label", "API Key", "Permissions", "IP Whitelist", "Created", ""]}>
            {data.map((k) => (
              <tr key={k.id} className="row-hover border-b border-[#151d2e]">
                <td className="td">{k.label}</td><td className="td font-num text-xs">{k.api_key.slice(0, 12)}…{k.api_key.slice(-6)}</td>
                <td className="td text-xs">{k.permissions.join(", ")}</td><td className="td text-xs font-num">{k.ip_whitelist.join(", ") || "Unrestricted"}</td>
                <td className="td text-xs font-num text-gray-400">{fmtTime(k.created_at)}</td>
                <td className="td"><button data-testid={`api-delete-${k.id}`} onClick={() => run(() => api.delete(`/account/api-keys/${k.id}`), "API key deleted")} className="text-gray-500 hover:text-[#ef4444]"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </Table>
        ) : <Empty text="No API keys" />}
      </div>
    </div>
  );
}

export function KycSection() {
  const { user, refresh } = useAuth();
  const { run, busy } = useAction();
  const [f, setF] = useState({ full_name: user.name, country: "", dob: "", doc_type: "passport", doc_number: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const locked = ["pending", "verified"].includes(user.kyc_status);
  return (
    <Card icon={ShieldCheck} title="Identity Verification (KYC)" desc="Verified accounts unlock higher withdrawal limits and VIP programs." testid="kyc-card" status={<StatusBadge status={user.kyc_status} />}>
      {locked ? <div className="text-sm text-gray-400" data-testid="kyc-status-text">{user.kyc_status === "pending" ? "Your documents are in the compliance review queue." : `Level ${user.kyc_level || 2} verified.`}</div> : (
        <div className="grid md:grid-cols-2 gap-3 max-w-2xl">
          <input data-testid="kyc-name" value={f.full_name} onChange={set("full_name")} placeholder="Full legal name" className="input-dark h-10 px-3" />
          <input data-testid="kyc-country" value={f.country} onChange={set("country")} placeholder="Country of residence" className="input-dark h-10 px-3" />
          <input data-testid="kyc-dob" type="date" value={f.dob} onChange={set("dob")} className="input-dark h-10 px-3" />
          <Select value={f.doc_type} onValueChange={(v) => setF({ ...f, doc_type: v })}>
            <SelectTrigger data-testid="kyc-doc-type" className="input-dark h-10"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#111827] border-[#1f2937] text-white"><SelectItem value="passport">Passport</SelectItem><SelectItem value="national_id">National ID</SelectItem><SelectItem value="driver_license">Driver License</SelectItem></SelectContent>
          </Select>
          <input data-testid="kyc-doc-number" value={f.doc_number} onChange={set("doc_number")} placeholder="Document number" className="input-dark h-10 px-3 font-num" />
          <button data-testid="kyc-submit" disabled={busy} onClick={() => run(() => api.post("/account/kyc", f), "KYC submitted for review").then((r) => r && refresh())} className="btn-orange rounded-lg h-10 text-sm">Submit for Review</button>
        </div>
      )}
    </Card>
  );
}
