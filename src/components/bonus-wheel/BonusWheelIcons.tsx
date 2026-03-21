"use client";

import type { EightSegmentIconVariant } from "./eightSegmentsData";

const STROKE = "rgba(245,240,232,0.88)";
const SW = 1.35;

/** Иконки строго по смыслу сектора; без дублирования образов между секторами. */
export function SegmentGlyph({ variant, size = 11 }: { variant: EightSegmentIconVariant; size?: number }) {
  const s = size / 24;
  const c = {
    fill: "none" as const,
    stroke: STROKE,
    strokeWidth: SW * s,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (variant) {
    case "discount_cocktail_2nd":
      return (
        <g transform={`translate(-12, -12) scale(${s})`}>
          <path d="M12 5v11M9 18h6" {...c} />
          <path d="M12 6l4-1.5v1.5l-4 2.5" {...c} />
          <circle cx={17} cy={7} r={2.2} {...c} />
          <path d="M15.5 7h3M17 5.5v3" {...c} strokeWidth={SW * s * 0.85} />
        </g>
      );
    case "cocktail":
      return (
        <g transform={`translate(-12, -12) scale(${s})`}>
          <path d="M12 4v14M8 18h8" {...c} />
          <path d="M12 6l5-2v2l-5 3" {...c} />
        </g>
      );
    case "beer":
      return (
        <g transform={`translate(-12, -12) scale(${s})`}>
          <path d="M8 5h7v12H8z" {...c} />
          <path d="M15 7h3v10h-3" {...c} />
          <path d="M7 5h10v2H7z" {...c} />
          <path d="M10 9h4M10 12h4" {...c} strokeWidth={SW * s * 0.9} />
        </g>
      );
    case "layered_shot":
      return (
        <g transform={`translate(-12, -12) scale(${s})`}>
          <path d="M9 6h6l-1 12H10L9 6z" {...c} />
          <path d="M9.5 11h5" {...c} strokeWidth={SW * s * 1.1} opacity={0.85} />
          <path d="M9.5 14.5h5" {...c} strokeWidth={SW * s * 1.1} opacity={0.65} />
        </g>
      );
    case "squid":
      return (
        <g transform={`translate(-12, -12) scale(${s})`}>
          <ellipse cx={12} cy={10} rx={5.5} ry={3.2} {...c} />
          <path d="M6.5 10q5.5 5.5 11 0" {...c} />
          <path d="M8 13v4M12 13.5v4M16 13v4" {...c} strokeWidth={SW * s * 0.9} />
        </g>
      );
    case "jerky":
      return (
        <g transform={`translate(-12, -12) scale(${s})`}>
          <path d="M7 9h10v6H7z" {...c} />
          <path d="M8 11h8M8 13.5h8" {...c} strokeWidth={SW * s * 0.85} opacity={0.75} />
        </g>
      );
    case "neutral_soft":
      return (
        <g transform={`translate(-12, -12) scale(${s})`}>
          <path d="M7 11c2 2 6 2 10 0" {...c} />
          <circle cx={9} cy={9} r={0.9} fill={STROKE} stroke="none" />
          <circle cx={15} cy={9} r={0.9} fill={STROKE} stroke="none" />
        </g>
      );
    case "neutral_no_bonus":
      return (
        <g transform={`translate(-12, -12) scale(${s})`}>
          <circle cx={12} cy={12} r={6} {...c} />
          <path d="M9 10h6M9 13h6" {...c} strokeWidth={SW * s * 0.85} opacity={0.6} />
        </g>
      );
    default:
      return null;
  }
}
