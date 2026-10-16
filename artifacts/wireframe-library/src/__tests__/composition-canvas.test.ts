import { describe, expect, it } from "vitest";
import {
  containerBounds,
  edgeNeighbours,
  layoutSlots,
  type LayoutRecord,
} from "@/components/CompositionCanvas";
import {
  MANIFEST,
  sizeOf,
  type Composition,
  type CompositionSlot,
  type LibraryComponent,
} from "@/lib/library";

const VIEWPORT = { w: 640, h: 480 };

function composition(slots: CompositionSlot[]): Composition {
  return {
    id: "test-composition",
    atomicLevel: "molecule",
    label: "Test composition",
    description: "Composition canvas test fixture",
    family: "workflow",
    slots,
  };
}

function slot(
  componentId: string,
  role: string,
  x: number,
  y: number,
  axes?: CompositionSlot["axes"]
): CompositionSlot {
  return { componentId, role, position: { x, y }, axes };
}

function component(
  id: string,
  axes: LibraryComponent["axes"],
  maxAxes: LibraryComponent["maxAxes"]
): LibraryComponent {
  return {
    id,
    family: "test",
    tier: 1,
    shape: "rect",
    axes,
    maxAxes,
    figmaNodeId: null,
  };
}

function recordBounds(records: LayoutRecord[]) {
  return records.reduce(
    (bounds, record) => ({
      minX: Math.min(bounds.minX, record.px - record.sw / 2),
      minY: Math.min(bounds.minY, record.py - record.sh / 2),
      maxX: Math.max(bounds.maxX, record.px + record.sw / 2),
      maxY: Math.max(bounds.maxY, record.py + record.sh / 2),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
}

describe("layoutSlots", () => {
  it("converts unit-fraction positions to pixel centers and uses the component size", () => {
    const records = layoutSlots(
      composition([slot("test.node", "node", 0.25, 0.75)]),
      { w: 800, h: 600 },
      {},
      [
        component(
          "test.node",
          { a1: 1, a2: 0, a3: 1, a4: 0, a5: 0 },
          { a1: 2, a2: 2, a3: 3, a4: 2, a5: 2 }
        ),
      ]
    );

    expect(records[0]).toMatchObject({
      px: 200,
      py: 450,
      sw: sizeOf(1).w,
      sh: sizeOf(1).h,
    });
  });

  it("merges component, slot, and override axes with per-axis clamping", () => {
    const records = layoutSlots(
      composition([
        slot("test.node", "node", 0.5, 0.5, {
          a1: 3,
          a2: 2,
          a3: 2,
        }),
      ]),
      VIEWPORT,
      { 0: { a1: -1, a3: 5, a4: 3 } },
      [
        component(
          "test.node",
          { a1: 1, a2: 1, a3: 1, a4: 1, a5: 1 },
          { a1: 2, a2: 3, a3: 4, a4: 2, a5: 1 }
        ),
      ]
    );

    expect(records[0].axes).toEqual({
      a1: 0,
      a2: 2,
      a3: 4,
      a4: 2,
      a5: 1,
    });
    expect(records[0].sw).toBe(sizeOf(4).w);
  });

  it("uses fallback axes and dimensions when a component ID is unknown", () => {
    const records = layoutSlots(
      composition([
        slot("missing.component", "unknown", 0.5, 0.5, {
          a1: 9,
          a3: -2,
          a5: 3,
        }),
      ]),
      VIEWPORT,
      {},
      []
    );

    expect(records[0].component).toBeNull();
    expect(records[0].axes).toEqual({
      a1: 4,
      a2: 0,
      a3: 0,
      a4: 0,
      a5: 3,
    });
    expect(records[0]).toMatchObject({
      px: 320,
      py: 240,
      sw: sizeOf(0).w,
      sh: sizeOf(0).h,
    });
  });
});

describe("edgeNeighbours", () => {
  it("chooses the two closest non-edge, non-container slots", () => {
    const records = layoutSlots(
      composition([
        slot("prim.edge.plain", "edge", 0.5, 0.5),
        slot("node.near-1", "near-1", 0.56, 0.5),
        slot("node.near-2", "near-2", 0.5, 0.7),
        slot("node.far", "far", 0.1, 0.1),
        slot("prim.edge.plain", "closer-edge", 0.51, 0.51),
        slot("kg.group", "closer-container", 0.5, 0.5),
      ]),
      VIEWPORT,
      {},
      []
    );

    expect(edgeNeighbours(records[0].slot, records)).toEqual([
      records[1],
      records[2],
    ]);
  });

  it("returns null when fewer than two eligible neighbours exist", () => {
    const records = layoutSlots(
      composition([
        slot("prim.edge.plain", "edge", 0.5, 0.5),
        slot("node.only", "only-node", 0.6, 0.5),
        slot("kg.group", "container", 0.5, 0.5),
        slot("prim.edge.plain", "another-edge", 0.4, 0.5),
      ]),
      VIEWPORT,
      {},
      []
    );

    expect(edgeNeighbours(records[0].slot, records)).toBeNull();
  });
});

describe("manifest compositions", () => {
  const expected = {
    "mol.task-card": {
      bounds: [270, 41, 594, 271],
      container: [246, 17, 372, 206],
      routes: {},
    },
    "mol.kg-entity-labeled": {
      bounds: [46, 209, 584, 271],
      container: null,
      routes: { edge: ["subject", "literal"] },
    },
    "org.workflow-decision-branch": {
      bounds: [78, 65, 562, 415],
      container: null,
      routes: {
        "branch-left": ["task-left", "decision"],
        "branch-right": ["task-right", "decision"],
      },
    },
    "org.kg-class-hierarchy": {
      bounds: [78, 41, 562, 439],
      container: null,
      routes: {
        "subclass-left": ["entity-left", "parent-class"],
        "subclass-right": ["entity-right", "parent-class"],
      },
    },
    "tpl.simple-workflow": {
      bounds: [88, -1, 552, 466.6],
      container: null,
      routes: {
        "flow-1": ["start", "task"],
        "flow-2": ["decision", "task"],
        "branch-yes": ["end-yes", "decision"],
        "branch-no": ["end-no", "decision"],
      },
    },
    "tpl.knowledge-graph-overview": {
      bounds: [78, 41, 562, 439],
      container: [54, 17, 532, 383.6],
      routes: {
        "relation-1": ["entity-1", "class"],
        "relation-2": ["entity-2", "class"],
        "relation-3": ["entity-3", "class"],
        "property-1": ["entity-2", "entity-1"],
        "property-2": ["entity-2", "entity-3"],
      },
    },
  } as const;

  it("covers all six bundled compositions", () => {
    expect(MANIFEST.compositions.map(({ id }) => id)).toEqual(
      Object.keys(expected)
    );
  });

  for (const compositionDefinition of MANIFEST.compositions) {
    it(`keeps ${compositionDefinition.id} layout bounds and edge routes stable`, () => {
      const records = layoutSlots(compositionDefinition, VIEWPORT);
      const regression = expected[compositionDefinition.id as keyof typeof expected];

      expect(records).toHaveLength(compositionDefinition.slots.length);
      expect(records.every((record) => record.component !== null)).toBe(true);

      const bounds = recordBounds(records);
      expect([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]).toEqual(
        regression.bounds
      );

      const containers = records.filter(
        (record) =>
          record.slot.role === "container" ||
          record.slot.componentId.includes("group")
      );
      expect(containers).toHaveLength(regression.container ? 1 : 0);
      if (regression.container) {
        const bounds = containerBounds(containers[0], records);
        expect(
          [bounds.x, bounds.y, bounds.width, bounds.height].map((value) =>
            Number(value.toFixed(3))
          )
        ).toEqual(regression.container);
      }

      const routes = Object.fromEntries(
        records
          .filter(
            (record) =>
              record.slot.role === "edge" ||
              record.slot.componentId.includes("edge")
          )
          .map((record) => [
            record.slot.role,
            edgeNeighbours(record.slot, records)?.map(
              (neighbour) => neighbour.slot.role
            ) ?? null,
          ])
      );
      expect(routes).toEqual(regression.routes);
    });
  }
});