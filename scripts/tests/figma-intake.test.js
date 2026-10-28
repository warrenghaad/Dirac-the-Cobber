import assert from "node:assert/strict";
import test from "node:test";
import { run, verifyLiveReferences, verifyResolvedReferences } from "../figma-intake.js";

const silentLogger = { log() {} };

function source(overrides = {}) {
  return {
    fileKey: "source-file",
    kind: "design",
    label: "Fixture source",
    intakeStatus: "pending",
    addedAt: "2026-08-22",
    ...overrides,
  };
}

test("rejects a manifest reference whose Figma node is absent from the fetched source", () => {
  const manifest = {
    figmaSources: [source()],
    components: [{ id: "prim.node.generic", figmaNodeId: "9:9", fileKey: "source-file" }],
  };

  assert.throws(
    () => verifyResolvedReferences(manifest, new Map([["source-file", new Map()]])),
    /node 9:9 that was not found/,
  );
});

test("rejects a retained reference when Figma's node endpoint no longer returns it", async () => {
  const manifest = {
    figmaSources: [source()],
    components: [{ id: "prim.node.generic", figmaNodeId: "9:9", fileKey: "source-file" }],
  };
  const requestedPaths = [];

  await assert.rejects(
    verifyLiveReferences(manifest, async (path) => {
      requestedPaths.push(path);
      return { nodes: {} };
    }),
    /node 9:9 that no longer resolves/,
  );

  assert.deepEqual(requestedPaths, ["/files/source-file/nodes?ids=9%3A9"]);
});

test("rejects an incompatible semantic primitive reference", () => {
  const manifest = {
    figmaSources: [source({ kind: "figjam", intakeMode: "semantic-primitives" })],
    components: [{ id: "wf.lane", figmaNodeId: "1:2", fileKey: "source-file" }],
  };
  const candidates = new Map([
    ["source-file", new Map([["1:2", { id: "1:2", name: "Generic node" }]])],
  ]);

  assert.throws(() => verifyResolvedReferences(manifest, candidates), /not semantically served/);
});

test("does not write either manifest mirror when a Figma source cannot be fetched", async () => {
  let writeCount = 0;
  const manifest = { figmaSources: [source()], components: [] };

  await assert.rejects(
    run({
      manifest,
      fetchFigma: async () => {
        throw new Error("network unavailable");
      },
      logger: silentLogger,
      writeFile: () => {
        writeCount += 1;
      },
    }),
    /Failed to inspect Figma source source-file: network unavailable/,
  );
  assert.equal(writeCount, 0);
});