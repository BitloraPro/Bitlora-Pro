import "@/App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import WebLayout from "@/components/layout/WebLayout";
import AdminLayout from "@/components/layout/AdminLayout";
import Landing from "@/pages/web/Landing";
import Markets from "@/pages/web/Markets";
import SpotTrade from "@/pages/web/SpotTrade";
import FuturesTrade from "@/pages/web/FuturesTrade";
import Account from "@/pages/web/Account";
import { ForgotPage, LoginPage, RegisterPage, ResetPage } from "@/pages/web/AuthPages";
import MobileShowcase from "@/pages/mobile/MobileShowcase";
import MobileApp from "@/pages/mobile/MobileApp";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminTreasury from "@/pages/admin/AdminTreasury";
import AdminRisk from "@/pages/admin/AdminRisk";
import { AdminSecurity, AdminSettings } from "@/pages/admin/AdminSettings";

// Phones opening the site root land in the app-style UI; add ?web=1 to stay on the web site.
function PhoneHomeRedirect({ children }) {
  const isPhone = window.matchMedia("(max-width: 767px)").matches;
  const wantsWeb = new URLSearchParams(window.location.search).has("web");
  return isPhone && !wantsWeb ? <Navigate to="/app" replace /> : children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<WebLayout />}>
            <Route path="/" element={<PhoneHomeRedirect><Landing /></PhoneHomeRedirect>} />
            <Route path="/markets" element={<Markets />} />
            <Route path="/trade/:symbol" element={<SpotTrade />} />
            <Route path="/trade" element={<Navigate to="/trade/BTCUSDT" replace />} />
            <Route path="/futures/:symbol" element={<FuturesTrade />} />
            <Route path="/futures" element={<Navigate to="/futures/BTCUSDT" replace />} />
            <Route path="/account/:section?" element={<Account />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPage />} />
            <Route path="/reset-password" element={<ResetPage />} />
          </Route>
          <Route path="/mobile" element={<MobileShowcase />} />
          <Route path="/app" element={<MobileApp />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="treasury" element={<AdminTreasury />} />
            <Route path="risk" element={<AdminRisk />} />
            <Route path="security" element={<AdminSecurity />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster theme="dark" position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
