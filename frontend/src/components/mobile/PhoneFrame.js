import { createContext, useContext, useEffect, useState } from "react";
import { BarChart3, CandlestickChart, Home, Repeat, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const PhoneCtx = createContext(null);
export const usePhone = () => useContext(PhoneCtx);

const TABS = [["home", "Home", Home], ["market", "Market", BarChart3], ["trade", "Trade", Repeat], ["futures", "Futures", CandlestickChart], ["wallet", "Wallet", Wallet]];

function StatusBar() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 30000); return () => clearInterval(i); }, []);
  return (
    <div className="h-11 flex items-center justify-between px-7 text-[12px] font-semibold text-white shrink-0 relative z-20">
      <span className="font-num">{t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false })}</span>
      <span className="flex items-center gap-1">
        <svg width="16" height="10" viewBox="0 0 16 10" fill="white"><rect x="0" y="6" width="3" height="4" rx="1" /><rect x="4.5" y="4" width="3" height="6" rx="1" /><rect x="9" y="2" width="3" height="8" rx="1" /><rect x="13" y="0" width="3" height="10" rx="1" /></svg>
        <svg width="22" height="11" viewBox="0 0 22 11"><rect x=".5" y=".5" width="18" height="10" rx="3" fill="none" stroke="white" opacity=".6" /><rect x="2" y="2" width="14" height="7" rx="1.5" fill="white" /><rect x="19.5" y="3.5" width="1.5" height="4" rx=".7" fill="white" opacity=".6" /></svg>
      </span>
    </div>
  );
}

function TabBar() {
  const { screen, go } = usePhone();
  return (
    <div className="h-16 shrink-0 border-t border-[#1a2232] bg-[#0b0f19] grid grid-cols-5 pb-2">
      {TABS.map(([k, l, I]) => (
        <button key={k} data-testid={`m-tab-${k}`} onClick={() => go(k)} className={cn("flex flex-col items-center justify-center gap-0.5 text-[10px]", screen === k ? "text-[#f59e0b]" : "text-gray-500")}>
          <I className="w-[18px] h-[18px]" />{l}
        </button>
      ))}
    </div>
  );
}

function useScreenState(initial, screens) {
  const [screen, setScreen] = useState(initial);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const go = (s, sym) => { if (sym) setSymbol(sym); setScreen(s); };
  return { screen, symbol, go, Screen: screens[screen], withTabs: TABS.some(([k]) => k === screen) };
}

export function PhoneApp({ initial, screens }) {
  const { screen, symbol, go, Screen, withTabs } = useScreenState(initial, screens);
  return (
    <div className="fixed inset-0 max-w-[520px] mx-auto bg-[#0b0f19] flex flex-col overflow-hidden" data-testid="phone-app">
      <PhoneCtx.Provider value={{ screen, go, symbol }}>
        <div className="flex-1 overflow-y-auto no-scrollbar relative" key={screen}><div className="rise" style={{ animationDuration: ".35s" }}><Screen /></div></div>
        {withTabs && <TabBar />}
      </PhoneCtx.Provider>
    </div>
  );
}

export function PhoneFrame({ initial, screens, label, sub, testid }) {
  const { screen, symbol, go, Screen, withTabs } = useScreenState(initial, screens);
  return (
    <figure className="flex flex-col items-center gap-4" data-testid={testid}>
      <div className="relative w-[300px] h-[630px] rounded-[48px] p-[10px] bg-gradient-to-b from-[#3a3f4a] via-[#1d2129] to-[#2b2f37] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9),0_0_0_1px_#4b5160_inset]">
        <div className="absolute -left-[3px] top-28 w-[3px] h-10 bg-[#2b2f37] rounded-l" /><div className="absolute -left-[3px] top-44 w-[3px] h-14 bg-[#2b2f37] rounded-l" /><div className="absolute -right-[3px] top-36 w-[3px] h-20 bg-[#2b2f37] rounded-r" />
        <div className="relative w-full h-full rounded-[38px] overflow-hidden bg-[#0b0f19] flex flex-col">
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-[92px] h-[26px] rounded-full bg-black z-30" />
          <PhoneCtx.Provider value={{ screen, go, symbol }}>
            <StatusBar />
            <div className="flex-1 overflow-y-auto no-scrollbar relative" key={screen}><div className="rise" style={{ animationDuration: ".35s" }}><Screen /></div></div>
            {withTabs && <TabBar />}
          </PhoneCtx.Provider>
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-28 h-1 rounded-full bg-white/70 z-30" />
        </div>
      </div>
      <figcaption className="text-center"><div className="text-sm font-semibold tracking-[0.18em] uppercase">{label}</div><div className="text-xs text-gray-500 mt-0.5">{sub}</div></figcaption>
    </figure>
  );
}
