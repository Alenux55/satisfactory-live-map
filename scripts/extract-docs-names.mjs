import { readFileSync, writeFileSync } from "node:fs";

const docsPath = "D:/Games/Steam/steamapps/common/Satisfactory/CommunityResources/Docs/en-US.json";
const buf = readFileSync(docsPath);
let text;
if (buf[0] === 0xff && buf[1] === 0xfe) text = buf.toString("utf16le");
else text = buf.toString("utf8");
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

const docs = JSON.parse(text);
const names = {};
const sc = new Map();
const crateHits = [];

for (const group of docs) {
  for (const cls of group.Classes || []) {
    const display = typeof cls.mDisplayName === "string" ? cls.mDisplayName.trim() : "";
    const className = String(cls.ClassName || "").replace(/_C$/, "");
    const blob = JSON.stringify(cls);
    if (/Crate/i.test(className) || /Crate/i.test(display) || /Crate/i.test(blob.slice(0, 400))) {
      crateHits.push({ className, display, native: group.NativeClass });
    }
    if (display && className) {
      const short = className
        .replace(/^Build_/, "")
        .replace(/^Desc_/, "")
        .replace(/^BP_/, "")
        .replace(/^Recipe_/, "")
        .replace(/^BUILD_/, "");
      const fromBuild = /^Build_|^Desc_/.test(className);
      if (!names[short] || fromBuild) names[short] = display;
    }
    const sub = String(cls.mSubCategories || "");
    const match = sub.match(/Sub_([^/]+)\/SC_([A-Za-z0-9]+)/);
    if (match) {
      const key = `${match[1]}/${match[2]}`;
      const list = sc.get(key) ?? [];
      if (list.length < 6 && !list.includes(className)) list.push(className);
      sc.set(key, list);
    }
  }
}

const outPath = new URL("../src/lib/world/docs-names.json", import.meta.url);
writeFileSync(outPath, `${JSON.stringify(names, null, 2)}\n`);
console.log("wrote", Object.keys(names).length, "names");
console.log("samples", {
  WorkBench: names.WorkBench,
  PowerTower: names.PowerTower,
  PowerTowerPlatform: names.PowerTowerPlatform,
  ConstructorMk1: names.ConstructorMk1,
  Foundation_8x4_01: names.Foundation_8x4_01,
  Packager: names.Packager,
  AlienPowerAugmenter: names.AlienPowerAugmenter,
  Crate: names.Crate,
  StoragePlayer: names.StoragePlayer,
  RadarTower: names.RadarTower,
  TradingPost: names.TradingPost,
  HubTerminal: names.HubTerminal,
});
console.log("crateHits", crateHits);
console.log("--- SC ---");
for (const [key, list] of [...sc.entries()].sort()) {
  console.log(key.padEnd(40), list.slice(0, 5).join(", "));
}
