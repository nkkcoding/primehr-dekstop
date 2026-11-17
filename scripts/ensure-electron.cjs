#!/usr/bin/env node
/**
 * Ensures the Electron platform binary is present after npm install.
 * npm may skip lifecycle scripts (ignore-scripts / allowScripts), leaving
 * node_modules/electron without dist/. Re-runs electron's install.js when needed.
 *
 * Usage: node scripts/ensure-electron.cjs
 * Also hooked as postinstall (best-effort; if scripts are blocked, run this manually).
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const electronDir = path.join(root, "node_modules", "electron");
const installJs = path.join(electronDir, "install.js");
const pathTxt = path.join(electronDir, "path.txt");

function log(msg) {
  console.log(`[ensure-electron] ${msg}`);
}

function warn(msg) {
  console.warn(`[ensure-electron] ${msg}`);
}

function electronBinaryPath() {
  if (!fs.existsSync(pathTxt)) return null;
  const rel = fs.readFileSync(pathTxt, "utf8").trim();
  if (!rel) return null;
  const full = path.join(electronDir, "dist", rel);
  return full;
}

function isBinaryOk() {
  const bin = electronBinaryPath();
  if (!bin) return false;
  try {
    const st = fs.statSync(bin);
    // Incomplete downloads are often tiny stubs / empty files
    return st.isFile() && st.size > 1_000_000;
  } catch {
    return false;
  }
}

const strict = process.argv.includes("--strict");

function fail(msg) {
  warn(msg);
  process.exitCode = strict ? 1 : 0;
}

function main() {
  if (!fs.existsSync(electronDir)) {
    fail(
      "electron package missing. Run: npm install electron --save-dev\n" +
        "  If npm blocked scripts: npm config set ignore-scripts false\n" +
        "  Then: npm rebuild electron  OR  node node_modules/electron/install.js\n" +
        "  Web trial still works: npm run dev:host",
    );
    return;
  }

  if (isBinaryOk()) {
    log(`OK: ${electronBinaryPath()}`);
    return;
  }

  if (!fs.existsSync(installJs)) {
    fail("electron/install.js missing — reinstall electron package");
    return;
  }

  log("Electron binary missing or incomplete — running install.js …");
  const result = spawnSync(process.execPath, [installJs], {
    cwd: electronDir,
    stdio: "inherit",
    env: {
      ...process.env,
      // Never skip when we explicitly repair
      ELECTRON_SKIP_BINARY_DOWNLOAD: "",
    },
  });

  if (result.status !== 0) {
    fail(
      "Electron download failed.\n" +
        "  1) npm config set ignore-scripts false\n" +
        "  2) npm install electron --save-dev\n" +
        "  3) node scripts/ensure-electron.cjs --strict\n" +
        "  Web trial still works without Electron: npm run dev:host",
    );
    return;
  }

  if (!isBinaryOk()) {
    fail("install.js finished but binary still missing/incomplete");
    return;
  }

  log(`Repaired: ${electronBinaryPath()}`);
}

main();
