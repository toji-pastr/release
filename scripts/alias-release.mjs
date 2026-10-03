import fs from "node:fs/promises";
import path from "node:path";

const [releaseDir] = process.argv.slice(2);

if (!releaseDir) {
  console.error("Usage: node scripts/alias-release.mjs <releaseDir>");
  process.exit(1);
}

const macAliases = [
  { match: /arm64|aarch64/i, name: "Activity-Monitor-arm64.dmg" },
  { match: /x64|x86_64|intel/i, name: "Activity-Monitor-x64.dmg" },
];

async function main() {
  const absoluteReleaseDir = path.resolve(releaseDir);
  const entries = await fs.readdir(absoluteReleaseDir);
  const dmgEntries = entries.filter((entry) => entry.endsWith(".dmg"));

  for (const dmgName of dmgEntries) {
    const alias = macAliases.find((candidate) => candidate.match.test(dmgName));
    if (!alias) {
      continue;
    }

    const sourcePath = path.join(absoluteReleaseDir, dmgName);
    const targetPath = path.join(absoluteReleaseDir, alias.name);
    // The build already emits the canonical name (electron-builder
    // artifactName "Activity-Monitor-${arch}.${ext}"), so the match is often
    // the file itself; copying a file onto itself would error.
    if (sourcePath === targetPath) {
      continue;
    }
    await fs.copyFile(sourcePath, targetPath);
  }

  const allowedFiles = new Set([
    "Activity-Monitor-Setup.exe",
    "Activity-Monitor-arm64.dmg",
    "Activity-Monitor-x64.dmg",
  ]);

  const finalEntries = await fs.readdir(absoluteReleaseDir);
  for (const entry of finalEntries) {
    if (entry.startsWith("checksums-")) {
      continue;
    }

    if (entry.endsWith(".dmg") || entry.endsWith(".exe")) {
      if (!allowedFiles.has(entry)) {
        await fs.rm(path.join(absoluteReleaseDir, entry));
      }
    }
  }
}

main().catch((error) => {
  console.error("Failed to create release aliases:", error);
  process.exit(1);
});
