"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { iconSrc } from "@/lib/world/icons";

export function WikiIcon({
  candidates,
  label,
  className,
}: {
  candidates: string[];
  label: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : iconSrc(candidates);
  if (!src) {
    return <span className={cn("inline-block rounded-sm bg-muted", className)} title={label} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label}
      title={label}
      className={cn("inline-block object-contain", className)}
      onError={() => setFailed(true)}
    />
  );
}
