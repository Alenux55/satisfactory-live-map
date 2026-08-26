import { parentPort, workerData } from "node:worker_threads";
import { parseSaveBuffer } from "./extract";

type Job = {
  name: string;
  buffer: ArrayBuffer;
};

type FromWorker =
  | { type: "progress"; progress: number; message?: string }
  | { type: "done"; header: ReturnType<typeof parseSaveBuffer>["header"]; entities: ReturnType<typeof parseSaveBuffer>["entities"] }
  | { type: "error"; message: string };

function run(job: Job): void {
  try {
    const parsed = parseSaveBuffer(job.name, job.buffer, (progress, message) => {
      const payload: FromWorker = { type: "progress", progress, message };
      parentPort?.postMessage(payload);
    });
    const payload: FromWorker = { type: "done", header: parsed.header, entities: parsed.entities };
    parentPort?.postMessage(payload);
  } catch (error) {
    const payload: FromWorker = {
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    };
    parentPort?.postMessage(payload);
  }
}

if (!parentPort) {
  throw new Error("parse-worker must run as a worker thread");
}

run(workerData as Job);
