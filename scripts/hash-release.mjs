import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const [releaseDir, outputName = "checksums.txt"] = process.argv.slice(2);

if (!releaseDir) {
  console.error("Usage: node scripts/hash-release.mjs <releaseDir> [outputName]");
  process.exit(1);
}

async function listTopLevelFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name));
}

async function isRegularFile(filePath) {
  const stat = await fs.lstat(filePath);
  if (stat.isSymbolicLink()) {
    try {
      const targetStat = await fs.stat(filePath);
      return targetStat.isFile();
    } catch {
      return false;
    }
  }

  return stat.isFile();
}

async function sha256(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function main() {
  const absoluteReleaseDir = path.resolve(releaseDir);
  const outputPath = path.join(absoluteReleaseDir, outputName);
  const files = await listTopLevelFiles(absoluteReleaseDir);
  const filtered = files.filter((file) => {
    if (path.resolve(file) === outputPath) return false;
    return file.endsWith(".dmg") || file.endsWith(".exe");
  });

  const lines = [];
  for (const file of filtered) {
    if (!(await isRegularFile(file))) {
      continue;
    }

    const hash = await sha256(file);
    const relative = path.relative(absoluteReleaseDir, file).split(path.sep).join("/");
    lines.push(`${hash}  ${relative}`);
  }

  lines.sort();
  await fs.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
}

main().catch((error) => {
  console.error("Failed to generate checksums:", error);
  process.exit(1);
});
