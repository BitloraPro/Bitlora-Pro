import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/common/Brand";
import { Field, ForgotForm, FormError, LoginForm, RegisterForm } from "@/components/auth/AuthForms";
import { api, apiError } from "@/lib/api";
import { HERO_IMG } from "@/lib/assets";

function AuthShell({ title, sub, children }) {
  return (
    <div className="min-h-[calc(100vh-56px)] grid lg:grid-cols-2">
      <div className="hidden lg:block relative overflow-hidden">
        <img src={HERO_IMG} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0b0f19]" />
        <div className="absolute bottom-12 left-12 max-w-md">
          <div className="eyebrow text-[#f59e0b]">Trade · Invest · Build</div>
          <h2 className="text-4xl font-bold mt-3 leading-tight">Global markets.<br />Powerful tools.</h2>
          <p className="text-gray-400 mt-3 text-sm">Live Binance-grade liquidity data, institutional custody and a matching engine that never sleeps.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm rise">
          <Logo size="text-2xl" className="mb-8" />
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-gray-400 text-sm mt-1 mb-8">{sub}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const nav = useNavigate();
  return <AuthShell title="Welcome Back" sub="Login to your account"><LoginForm onDone={(u) => nav(u.role === "admin" ? "/admin" : "/trade/BTCUSDT")} /></AuthShell>;
}

export function RegisterPage() {
  const nav = useNavigate();
  return <AuthShell title="Create Account" sub="Join Bitlora Pro today"><RegisterForm onDone={() => nav("/account")} /></AuthShell>;
}

export function ForgotPage() {
  return <AuthShell title="Forgot Password" sub="Enter your email and we'll send you a reset link."><ForgotForm /></AuthShell>;
}

export function ResetPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (pw !== confirm) return setError("Passwords do not match");
    try { await api.post("/auth/reset-password", { token: params.get("token"), password: pw }); toast.success("Password updated. Please log in."); nav("/login"); }
    catch (err) { setError(apiError(err)); }
  };
  return (
    <AuthShell title="Reset Password" sub="Choose a new password for your account.">
      <form onSubmit={submit} className="space-y-4">
        <Field icon={Lock} secret testid="reset-password-input" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required />
        <Field icon={Lock} secret testid="reset-confirm-input" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <FormError error={error} />
        <button data-testid="reset-submit" className="w-full h-12 rounded-xl btn-orange">Update Password</button>
        <Link to="/login" className="block text-center text-sm text-gray-400">Back to Login</Link>
      </form>
    </AuthShell>
  );
}
