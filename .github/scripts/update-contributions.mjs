// Regenerate the "Recent Open-Source Contributions" table in README.md from the
// user's live pull requests. Runs in CI (see .github/workflows/contributions.yml).
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const USER = "n0liu";
// Own account and company orgs never belong on the personal contributions list.
const EXCLUDE_OWNERS = new Set(["n0liu", "mrgut2018", "mrgut"]);
const START = "<!-- CONTRIBUTIONS:START -->";
const END = "<!-- CONTRIBUTIONS:END -->";
const MAX_ROWS = 12;
const OPEN_MAX_AGE_DAYS = 365;

const raw = execSync(
  `gh search prs --author=${USER} --limit 60 --json url,title,state,isDraft,createdAt`,
  { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
);
const prs = JSON.parse(raw);

const parseRepo = (url) => {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/\d+/);
  return m ? { owner: m[1], repo: m[2] } : null;
};

const cutoff = Date.now() - OPEN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

const selected = prs
  .map((pr) => ({ ...pr, info: parseRepo(pr.url) }))
  .filter((pr) => {
    if (!pr.info) return false;
    if (EXCLUDE_OWNERS.has(pr.info.owner.toLowerCase())) return false;
    if (pr.state === "closed") return false; // hide closed-unmerged
    // keep merged forever, but drop stale open PRs that will never land
    if (pr.state === "open" && new Date(pr.createdAt).getTime() < cutoff) {
      return false;
    }
    return true;
  })
  .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  .slice(0, MAX_ROWS);

// Don't wipe a good table if the search API hiccups and returns nothing.
if (selected.length === 0) {
  console.log("no contributions matched; leaving README unchanged");
  process.exit(0);
}

const cleanTitle = (title) => {
  const stripped = title
    .replace(/^[\p{Extended_Pictographic}️\s]+/u, "") // leading gitmoji
    .replace(/^\w+(\([^)]*\))?!?:\s*/, "") // conventional-commit prefix
    .replace(/\|/g, "\\|")
    .trim();
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
};

const statusOf = (pr) =>
  pr.state === "merged"
    ? "✅ Merged"
    : pr.isDraft
      ? "⚪ Draft"
      : "🔵 In review";

const rows = selected
  .map(
    (pr) =>
      `| [${pr.info.owner}/${pr.info.repo}](${pr.url}) | ${cleanTitle(pr.title)} | ${statusOf(pr)} |`,
  )
  .join("\n");

const table = [
  "| Project | Contribution | Status |",
  "| --- | --- | --- |",
  rows,
].join("\n");

const readme = readFileSync("README.md", "utf8");
const region = new RegExp(`${START}[\\s\\S]*?${END}`);
if (!region.test(readme)) {
  console.error("CONTRIBUTIONS markers not found in README.md");
  process.exit(1);
}
writeFileSync("README.md", readme.replace(region, `${START}\n\n${table}\n\n${END}`));
console.log(`updated ${selected.length} contributions`);
