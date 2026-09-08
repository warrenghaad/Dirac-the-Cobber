import { useRef } from "react";
import { Glyph, glyphColors } from "@/components/Glyph";
import {
  sizeOf,
  clampAxes,
  MANIFEST,
  INK,
  type AxisCoords,
  type Composition,
  type CompositionSlot,
  type LibraryComponent,
} from "@/lib/library";
import { useManifest } from "@/lib/manifest-context";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AxesOverrideMap = Record<number, Partial<AxisCoords>>;
export type HueMap = Record<number, number>;

export type LayoutRecord = {
  slot: CompositionSlot;
  component: LibraryComponent | null;
  axes: AxisCoords;
  /** pixel center X */
  px: number;
  /** pixel center Y */
  py: number;
  /** logical width from sizeOf */
  sw: number;
  /** logical height from sizeOf */
  sh: number;
  index: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FALLBACK_AXES: AxisCoords = { a1: 1, a2: 0, a3: 2, a4: 0, a5: 0 };
const FALLBACK_MAX: AxisCoords = { a1: 4, a2: 4, a3: 4, a4: 4, a5: 4 };

function isEdge(slot: CompositionSlot): boolean {
  return slot.role === "edge" || slot.componentId.includes("edge");
}

function isContainer(slot: CompositionSlot): boolean {
  return slot.role === "container" || slot.componentId.includes("group");
}

/** Convert unit-fraction slot positions → pixel layout records. */
export function layoutSlots(
  composition: Composition,
  viewport: { w: number; h: number },
  axesOverrides: AxesOverrideMap = {},
  components: LibraryComponent[] = MANIFEST.components
): LayoutRecord[] {
  return composition.slots.map((slot, index) => {
    const component = components.find((c) => c.id === slot.componentId) ?? null;
    const base: AxisCoords = component?.axes ?? FALLBACK_AXES;
    const maxAxes: AxisCoords = component?.maxAxes ?? FALLBACK_MAX;
    const merged: AxisCoords = {
      ...base,
      ...(slot.axes ?? {}),
      ...(axesOverrides[index] ?? {}),
    };
    // Clamp manually if no component found
    const axes: AxisCoords = component
      ? clampAxes(component, merged)
      : (Object.fromEntries(
          (["a1", "a2", "a3", "a4", "a5"] as const).map((k) => [
            k,
            Math.min(Math.max(merged[k], 0), maxAxes[k]),
          ])
        ) as AxisCoords);

    const { w, h } = sizeOf(axes.a3);
    return {
      slot,
      component,
      axes,
      px: slot.position.x * viewport.w,
      py: slot.position.y * viewport.h,
      sw: w,
      sh: h,
      index,
    };
  });
}

// ─── Edge Rendering ───────────────────────────────────────────────────────────

/** For an edge slot, find the 2 nearest non-edge neighbours (by unit-fraction distance). */
function edgeNeighbours(
  edgeSlot: CompositionSlot,
  allRecords: LayoutRecord[]
): [LayoutRecord, LayoutRecord] | null {
  const candidates = allRecords.filter(
    (r) => !isEdge(r.slot) && !isContainer(r.slot)
  );
  if (candidates.length < 2) return null;

  const dist = (r: LayoutRecord) =>
    Math.hypot(r.slot.position.x - edgeSlot.position.x, r.slot.position.y - edgeSlot.position.y);

  const sorted = [...candidates].sort((a, b) => dist(a) - dist(b));
  return [sorted[0], sorted[1]];
}

type EdgeLineProps = {
  record: LayoutRecord;
  allRecords: LayoutRecord[];
  markerId: string;
};

function EdgeLine({ record, allRecords, markerId }: EdgeLineProps) {
  const neighbours = edgeNeighbours(record.slot, allRecords);
  if (!neighbours) return null;
  const [src, tgt] = neighbours;

  const { stroke } = glyphColors(record.axes, 0);
  const isDashed =
    record.slot.componentId.includes("subclass") ||
    record.slot.componentId.includes("dash") ||
    record.axes.a4 >= 2;
  const sw = [1, 1.5, 2, 2.5, 3][record.axes.a4] ?? 1.5;

  // Shorten the line so it doesn't overlap the node glyphs
  const dx = tgt.px - src.px;
  const dy = tgt.py - src.py;
  const len = Math.hypot(dx, dy) || 1;
  const margin = 20;
  const ux = dx / len;
  const uy = dy / len;

  const x1 = src.px + ux * margin;
  const y1 = src.py + uy * margin;
  const x2 = tgt.px - ux * (margin + 8); // leave room for arrowhead
  const y2 = tgt.py - uy * (margin + 8);

  // Label from the slot role (if a5 >= 1)
  const showLabel = record.axes.a5 >= 1;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const role = record.slot.role.replace(/-/g, " ");

  return (
    <g>
      <defs>
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill={stroke} />
        </marker>
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={stroke}
        strokeWidth={sw}
        strokeDasharray={isDashed ? "6 4" : undefined}
        markerEnd={`url(#${markerId})`}
      />
      {showLabel && (
        <text
          x={midX}
          y={midY - 5}
          textAnchor="middle"
          fontSize={9}
          fontStyle="italic"
          fill="#6B7280"
        >
          {role}
        </text>
      )}
    </g>
  );
}

// ─── Container Rendering ──────────────────────────────────────────────────────

type ContainerRectProps = {
  record: LayoutRecord;
  allRecords: LayoutRecord[];
};

function ContainerRect({ record, allRecords }: ContainerRectProps) {
  const siblings = allRecords.filter(
    (r) => r.index !== record.index && !isEdge(r.slot)
  );

  const { stroke, fill } = glyphColors(record.axes, 0);

  if (siblings.length === 0) {
    // Fallback: just render a rect centered on position
    const { sw, sh, px, py } = record;
    const pad = 12;
    return (
      <rect
        x={px - sw / 2 - pad}
        y={py - sh / 2 - pad}
        width={sw + pad * 2}
        height={sh + pad * 2}
        fill="transparent"
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray="4 4"
        rx={6}
      />
    );
  }

  // Compute bounding box of all sibling slots
  const pad = 24;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of siblings) {
    minX = Math.min(minX, r.px - r.sw / 2);
    minY = Math.min(minY, r.py - r.sh / 2);
    maxX = Math.max(maxX, r.px + r.sw / 2);
    maxY = Math.max(maxY, r.py + r.sh / 2);
  }

  const sw = [1, 1.5, 2, 2.5, 3][record.axes.a4] ?? 1;
  const label = record.axes.a5 >= 1 ? record.slot.role : undefined;

  return (
    <g>
      <rect
        x={minX - pad}
        y={minY - pad}
        width={maxX - minX + pad * 2}
        height={maxY - minY + pad * 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
        rx={8}
      />
      {label && (
        <text
          x={minX - pad + 8}
          y={minY - pad + 13}
          fontSize={9}
          fontWeight={600}
          fill={INK}
        >
          {label}
        </text>
      )}
    </g>
  );
}

// ─── Glyph Positioner ─────────────────────────────────────────────────────────

/** Wraps a Glyph inside a <g> so it is centered at (px, py) in the canvas SVG. */
function PositionedGlyph({
  record,
  hueIndex,
}: {
  record: LayoutRecord;
  hueIndex: number;
}) {
  const { component, axes, px, py, sw, sh } = record;
  if (!component) return null;

  const scale = 1;
  const W = sw * scale;
  const H = sh * scale;

  // Arrow glyphs have different sizing — keep the translate centred on their visual midpoint
  const shapeIsArrow =
    component.shape.startsWith("arrow") || component.shape.startsWith("line");
  const extraH = axes.a5 >= 3 ? Math.max(0, axes.a5 - 2) * 2 * 12 : 0;

  const tx = shapeIsArrow ? px - (W + 40) / 2 : px - W / 2 - 3;
  const ty = shapeIsArrow ? py - 20 : py - (H + extraH) / 2 - 3;

  return (
    <g transform={`translate(${tx}, ${ty})`}>
      <Glyph
        component={component}
        axes={axes}
        hueIndex={hueIndex}
        scale={scale}
      />
    </g>
  );
}

// ─── SVG Export ───────────────────────────────────────────────────────────────

/** Serialises the SVG referenced by `svgRef` and triggers a file download. */
export function downloadSVG(
  svgRef: React.RefObject<SVGSVGElement | null>,
  filename = "composition.svg"
) {
  const el = svgRef.current;
  if (!el) return;
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(el);
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CompositionCanvas ────────────────────────────────────────────────────────

export type CompositionCanvasProps = {
  composition: Composition;
  /** Per-slot axis overrides keyed by slot index */
  axesOverrides?: AxesOverrideMap;
  /** Per-slot hue index keyed by slot index */
  hueMap?: HueMap;
  /** Uniform scale multiplier (default 1) */
  scale?: number;
  /** SVG ref for external download */
  svgRef?: React.RefObject<SVGSVGElement | null>;
  className?: string;
};

const BASE_W = 640;
const BASE_H = 480;

export function CompositionCanvas({
  composition,
  axesOverrides = {},
  hueMap = {},
  scale = 1,
  svgRef,
  className,
}: CompositionCanvasProps) {
  const internalRef = useRef<SVGSVGElement>(null);
  const ref = (svgRef ?? internalRef) as React.RefObject<SVGSVGElement>;
  const { manifest } = useManifest();

  const viewport = { w: BASE_W, h: BASE_H };
  const records = layoutSlots(composition, viewport, axesOverrides, manifest.components);

  const containerRecords = records.filter((r) => isContainer(r.slot));
  const edgeRecords = records.filter((r) => isEdge(r.slot));
  const nodeRecords = records.filter(
    (r) => !isContainer(r.slot) && !isEdge(r.slot)
  );

  const W = BASE_W * scale;
  const H = BASE_H * scale;

  return (
    <svg
      ref={ref}
      width={W}
      height={H}
      viewBox={`0 0 ${BASE_W} ${BASE_H}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "block" }}
    >
      {/* 1. Container slots — lowest z-order */}
      {containerRecords.map((r) => (
        <ContainerRect key={r.index} record={r} allRecords={records} />
      ))}

      {/* 2. Edge slots — middle z-order */}
      {edgeRecords.map((r) => (
        <EdgeLine
          key={r.index}
          record={r}
          allRecords={records}
          markerId={`arrow-${composition.id.replace(/\W/g, "")}-${r.index}`}
        />
      ))}

      {/* 3. Node glyphs — top z-order */}
      {nodeRecords.map((r) => (
        <PositionedGlyph
          key={r.index}
          record={r}
          hueIndex={hueMap[r.index] ?? 0}
        />
      ))}
    </svg>
  );
}
