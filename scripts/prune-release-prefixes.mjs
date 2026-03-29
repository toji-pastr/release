import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const [manifestPath] = process.argv.slice(2);

if (!manifestPath) {
  console.error("Usage: node scripts/prune-release-prefixes.mjs <manifestPath>");
  process.exit(1);
}

const { R2_BUCKET, R2_ENDPOINT_URL, RETAIN_PREVIOUS_RELEASES } = process.env;

if (!R2_BUCKET || !R2_ENDPOINT_URL) {
  console.error("Missing R2 bucket configuration.");
  process.exit(1);
}

async function runAws(args) {
  const { stdout } = await execFileAsync("aws", args, {
    env: process.env,
  });

  return stdout;
}

async function listTopLevelPrefixes() {
  const stdout = await runAws([
    "s3api",
    "list-objects-v2",
    "--bucket",
    R2_BUCKET,
    "--delimiter",
    "/",
    "--endpoint-url",
    R2_ENDPOINT_URL,
    "--output",
    "json",
  ]);

  const payload = JSON.parse(stdout);
  return (payload.CommonPrefixes || [])
    .map((entry) => entry.Prefix)
    .filter((prefix) => typeof prefix === "string");
}

async function deletePrefix(prefix) {
  await runAws([
    "s3",
    "rm",
    `s3://${R2_BUCKET}/${prefix}`,
    "--recursive",
    "--endpoint-url",
    R2_ENDPOINT_URL,
  ]);
}

async function main() {
  const manifestContent = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestContent);
  const retainedTags = new Set(
    (manifest.releases || [])
      .map((release) => release?.tag)
      .filter((tag) => typeof tag === "string")
  );

  const prefixes = await listTopLevelPrefixes();
  const removablePrefixes = prefixes.filter((prefix) => {
    if (!prefix.startsWith("v")) {
      return false;
    }

    const normalizedTag = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    return !retainedTags.has(normalizedTag);
  });

  if (removablePrefixes.length === 0) {
    console.log(
      `No old release prefixes to prune. Keeping latest plus ${RETAIN_PREVIOUS_RELEASES ?? "5"} previous releases.`
    );
    return;
  }

  for (const prefix of removablePrefixes) {
    console.log(`Pruning old release prefix: ${prefix}`);
    await deletePrefix(prefix);
  }
}

main().catch((error) => {
  console.error("Failed to prune release prefixes:", error);
  process.exit(1);
});
