import { promises as fs } from "node:fs";
import { SaveReader, SatisfactorySaveHeader } from "@etothepii/satisfactory-file-parser";
import { newestWatchableSave } from "./save-io";
import type { SaveHeaderInfo } from "./types";

const HEADER_PEEK_BYTES = 256 * 1024;

export function peekSaveHeader(bytes: ArrayBufferLike): SaveHeaderInfo | null {
  try {
    const reader = new SaveReader(bytes);
    const header = SatisfactorySaveHeader.Parse(reader);
    const saveIdentifier = header.saveIdentifier?.trim();
    return {
      sessionName: header.sessionName || "Unnamed session",
      mapName: header.mapName || "Persistent_Level",
      playDurationSeconds: header.playDurationSeconds ?? 0,
      saveDateTime: String(header.saveDateTime ?? ""),
      buildVersion: header.buildVersion ?? 0,
      ...(header.creativeModeEnabled ? { creativeModeEnabled: true } : {}),
      ...(saveIdentifier ? { saveIdentifier } : {}),
    };
  } catch {
    return null;
  }
}

export async function peekNewestSaveHeader(savesDir: string): Promise<SaveHeaderInfo | null> {
  let file: string | null;
  try {
    file = await newestWatchableSave(savesDir);
  } catch {
    return null;
  }
  if (!file) return null;
  const handle = await fs.open(file, "r");
  try {
    const buf = Buffer.allocUnsafe(HEADER_PEEK_BYTES);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    if (bytesRead < 32) return null;
    const copy = Uint8Array.from(buf.subarray(0, bytesRead));
    return peekSaveHeader(copy.buffer);
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}
