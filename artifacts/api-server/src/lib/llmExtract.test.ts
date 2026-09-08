/**
 * Ensures that buildSystemPrompt stays in sync with the librarian's
 * component-selection tables (KG_NODE_COMPONENT, KG_EDGE_COMPONENT,
 * WF_NODE_COMPONENT, WF_EDGE_COMPONENT).
 *
 * If a new kind is added to any table but buildSystemPrompt is not updated
 * to mention it, these tests will fail.
 */

import { describe, it, expect } from "vitest";
import {
  KG_NODE_COMPONENT,
  KG_EDGE_COMPONENT,
  WF_NODE_COMPONENT,
  WF_EDGE_COMPONENT,
} from "@workspace/wireframe-librarian";
import { buildSystemPrompt } from "./llmExtract";

const PROMPT = buildSystemPrompt();

describe("buildSystemPrompt – knowledge-graph node kinds", () => {
  for (const kind of Object.keys(KG_NODE_COMPONENT)) {
    it(`includes kind "${kind}" in the prompt`, () => {
      expect(PROMPT).toContain(kind);
    });
  }
});

describe("buildSystemPrompt – knowledge-graph edge kinds", () => {
  for (const kind of Object.keys(KG_EDGE_COMPONENT)) {
    it(`includes kind "${kind}" in the prompt`, () => {
      expect(PROMPT).toContain(kind);
    });
  }
});

describe("buildSystemPrompt – workflow node kinds", () => {
  for (const kind of Object.keys(WF_NODE_COMPONENT)) {
    it(`includes kind "${kind}" in the prompt`, () => {
      expect(PROMPT).toContain(kind);
    });
  }
});

describe("buildSystemPrompt – workflow edge kinds", () => {
  for (const kind of Object.keys(WF_EDGE_COMPONENT)) {
    it(`includes kind "${kind}" in the prompt`, () => {
      expect(PROMPT).toContain(kind);
    });
  }
});

describe("buildSystemPrompt – kind list completeness (regression guard)", () => {
  it("fails if a new KG node kind is added to the table but omitted from the prompt", () => {
    const promptKgNodeSection = PROMPT.match(
      /knowledge-graph family:\s*([^\n]+)/,
    )?.[1] ?? "";
    for (const kind of Object.keys(KG_NODE_COMPONENT)) {
      expect(promptKgNodeSection).toContain(kind);
    }
  });

  it("fails if a new KG edge kind is added to the table but omitted from the prompt", () => {
    const promptKgEdgeSection = PROMPT.match(
      /knowledge-graph family:\s*([^\n]+)/g,
    )?.[1] ?? "";
    for (const kind of Object.keys(KG_EDGE_COMPONENT)) {
      expect(promptKgEdgeSection).toContain(kind);
    }
  });

  it("fails if a new WF node kind is added to the table but omitted from the prompt", () => {
    const promptWfNodeSection = PROMPT.match(
      /workflow family:\s*([^\n]+)/,
    )?.[1] ?? "";
    for (const kind of Object.keys(WF_NODE_COMPONENT)) {
      expect(promptWfNodeSection).toContain(kind);
    }
  });

  it("fails if a new WF edge kind is added to the table but omitted from the prompt", () => {
    const promptWfEdgeSection = PROMPT.match(
      /workflow family:\s*([^\n]+)/g,
    )?.[1] ?? "";
    for (const kind of Object.keys(WF_EDGE_COMPONENT)) {
      expect(promptWfEdgeSection).toContain(kind);
    }
  });
});
