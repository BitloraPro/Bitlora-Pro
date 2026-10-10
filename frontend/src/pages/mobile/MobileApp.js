import { PhoneApp } from "@/components/mobile/PhoneFrame";
import { SCREENS } from "./MobileShowcase";

export default function MobileApp() {
  return <PhoneApp initial="home" screens={SCREENS} />;
}
