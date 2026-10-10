import { PhoneApp } from "@/components/mobile/PhoneFrame";
import { useAuth } from "@/context/AuthContext";
import { SCREENS } from "./MobileShowcase";

export default function MobileApp() {
  const { user } = useAuth();
  return <PhoneApp initial={user ? "home" : "welcome"} screens={SCREENS} />;
}
