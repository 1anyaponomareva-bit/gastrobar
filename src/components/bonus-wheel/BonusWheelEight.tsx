"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { EIGHT_SEGMENTS, type EightSegmentDef } from "./eightSegmentsData";
import { SegmentGlyph } from "./BonusWheelIcons";

const N = 8;
const RADIUS = 138;
const RIM_WIDTH = 4;
const CX = 150;
const CY = 150;
const INNER_R = RADIUS - RIM_WIDTH;
const HUB_R = 36;

const GOLD_SOFT = "rgba(196,163,90,0.42)";
const PURPLE_BASE = "#3D1F5C";
const PURPLE_ALT = "#2E1545";
const PURPLE_ACTIVE = "#7C3AED";
const PURPLE_WIN = "#8B5CF6";
const TEXT_PRIMARY = "#F5F0E8";
const TEXT_SECONDARY = "rgba(245,240,232,0.74)";

function wedgePath(i: number, innerR: number): string {
  const SEG = 360 / N;
  const startAngle = -90 + i * SEG;
  const endAngle = -90 + (i + 1) * SEG;
  const sr = (startAngle * Math.PI) / 180;
  const er = (endAngle * Math.PI) / 180;
  const x1 = CX + innerR * Math.cos(sr);
  const y1 = CY + innerR * Math.sin(sr);
  const x2 = CX + innerR * Math.cos(er);
  const y2 = CY + innerR * Math.sin(er);
  return `M ${CX} ${CY} L ${x1} ${y1} A ${innerR} ${innerR} 0 0 1 ${x2} ${y2} Z`;
}

function delayForStep(step: number, totalSteps: number): number {
  const remaining = totalSteps - 1 - step;
  if (remaining <= 2) return 320 + (2 - remaining) * 140;
  const t = step / Math.max(1, totalSteps - 1);
  return 28 + t * t * 240;
}

type Props = {
  /** Демо: при клике «КРУТИ» выбирается случайный сектор (0–7). Позже заменим на реальный исход. */
  demoMode?: boolean;
};

export function BonusWheelEight({ demoMode = true }: Props) {
  const SEGMENT_ANGLE = 360 / N;
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const timersRef = useRef<number[]>([]);
  const runIdRef = useRef(0);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const startDemoSpin = useCallback(() => {
    if (!demoMode || isAnimating) return;
    const target = Math.floor(Math.random() * N);
    const runId = ++runIdRef.current;
    clearTimers();
    setWinnerIndex(null);
    setIsAnimating(true);

    const fullRotations = 3;
    const totalSteps = fullRotations * N + target + 1;
    let step = 0;

    const runStep = () => {
      if (runId !== runIdRef.current) return;
      const idx = step % N;
      setHighlightIndex(idx);

      if (step >= totalSteps - 1) {
        setHighlightIndex(null);
        setWinnerIndex(target);
        const t = window.setTimeout(() => {
          if (runId !== runIdRef.current) return;
          setIsAnimating(false);
        }, 900);
        timersRef.current.push(t);
        return;
      }

      const d = delayForStep(step, totalSteps);
      const t = window.setTimeout(() => {
        step += 1;
        runStep();
      }, d);
      timersRef.current.push(t);
    };

    runStep();
  }, [demoMode, isAnimating, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const segments = EIGHT_SEGMENTS;

  function renderSegmentContent(seg: EightSegmentDef, i: number) {
    const midDeg = -90 + (i + 0.5) * SEGMENT_ANGLE;
    const midRad = (midDeg * Math.PI) / 180;
    const labelR = INNER_R * 0.46;
    const x = labelR * Math.cos(midRad);
    const y = labelR * Math.sin(midRad);
    const rot = midDeg + 90;
    const hasLine2 = !!seg.line2?.length;
    const isDiscount = seg.id === "seg_minus50" || seg.id === "seg_minus10";
    const fs1 = isDiscount ? 11.5 : 10;
    const fs2 = hasLine2 && isDiscount ? Math.max(7, fs1 * 0.65) : hasLine2 ? 8 : 0;
    const y1 = hasLine2 ? (isDiscount ? -17 : -14) : -2;
    const y2 = hasLine2 ? (isDiscount ? -4 : -5) : 0;
    const iconDy = hasLine2 ? 15 : 11;

    return (
      <g key={seg.id} transform={`translate(${x}, ${y}) rotate(${rot})`}>
        <g transform={`rotate(${-rot})`} style={{ textAnchor: "middle" }}>
          <text
            x={0}
            y={y1}
            fill={TEXT_PRIMARY}
            fontSize={fs1}
            fontWeight="700"
            textAnchor="middle"
            style={{ fontFamily: "system-ui, sans-serif", letterSpacing: "0.02em" }}
          >
            {seg.line1}
          </text>
          {hasLine2 && (
            <text
              x={0}
              y={y2}
              fill={TEXT_SECONDARY}
              fontSize={fs2}
              fontWeight="600"
              textAnchor="middle"
              style={{ fontFamily: "system-ui, sans-serif" }}
            >
              {seg.line2}
            </text>
          )}
          <g transform={`translate(0, ${iconDy})`}>
            <SegmentGlyph variant={seg.icon} size={10} />
          </g>
        </g>
      </g>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative"
        style={{
          borderRadius: "50%",
          boxShadow: "0 12px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(196,163,90,0.12)",
        }}
      >
        <svg
          viewBox="0 0 300 300"
          className="h-[min(280px,85vw)] w-[min(280px,85vw)]"
          style={{ filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.55))" }}
        >
          <defs>
            <filter id="bw8-segGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="bw8-winnerGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="bw8-hub" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2a2630" />
              <stop offset="100%" stopColor="#121014" />
            </linearGradient>
          </defs>

          <circle cx={CX} cy={CY} r={RADIUS + 1} fill="none" stroke={GOLD_SOFT} strokeWidth={2} />

          {Array.from({ length: N }).map((_, i) => {
            const isHi = highlightIndex === i;
            const isWin = winnerIndex === i;
            const base = i % 2 === 0 ? PURPLE_BASE : PURPLE_ALT;
            let fill = base;
            if (isHi) fill = PURPLE_ACTIVE;
            if (isWin) fill = PURPLE_WIN;
            const d = wedgePath(i, INNER_R);
            if (isWin) {
              return (
                <motion.path
                  key={`w-${i}`}
                  d={d}
                  fill={fill}
                  filter="url(#bw8-winnerGlow)"
                  animate={{ opacity: [1, 0.84, 1] }}
                  transition={{ duration: 0.75, ease: "easeInOut", repeat: 1 }}
                />
              );
            }
            return (
              <path
                key={`w-${i}`}
                d={d}
                fill={fill}
                opacity={isHi ? 0.96 : 1}
                filter={isHi ? "url(#bw8-segGlow)" : undefined}
                style={{ transition: "fill 0.12s ease" }}
              />
            );
          })}

          <g stroke={GOLD_SOFT} strokeWidth="0.85" strokeLinecap="round" opacity={0.88}>
            {Array.from({ length: N }).map((_, i) => {
              const angle = -90 + i * SEGMENT_ANGLE;
              const rad = (angle * Math.PI) / 180;
              const x2 = CX + INNER_R * Math.cos(rad);
              const y2 = CY + INNER_R * Math.sin(rad);
              return <line key={i} x1={CX} y1={CY} x2={x2} y2={y2} />;
            })}
          </g>

          <g transform={`translate(${CX}, ${CY})`}>{segments.map((seg, i) => renderSegmentContent(seg, i))}</g>

          <circle cx={CX} cy={CY} r={HUB_R} fill="url(#bw8-hub)" stroke={GOLD_SOFT} strokeWidth={2} />
          <text
            x={CX}
            y={CY + 6}
            fill={TEXT_PRIMARY}
            fontSize={14}
            fontWeight="800"
            textAnchor="middle"
            letterSpacing="0.12em"
            style={{ fontFamily: "system-ui, sans-serif" }}
          >
            КРУТИ
          </text>
        </svg>

        <button
          type="button"
          onClick={startDemoSpin}
          disabled={!demoMode || isAnimating}
          className="absolute left-1/2 top-1/2 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-amber-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
          aria-label="Крутить колесо"
          style={{ cursor: demoMode && !isAnimating ? "pointer" : "default" }}
        />
      </div>
      {demoMode && (
        <p className="mt-4 max-w-xs text-center text-xs text-white/45">
          Демо: только визуал и анимация подсветки. Итоговый сектор выбирается случайно для проверки.
        </p>
      )}
    </div>
  );
}
