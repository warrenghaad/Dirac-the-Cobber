import { INK, PAPER, ACCENT, PALETTE, sizeOf, tint, SheetHeader, DASHED, DOTTED, BORDER, TEXT_SECONDARY, TEXT_MUTED, TEXT_BODY } from "./_shared/tokens";

function Node({
  shape = "rounded-rect",
  fillColor,
  stroke = 1,
  dash,
  label,
  tag,
  w = 100,
  h = 62,
}: {
  shape?: string;
  fillColor?: string;
  stroke?: number;
  dash?: string;
  label?: string;
  tag?: string;
  w?: number;
  h?: number;
}) {
  const common = {
    fill: fillColor ?? "white",
    stroke: INK,
    strokeWidth: stroke,
    strokeDasharray: dash,
  } as const;
  const cx = w / 2, cy = h / 2;
  return (
    <svg width={w + 4} height={h + 4} viewBox={`-2 -2 ${w + 4} ${h + 4}`}>
      {shape === "rounded-rect" && <rect x={0} y={0} width={w} height={h} rx={8} {...common} />}
      {shape === "rectangle" && <rect x={0} y={0} width={w} height={h} {...common} />}
      {shape === "ellipse" && <ellipse cx={cx} cy={cy} rx={cx} ry={cy} {...common} />}
      {shape === "pill" && <rect x={0} y={0} width={w} height={h} rx={h / 2} {...common} />}
      {shape === "diamond" && <polygon points={`${cx},0 ${w},${cy} ${cx},${h} 0,${cy}`} {...common} />}
      {shape === "hexagon" && (
        <polygon points={`${w * 0.2},0 ${w * 0.8},0 ${w},${cy} ${w * 0.8},${h} ${w * 0.2},${h} 0,${cy}`} {...common} />
      )}
      {shape === "parallelogram" && (
        <polygon points={`${w * 0.18},0 ${w},0 ${w * 0.82},${h} 0,${h}`} {...common} />
      )}
      {shape === "dot" && <circle cx={cx} cy={cy} r={6} fill={INK} />}
      {label && (
        <text x={cx} y={tag ? cy - 2 : cy + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill={INK} fontFamily="Inter, sans-serif">
          {label}
        </text>
      )}
      {tag && (
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={9} fill={TEXT_SECONDARY} fontFamily="Inter, sans-serif">
          {tag}
        </text>
      )}
    </svg>
  );
}

function Edge({ w = 100, dash, stroke = 1, label }: { w?: number; dash?: string; stroke?: number; label?: string }) {
  return (
    <svg width={w} height={28} viewBox={`0 0 ${w} 28`}>
      <defs>
        <marker id={`arr-${stroke}-${dash ?? "s"}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={INK} />
        </marker>
      </defs>
      {label && <text x={w / 2} y={8} textAnchor="middle" fontSize={9} fill={TEXT_SECONDARY} fontFamily="Inter, sans-serif">{label}</text>}
      <line x1={2} y1={18} x2={w - 10} y2={18} stroke={INK} strokeWidth={stroke} strokeDasharray={dash} markerEnd={`url(#arr-${stroke}-${dash ?? "s"})`} />
    </svg>
  );
}

function Cell({ children, name, note }: { children: React.ReactNode; name: string; note?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-lg border" style={{ borderColor: BORDER, background: "white" }}>
      <div className="flex-1 flex items-center justify-center min-h-[80px]">{children}</div>
      <div className="text-xs font-semibold text-center" style={{ color: INK }}>{name}</div>
      {note && <div className="text-[10px] text-center" style={{ color: TEXT_MUTED }}>{note}</div>}
    </div>
  );
}

function TierBand({ n, title, rule, children }: { n: number; title: string; rule: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3 mb-2">
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded"
          style={{ background: n === 1 ? INK : tint(ACCENT, 0.12), color: n === 1 ? "white" : ACCENT }}
        >
          TIER {n}
        </span>
        <span className="text-sm font-semibold" style={{ color: INK }}>{title}</span>
        <span className="text-xs" style={{ color: TEXT_MUTED }}>{rule}</span>
      </div>
      <div className="grid grid-cols-5 gap-3">{children}</div>
    </div>
  );
}

export function TierLadder() {
  const s2 = sizeOf(2);
  return (
    <div className="min-h-screen p-10" style={{ background: PAPER, fontFamily: "Inter, sans-serif" }}>
      <SheetHeader
        title="Tier Ladder — Primitives to Expressive"
        subtitle="Tier 1 is equal-consequence: identical size (S2), mono ink, 1px stroke, no label — a selector can swap any primitive without creating emphasis. Each higher tier unlocks one more level on the growth axes. Manifest: docs/wireframe-library/manifest.json"
      />

      <TierBand n={1} title="Primitives — equal consequence" rule="locked: A1≤1 · A2=0 · A3=S2 · A4=W1 · A5=none">
        <Cell name="prim.node.generic" note="rounded-rect"><Node w={s2.w} h={s2.h} /></Cell>
        <Cell name="prim.node.round" note="ellipse"><Node shape="ellipse" w={s2.w} h={s2.h} /></Cell>
        <Cell name="prim.edge.plain" note="solid arrow"><Edge /></Cell>
        <Cell name="prim.container.plain" note="outline group"><Node shape="rectangle" w={s2.w} h={s2.h} fillColor="transparent" /></Cell>
        <Cell name="prim.anchor.point" note="attachment dot · S2 footprint"><Node shape="dot" w={s2.w} h={s2.h} /></Cell>
      </TierBand>

      <TierBand n={2} title="Categorical — default working tier" rule="max axis level 2: category shapes, ≤5 hues, name labels">
        <Cell name="wf.task" note="A1:1 A2:2 A5:1"><Node fillColor={tint(PALETTE[0], 0.15)} label="Verify order" w={s2.w} h={s2.h} /></Cell>
        <Cell name="wf.decision" note="A1:2 diamond"><Node shape="diamond" fillColor={tint(PALETTE[1], 0.15)} label="OK?" w={s2.w} h={s2.h + 10} /></Cell>
        <Cell name="kg.entity" note="hue = class"><Node fillColor={tint(PALETTE[2], 0.15)} label="Person" w={s2.w} h={s2.h} /></Cell>
        <Cell name="kg.literal" note="ellipse, S1"><Node shape="ellipse" fillColor="white" label='"1979"' w={80} h={50} /></Cell>
        <Cell name="kg.subclass-edge" note="dash = taxonomic"><Edge dash={DASHED} label="subClassOf" /></Cell>
      </TierBand>

      <TierBand n={3} title="Differentiated" rule="max axis level 3: tints, W3, type tags + key properties">
        <Cell name="kg.class" note="W2 stroke · type tag"><Node shape="rectangle" stroke={2} fillColor={tint(PALETTE[3], 0.12)} label="Organization" tag="owl:Class" w={125} h={78} /></Cell>
        <Cell name="wf.parallel" note="hexagon gateway"><Node shape="hexagon" stroke={2} fillColor={tint(PALETTE[0], 0.1)} label="Fork" w={s2.w} h={s2.h} /></Cell>
        <Cell name="wf.data" note="parallelogram"><Node shape="parallelogram" fillColor={tint(PALETTE[1], 0.1)} label="Invoice.csv" tag="data" w={s2.w} h={s2.h} /></Cell>
        <Cell name="edge · weighted" note="W3 = strong relation"><Edge stroke={3} label="employs" /></Cell>
        <Cell name="edge · derived" note="dotted = inferred"><Edge dash={DOTTED} label="inferred" /></Cell>
      </TierBand>

      <TierBand n={4} title="Expressive — one hero per view" rule="max one Tier-4 component per view (focal element only)">
        <Cell name="focal entity" note="S4 · W3 · tint fill">
          <Node fillColor={tint(PALETTE[0], 0.25)} stroke={3} label="ACME Corp" tag="Organization · 14 links" w={156} h={97} />
        </Cell>
        <Cell name="rule" note="everything else ≤ Tier 3">
          <div className="text-[11px] leading-relaxed px-2" style={{ color: TEXT_BODY }}>
            E = a1+a2+a3+a4+a5.<br />Spend emphasis one axis-step at a time; one meaning per axis.
          </div>
        </Cell>
        <Cell name="hue budget" note="≤ 5 hues per view">
          <div className="flex gap-1">{PALETTE.map((c) => <div key={c} className="w-6 h-6 rounded" style={{ background: c }} />)}</div>
        </Cell>
        <Cell name="size spread" note="≤ 2 steps per view">
          <div className="flex items-end gap-1">
            {[0, 1, 2].map((i) => { const s = sizeOf(i); return <div key={i} className="rounded border" style={{ width: s.w / 2, height: s.h / 2, borderColor: INK, background: "white" }} />; })}
          </div>
        </Cell>
        <Cell name="no double-encoding" note="unless declared for a11y">
          <div className="text-[11px] leading-relaxed px-2" style={{ color: TEXT_BODY }}>
            Category→shape · Class→hue · Importance→size · Edge kind→stroke · Detail→labels
          </div>
        </Cell>
      </TierBand>
    </div>
  );
}
