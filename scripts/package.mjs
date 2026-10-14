import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename } from "node:path";

// Builds dist/page-lens-reader-v<version>.zip for "Load unpacked" or a store upload.
const { version } = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
const staging = "dist/page-lens-reader";
const archive = `page-lens-reader-v${version}.zip`;
rmSync("dist", { recursive: true, force: true });
// The real config.local.js holds a private proxy key, so the package ships an empty one.
cpSync("extension", staging, { recursive: true, filter: (source) => !["config.local.js", ".DS_Store"].includes(basename(source)) });
writeFileSync(`${staging}/config.local.js`, "// Optional local defaults; see config.local.example.js. Keys are best entered in Settings.\n");
const zip = spawnSync("zip", ["-qr", `../${archive}`, "."], { cwd: staging, stdio: "inherit" });
if (zip.status !== 0) process.exit(zip.status ?? 1);
console.log(`dist/${archive}`);
