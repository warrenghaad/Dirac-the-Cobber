import { INK, PAPER, PALETTE, tint, SheetHeader, DASHED, BORDER, TEXT_SECONDARY, TEXT_LABEL } from "./_shared/tokens";

// Example composition assembled ONLY from manifest components (wf.* family, Tier 2 defaults).
// wf.lane containers · wf.start-end pills · wf.task rounded-rects (hue = owning system) ·
// wf.decision diamond · wf.parallel hexagons · wf.data parallelogram · wf.flow-edge / wf.cond-edge.

type S = { x: number; y: number; w: number; h: number; shape: string; label: string; tag?: string; hue?: string };

const LANES = [
  { y: 90, h: 190, label: "Customer" },
  { y: 280, h: 190, label: "Order Service" },
  { y: 470, h: 190, label: "Fulfillment" },
];

const N: Record<string, S> = {
  start: { x: 80, y: 155, w: 100, h: 44, shape: "pill", label: "Order placed", hue: PALETTE[0] },
  validate: { x: 260, y: 344, w: 125, h: 62, shape: "task", label: "Validate order", hue: PALETTE[1] },
  decision: { x: 470, y: 335, w: 110, h: 80, shape: "diamond", label: "In stock?" },
  notify: { x: 470, y: 146, w: 125, h: 62, shape: "task", label: "Notify customer", tag: "backorder", hue: PALETTE[0] },
  fork: { x: 660, y: 350, w: 90, h: 50, shape: "hexagon", label: "Fork" },
  charge: { x: 800, y: 320, w: 125, h: 62, shape: "task", label: "Charge payment", hue: PALETTE[1] },
  pick: { x: 800, y: 530, w: 125, h: 62, shape: "task", label: "Pick & pack", hue: PALETTE[2] },
  invoice: { x: 620, y: 540, w: 110, h: 52, shape: "data", label: "Invoice.pdf" },
  join: { x: 985, y: 430, w: 90, h: 50, shape: "hexagon", label: "Join" },
  end: { x: 1120, y: 434, w: 100, h: 44, shape: "pill", label: "Shipped", hue: PALETTE[2] },
};

function Shape({ s }: { s: S }) {
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
  const fill = s.hue ? tint(s.hue, 0.15) : "white";
  const stroke = s.hue ?? INK;
  return (
    <g>
      {s.shape === "pill" && <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.h / 2} fill={fill} stroke={stroke} strokeWidth={2} />}
      {s.shape === "task" && <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={10} fill={fill} stroke={stroke} strokeWidth={1.5} />}
      {s.shape === "diamond" && <polygon points={`${cx},${s.y} ${s.x + s.w},${cy} ${cx},${s.y + s.h} ${s.x},${cy}`} fill={tint(PALETTE[1], 0.1)} stroke={INK} strokeWidth={1.5} />}
      {s.shape === "hexagon" && (
        <polygon
          points={`${s.x + s.w * 0.22},${s.y} ${s.x + s.w * 0.78},${s.y} ${s.x + s.w},${cy} ${s.x + s.w * 0.78},${s.y + s.h} ${s.x + s.w * 0.22},${s.y + s.h} ${s.x},${cy}`}
          fill="white" stroke={INK} strokeWidth={1.5}
        />
      )}
      {s.shape === "data" && (
        <polygon points={`${s.x + s.w * 0.15},${s.y} ${s.x + s.w},${s.y} ${s.x + s.w * 0.85},${s.y + s.h} ${s.x},${s.y + s.h}`} fill={tint(PALETTE[3], 0.1)} stroke={PALETTE[3]} strokeWidth={1} />
      )}
      <text x={cx} y={s.tag ? cy : cy + 4} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={INK} fontFamily="Inter, sans-serif">{s.label}</text>
      {s.tag && <text x={cx} y={cy + 15} textAnchor="middle" fontSize={9.5} fill={TEXT_SECONDARY} fontFamily="Inter, sans-serif">{s.tag}</text>}
    </g>
  );
}

function Flow({ from, to, label, dash, viaY }: { from: S; to: S; label?: string; dash?: string; viaY?: number }) {
  const fx = from.x + from.w, fy = from.y + from.h / 2;
  const tx = to.x, ty = to.y + to.h / 2;
  const id = `wfm-${from.label}-${to.label}`.replace(/[^a-z]/gi, "");
  const path = viaY !== undefined
    ? `M ${from.x + from.w / 2} ${viaY > fy ? from.y + from.h : from.y} V ${viaY} H ${tx - 10}`
    : `M ${fx} ${fy} L ${(fx + tx) / 2} ${fy} L ${(fx + tx) / 2} ${ty} L ${tx - 10} ${ty}`;
  const lx = viaY !== undefined ? from.x + from.w / 2 + 8 : (fx + tx) / 2 + 8;
  const ly = viaY !== undefined ? (fy + viaY) / 2 : Math.min(fy, ty) + 14;
  return (
    <g>
      <defs>
        <marker id={id} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
          <path d="M0,0 L9,4.5 L0,9 z" fill={INK} />
        </marker>
      </defs>
      <path d={path} fill="none" stroke={INK} strokeWidth={1.5} strokeDasharray={dash} markerEnd={`url(#${id})`} />
      {label && <text x={lx} y={ly} fontSize={10.5} fontStyle="italic" fill={TEXT_LABEL} fontFamily="Inter, sans-serif">[{label}]</text>}
    </g>
  );
}

export function WorkflowExample() {
  return (
    <div className="min-h-screen p-8" style={{ background: PAPER, fontFamily: "Inter, sans-serif" }}>
      <SheetHeader
        title="Example Composition — Order Workflow"
        subtitle="Assembled only from manifest components: wf.lane, wf.start-end, wf.task, wf.decision, wf.parallel, wf.data, wf.flow-edge, wf.cond-edge. Hue = owning lane/system (A2:2) · guards as [bracket] labels (A5:1) · gateways stay mono ink."
      />
      <svg width={1260} height={690} viewBox="0 0 1260 690">
        {LANES.map((l) => (
          <g key={l.label}>
            <rect x={30} y={l.y} width={1210} height={l.h} fill="white" stroke={BORDER} />
            <rect x={30} y={l.y} width={34} height={l.h} fill={tint(INK, 0.04)} stroke={BORDER} />
            <text x={47} y={l.y + l.h / 2} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={TEXT_LABEL} fontFamily="Inter, sans-serif" transform={`rotate(-90 47 ${l.y + l.h / 2})`}>{l.label}</text>
          </g>
        ))}
        <Flow from={N.start} to={N.validate} viaY={375} />
        <Flow from={N.validate} to={N.decision} />
        <Flow from={N.decision} to={N.fork} label="yes" />
        <Flow from={N.decision} to={N.notify} label="no" viaY={177} />
        <Flow from={N.fork} to={N.charge} />
        <Flow from={N.fork} to={N.pick} viaY={561} />
        {/* data artifact: pick left side → invoice right side */}
        <g>
          <defs>
            <marker id="wfm-inv" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill={INK} />
            </marker>
          </defs>
          <path d={`M ${N.pick.x} ${N.pick.y + N.pick.h / 2} L ${N.invoice.x + N.invoice.w + 10} ${N.invoice.y + N.invoice.h / 2}`} fill="none" stroke={INK} strokeWidth={1.5} strokeDasharray={DASHED} markerEnd="url(#wfm-inv)" />
        </g>
        <Flow from={N.charge} to={N.join} />
        <Flow from={N.pick} to={N.join} />
        <Flow from={N.join} to={N.end} />
        {Object.values(N).map((s) => <Shape key={s.label} s={s} />)}
        <g fontFamily="Inter, sans-serif">
          <rect x={1000} y={95} width={240} height={120} rx={8} fill="white" stroke={BORDER} />
          <text x={1016} y={120} fontSize={11} fontWeight={700} fill={INK}>LEGEND</text>
          <text x={1016} y={141} fontSize={10.5} fill={TEXT_LABEL}>pill = terminator · diamond = decision</text>
          <text x={1016} y={159} fontSize={10.5} fill={TEXT_LABEL}>hexagon = parallel gateway (mono ink)</text>
          <text x={1016} y={177} fontSize={10.5} fill={TEXT_LABEL}>hue = owning system (A2:2, 4 hues)</text>
          <text x={1016} y={195} fontSize={10.5} fill={TEXT_LABEL}>dashed = data artifact flow (A4:2)</text>
        </g>
      </svg>
    </div>
  );
}
