"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-full bg-muted data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-primary select-none data-horizontal:h-full data-vertical:w-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="relative block size-4 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

type BoundedRangeSliderProps = {
  min: number;
  max: number;
  lower: number;
  upper: number;
  step?: number;
  onValueChange: (lower: number, upper: number) => void;
  className?: string;
};

const THUMB_CLASS =
  "absolute top-1/2 size-4 shrink-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3";

function BoundedRangeSlider({
  min,
  max,
  lower,
  upper,
  step = 1,
  onValueChange,
  className,
}: BoundedRangeSliderProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<"lo" | "hi" | null>(null);
  const [active, setActive] = React.useState<"lo" | "hi">("hi");
  const lowerRef = React.useRef(lower);
  const upperRef = React.useRef(upper);
  const onChangeRef = React.useRef(onValueChange);
  lowerRef.current = lower;
  upperRef.current = upper;
  onChangeRef.current = onValueChange;

  const span = Math.max(step, max - min);
  const loPct = ((lower - min) / span) * 100;
  const hiPct = ((upper - min) / span) * 100;

  const clientXToValue = React.useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return lowerRef.current;
      const t = (clientX - rect.left) / rect.width;
      const snapped = Math.round((min + t * (max - min)) / step) * step;
      return Math.min(max, Math.max(min, snapped));
    },
    [max, min, step],
  );

  const apply = React.useCallback(
    (which: "lo" | "hi", value: number) => {
      const lo = lowerRef.current;
      const hi = upperRef.current;
      if (which === "lo") onChangeRef.current(Math.min(value, hi - step), hi);
      else onChangeRef.current(lo, Math.max(value, lo + step));
    },
    [step],
  );

  React.useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragRef.current) return;
      apply(dragRef.current, clientXToValue(event.clientX));
    };
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [apply, clientXToValue]);

  const startDrag = (which: "lo" | "hi") => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = which;
    setActive(which);
    apply(which, clientXToValue(event.clientX));
  };

  const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const value = clientXToValue(event.clientX);
    const distLo = Math.abs(value - lowerRef.current);
    const distHi = Math.abs(value - upperRef.current);
    const which = distLo <= distHi ? "lo" : "hi";
    dragRef.current = which;
    setActive(which);
    apply(which, value);
  };

  const onKeyDown = (which: "lo" | "hi") => (event: React.KeyboardEvent) => {
    const delta =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? -step
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? step
          : 0;
    if (!delta) return;
    event.preventDefault();
    setActive(which);
    apply(which, (which === "lo" ? lowerRef.current : upperRef.current) + delta);
  };

  return (
    <div className={cn("relative flex w-full touch-none items-center select-none", className)}>
      <div
        ref={trackRef}
        data-slot="slider-track"
        className="relative h-4 w-full grow cursor-pointer touch-none"
        onPointerDown={onTrackPointerDown}
      >
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 overflow-hidden rounded-full bg-muted" />
        <div
          data-slot="slider-range"
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${loPct}%`, width: `${Math.max(0, hiPct - loPct)}%` }}
        />
        <button
          type="button"
          data-slot="slider-thumb"
          role="slider"
          aria-label="Lower height"
          aria-valuemin={min}
          aria-valuemax={upper - step}
          aria-valuenow={lower}
          className={THUMB_CLASS}
          style={{ left: `${loPct}%`, zIndex: active === "lo" ? 3 : 1 }}
          onPointerDown={startDrag("lo")}
          onKeyDown={onKeyDown("lo")}
        />
        <button
          type="button"
          data-slot="slider-thumb"
          role="slider"
          aria-label="Upper height"
          aria-valuemin={lower + step}
          aria-valuemax={max}
          aria-valuenow={upper}
          className={THUMB_CLASS}
          style={{ left: `${hiPct}%`, zIndex: active === "hi" ? 3 : 2 }}
          onPointerDown={startDrag("hi")}
          onKeyDown={onKeyDown("hi")}
        />
      </div>
    </div>
  );
}

export { Slider, BoundedRangeSlider }
