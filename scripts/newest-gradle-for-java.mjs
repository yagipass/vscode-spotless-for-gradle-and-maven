import console from "node:console";
import process from "node:process";

const extension = "vscjava.vscode-gradle";
const byExtensionName = 7;
const includeVersions = 0x1;
const includeVersionProperties = 0x10;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const channel = process.argv[2];
if (channel !== "stable" && channel !== "pre-release") {
  fail("Usage: node scripts/newest-gradle-for-java.mjs stable|pre-release");
}

const url =
  "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";
const response = await globalThis.fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json;api-version=3.0-preview.1",
  },
  body: JSON.stringify({
    filters: [
      { criteria: [{ filterType: byExtensionName, value: extension }] },
    ],
    flags: includeVersions | includeVersionProperties,
  }),
});
if (!response.ok) {
  fail(`POST ${url} failed with ${response.status}`);
}

const versions =
  (await response.json()).results?.[0]?.extensions?.[0]?.versions ?? [];
const preRelease = (version) =>
  version.properties?.some(
    ({ key, value }) =>
      key === "Microsoft.VisualStudio.Code.PreRelease" && value === "true",
  ) ?? false;
const newest = versions.find(
  (version) => channel === "pre-release" || !preRelease(version),
);
if (newest === undefined) {
  fail(`The Marketplace lists no ${channel} version of ${extension}.`);
}
console.log(newest.version);
