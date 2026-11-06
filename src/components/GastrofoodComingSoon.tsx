import { GastrofoodFavicon } from "@/components/GastrofoodFavicon";
import "./GastrofoodComingSoon.css";

export function GastrofoodComingSoon() {
  return (
    <main className="gfSoon">
      <GastrofoodFavicon />
      <div className="gfSoonLogos">
        <img
          className="gfSoonLogo"
          src="/gastrofood/gastrofood-online-kitchen.png"
          alt="GASTROFOOD Online Kitchen"
          width={1024}
          height={1024}
        />
        <img
          className="gfSoonLogo"
          src="/gastrofood/nicks-online-kitchen.png"
          alt="Nick's Online Kitchen by GASTROFOOD"
          width={1024}
          height={682}
        />
      </div>
      <p className="gfSoonLead">Меню скоро</p>
      <p className="gfSoonSub">Menu coming soon · Thực đơn sắp ra mắt</p>
    </main>
  );
}
