import { INK, PAPER, ACCENT, PALETTE, sizeOf, tint, SheetHeader, DASHED, DOTTED, BORDER, TEXT_SECONDARY, TEXT_MUTED } from "./_shared/tokens";

function Box({
  w = 62, h = 40, rx = 6, fill = "white", stroke = 1, dash, color = INK, shape = "rounded-rect", label, tag, props,
}: {
  w?: number; h?: number; rx?: number; fill?: string; stroke?: number; dash?: string; color?: string;
  shape?: string; label?: string; tag?: string; props?: string[];
}) {
  const cx = w / 2, cy = h / 2;
  const common = { fill, stroke: color, strokeWidth: stroke, strokeDasharray: dash } as const;
  const textY = props ? 14 : tag ? cy - 2 : cy + 4;
  return (
    <svg width={w + 4} height={h + 4} viewBox={`-2 -2 ${w + 4} ${h + 4}`}>
      {shape === "rounded-rect" && <rect width={w} height={h} rx={rx} {...common} />}
      {shape === "rectangle" && <rect width={w} height={h} {...common} />}
      {shape === "ellipse" && <ellipse cx={cx} cy={cy} rx={cx} ry={cy} {...common} />}
      {shape === "diamond" && <polygon points={`${cx},0 ${w},${cy} ${cx},${h} 0,${cy}`} {...common} />}
      {shape === "pill" && <rect width={w} height={h} rx={h / 2} {...common} />}
      {shape === "badge" && (
        <>
          <rect width={w} height={h} rx={rx} {...common} />
          <rect x={w - 26} y={-6} width={30} height={14} rx={7} fill={color} stroke="none" />
          <text x={w - 11} y={4} textAnchor="middle" fontSize={8} fill="white" fontFamily="Inter, sans-serif">type</text>
        </>
      )}
      {label && <text x={cx} y={textY} textAnchor="middle" fontSize={10} fontWeight={600} fill={INK} fontFamily="Inter, sans-serif">{label}</text>}
      {tag && !props && <text x={cx} y={cy + 12} textAnchor="middle" fontSize={8} fill={TEXT_SECONDARY} fontFamily="Inter, sans-serif">{tag}</text>}
      {props?.map((p, i) => (
        <text key={p} x={cx} y={26 + i * 10} textAnchor="middle" fontSize={7.5} fill={TEXT_SECONDARY} fontFamily="Inter, sans-serif">{p}</text>
      ))}
    </svg>
  );
}

function AxisRow({ id, name, meaning, children }: { id: string; name: string; meaning: string; children: React.ReactNode[] }) {
  return (
    <div className="mb-5 rounded-lg border bg-white p-4" style={{ borderColor: BORDER }}>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: tint(ACCENT, 0.12), color: ACCENT }}>{id}</span>
        <span className="text-sm font-semibold" style={{ color: INK }}>{name}</span>
        <span className="text-xs" style={{ color: TEXT_MUTED }}>{meaning}</span>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {children.map((c, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="h-[104px] flex items-center justify-center">{c}</div>
            <div className="text-[10px] font-semibold" style={{ color: TEXT_MUTED }}>Level {i}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EdgeSample({ stroke = 1, dash, double }: { stroke?: number; dash?: string; double?: boolean }) {
  return (
    <svg width={90} height={24} viewBox="0 0 90 24">
      <defs>
        <marker id={`ga-${stroke}-${dash ?? "s"}-${double ? "d" : ""}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={INK} />
        </marker>
      </defs>
      <line x1={2} y1={double ? 9 : 12} x2={80} y2={double ? 9 : 12} stroke={INK} strokeWidth={stroke} strokeDasharray={dash} markerEnd={`url(#ga-${stroke}-${dash ?? "s"}-${double ? "d" : ""})`} />
      {double && <line x1={2} y1={15} x2={76} y2={15} stroke={INK} strokeWidth={stroke} />}
    </svg>
  );
}

export function GrowthAxes() {
  return (
    <div className="min-h-screen p-10" style={{ background: PAPER, fontFamily: "Inter, sans-serif" }}>
      <SheetHeader
        title="Growth Axes — Five Parallel Linear Progressions"
        subtitle="Each axis is an independent 0→4 scale with perceptually equal steps. Axes are orthogonal — raising one never moves another — so hierarchy is counted units of emphasis: E = a1+a2+a3+a4+a5. One meaning per axis, never skip a level."
      />

      <AxisRow id="A1" name="Shape semantics" meaning="how much the silhouette encodes category">
        {[
          <Box key={0} />,
          <Box key={1} shape="ellipse" />,
          <Box key={2} shape="diamond" w={62} h={48} />,
          <Box key={3} shape="badge" color={PALETTE[0]} />,
          <div key={4} className="text-2xl">⚙︎</div>,
        ]}
      </AxisRow>

      <AxisRow id="A2" name="Color" meaning="chromatic differentiation — mono ink → semantic coding">
        {[
          <Box key={0} />,
          <Box key={1} fill={tint(ACCENT, 0.15)} />,
          <div key={2} className="flex gap-1">{PALETTE.slice(0, 3).map((c) => <Box key={c} w={26} h={26} fill={tint(c, 0.5)} color={c} />)}</div>,
          <div key={3} className="flex gap-1">{[0.6, 0.35, 0.15].map((a) => <Box key={a} w={26} h={26} fill={tint(PALETTE[0], a)} color={PALETTE[0]} />)}</div>,
          <div key={4} className="flex gap-1">
            <Box w={26} h={26} fill={tint(PALETTE[2], 0.5)} color={PALETTE[2]} />
            <Box w={26} h={26} fill={tint(PALETTE[1], 0.5)} color={PALETTE[1]} />
            <Box w={26} h={26} fill={tint(PALETTE[4], 0.5)} color={PALETTE[4]} />
          </div>,
        ]}
      </AxisRow>

      <AxisRow id="A3" name="Size" meaning="modular ×1.25 scale · S0 64 → S4 156 (footprint = importance)">
        {[0, 1, 2, 3, 4].map((lvl) => {
          const s = sizeOf(lvl);
          return <Box key={lvl} w={s.w * 0.62} h={s.h * 0.62} label={`S${lvl}`} />;
        })}
      </AxisRow>

      <AxisRow id="A4" name="Stroke & line" meaning="weight and dash vocabulary for edge/border classes">
        {[
          <EdgeSample key={0} stroke={1} />,
          <EdgeSample key={1} stroke={2} />,
          <EdgeSample key={2} stroke={3} />,
          <div key={3} className="flex flex-col gap-1.5"><EdgeSample stroke={3} dash={DASHED} /><EdgeSample stroke={3} dash={DOTTED} /></div>,
          <div key={4} className="flex flex-col gap-1.5"><EdgeSample stroke={4} /><EdgeSample stroke={2} double /></div>,
        ]}
      </AxisRow>

      <AxisRow id="A5" name="Label density" meaning="text carried — none → full property table">
        {[
          <Box key={0} w={84} h={52} />,
          <Box key={1} w={84} h={52} label="Person" />,
          <Box key={2} w={84} h={52} label="Person" tag="kg:Entity" />,
          <Box key={3} w={96} h={60} label="Person" props={["name: string", "born: 1979"]} />,
          <Box key={4} w={104} h={72} label="Person" props={["name: Ada", "born: 1979", "role: Eng", "org: ACME"]} />,
        ]}
      </AxisRow>

      <div className="text-xs mt-2" style={{ color: TEXT_MUTED }}>
        Librarian priority: category→A1 · class→A2 · importance→A3 · edge-kind→A4 · information-need→A5. Constraints: ≤5 hues, ≤2 size steps of spread, one Tier-4 hero per view.
      </div>
    </div>
  );
}
