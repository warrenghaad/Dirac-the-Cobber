import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../app";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not expose a TCP port.");
      }
      baseUrl = `http://127.0.0.1:${address.port}/api`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("librarian routes", () => {
  it("creates a plan and carries a known compatible composition id", async () => {
    const response = await fetch(`${baseUrl}/librarian/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        need: "approval workflow",
        family: "workflow",
        nodes: [
          {
            id: "approve",
            label: "Approve",
            className: "task",
            kind: "task",
            compositionId: "org.workflow-decision-branch",
          },
        ],
        edges: [],
      }),
    });
    const body = await response.json() as {
      plan?: { placements?: Array<{ id: string; content: { compositionId?: string } }> };
    };

    expect(response.status).toBe(200);
    expect(
      body.plan?.placements?.find((placement) => placement.id === "approve")
        ?.content.compositionId,
    ).toBe("org.workflow-decision-branch");
  });

  it("keeps refinement on its own route and validates its request schema", async () => {
    const response = await fetch(`${baseUrl}/librarian/refine`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });
});