"use client";

import { useEffect, useState } from "react";
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
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [candidates.join("|")]);

  const src = iconSrc(candidates.slice(index));
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
      onError={() => setIndex((current) => current + 1)}
    />
  );
}
