import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const from = path.join(root, "source");
const to = path.join(root, "dist", "source");

await fs.rm(to, { recursive: true, force: true });
await fs.cp(from, to, { recursive: true });
console.log("copied source archive to dist/source");
