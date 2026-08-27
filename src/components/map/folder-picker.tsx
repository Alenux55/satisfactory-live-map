"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Folder, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type Entry = { name: string; path: string; dir: boolean; sav?: boolean };

export function FolderPicker({
  onPick,
  disabled,
}: {
  onPick: (dir: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (dir: string) => {
    setError(null);
    const response = await fetch(`/api/fs/browse?path=${encodeURIComponent(dir)}`, { cache: "no-store" });
    const body = (await response.json()) as {
      path?: string;
      parent?: string | null;
      entries?: Entry[];
      error?: string;
    };
    if (!response.ok) {
      setError(body.error ?? "Could not open folder");
      return;
    }
    setCurrent(body.path ?? dir);
    setParent(body.parent ?? null);
    setEntries(body.entries ?? []);
  }, []);

  useEffect(() => {
    if (open) void load("");
  }, [load, open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          <FolderOpen />
          Browse
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-[min(100%,28rem)] flex-col gap-3 p-4">
        <SheetHeader>
          <SheetTitle>Choose save folder</SheetTitle>
        </SheetHeader>
        <p className="font-mono text-[11px] break-all text-muted-foreground">{current || "Shortcuts"}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!parent}
            onClick={() => parent && void load(parent)}
          >
            <ChevronLeft />
            Up
          </Button>
          <Button
            size="sm"
            className="ml-auto"
            disabled={!current}
            onClick={() => {
              onPick(current);
              setOpen(false);
            }}
          >
            Use this folder
          </Button>
        </div>
        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/70">
          {entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] hover:bg-muted/70"
              onClick={() => {
                if (entry.dir) void load(entry.path);
                else {
                  const dir = entry.path.replace(/[\\/][^\\/]+$/, "");
                  onPick(dir);
                  setOpen(false);
                }
              }}
            >
              {entry.dir ? (
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <span className="size-3.5 shrink-0 font-mono text-[10px] text-muted-foreground">sav</span>
              )}
              <span className="truncate">{entry.name}</span>
            </button>
          ))}
          {!entries.length && !error ? (
            <p className="p-3 text-[12px] text-muted-foreground">Empty folder.</p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function nameFromSaveDir(dir: string): string {
  const base = dir.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "Server";
  if (/^\d+$/.test(base)) return `Saves ${base}`;
  if (/^server$/i.test(base)) return "Dedicated server";
  return base.replace(/[_-]+/g, " ");
}
