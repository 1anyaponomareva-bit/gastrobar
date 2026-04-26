"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type SyntheticEvent,
} from "react";

/**
 * Один `src`, без отдельных blur-файлов: при загрузке — `filter: blur(20px)` и лёгкий
 * `scale(1.05)` (только если нет своего `transform` в `style` / `className` — иначе бы
 * перебили Tailwind `scale-*` у FUZZY, настоек и т.д.).
 */
export function SmartImage({
  className,
  style,
  onLoad,
  alt = "",
  src,
  loading = "lazy",
  ...rest
}: ComponentProps<"img">) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement | null>(null);

  const styleObj = (style ?? {}) as CSSProperties;
  const hasInlineTransform = styleObj.transform != null && styleObj.transform !== "";
  const hasClassScale = typeof className === "string" && /scale(-|\[)/.test(className);
  const useLoadScale = !hasInlineTransform && !hasClassScale;

  useLayoutEffect(() => {
    const el = ref.current;
    if (el?.complete) setLoaded(true);
    else setLoaded(false);
  }, [src]);

  const handleLoad = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      setLoaded(true);
      onLoad?.(e);
    },
    [onLoad]
  );

  const transform =
    loaded ? styleObj.transform : useLoadScale ? "scale(1.05)" : styleObj.transform;

  const loadFilter = loaded
    ? styleObj.filter != null
      ? styleObj.filter
      : "blur(0px)"
    : "blur(20px)";

  return (
    <img
      {...rest}
      ref={ref}
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onLoad={handleLoad}
      style={{
        ...style,
        filter: loadFilter,
        transform,
        transition: "filter 0.4s ease, transform 0.4s ease",
      }}
    />
  );
}
