import fs from "node:fs/promises";
import path from "node:path";

const [releaseDir, releaseTag, downloadBaseUrl] = process.argv.slice(2);
const DEFAULT_RETAIN_PREVIOUS_RELEASES = 5;

function parseRetainPreviousReleases(value) {
  if (!value) {
    return DEFAULT_RETAIN_PREVIOUS_RELEASES;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_RETAIN_PREVIOUS_RELEASES;
  }

  return parsed;
}

if (!releaseDir || !releaseTag) {
  console.error("Usage: node scripts/build-release-manifest.mjs <releaseDir> <releaseTag> [downloadBaseUrl]");
  process.exit(1);
}

const manifestFileName = "manifest.json";
const retainPreviousReleases = parseRetainPreviousReleases(process.env.RETAIN_PREVIOUS_RELEASES);
const maxReleaseEntries = retainPreviousReleases + 1;

function getManifestUrls(url) {
  if (!url) {
    return [];
  }

  return [`${url}/${manifestFileName}`, `${url}/latest/${manifestFileName}`];
}

async function readExistingManifest(url) {
  const manifestUrls = getManifestUrls(url);
  if (manifestUrls.length === 0) {
    return { releases: [] };
  }

  for (const manifestUrl of manifestUrls) {
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        continue;
      }

      return response.json();
    } catch {
      continue;
    }
  }

  return { releases: [] };
}

function normalizeTag(value) {
  return value.startsWith("v") ? value : `v${value}`;
}

async function main() {
  const absoluteReleaseDir = path.resolve(releaseDir);
  const entries = await fs.readdir(absoluteReleaseDir);
  const files = entries
    .filter((entry) => entry.endsWith(".dmg") || entry.endsWith(".exe"))
    .sort();

  const existing = await readExistingManifest(downloadBaseUrl);
  const normalizedTag = normalizeTag(releaseTag);
  const version = normalizedTag.replace(/^v/, "");

  const nextRelease = {
    tag: normalizedTag,
    version,
    publishedAt: new Date().toISOString(),
    files,
    notes: null,
  };

  const previousReleases = (existing.releases || [])
    .filter((release) => release.tag !== normalizedTag)
    .slice(0, maxReleaseEntries - 1);

  const releases = [nextRelease, ...previousReleases].slice(0, maxReleaseEntries);
  const manifest = { releases };

  await fs.writeFile(
    path.join(absoluteReleaseDir, manifestFileName),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
}

main().catch((error) => {
  console.error("Failed to build manifest:", error);
  process.exit(1);
});
