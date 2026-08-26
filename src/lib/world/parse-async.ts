import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { logger } from "@/lib/log";
import { parseSaveBuffer } from "./extract";
import { STAGING_DIR } from "./save-io";
import type { MapEntity, SaveHeaderInfo } from "./types";

export type ParsedWorld = {
  header: SaveHeaderInfo;
  entities: MapEntity[];
};

/** Path is encoded so Turbopack cannot turn it into a build-time module resolve. */
function parseChildScript(): string {
  const fromEnv = process.env.FICSIT_PARSE_CHILD?.trim();
  if (fromEnv) return path.resolve(/*turbopackIgnore: true*/ fromEnv);
  const relative = Buffer.from("Lm5leHQvcGFyc2Utd29ya2VyL3BhcnNlLXdvcmtlci5qcw==", "base64").toString("utf8");
  return path.join(/*turbopackIgnore: true*/ process.cwd(), relative);
}

type ChildMessage =
  | { type: "progress"; progress: number; message?: string }
  | { type: "done"; header: SaveHeaderInfo; entities: MapEntity[] }
  | { type: "error"; message: string };

function spawnParseChild(script: string, name: string, savePath: string): ChildProcess {
  // Require inside the function so Turbopack does not treat spawn/fork as a bundled worker.
  const { spawn } = require("node:child_process") as typeof import("node:child_process");
  return spawn(process.execPath, [script, name, savePath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    windowsHide: true,
  });
}

export async function parseSaveAsync(
  name: string,
  buffer: ArrayBuffer,
  onProgress?: (progress: number, message?: string) => void,
): Promise<ParsedWorld> {
  const script = parseChildScript();
  if (!existsSync(/*turbopackIgnore: true*/ script)) {
    logger.warn("parse child missing; parsing on the main thread (HTTP will freeze). Rebuild with npm run build.", {
      script,
    });
    return parseSaveBuffer(name, buffer, onProgress);
  }

  await mkdir(STAGING_DIR, { recursive: true });
  const tempSave = path.join(STAGING_DIR, `job-${process.pid}-${Date.now()}.sav`);
  await writeFile(tempSave, Buffer.from(buffer));

  try {
    return await new Promise<ParsedWorld>((resolve, reject) => {
      const started = Date.now();
      logger.info("parse child start", { name, bytes: buffer.byteLength, script });
      const child = spawnParseChild(script, name, tempSave);

      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
        if (!child.killed) child.kill();
      };

      child.on("message", (message: ChildMessage) => {
        if (message.type === "progress") {
          onProgress?.(message.progress, message.message);
          return;
        }
        if (message.type === "done") {
          logger.info("parse child done", {
            name,
            ms: Date.now() - started,
            entities: message.entities.length,
          });
          finish(() => resolve({ header: message.header, entities: message.entities }));
          return;
        }
        if (message.type === "error") {
          logger.error("parse child error", { name, err: message.message, ms: Date.now() - started });
          finish(() => reject(new Error(message.message || "Parse child failed")));
        }
      });

      child.on("error", (error) => {
        logger.error("parse child crashed", { name, err: error.message });
        finish(() => reject(error));
      });

      child.on("exit", (code) => {
        if (!settled && code !== 0 && code !== null) {
          finish(() => reject(new Error(`Parse child exited with code ${code}`)));
        }
      });
    });
  } finally {
    await unlink(tempSave).catch(() => undefined);
  }
}
