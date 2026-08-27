"use client";

import { useCallback, useRef } from "react";

export function SidebarResizeHandle({
  edge,
  onDelta,
}: {
  edge: "left" | "right";
  onDelta: (delta: number) => void;
}) {
  const lastX = useRef(0);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      lastX.current = event.clientX;
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const move = (next: PointerEvent) => {
        const delta = next.clientX - lastX.current;
        lastX.current = next.clientX;
        onDelta(edge === "left" ? delta : -delta);
      };
      const up = () => {
        target.releasePointerCapture(event.pointerId);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [edge, onDelta],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={onPointerDown}
      className={`absolute inset-y-0 z-20 hidden w-2 cursor-col-resize touch-none hover:bg-primary/25 md:block ${
        edge === "left" ? "-right-1" : "-left-1"
      }`}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-primary" />
    </div>
  );
}
