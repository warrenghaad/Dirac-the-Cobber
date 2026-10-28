/**
 * Verifies that the configured GitHub remote can be read and that the current
 * commit could be pushed, without changing any remote refs.
 *
 * Usage:
 *   pnpm run preflight:github
 *   pnpm run preflight:github -- --remote origin --branch main
 *   pnpm run preflight:github -- --json
 *   pnpm run publish:github -- --remote origin --branch main
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export type GitResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type GitRunner = (args: string[]) => GitResult;

export type PreflightState =
  | "ready-empty"
  | "ready-existing"
  | "authentication-failure"
  | "read-failure"
  | "write-failure"
  | "history-conflict"
  | "configuration-error";

export type PreflightReport = {
  ok: boolean;
  state: PreflightState;
  remote: string | null;
  fetchUrl?: string;
  pushUrl?: string;
  branch: string | null;
  repositoryEmpty: boolean | null;
  read: { ok: boolean; detail?: string };
  write: { ok: boolean; detail?: string };
  action?: string;
};

export type PublishResult = {
  preflight: PreflightReport;
  push?: GitResult;
};

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function runGit(args: string[]): GitResult {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

function output(result: GitResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}

function containsAuthenticationFailure(detail: string): boolean {
  return /authentication failed|authorization failed|permission denied|permission to .+ denied|could not read username|access denied|repository not found|remote: not found|401|403/i.test(
    detail,
  );
}

function containsHistoryConflict(detail: string): boolean {
  return /non-fast-forward|fetch first|rejected|remote contains work|updates were rejected|would be overwritten/i.test(
    detail,
  );
}

function isGithubUrl(url: string): boolean {
  return /(?:^|[@/])github\.com(?::|\/)/i.test(url);
}

function githubRepositoryPath(url: string): string[] | null {
  let repositoryPath = "";
  if (url.startsWith("git@github.com:")) {
    repositoryPath = url.slice("git@github.com:".length);
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.toLowerCase() !== "github.com") return null;
      repositoryPath = parsed.pathname;
    } catch {
      return null;
    }
  }

  return repositoryPath
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean);
}

function safeRemoteUrl(url: string): string {
  return url
    .replace(
      /([a-z][a-z0-9+.-]*:\/\/)([^/\s?#]+)([^\s]*)/gi,
      (_match, scheme: string, authority: string, remainder: string) => {
        const host = authority.includes("@")
          ? authority.slice(authority.lastIndexOf("@") + 1)
          : authority;
        return `${scheme}${host}${remainder.split(/[?#]/, 1)[0]}`;
      },
    )
    .replace(
      /[^\s@]+@([^:\s]+):([^\s?#]+)(?:[?#][^\s]*)?/g,
      "[userinfo]@$1:$2",
    );
}

function safeDetail(detail: string): string {
  return safeRemoteUrl(detail);
}

function sameGithubRepository(firstUrl: string, secondUrl: string): boolean {
  const first = githubRepositoryPath(firstUrl);
  const second = githubRepositoryPath(secondUrl);
  return (
    first?.length === 2 &&
    second?.length === 2 &&
    first[0].toLowerCase() === second[0].toLowerCase() &&
    first[1].toLowerCase() === second[1].toLowerCase()
  );
}

function getRemoteNames(git: GitRunner): string[] {
  const result = git(["remote"]);
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function selectGithubRemote(
  git: GitRunner,
  requestedRemote?: string,
): { name: string; fetchUrl: string; pushUrl: string } | { error: string } {
  const names = getRemoteNames(git);
  const getUrls = (
    name: string,
  ):
    { name: string; fetchUrl: string; pushUrl: string } | { error: string } => {
    const fetchResult = git(["remote", "get-url", name]);
    const fetchUrl = fetchResult.stdout.trim();
    if (fetchResult.status !== 0 || !fetchUrl) {
      return { error: `Git remote "${name}" has no readable fetch URL.` };
    }
    const pushResult = git(["remote", "get-url", "--push", name]);
    const pushUrl = pushResult.stdout.trim();
    if (pushResult.status !== 0 || !pushUrl) {
      return { error: `Git remote "${name}" has no readable push URL.` };
    }
    return { name, fetchUrl, pushUrl };
  };

  if (requestedRemote) {
    if (!names.includes(requestedRemote)) {
      return { error: `Git remote "${requestedRemote}" is not configured.` };
    }
    const urls = getUrls(requestedRemote);
    if ("error" in urls) return urls;
    if (!isGithubUrl(urls.fetchUrl) || !isGithubUrl(urls.pushUrl)) {
      return {
        error: `Git remote "${requestedRemote}" must use GitHub for both fetch and push.`,
      };
    }
    return urls;
  }

  const githubRemotes = names.flatMap((name) => {
    const result = git(["remote", "get-url", name]);
    const fetchUrl = result.stdout.trim();
    return result.status === 0 && isGithubUrl(fetchUrl) ? [name] : [];
  });

  if (githubRemotes.length === 0) {
    return {
      error:
        "No configured GitHub remote was found. Pass --remote <name> after configuring one.",
    };
  }
  if (githubRemotes.length > 1) {
    return {
      error: `More than one GitHub remote is configured (${githubRemotes.join(", ")}). Pass --remote <name> to choose the publishing remote.`,
    };
  }
  return getUrls(githubRemotes[0]);
}

export function preflightGithub({
  git,
  requestedRemote,
  branch,
}: {
  git: GitRunner;
  requestedRemote?: string;
  branch?: string;
}): PreflightReport {
  const selected = selectGithubRemote(git, requestedRemote);
  if ("error" in selected) {
    return {
      ok: false,
      state: "configuration-error",
      remote: requestedRemote ?? null,
      branch: branch ?? null,
      repositoryEmpty: null,
      read: { ok: false },
      write: { ok: false },
      action: selected.error,
    };
  }

  const fetchRepositoryPath = githubRepositoryPath(selected.fetchUrl);
  const pushRepositoryPath = githubRepositoryPath(selected.pushUrl);
  if (
    !fetchRepositoryPath ||
    fetchRepositoryPath.length !== 2 ||
    !pushRepositoryPath ||
    pushRepositoryPath.length !== 2
  ) {
    return {
      ok: false,
      state: "configuration-error",
      remote: selected.name,
      fetchUrl: safeRemoteUrl(selected.fetchUrl),
      pushUrl: safeRemoteUrl(selected.pushUrl),
      branch: branch ?? null,
      repositoryEmpty: null,
      read: {
        ok: false,
        detail:
          "The fetch and push URLs must point to github.com/<owner>/<repository>.",
      },
      write: { ok: false },
      action: `Update the fetch and push URLs for remote "${selected.name}" to exact GitHub repository URLs, then rerun this preflight.`,
    };
  }

  if (!sameGithubRepository(selected.fetchUrl, selected.pushUrl)) {
    return {
      ok: false,
      state: "configuration-error",
      remote: selected.name,
      fetchUrl: safeRemoteUrl(selected.fetchUrl),
      pushUrl: safeRemoteUrl(selected.pushUrl),
      branch: branch ?? null,
      repositoryEmpty: null,
      read: {
        ok: false,
        detail:
          "The fetch URL and push URL target different GitHub repositories.",
      },
      write: { ok: false },
      action: `Align the fetch and push URLs for remote "${selected.name}" before publishing, then rerun this preflight.`,
    };
  }

  const resolvedBranch =
    branch ??
    (() => {
      const result = git(["branch", "--show-current"]);
      return result.status === 0 ? result.stdout.trim() : "";
    })();
  if (!resolvedBranch) {
    return {
      ok: false,
      state: "configuration-error",
      remote: selected.name,
      fetchUrl: safeRemoteUrl(selected.fetchUrl),
      pushUrl: safeRemoteUrl(selected.pushUrl),
      branch: null,
      repositoryEmpty: null,
      read: { ok: false },
      write: { ok: false },
      action:
        "The current checkout is detached. Pass --branch <name> for the branch that will be published.",
    };
  }

  const readResult = git(["ls-remote", selected.name]);
  const readDetail = output(readResult);
  if (readResult.status !== 0) {
    const authenticationFailure = containsAuthenticationFailure(readDetail);
    return {
      ok: false,
      state: authenticationFailure ? "authentication-failure" : "read-failure",
      remote: selected.name,
      fetchUrl: safeRemoteUrl(selected.fetchUrl),
      pushUrl: safeRemoteUrl(selected.pushUrl),
      branch: resolvedBranch,
      repositoryEmpty: null,
      read: {
        ok: false,
        detail: authenticationFailure ? undefined : safeDetail(readDetail),
      },
      write: { ok: false },
      action: authenticationFailure
        ? `Reconnect the GitHub account used by this workspace in its connected services, confirm it can access ${fetchRepositoryPath[0]}/${fetchRepositoryPath[1]}, then rerun this preflight.`
        : `Fix the GitHub remote/network error and rerun this preflight. Detail: ${safeDetail(readDetail)}`,
    };
  }

  const repositoryEmpty = readResult.stdout.trim().length === 0;
  const writeResult = git([
    "push",
    "--dry-run",
    selected.name,
    `HEAD:refs/heads/${resolvedBranch}`,
  ]);
  const writeDetail = output(writeResult);
  if (writeResult.status !== 0) {
    const authenticationFailure = containsAuthenticationFailure(writeDetail);
    const historyConflict = containsHistoryConflict(writeDetail);
    return {
      ok: false,
      state: authenticationFailure
        ? "authentication-failure"
        : historyConflict
          ? "history-conflict"
          : "write-failure",
      remote: selected.name,
      fetchUrl: safeRemoteUrl(selected.fetchUrl),
      pushUrl: safeRemoteUrl(selected.pushUrl),
      branch: resolvedBranch,
      repositoryEmpty,
      read: { ok: true },
      write: {
        ok: false,
        detail: authenticationFailure ? undefined : safeDetail(writeDetail),
      },
      action: authenticationFailure
        ? `Reconnect the GitHub account used by this workspace in its connected services, confirm it has write access to ${pushRepositoryPath[0]}/${pushRepositoryPath[1]}, then rerun this preflight.`
        : historyConflict
          ? `The remote already has unrelated history on "${resolvedBranch}". Fetch and reconcile it before publishing; this preflight did not change remote history.`
          : `Resolve the GitHub write error and rerun this preflight. Detail: ${safeDetail(writeDetail)}`,
    };
  }

  return {
    ok: true,
    state: repositoryEmpty ? "ready-empty" : "ready-existing",
    remote: selected.name,
    fetchUrl: safeRemoteUrl(selected.fetchUrl),
    pushUrl: safeRemoteUrl(selected.pushUrl),
    branch: resolvedBranch,
    repositoryEmpty,
    read: { ok: true },
    write: { ok: true },
  };
}

/**
 * Runs the access preflight and pushes only the exact remote and branch that
 * passed both the read and dry-run write checks.
 */
export function publishGithub({
  git,
  requestedRemote,
  branch,
}: {
  git: GitRunner;
  requestedRemote?: string;
  branch?: string;
}): PublishResult {
  const preflight = preflightGithub({ git, requestedRemote, branch });
  if (!preflight.ok) return { preflight };

  const push = git([
    "push",
    preflight.remote!,
    `HEAD:refs/heads/${preflight.branch!}`,
  ]);
  return { preflight, push };
}

function parseArgs(args: string[]): {
  remote?: string;
  branch?: string;
  json: boolean;
  publish: boolean;
} {
  let remote: string | undefined;
  let branch: string | undefined;
  let json = false;
  let publish = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--publish") {
      publish = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--remote" && args[index + 1]) {
      remote = args[++index];
    } else if (arg === "--branch" && args[index + 1]) {
      branch = args[++index];
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: pnpm run preflight:github -- [--remote <name>] [--branch <name>] [--json]",
      );
      console.log(
        "       pnpm run publish:github -- [--remote <name>] [--branch <name>]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }

  return { remote, branch, json, publish };
}

function printReport(report: PreflightReport, publishing: boolean): void {
  if (report.ok) {
    const repositoryState = report.repositoryEmpty
      ? "empty repository"
      : "existing repository";
    console.log(
      `GitHub preflight OK: ${repositoryState}; read access and write access verified for "${report.remote}" on branch "${report.branch}".`,
    );
    console.log(
      publishing
        ? "Preflight passed; publishing the verified branch now."
        : "No remote history was changed (write check used git push --dry-run).",
    );
    return;
  }

  console.error(`GitHub preflight FAILED: ${report.state}.`);
  if (report.remote) console.error(`Remote: ${report.remote}`);
  if (report.fetchUrl) console.error(`Fetch URL: ${report.fetchUrl}`);
  if (report.pushUrl) console.error(`Push URL: ${report.pushUrl}`);
  if (report.branch) console.error(`Branch: ${report.branch}`);
  if (report.repositoryEmpty !== null) {
    console.error(
      `Repository state: ${report.repositoryEmpty ? "empty" : "contains refs"}.`,
    );
  }
  if (report.action) console.error(`Action: ${report.action}`);
  console.error("No remote history was changed.");
}

export function main(): void {
  const { remote, branch, json, publish } = parseArgs(process.argv.slice(2));
  const result = publish
    ? publishGithub({ git: runGit, requestedRemote: remote, branch })
    : {
        preflight: preflightGithub({
          git: runGit,
          requestedRemote: remote,
          branch,
        }),
      };
  const report = result.preflight;
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report, publish);
    if (publish && report.ok && result.push?.status === 0) {
      console.log(
        `GitHub publish OK: pushed HEAD to "${report.remote}" branch "${report.branch}".`,
      );
    } else if (publish && report.ok) {
      console.error(
        `GitHub publish FAILED: ${safeDetail(output(result.push ?? { status: null, stdout: "", stderr: "" })) || "git push failed."}`,
      );
    }
  }
  if (!report.ok || (publish && result.push?.status !== 0)) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
