import fs from "node:fs/promises";
import path from "node:path";

const [releaseDir] = process.argv.slice(2);

if (!releaseDir) {
  console.error("Usage: node scripts/alias-release.mjs <releaseDir>");
  process.exit(1);
}

const macAliases = [
  { match: /arm64|aarch64/i, name: "System-Audio-Service-arm64.dmg" },
  { match: /x64|x86_64|intel/i, name: "System-Audio-Service-x64.dmg" },
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
    await fs.copyFile(sourcePath, targetPath);
  }

  const allowedFiles = new Set([
    "System-Audio-Service-Setup.exe",
    "System-Audio-Service-arm64.dmg",
    "System-Audio-Service-x64.dmg",
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
