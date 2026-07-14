import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static");
const ffprobeStatic = require("ffprobe-static");

const pathSeparator = process.platform === "win32" ? ";" : ":";
const extraPaths = [
  ffmpegPath ? dirname(ffmpegPath) : null,
  ffprobeStatic?.path ? dirname(ffprobeStatic.path) : null,
].filter(Boolean);

const env = {
  ...process.env,
  PATH: [...extraPaths, process.env.PATH || ""].join(pathSeparator),
};

const root = dirname(fileURLToPath(import.meta.url));
const binary = join(root, "..", "node_modules", "hyperframes", "dist", "cli.js");

const child = spawn(process.execPath, [binary, ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
