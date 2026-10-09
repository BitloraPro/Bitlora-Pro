import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { LOGIN, REGISTER } from "@/constants/testIds";

export function Field({ icon: Icon, type = "text", secret, testid, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <label className="flex items-center gap-3 input-dark h-12 px-4">
      <Icon className="w-4 h-4 text-gray-500 shrink-0" />
      <input data-testid={testid} type={secret ? (show ? "text" : "password") : type} className="bg-transparent outline-none flex-1 text-sm min-w-0" {...rest} />
      {secret && <button type="button" onClick={() => setShow(!show)} className="text-gray-500">{show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>}
    </label>
  );
}

export function FormError({ error }) {
  return error ? <div data-testid="auth-error" className="text-xs text-[#ef4444] bg-down rounded-md px-3 py-2">{error}</div> : null;
}

export function LoginForm({ onDone, linkTo = (p) => p, onNavigate }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [need2fa, setNeed2fa] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const u = await login(email, password, code || undefined);
      toast.success(`Welcome back, ${u.name}`);
      onDone?.(u);
    } catch (err) {
      const msg = apiError(err);
      if (msg === "2FA_REQUIRED") { setNeed2fa(true); setError("Enter your Google Authenticator code"); } else setError(msg);
    } finally { setBusy(false); }
  };
  const L = ({ to, children, testid }) => onNavigate ? <button type="button" data-testid={testid} onClick={() => onNavigate(to)} className="text-[#f59e0b]">{children}</button> : <Link data-testid={testid} to={linkTo(to)} className="text-[#f59e0b]">{children}</Link>;
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="login-form">
      <Field icon={Mail} testid={LOGIN.emailInput} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Field icon={Lock} testid={LOGIN.passwordInput} secret placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {need2fa && <Field icon={Lock} testid="login-2fa-input" placeholder="6-digit 2FA code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <label className="flex items-center gap-2"><Checkbox defaultChecked className="border-[#f59e0b] data-[state=checked]:bg-[#f59e0b]" />Remember me</label>
        <L to="/forgot-password" testid={LOGIN.forgotPasswordLink}>Forgot password?</L>
      </div>
      <FormError error={error} />
      <button data-testid={LOGIN.submitButton} disabled={busy} className="w-full h-12 rounded-xl btn-orange disabled:opacity-60">{busy ? "Signing in…" : "Login"}</button>
      <p className="text-center text-xs text-gray-400">Don't have an account? <L to="/register" testid={LOGIN.registerLink}>Sign Up</L></p>
    </form>
  );
}

export function RegisterForm({ onDone, onNavigate }) {
  const { register } = useAuth();
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "" });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (f.password !== f.confirm) return setError("Passwords do not match");
    if (!agree) return setError("Please accept the Terms of Service");
    setBusy(true); setError("");
    try { const u = await register(f.name, f.email, f.password); toast.success("Account created — 10,000 USDT credited"); onDone?.(u); }
    catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3.5" data-testid="register-form">
      <Field icon={UserIcon} testid={REGISTER.nameInput} placeholder="Full Name" value={f.name} onChange={set("name")} required />
      <Field icon={Mail} testid={REGISTER.emailInput} type="email" placeholder="Email" value={f.email} onChange={set("email")} required />
      <Field icon={Lock} testid={REGISTER.passwordInput} secret placeholder="Password (min 8 chars)" value={f.password} onChange={set("password")} required minLength={8} />
      <Field icon={Lock} testid={REGISTER.passwordConfirmInput} secret placeholder="Confirm Password" value={f.confirm} onChange={set("confirm")} required />
      <label className="flex items-start gap-2 text-xs text-gray-400"><Checkbox data-testid="register-terms-checkbox" checked={agree} onCheckedChange={(v) => setAgree(!!v)} className="mt-0.5 border-[#f59e0b] data-[state=checked]:bg-[#f59e0b]" />I agree to the <span className="text-[#f59e0b]">Terms of Service</span> and Privacy Policy</label>
      <FormError error={error} />
      <button data-testid={REGISTER.submitButton} disabled={busy} className="w-full h-12 rounded-xl btn-orange disabled:opacity-60">{busy ? "Creating…" : "Create Account"}</button>
      <p className="text-center text-xs text-gray-400">Already have an account? {onNavigate ? <button type="button" data-testid={REGISTER.loginLink} onClick={() => onNavigate("/login")} className="text-[#f59e0b]">Login</button> : <Link data-testid={REGISTER.loginLink} to="/login" className="text-[#f59e0b]">Login</Link>}</p>
    </form>
  );
}

export function ForgotForm({ onNavigate }) {
  const [email, setEmail] = useState("");
  const [res, setRes] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try { const { data } = await api.post("/auth/forgot-password", { email }); setRes(data); } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
      <Field icon={Mail} testid="forgot-email-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <FormError error={error} />
      {res && (
        <div className="text-xs text-gray-300 bg-up rounded-md px-3 py-2 space-y-2" data-testid="forgot-success">
          <div>{res.message}</div>
          <div className="text-gray-400">Check your inbox (and spam folder). The link expires in 1 hour.</div>
        </div>
      )}
      <button data-testid="forgot-submit" disabled={busy} className="w-full h-12 rounded-xl btn-orange disabled:opacity-60">{busy ? "Sending…" : "Send Reset Link"}</button>
      <div className="text-center text-xs text-gray-500">or</div>
      {onNavigate ? <button type="button" onClick={() => onNavigate("/login")} className="block w-full text-center text-sm text-gray-300">Back to Login</button> : <Link to="/login" className="block text-center text-sm text-gray-300" data-testid="forgot-back-login">Back to Login</Link>}
    </form>
  );
}
