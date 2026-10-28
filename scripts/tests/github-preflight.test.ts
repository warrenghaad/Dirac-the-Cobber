import assert from "node:assert/strict";
import test from "node:test";
import {
  preflightGithub,
  publishGithub,
  type GitResult,
} from "../src/github-preflight.ts";

function runner({
  refs = "",
  readStatus = 0,
  readError = "",
  writeStatus = 0,
  writeError = "",
  publishStatus = 0,
  publishError = "",
  branch = "main",
  fetchUrl = "https://github.com/acme/example.git",
  pushUrl = fetchUrl,
}: {
  refs?: string;
  readStatus?: number;
  readError?: string;
  writeStatus?: number;
  writeError?: string;
  publishStatus?: number;
  publishError?: string;
  branch?: string;
  fetchUrl?: string;
  pushUrl?: string;
} = {}) {
  const calls: string[][] = [];
  const git = (args: string[]): GitResult => {
    calls.push(args);
    if (args[0] === "remote") {
      if (args.length === 1)
        return { status: 0, stdout: "origin\n", stderr: "" };
      return {
        status: 0,
        stdout: `${args.includes("--push") ? pushUrl : fetchUrl}\n`,
        stderr: "",
      };
    }
    if (args[0] === "branch")
      return { status: 0, stdout: `${branch}\n`, stderr: "" };
    if (args[0] === "ls-remote") {
      return { status: readStatus, stdout: refs, stderr: readError };
    }
    if (args[0] === "push") {
      if (args.includes("--dry-run")) {
        return { status: writeStatus, stdout: "", stderr: writeError };
      }
      return { status: publishStatus, stdout: "", stderr: publishError };
    }
    throw new Error(`Unexpected git call: ${args.join(" ")}`);
  };
  return { calls, git };
}

test("publishes only after the read and dry-run write checks pass", () => {
  const fake = runner({ refs: "abc123\trefs/heads/main\n" });
  const result = publishGithub({ git: fake.git });

  assert.equal(result.preflight.ok, true);
  assert.equal(result.push?.status, 0);
  assert.deepEqual(fake.calls.slice(-2), [
    ["push", "--dry-run", "origin", "HEAD:refs/heads/main"],
    ["push", "origin", "HEAD:refs/heads/main"],
  ]);
});

test("does not publish when the preflight reports an access failure", () => {
  const fake = runner({
    writeStatus: 1,
    writeError: "remote: Permission to acme/example.git denied.",
  });
  const result = publishGithub({ git: fake.git });

  assert.equal(result.preflight.ok, false);
  assert.equal(result.preflight.state, "authentication-failure");
  assert.equal(result.push, undefined);
  assert.equal(
    fake.calls.some(
      ([command, option]) => command === "push" && option !== "--dry-run",
    ),
    false,
  );
});

test("does not publish when the preflight reports configuration or history conflicts", () => {
  const malformedRemote = runner({
    fetchUrl: "https://github.com/acme/example/nested",
  });
  const malformedResult = publishGithub({ git: malformedRemote.git });
  assert.equal(malformedResult.preflight.state, "configuration-error");
  assert.equal(malformedResult.push, undefined);

  const historyConflict = runner({
    refs: "abc123\trefs/heads/main\n",
    writeStatus: 1,
    writeError: "rejected: non-fast-forward",
  });
  const conflictResult = publishGithub({ git: historyConflict.git });
  assert.equal(conflictResult.preflight.state, "history-conflict");
  assert.equal(conflictResult.push, undefined);
  assert.equal(
    historyConflict.calls.some(
      ([command, option]) => command === "push" && option !== "--dry-run",
    ),
    false,
  );
});

test("reports an empty repository separately after read and dry-run write checks pass", () => {
  const fake = runner();
  const report = preflightGithub({ git: fake.git });

  assert.equal(report.ok, true);
  assert.equal(report.state, "ready-empty");
  assert.equal(report.repositoryEmpty, true);
  assert.deepEqual(fake.calls.slice(-2), [
    ["ls-remote", "origin"],
    ["push", "--dry-run", "origin", "HEAD:refs/heads/main"],
  ]);
});

test("reports an existing repository when refs are readable", () => {
  const report = preflightGithub({
    git: runner({ refs: "abc123\trefs/heads/main\n" }).git,
  });

  assert.equal(report.ok, true);
  assert.equal(report.state, "ready-existing");
  assert.equal(report.repositoryEmpty, false);
});

test("gives the reconnect action for an authentication failure", () => {
  const report = preflightGithub({
    git: runner({
      readStatus: 128,
      readError: "remote: Repository not found.\nfatal: repository not found",
    }).git,
  });

  assert.equal(report.ok, false);
  assert.equal(report.state, "authentication-failure");
  assert.match(report.action ?? "", /Reconnect the GitHub account/);
  assert.equal(report.repositoryEmpty, null);
});

test("distinguishes a write permission failure from an empty repository", () => {
  const report = preflightGithub({
    git: runner({
      writeStatus: 1,
      writeError: "remote: Permission to acme/example.git denied.",
    }).git,
  });

  assert.equal(report.ok, false);
  assert.equal(report.state, "authentication-failure");
  assert.equal(report.repositoryEmpty, true);
  assert.match(report.action ?? "", /write access/);
});

test("reports unrelated remote history instead of calling it an auth failure", () => {
  const report = preflightGithub({
    git: runner({
      refs: "abc123\trefs/heads/main\n",
      writeStatus: 1,
      writeError: "rejected: non-fast-forward",
    }).git,
  });

  assert.equal(report.ok, false);
  assert.equal(report.state, "history-conflict");
  assert.equal(report.repositoryEmpty, false);
});

test("rejects a malformed GitHub repository URL before contacting the remote", () => {
  const fake = runner();
  const originalGit = fake.git;
  fake.git = (args: string[]): GitResult => {
    if (args[0] === "remote" && args.length > 1) {
      return {
        status: 0,
        stdout: "https://github.com/acme/example/nested\n",
        stderr: "",
      };
    }
    return originalGit(args);
  };

  const report = preflightGithub({ git: fake.git });
  assert.equal(report.state, "configuration-error");
  assert.match(report.action ?? "", /exact GitHub repository URLs/);
  assert.deepEqual(fake.calls, [["remote"]]);
});

test("redacts all URL userinfo, query parameters, and fragments from reports", () => {
  const report = preflightGithub({
    git: runner({
      fetchUrl:
        "https://read-token@github.com/acme/example.git?access_token=read-secret#read-fragment",
      pushUrl:
        "https://writer:write-token@github.com/acme/example.git?token=write-secret#write-fragment",
    }).git,
  });

  const serialized = JSON.stringify(report);
  assert.equal(report.ok, true);
  assert.equal(report.fetchUrl, "https://github.com/acme/example.git");
  assert.equal(report.pushUrl, "https://github.com/acme/example.git");
  assert.doesNotMatch(
    serialized,
    /read-token|read-secret|read-fragment|writer|write-token|write-secret|write-fragment/,
  );
});

test("rejects different fetch and push repositories before checking access", () => {
  const fake = runner({
    fetchUrl: "https://github.com/acme/example.git",
    pushUrl: "git@github.com:acme/other.git",
  });
  const report = preflightGithub({ git: fake.git });

  assert.equal(report.ok, false);
  assert.equal(report.state, "configuration-error");
  assert.match(report.action ?? "", /Align the fetch and push URLs/);
  assert.equal(
    fake.calls.some(
      ([command]) => command === "ls-remote" || command === "push",
    ),
    false,
  );
});

test("redacts credential-bearing URLs from non-authentication diagnostics", () => {
  const report = preflightGithub({
    git: runner({
      readStatus: 1,
      readError:
        "network failed for https://token@github.com/acme/example.git?access_token=secret#fragment",
    }).git,
  });

  const serialized = JSON.stringify(report);
  assert.equal(report.state, "read-failure");
  assert.doesNotMatch(serialized, /token@|access_token|secret|fragment/);
});
