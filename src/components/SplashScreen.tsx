"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

const LANGUAGES = [
  { id: "en", flag: "🇬🇧", label: "UK" },
  { id: "ru", flag: "🇷🇺", label: "RU" },
  { id: "vi", flag: "🇻🇳", label: "VN" },
] as const;

type LangId = (typeof LANGUAGES)[number]["id"];

const POUR_DURATION = 0.9;
const CLINK_TIME = 1.1;
const TOTAL_DURATION = 2.0;
const W = 360;
const H = 640;

// ЖЕСТКАЯ ОТРИСОВКА: ХРУСТАЛЬ, ЛАЗЕРЫ И ФИЗИКА
const drawGastrobarSplash = (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  progress: number,
  isClinked: boolean,
  ts: number
) => {
  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = "screen";

  const centerX = W / 2;
  const centerY = H * 0.55;
  const colors = ["#00FF41", "#FFD700", "#FF3131"]; // Green, Yellow, Red

  [-1.3, 0, 1.3].forEach((offset, i) => {
    // Схождение рюмок при чоканье
    const currentX = isClinked ? centerX + offset * 20 : centerX + offset * 80;
    const y = centerY;
    const w = 55;
    const h = 95;

    // 1. ЛАЗЕРНЫЕ СТРУИ (НЕ ПОЛОСКИ!)
    if (progress < 0.9 && !isClinked) {
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor = colors[i];
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(currentX, 0);
      ctx.lineTo(currentX, y - h / 2 + h * (1 - progress));
      ctx.stroke();
      ctx.restore();
    }

    // 2. ОБЪЕМНЫЙ ХРУСТАЛЬ (С ГРАНЯМИ)
    ctx.save();
    const glassGrad = ctx.createLinearGradient(currentX - w / 2, 0, currentX + w / 2, 0);
    glassGrad.addColorStop(0, "rgba(255,255,255,0.02)");
    glassGrad.addColorStop(0.2, "rgba(255,255,255,0.3)"); // Блик
    glassGrad.addColorStop(0.5, "rgba(255,255,255,0.05)");
    glassGrad.addColorStop(0.8, "rgba(255,255,255,0.3)"); // Блик
    glassGrad.addColorStop(1, "rgba(255,255,255,0.02)");
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.roundRect(currentX - w / 2, y - h / 2, w, h, [2, 2, 12, 12]);
    ctx.fill();
    // Грани
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    for (let l = -w / 2 + 12; l < w / 2; l += 15) {
      ctx.beginPath();
      ctx.moveTo(currentX + l, y - h / 2);
      ctx.lineTo(currentX + l, y + h / 2);
      ctx.stroke();
    }
    ctx.restore();

    // 3. ЖИДКОСТЬ (ВОЛНА ПО СИНУСУ)
    const fillLevel = Math.min(progress * 1.2, 1);
    if (fillLevel > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(currentX - w / 2, y - h / 2, w, h, [2, 2, 12, 12]);
      ctx.clip();

      const fluidH = h * fillLevel;
      const topY = y + h / 2 - fluidH;

      ctx.fillStyle = colors[i];
      ctx.shadowBlur = 30;
      ctx.shadowColor = colors[i];
      ctx.globalAlpha = 0.8;

      ctx.beginPath();
      ctx.moveTo(currentX - w / 2, y + h / 2);
      for (let sx = currentX - w / 2; sx <= currentX + w / 2; sx++) {
        const amp = isClinked ? 0 : 6;
        const wave = Math.sin(sx * 0.12 + ts * 0.01) * amp;
        ctx.lineTo(sx, topY + wave);
      }
      ctx.lineTo(currentX + w / 2, y + h / 2);
      ctx.fill();
      ctx.restore();
    }
  });

  // 4. ВСПЫШКА (FLASH) ПРИ УДАРЕ
  if (isClinked) {
    const flash = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 140);
    flash.addColorStop(0, "#fff");
    flash.addColorStop(1, "transparent");
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 180, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
};

export function SplashScreen({ onComplete }: { onComplete: (lang: LangId) => void }) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const [neonOn, setNeonOn] = useState(false);
  const [showFlags, setShowFlags] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clinkPlayedRef = useRef(false);
  const neonOnRef = useRef(false);
  const [hoveredLang, setHoveredLang] = useState<LangId | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    audioRef.current = new Audio("/clink.mp3");
    if (audioRef.current) audioRef.current.volume = 0.7;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setUseFallback(true);
      return;
    }

    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 3);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    let cancelled = false;
    const baseY = H * 0.52;
    const cx = W / 2;

    const drawFrame = (ts: number) => {
      if (cancelled) return;
      try {
      if (!startTimeRef.current) startTimeRef.current = ts;
      const t = Math.min((ts - startTimeRef.current) / 1000, TOTAL_DURATION);

      const progress = Math.min(t / 1.2, 1);
      const isClinked = t >= CLINK_TIME;
      const clinkBurstEnd = CLINK_TIME + 0.2;

      ctx.save();
      if (t >= CLINK_TIME && t < clinkBurstEnd) {
        const sh = (t - CLINK_TIME) / 0.2;
        const shake = (1 - sh) * 5;
        ctx.translate(Math.sin(sh * Math.PI * 20) * shake, Math.cos(sh * Math.PI * 18) * shake * 0.6);
      }
      drawGastrobarSplash(ctx, W, H, progress, isClinked, ts);
      ctx.restore();

      const logoY = baseY + 70;
      const neon = neonOnRef.current;
      ctx.font = "700 22px system-ui, Montserrat, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const parts: { text: string; color: string; shadowColor: string; shadowBlur: number }[] = [
        { text: "GASTRO", color: "#ffffff", shadowColor: neon ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.3)", shadowBlur: neon ? 22 : 6 },
        { text: "B", color: "#22c55e", shadowColor: neon ? "rgba(34,197,94,0.95)" : "rgba(0,0,0,0.3)", shadowBlur: neon ? 24 : 6 },
        { text: "A", color: "#eab308", shadowColor: neon ? "rgba(234,179,8,0.95)" : "rgba(0,0,0,0.3)", shadowBlur: neon ? 24 : 6 },
        { text: "R", color: "#ef4444", shadowColor: neon ? "rgba(239,68,68,0.95)" : "rgba(0,0,0,0.3)", shadowBlur: neon ? 24 : 6 },
      ];
      const totalW = parts.reduce((acc, p) => acc + ctx.measureText(p.text).width, 0);
      let curX = cx - totalW / 2;
      parts.forEach((p) => {
        const w = ctx.measureText(p.text).width;
        ctx.shadowColor = p.shadowColor;
        ctx.shadowBlur = p.shadowBlur;
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, curX + w / 2, logoY);
        curX += w;
      });
      ctx.shadowBlur = 0;

      if (t >= CLINK_TIME && !clinkPlayedRef.current) {
        clinkPlayedRef.current = true;
        neonOnRef.current = true;
        setNeonOn(true);
        setShowFlags(true);
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
      }

      frameRef.current = requestAnimationFrame(drawFrame);
      } catch {
        setUseFallback(true);
      }
    };

    const start = () => {
      if (cancelled) return;
      frameRef.current = requestAnimationFrame(drawFrame);
    };
    const id = requestAnimationFrame(start);
    return () => {
      cancelled = true;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      cancelAnimationFrame(id);
    };
  }, []);

  const handleLanguageSelect = (lang: LangId) => {
    try {
      localStorage.setItem("gastrobar-lang", lang);
    } catch {}
    const overlay = overlayRef.current;
    if (!overlay) {
      onComplete(lang);
      return;
    }
    gsap.to(overlay, {
      yPercent: -100,
      duration: 0.6,
      ease: "power2.inOut",
      onComplete: () => onComplete(lang),
    });
  };

  useEffect(() => {
    if (!useFallback) return;
    const t = setTimeout(() => setShowFlags(true), 800);
    return () => clearTimeout(t);
  }, [useFallback]);

  if (useFallback) {
    return (
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-8 bg-black px-4"
        style={{ width: "100vw", height: "100vh", minHeight: "100dvh" }}
      >
        <p className="text-center font-bold tracking-widest text-white" style={{ textShadow: "0 0 20px rgba(255,255,255,0.3)" }}>
          <span className="text-white">GASTRO</span>
          <span className="text-[#22c55e]">B</span>
          <span className="text-[#eab308]">A</span>
          <span className="text-[#ef4444]">R</span>
        </p>
        {showFlags && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/55">Choose language</p>
            <div className="flex gap-5">
              {LANGUAGES.map(({ id, flag, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleLanguageSelect(id)}
                  onMouseEnter={() => setHoveredLang(id)}
                  onMouseLeave={() => setHoveredLang((p) => (p === id ? null : p))}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-black/70 text-xl text-white transition active:scale-95"
                  style={hoveredLang === id ? { boxShadow: "0 0 18px rgba(250,204,21,0.7)" } : undefined}
                  aria-label={label}
                >
                  {flag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
      style={{ width: "100vw", height: "100vh", minHeight: "100dvh" }}
    >
      <div className="flex flex-col items-center justify-center">
        <canvas
          ref={canvasRef}
          className="rounded-2xl bg-black"
          style={{
            width: "min(360px, calc(100vw - 32px))",
            height: "min(640px, 80vh)",
            maxWidth: "100%",
          }}
        />
        {showFlags && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/55">
              Choose language
            </p>
            <div className="flex gap-5">
              {LANGUAGES.map(({ id, flag, label }) => {
                const hovered = hoveredLang === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleLanguageSelect(id)}
                    onMouseEnter={() => setHoveredLang(id)}
                    onMouseLeave={() => setHoveredLang((prev) => (prev === id ? null : prev))}
                    className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-black/70 text-xl text-white shadow-[0_0_16px_rgba(0,0,0,0.8)] transition-transform active:scale-95"
                    aria-label={label}
                    style={
                      hovered
                        ? {
                            boxShadow: "0 0 18px rgba(250,204,21,0.7), 0 0 40px rgba(250,204,21,0.45)",
                            backgroundImage: "radial-gradient(circle at 50% 50%, rgba(250,204,21,0.4), transparent 60%)",
                          }
                        : undefined
                    }
                  >
                    <span className="leading-none">{flag}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
