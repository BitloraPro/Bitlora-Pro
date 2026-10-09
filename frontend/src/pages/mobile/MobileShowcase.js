import { Link } from "react-router-dom";
import { Download, Monitor } from "lucide-react";
import { PhoneFrame } from "@/components/mobile/PhoneFrame";
import { Logo } from "@/components/common/Brand";
import { MHome, MMarket, Welcome } from "./MainScreens";
import { MFutures, MTrade } from "./TradeScreens";
import { MForgot, MLogin, MMenu, MSignup, MWallet } from "./AccountScreens";
import { BACKEND_URL } from "@/lib/api";
import { HERO_IMG } from "@/lib/assets";

const SCREENS = { welcome: Welcome, home: MHome, market: MMarket, trade: MTrade, futures: MFutures, wallet: MWallet, login: MLogin, signup: MSignup, menu: MMenu, forgot: MForgot };
const FRAMES = [
  ["welcome", "01. Welcome / Onboarding", "Strong first impression"], ["home", "02. Home Page", "Login, signup, top markets"], ["market", "03. Market Page", "Tabs, filters and market list"],
  ["trade", "04. Spot Trade", "Chart, order book, buy/sell"], ["futures", "05. Futures", "Leverage, positions, orders"], ["wallet", "06. Wallet", "Balances, deposit, withdraw"],
  ["login", "07. Login", "Access your account"], ["signup", "08. Signup / Register", "Create new account"], ["menu", "09. Side Menu", "Navigation drawer"], ["forgot", "10. Forgot Password", "Reset your password"],
];

export default function MobileShowcase() {
  return (
    <div className="relative min-h-screen bg-[#0b0f19] overflow-hidden" data-testid="mobile-showcase">
      <img src={HERO_IMG} alt="" className="absolute inset-x-0 top-0 w-full h-[520px] object-cover opacity-30" />
      <div className="absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-transparent to-[#0b0f19]" />
      <div className="relative px-6 lg:px-12 py-10 max-w-[1700px] mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
          <div>
            <Logo size="text-5xl" />
            <div className="eyebrow mt-3">Trade · Invest · Build a brighter tomorrow</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-light">More Than an Exchange</div>
            <div className="text-xs text-gray-400 mt-1">Every screen below is live — real prices, real orders, real balances.</div>
            <div className="flex gap-2 justify-end mt-4">
              <Link to="/" className="btn-ghost rounded-lg h-9 px-4 text-xs flex items-center gap-2" data-testid="mobile-to-web"><Monitor className="w-4 h-4" />Web Exchange</Link>
              <a href={`${BACKEND_URL}/api/download/source`} data-testid="mobile-download-source" className="btn-orange rounded-lg h-9 px-4 text-xs flex items-center gap-2"><Download className="w-4 h-4" />Download Source</a>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-x-6 gap-y-14 justify-items-center">
          {FRAMES.map(([k, l, s]) => <PhoneFrame key={k} testid={`phone-${k}`} initial={k} screens={SCREENS} label={l} sub={s} />)}
        </div>
      </div>
    </div>
  );
}
