import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Each mac build job (arm64, x64) writes its own latest-mac.yml, renamed to
 * latest-mac-<arch>.yml before upload so the two do not overwrite each other.
 * electron-updater reads one latest-mac.yml and picks the zip for its own
 * arch by name ("arm64" in the file name), so this merges the two file lists
 * into that one file.
 *
 * No per-arch files (a source ref from before self-update): nothing to do.
 * Exactly one: an arch is missing, which must not publish a feed that would
 * offer the other arch's build.
 */

/** Parses the fixed shape electron-builder writes (version, files, path, sha512, releaseDate). */
export function parseUpdateInfo(text) {
  const info = { files: [] };
  let current = null;
  let inFiles = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = /^ {2}- (\w+): (.*)$/.exec(line);
    const field = /^ {4}(\w+): (.*)$/.exec(line);
    const top = /^(\w+):\s*(.*)$/.exec(line);
    if (inFiles && item) {
      current = { [item[1]]: unquote(item[2]) };
      info.files.push(current);
    } else if (inFiles && field && current) {
      current[field[1]] = unquote(field[2]);
    } else if (top) {
      inFiles = top[1] === "files";
      current = null;
      if (!inFiles) info[top[1]] = unquote(top[2]);
    } else {
      throw new Error(`Unexpected line in update info: ${line}`);
    }
  }
  return info;
}

function unquote(value) {
  const trimmed = value.trim();
  return /^'.*'$|^".*"$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

export function mergeUpdateInfo(infos) {
  const versions = new Set(infos.map((info) => info.version));
  if (versions.size !== 1) {
    throw new Error(`mac builds disagree on the version: ${[...versions].join(", ")}`);
  }
  const [first] = infos;
  const releaseDate = infos.map((info) => info.releaseDate).sort().at(-1);
  return { ...first, files: infos.flatMap((info) => info.files), releaseDate };
}

export function serializeUpdateInfo(info) {
  const lines = [`version: ${info.version}`, "files:"];
  for (const file of info.files) {
    lines.push(`  - url: ${file.url}`, `    sha512: ${file.sha512}`, `    size: ${file.size}`);
  }
  lines.push(`path: ${info.path}`, `sha512: ${info.sha512}`, `releaseDate: '${info.releaseDate}'`);
  return `${lines.join("\n")}\n`;
}

async function main(releaseDir) {
  if (!releaseDir) {
    throw new Error("Usage: node scripts/merge-mac-update-info.mjs <releaseDir>");
  }
  const dir = path.resolve(releaseDir);
  const perArch = (await fs.readdir(dir)).filter((name) => /^latest-mac-[\w-]+\.yml$/.test(name)).sort();
  if (perArch.length === 0) {
    console.log("No per-arch mac update info; nothing to merge.");
    return;
  }
  if (perArch.length !== 2) {
    throw new Error(`Expected update info from both mac builds, found: ${perArch.join(", ")}`);
  }
  const infos = await Promise.all(
    perArch.map(async (name) => parseUpdateInfo(await fs.readFile(path.join(dir, name), "utf8")))
  );
  const merged = mergeUpdateInfo(infos);
  await fs.writeFile(path.join(dir, "latest-mac.yml"), serializeUpdateInfo(merged));
  await Promise.all(perArch.map((name) => fs.rm(path.join(dir, name))));
  console.log(`Merged ${perArch.join(" + ")} into latest-mac.yml (${merged.files.length} files, ${merged.version}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2]).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
