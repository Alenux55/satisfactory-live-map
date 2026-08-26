import { readFileSync } from "node:fs";
import { parseSaveBuffer } from "./extract";

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function run(name: string, filePath: string): void {
  const bytes = readFileSync(filePath);
  const parsed = parseSaveBuffer(name, toArrayBuffer(bytes), (progress, message) => {
    process.send?.({ type: "progress", progress, message });
  });
  process.send?.({ type: "done", header: parsed.header, entities: parsed.entities });
}

const name = process.argv[2];
const filePath = process.argv[3];
if (!name || !filePath) {
  process.send?.({ type: "error", message: "parse child expected name and save path arguments" });
  process.exit(1);
}

try {
  run(name, filePath);
} catch (error) {
  process.send?.({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}
