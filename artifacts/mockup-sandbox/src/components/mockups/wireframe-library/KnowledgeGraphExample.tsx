import { INK, PAPER, PALETTE, tint, SheetHeader, DASHED, BORDER, TEXT_SECONDARY, TEXT_LABEL } from "./_shared/tokens";

// Example composition assembled ONLY from manifest components (kg.* family, Tier 2 defaults).
// Hues: PALETTE[0]=Person, PALETTE[1]=Organization, PALETTE[2]=Place. Literals = white ellipses.
// Solid = kg.relation-edge / kg.property-edge · dashed = kg.subclass-edge (instanceOf).

const N = {
  person: { x: 170, y: 300, w: 125, h: 78, hue: PALETTE[0], label: "Ada Park", tag: "Person", focal: true },
  org: { x: 560, y: 160, w: 100, h: 62, hue: PALETTE[1], label: "ACME Corp", tag: "Organization" },
  place: { x: 560, y: 440, w: 100, h: 62, hue: PALETTE[2], label: "Berlin", tag: "Place" },
  person2: { x: 170, y: 560, w: 100, h: 62, hue: PALETTE[0], label: "Sam Roy", tag: "Person" },
  classPerson: { x: 40, y: 80, w: 110, h: 62, hue: PALETTE[0], label: "Person", tag: "owl:Class", isClass: true },
  born: { x: 420, y: 620, w: 80, h: 50, label: '"1979"', literal: true },
  founded: { x: 880, y: 200, w: 80, h: 50, label: '"2011"', literal: true },
} as const;

type NodeSpec = { x: number; y: number; w: number; h: number; hue?: string; label: string; tag?: string; focal?: boolean; isClass?: boolean; literal?: boolean };

function GNode({ n }: { n: NodeSpec }) {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  const stroke = n.focal ? 3 : n.isClass ? 2 : 1;
  const fill = n.literal ? "white" : tint(n.hue!, n.focal ? 0.25 : 0.15);
  return (
    <g>
      {n.literal ? (
        <ellipse cx={cx} cy={cy} rx={n.w / 2} ry={n.h / 2} fill={fill} stroke={INK} strokeWidth={1} />
      ) : n.isClass ? (
        <rect x={n.x} y={n.y} width={n.w} height={n.h} fill={fill} stroke={n.hue} strokeWidth={stroke} />
      ) : (
        <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={10} fill={fill} stroke={n.hue} strokeWidth={stroke} />
      )}
      <text x={cx} y={n.tag ? cy : cy + 4} textAnchor="middle" fontSize={13} fontWeight={600} fill={INK} fontFamily="Inter, sans-serif">{n.label}</text>
      {n.tag && <text x={cx} y={cy + 16} textAnchor="middle" fontSize={10} fill={TEXT_SECONDARY} fontFamily="Inter, sans-serif">{n.tag}</text>}
    </g>
  );
}

function edgePts(a: NodeSpec, b: NodeSpec) {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
  const ar = Math.min(a.w, a.h) / 2 + 8, br = Math.min(b.w, b.h) / 2 + 14;
  return { x1: ax + (dx / len) * ar, y1: ay + (dy / len) * ar, x2: bx - (dx / len) * br, y2: by - (dy / len) * br };
}

function GEdge({ id, from, to, label, hue = INK, dash, stroke = 1 }: { id: string; from: NodeSpec; to: NodeSpec; label?: string; hue?: string; dash?: string; stroke?: number }) {
  const p = edgePts(from, to);
  const mx = (p.x1 + p.x2) / 2, my = (p.y1 + p.y2) / 2;
  return (
    <g>
      <defs>
        <marker id={id} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
          <path d="M0,0 L9,4.5 L0,9 z" fill={hue} />
        </marker>
      </defs>
      <line {...p} stroke={hue} strokeWidth={stroke} strokeDasharray={dash} markerEnd={`url(#${id})`} />
      {label && (
        <>
          <rect x={mx - label.length * 3.4 - 4} y={my - 18} width={label.length * 6.8 + 8} height={15} rx={4} fill={PAPER} />
          <text x={mx} y={my - 6.5} textAnchor="middle" fontSize={10.5} fontStyle="italic" fill={TEXT_LABEL} fontFamily="Inter, sans-serif">{label}</text>
        </>
      )}
    </g>
  );
}

export function KnowledgeGraphExample() {
  return (
    <div className="min-h-screen p-10" style={{ background: PAPER, fontFamily: "Inter, sans-serif" }}>
      <SheetHeader
        title="Example Composition — Property Graph"
        subtitle="Assembled only from manifest components: kg.entity, kg.class, kg.literal, kg.relation-edge, kg.property-edge, kg.subclass-edge. Emphasis spent per librarian rules: class→hue (A2), focal entity→size+stroke (A3,A4), taxonomy→dash (A4). One Tier-4 hero (Ada Park)."
      />
      <svg width={1000} height={700} viewBox="0 0 1000 700">
        <GEdge id="e1" from={N.person} to={N.org} label="employedBy" hue={PALETTE[1]} stroke={2} />
        <GEdge id="e2" from={N.person} to={N.place} label="livesIn" hue={PALETTE[2]} stroke={1} />
        <GEdge id="e3" from={N.person2} to={N.person} label="knows" hue={PALETTE[0]} stroke={1} />
        <GEdge id="e4" from={N.org} to={N.place} label="hqIn" hue={PALETTE[2]} stroke={1} />
        <GEdge id="e5" from={N.person} to={N.born} label="born" stroke={1} />
        <GEdge id="e6" from={N.org} to={N.founded} label="founded" stroke={1} />
        <GEdge id="e7" from={N.person} to={N.classPerson} label="instanceOf" dash={DASHED} stroke={1} />
        <GEdge id="e8" from={N.person2} to={N.classPerson} label="instanceOf" dash={DASHED} stroke={1} />
        {Object.values(N).map((n) => <GNode key={n.label} n={n as NodeSpec} />)}
        <g fontFamily="Inter, sans-serif">
          <rect x={700} y={520} width={260} height={150} rx={8} fill="white" stroke={BORDER} />
          <text x={716} y={545} fontSize={11} fontWeight={700} fill={INK}>LEGEND</text>
          <text x={716} y={566} fontSize={10.5} fill={TEXT_LABEL}>hue = class (A2:2) · 3 of 5 hues used</text>
          <text x={716} y={584} fontSize={10.5} fill={TEXT_LABEL}>S3 + W3 = focal entity (A3, A4)</text>
          <text x={716} y={602} fontSize={10.5} fill={TEXT_LABEL}>dashed = taxonomic edge (A4:2)</text>
          <text x={716} y={620} fontSize={10.5} fill={TEXT_LABEL}>ellipse = literal (A1:1)</text>
          <text x={716} y={638} fontSize={10.5} fill={TEXT_LABEL}>italic mid-label = property edge (A5:1)</text>
          <text x={716} y={656} fontSize={10.5} fill={TEXT_LABEL}>E spread: hero 9 · entities 7 · literals 3</text>
        </g>
      </svg>
    </div>
  );
}
