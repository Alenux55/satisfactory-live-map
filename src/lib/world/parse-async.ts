import { existsSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { logger } from "@/lib/log";
import { parseSaveBuffer } from "./extract";
import type { MapEntity, SaveHeaderInfo } from "./types";

export type ParsedWorld = {
  header: SaveHeaderInfo;
  entities: MapEntity[];
};

const WORKER_FILE = path.join(process.cwd(), ".next", "parse-worker", "parse-worker.js");

export function parseSaveAsync(
  name: string,
  buffer: ArrayBuffer,
  onProgress?: (progress: number, message?: string) => void,
): Promise<ParsedWorld> {
  if (!existsSync(WORKER_FILE)) {
    logger.warn("parse worker missing; parsing on the main thread (HTTP will freeze). Rebuild with npm run build.", {
      worker: WORKER_FILE,
    });
    return Promise.resolve(parseSaveBuffer(name, buffer, onProgress));
  }

  return new Promise((resolve, reject) => {
    const started = Date.now();
    logger.info("parse worker start", { name, bytes: buffer.byteLength, worker: WORKER_FILE });
    const worker = new Worker(WORKER_FILE, {
      workerData: { name, buffer },
      transferList: [buffer],
    });
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      void worker.terminate();
    };

    worker.on("message", (message: { type: string; progress?: number; message?: string; header?: SaveHeaderInfo; entities?: MapEntity[] }) => {
      if (message.type === "progress") {
        onProgress?.(message.progress ?? 0, message.message);
        return;
      }
      if (message.type === "done" && message.header && message.entities) {
        logger.info("parse worker done", {
          name,
          ms: Date.now() - started,
          entities: message.entities.length,
        });
        finish(() => resolve({ header: message.header!, entities: message.entities! }));
        return;
      }
      if (message.type === "error") {
        logger.error("parse worker error", { name, err: message.message, ms: Date.now() - started });
        finish(() => reject(new Error(message.message || "Parse worker failed")));
      }
    });

    worker.on("error", (error) => {
      logger.error("parse worker crashed", { name, err: error.message });
      finish(() => reject(error));
    });

    worker.on("exit", (code) => {
      if (!settled && code !== 0 && code !== null) {
        finish(() => reject(new Error(`Parse worker exited with code ${code}`)));
      }
    });
  });
}
