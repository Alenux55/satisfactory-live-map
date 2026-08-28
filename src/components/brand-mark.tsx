import { APP_VERSION_LABEL } from "@/lib/app-version";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <p className={cn("font-heading text-[11px] tracking-[0.22em] text-primary uppercase", className)}>
      FICSIT Cartography
      <span className="ml-2 font-mono text-[10px] tracking-normal text-muted-foreground normal-case">
        {APP_VERSION_LABEL}
      </span>
    </p>
  );
}
