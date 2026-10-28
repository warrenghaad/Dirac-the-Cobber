import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Circle } from 'lucide-react';

const INK = '#211E19';
const PAPER = '#EFE8DB';
const PAPER_DIM = '#E7DFCE';
const CLAY = '#A8542E';
const MOSS = '#6F7A5B';
const ASH = '#8E8676';

const STAGES = {
  H: { name: 'HINOKI HALL', color: CLAY },
  B: { name: 'BIRCH COURT', color: MOSS },
  P: { name: 'PAPER ROOM', color: ASH },
};

const DAYS = [
  {
    key: 'D1',
    kanji: '木',
    label: 'DAY 01 — WOOD',
    date: 'FRI · 04 OCT 2025',
    artists: [
      { name: 'Asa Lindqvist', place: 'Stockholm, SE', genre: 'Modern Composition', time: '21:00', stage: 'H', span: 7, tier: 1 },
      { name: 'Mizu Ensemble', place: 'Kyoto, JP', genre: 'Chamber Ambient', time: '19:30', stage: 'H', span: 5, tier: 1 },
      { name: 'Birk Halvorsen', place: 'Oslo, NO', genre: 'Prepared Piano', time: '18:15', stage: 'B', span: 4, tier: 2 },
      { name: 'Komorebi Tape Club', place: 'Tokyo, JP', genre: 'Tape Loops', time: '17:30', stage: 'P', span: 4, tier: 2 },
      { name: 'Vera Lindh', place: 'Copenhagen, DK', genre: 'Cello & Voice', time: '16:45', stage: 'B', span: 4, tier: 2 },
      { name: 'Shio & The Quiet Hours', place: 'Naoshima, JP', genre: 'Slow Folk', time: '16:00', stage: 'P', span: 3, tier: 3 },
      { name: 'Grain Choir', place: 'Bergen, NO', genre: 'A Cappella Drone', time: '15:15', stage: 'B', span: 3, tier: 3 },
      { name: 'Ibsen Oda Duo', place: 'Aarhus, DK', genre: 'Reed Organ', time: '14:30', stage: 'P', span: 3, tier: 3 },
      { name: 'Field Notes Orchestra', place: 'Helsinki, FI', genre: 'Found Sound', time: '13:45', stage: 'H', span: 3, tier: 3 },
      { name: 'Lina Kobayashi', place: 'Kanazawa, JP', genre: 'Koto, Solo', time: '13:00', stage: 'P', span: 2, tier: 4 },
      { name: 'Two Rivers', place: 'Gothenburg, SE', genre: 'Guitar Duets', time: '12:30', stage: 'B', span: 2, tier: 4 },
      { name: 'Mokume', place: 'Osaka, JP', genre: 'Percussion', time: '12:00', stage: 'P', span: 2, tier: 4 },
      { name: 'Hede & Strand', place: 'Malmö, SE', genre: 'Harmonium', time: '11:30', stage: 'B', span: 2, tier: 4 },
      { name: 'The Plane & Chisel', place: 'Portland, US', genre: 'Workshop Set', time: '11:00', stage: 'P', span: 2, tier: 4 },
      { name: 'Aoki Soundprints', place: 'Nagano, JP', genre: 'Field Recording', time: '10:30', stage: 'P', span: 2, tier: 4 },
    ],
  },
  {
    key: 'D2',
    kanji: '紙',
    label: 'DAY 02 — PAPER',
    date: 'SAT · 05 OCT 2025',
    artists: [
      { name: 'Hibiki Strings', place: 'Tokyo, JP', genre: 'String Quartet, Amplified', time: '21:00', stage: 'H', span: 7, tier: 1 },
      { name: 'Nordlys', place: 'Tromsø, NO', genre: 'Modular & Brass', time: '19:30', stage: 'H', span: 5, tier: 1 },
      { name: 'Eira Voll', place: 'Reykjavík, IS', genre: 'Piano Miniatures', time: '18:15', stage: 'B', span: 4, tier: 2 },
      { name: 'Washi Frequencies', place: 'Mino, JP', genre: 'Paper Instruments', time: '17:30', stage: 'P', span: 4, tier: 2 },
      { name: 'Søren Bek Trio', place: 'Copenhagen, DK', genre: 'Quiet Jazz', time: '16:45', stage: 'B', span: 4, tier: 2 },
      { name: 'Ame Ensemble', place: 'Kyoto, JP', genre: 'Rain Studies', time: '16:00', stage: 'P', span: 3, tier: 3 },
      { name: 'Linnea Holm', place: 'Uppsala, SE', genre: 'Nyckelharpa', time: '15:15', stage: 'B', span: 3, tier: 3 },
      { name: 'Kami Choir', place: 'Takayama, JP', genre: 'Voice & Bells', time: '14:30', stage: 'P', span: 3, tier: 3 },
      { name: 'Drift Atlas', place: 'Helsinki, FI', genre: 'Slow Electronics', time: '13:45', stage: 'H', span: 3, tier: 3 },
      { name: 'Otto Vinter', place: 'Oslo, NO', genre: 'Clarinet, Solo', time: '13:00', stage: 'P', span: 2, tier: 4 },
      { name: 'Sumi Lines', place: 'Tokyo, JP', genre: 'Ink & Sound', time: '12:30', stage: 'B', span: 2, tier: 4 },
      { name: 'Fold / Unfold', place: 'Berlin, DE', genre: 'Origami Score', time: '12:00', stage: 'P', span: 2, tier: 4 },
      { name: 'Birgit Aas', place: 'Bergen, NO', genre: 'Hardanger Fiddle', time: '11:30', stage: 'B', span: 2, tier: 4 },
      { name: 'Tetsu Mori', place: 'Sapporo, JP', genre: 'Vibraphone', time: '11:00', stage: 'P', span: 2, tier: 4 },
      { name: 'The Bindery', place: 'Amsterdam, NL', genre: 'Spoken Craft', time: '10:30', stage: 'P', span: 2, tier: 4 },
    ],
  },
  {
    key: 'D3',
    kanji: '石',
    label: 'DAY 03 — STONE',
    date: 'SUN · 06 OCT 2025',
    artists: [
      { name: 'Tatami Drone Society', place: 'Kyoto, JP', genre: 'Long-form Drone', time: '21:00', stage: 'H', span: 7, tier: 1 },
      { name: 'Ellinor Vask', place: 'Stockholm, SE', genre: 'Voice & Organ', time: '19:30', stage: 'H', span: 5, tier: 1 },
      { name: 'Stone Garden Trio', place: 'Kanazawa, JP', genre: 'Percussion & Water', time: '18:15', stage: 'B', span: 4, tier: 2 },
      { name: 'Halvar Eng', place: 'Trondheim, NO', genre: 'Pipe Organ', time: '17:30', stage: 'P', span: 4, tier: 2 },
      { name: 'Suiseki', place: 'Nara, JP', genre: 'Stone Flutes', time: '16:45', stage: 'B', span: 4, tier: 2 },
      { name: 'Maren Skov', place: 'Aarhus, DK', genre: 'Viola da Gamba', time: '16:00', stage: 'P', span: 3, tier: 3 },
      { name: 'Kawa Quartet', place: 'Gifu, JP', genre: 'River Recordings', time: '15:15', stage: 'B', span: 3, tier: 3 },
      { name: 'North Slate', place: 'Edinburgh, UK', genre: 'Slate Marimba', time: '14:30', stage: 'P', span: 3, tier: 3 },
      { name: 'Ishi & Brand', place: 'Tokyo / Oslo', genre: 'Duets', time: '13:45', stage: 'H', span: 3, tier: 3 },
      { name: 'Pia Lund', place: 'Malmö, SE', genre: 'Glass Harp', time: '13:00', stage: 'P', span: 2, tier: 4 },
      { name: 'Karesansui', place: 'Kyoto, JP', genre: 'Raked Sound', time: '12:30', stage: 'B', span: 2, tier: 4 },
      { name: 'Vidar Holt', place: 'Oslo, NO', genre: 'Double Bass', time: '12:00', stage: 'P', span: 2, tier: 4 },
      { name: 'Asa & Daughters', place: 'Reykjavík, IS', genre: 'Lullabies', time: '11:30', stage: 'B', span: 2, tier: 4 },
      { name: 'Mortar Choir', place: 'Helsinki, FI', genre: 'Low Voices', time: '11:00', stage: 'P', span: 2, tier: 4 },
      { name: 'Closing Bell', place: 'All Stages', genre: 'Single Strike, 432 Hz', time: '22:00', stage: 'H', span: 2, tier: 4 },
    ],
  },
];

const STATS = [
  { value: '100%', label: 'OF PROCEEDS TO APPRENTICESHIPS', span: 3 },
  { value: '47', label: 'APPRENTICES FUNDED SINCE 2017', span: 3 },
  { value: '¥182M', label: 'RAISED ACROSS SEVEN EDITIONS', span: 3 },
  { value: '12', label: 'PARTNER ATELIERS · JP / SE / NO / DK', span: 3 },
];

const HOURS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];

export default function App() {
  const [dayIdx, setDayIdx] = useState(0);
  const day = DAYS[dayIdx];

  const tierName = (t) =>
    t === 1 ? 'shippori text-[clamp(28px,3.4vw,46px)] leading-[1.02]' :
    t === 2 ? 'shippori text-[clamp(20px,2.2vw,30px)] leading-[1.05]' :
    t === 3 ? 'shippori text-[clamp(16px,1.7vw,22px)] leading-[1.1]' :
    'shippori text-[clamp(13px,1.3vw,17px)] leading-[1.15]';

  return (
    <div className="min-h-screen w-full flex justify-center px-3 py-8 md:py-14" style={{ background: '#171411' }}>
      <link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500;600;700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: `
        .shippori { font-family: 'Shippori Mincho', serif; }
        .inter { font-family: 'Inter', sans-serif; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .paper-tex {
          background-color: ${PAPER};
          background-image: radial-gradient(rgba(33,30,25,0.045) 1px, transparent 0);
          background-size: 5px 5px;
        }
        .cell { background: ${PAPER}; transition: background .25s ease, color .25s ease; }
        .cell-dim { background: ${PAPER_DIM}; }
        .artist-cell { cursor: pointer; }
        .artist-cell:hover { background: ${INK}; color: ${PAPER}; }
        .artist-cell:hover .meta { color: ${PAPER}; opacity: .65; }
        .artist-cell:hover .timecode { color: ${CLAY}; }
        .vline { writing-mode: vertical-rl; text-orientation: upright; }
        .strike { position: relative; }
        .strike::after { content:''; position:absolute; left:-2%; right:-2%; top:52%; height:1.5px; background:${CLAY}; transform: rotate(-1.2deg); }
        ::selection { background: ${CLAY}; color: ${PAPER}; }
        .scroll-x::-webkit-scrollbar { height: 0; }
      `}} />

      <div className="w-full max-w-[1180px]">
        {/* ====== POSTER SHEET ====== */}
        <div className="paper-tex shadow-[0_40px_120px_rgba(0,0,0,0.6)]" style={{ color: INK, border: `1px solid ${INK}` }}>

          {/* MASTHEAD */}
          <div className="grid grid-cols-12" style={{ borderBottom: `1px solid ${INK}` }}>
            <div className="col-span-12 md:col-span-2 flex items-center justify-between md:justify-center px-4 py-3 md:py-0" style={{ borderRight: `1px solid ${INK}` }}>
              <span className="mono text-[10px] tracking-[0.25em]">EDITION 08</span>
              <span className="mono text-[10px] tracking-[0.25em] md:hidden">N° 0001 / 1500</span>
            </div>
            <div className="col-span-12 md:col-span-7 px-5 md:px-8 py-6 md:py-8" style={{ borderRight: `1px solid ${INK}` }}>
              <div className="mono text-[10px] tracking-[0.3em] mb-3" style={{ color: ASH }}>
                A REBRANDING, REVEALED IN SOUND — <span className="strike inline-block px-1">THE HANDCRAFT AID COUNCIL</span> IS NOW
              </div>
              <div className="flex items-end gap-4 flex-wrap">
                <h1 className="shippori font-bold tracking-[-0.01em] text-[clamp(56px,9vw,118px)] leading-[0.9]">TSUGI</h1>
                <span className="shippori text-[clamp(40px,6vw,84px)] leading-[0.9]" style={{ color: CLAY }}>継</span>
                <p className="inter text-[12px] md:text-[13px] leading-snug max-w-[240px] pb-1" style={{ color: '#4a443a' }}>
                  <em className="shippori">tsugi</em> — to join, to inherit, to continue. A benefit festival funding craft apprenticeships across Japan &amp; Scandinavia.
                </p>
              </div>
            </div>
            <div className="col-span-12 md:col-span-3 grid grid-rows-3" style={{ borderTop: '1px solid transparent' }}>
              <div className="px-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${INK}` }}>
                <span className="mono text-[10px] tracking-[0.2em]">VENUE</span>
                <span className="inter text-[12px] font-medium">The Old Sawmill, Setagaya</span>
              </div>
              <div className="px-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${INK}` }}>
                <span className="mono text-[10px] tracking-[0.2em]">DATES</span>
                <span className="inter text-[12px] font-medium">04 — 06 OCT 2025</span>
              </div>
              <div className="px-4 flex items-center justify-between">
                <span className="mono text-[10px] tracking-[0.2em]">PASSES</span>
                <span className="inter text-[12px] font-medium" style={{ color: CLAY }}>¥9,800 · all proceeds donated</span>
              </div>
            </div>
          </div>

          {/* DAY TOGGLE + STAGE LEGEND */}
          <div className="grid grid-cols-12" style={{ borderBottom: `1px solid ${INK}` }}>
            {DAYS.map((d, i) => (
              <button
                key={d.key}
                onClick={() => setDayIdx(i)}
                className="col-span-4 md:col-span-2 px-4 py-3 text-left transition-colors duration-200"
                style={{
                  borderRight: `1px solid ${INK}`,
                  background: i === dayIdx ? INK : PAPER,
                  color: i === dayIdx ? PAPER : INK,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="shippori text-[18px]" style={{ color: i === dayIdx ? CLAY : ASH }}>{d.kanji}</span>
                  <div>
                    <div className="mono text-[10px] tracking-[0.2em]">{d.label}</div>
                    <div className="inter text-[10px] opacity-60">{d.date}</div>
                  </div>
                </div>
              </button>
            ))}
            <div className="hidden md:flex col-span-6 items-center justify-end gap-6 px-5">
              {Object.entries(STAGES).map(([k, s]) => (
                <div key={k} className="flex items-center gap-2">
                  <Circle size={8} fill={s.color} stroke="none" />
                  <span className="mono text-[10px] tracking-[0.2em]">{k} — {s.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* LINEUP GRID */}
          <AnimatePresence mode="wait">
            <motion.div
              key={day.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="grid grid-cols-6 md:grid-cols-12 gap-px"
              style={{ background: INK }}
            >
              {day.artists.map((a, i) => {
                const stage = STAGES[a.stage];
                return (
                  <div
                    key={a.name}
                    className={`cell artist-cell flex flex-col justify-between px-3 md:px-4 py-3 md:py-4 ${a.tier <= 2 ? 'min-h-[120px] md:min-h-[150px]' : a.tier === 3 ? 'min-h-[100px] md:min-h-[120px]' : 'min-h-[88px] md:min-h-[100px]'}`}
                    style={{ gridColumn: `span ${Math.min(a.span * (a.tier <= 2 ? 1 : 1), 12)} / span ${a.span}` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="mono timecode text-[10px] tracking-[0.15em]" style={{ color: CLAY }}>{a.time}</span>
                      <span className="flex items-center gap-1.5">
                        <Circle size={7} fill={stage.color} stroke="none" />
                        <span className="mono text-[9px] tracking-[0.2em] meta" style={{ color: ASH }}>{a.stage}</span>
                      </span>
                    </div>
                    <div>
                      <div className={`${tierName(a.tier)} font-semibold`}>{a.name}</div>
                      <div className="meta inter text-[10px] md:text-[11px] mt-1 flex flex-wrap gap-x-2" style={{ color: '#6a6354' }}>
                        <span>{a.genre}</span>
                        <span>·</span>
                        <span>{a.place}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* mission interleave cell */}
              <div className="cell-dim col-span-6 md:col-span-4 px-4 py-4 flex flex-col justify-between min-h-[100px]">
                <span className="mono text-[9px] tracking-[0.25em]" style={{ color: ASH }}>WHY WE PLAY</span>
                <p className="shippori text-[15px] md:text-[17px] leading-snug">
                  Every ticket places one young maker beside a master — at the bench, the loom, the wheel — for a full season.
                </p>
              </div>
              <div className="cell-dim col-span-3 md:col-span-2 px-4 py-4 flex flex-col justify-between">
                <span className="mono text-[9px] tracking-[0.25em]" style={{ color: ASH }}>SOUND LEVEL</span>
                <span className="shippori text-[22px]">≤ 82 dB</span>
                <span className="inter text-[10px]" style={{ color: '#6a6354' }}>Listening, not loudness.</span>
              </div>
              <div className="cell-dim col-span-3 md:col-span-2 px-4 py-4 flex flex-col justify-between">
                <span className="mono text-[9px] tracking-[0.25em]" style={{ color: ASH }}>SEATING</span>
                <span className="shippori text-[22px]">Zaisu</span>
                <span className="inter text-[10px]" style={{ color: '#6a6354' }}>Hand-joined oak floor chairs.</span>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* TIMELINE STRIP */}
          <div style={{ borderTop: `1px solid ${INK}`, borderBottom: `1px solid ${INK}` }} className="grid grid-cols-12">
            <div className="col-span-12 md:col-span-2 px-4 py-3 flex items-center" style={{ borderRight: `1px solid ${INK}` }}>
              <span className="mono text-[10px] tracking-[0.25em]">PROGRAMME GRID</span>
            </div>
            <div className="col-span-12 md:col-span-10 overflow-x-auto scroll-x">
              <div className="flex min-w-[700px]">
                {HOURS.map((h, i) => (
                  <div key={h} className="flex-1 px-2 py-3 relative" style={{ borderRight: i < HOURS.length - 1 ? `1px solid rgba(33,30,25,0.25)` : 'none' }}>
                    <span className="mono text-[9px] tracking-[0.1em]" style={{ color: ASH }}>{h}</span>
                    <div className="mt-2 h-1.5" style={{
                      background: i >= 11 ? CLAY : i >= 8 ? INK : i >= 4 ? MOSS : 'rgba(33,30,25,0.18)'
                    }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* STATS ROW */}
          <div className="grid grid-cols-2 md:grid-cols-12 gap-px" style={{ background: INK }}>
            {STATS.map((s) => (
              <div key={s.label} className="cell col-span-1 md:col-span-3 px-4 py-5 flex flex-col justify-between min-h-[110px]">
                <span className="shippori text-[clamp(28px,3vw,42px)] font-semibold" style={{ color: s.value === '100%' ? CLAY : INK }}>{s.value}</span>
                <span className="mono text-[9px] tracking-[0.2em] leading-relaxed" style={{ color: '#6a6354' }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* REBRAND NOTE + VERTICAL TEXT + CTA */}
          <div className="grid grid-cols-12" style={{ borderTop: `1px solid ${INK}` }}>
            <div className="hidden md:flex col-span-1 items-center justify-center py-6" style={{ borderRight: `1px solid ${INK}` }}>
              <span className="vline shippori text-[14px] tracking-[0.4em]" style={{ color: ASH }}>手から手へ、続いていく</span>
            </div>
            <div className="col-span-12 md:col-span-7 px-5 md:px-8 py-6" style={{ borderRight: `1px solid ${INK}` }}>
              <span className="mono text-[10px] tracking-[0.3em]" style={{ color: ASH }}>ON THE NEW NAME</span>
              <p className="shippori text-[17px] md:text-[20px] leading-relaxed mt-3 max-w-[60ch]">
                For seventeen years we worked under a name that described what we did. <span style={{ color: CLAY }}>Tsugi</span> describes why: the joint where one generation’s hands meet the next. Same trust, same ledger, same people — a sharper edge on the same blade.
              </p>
              <p className="inter text-[12px] mt-4" style={{ color: '#6a6354' }}>
                — Maren Okabe &amp; Lars Thune, Co-directors. Registered charity no. 110-43-58721 (JP) · 802471-3344 (SE).
              </p>
            </div>
            <div className="col-span-12 md:col-span-4 flex flex-col">
              <a className="group flex-1 flex items-center justify-between px-5 py-5 cursor-pointer transition-colors duration-200 hover:opacity-90"
                style={{ background: CLAY, color: PAPER, borderBottom: `1px solid ${INK}` }}>
                <div>
                  <div className="mono text-[10px] tracking-[0.3em] opacity-80">FULL FESTIVAL PASS</div>
                  <div className="shippori text-[24px] font-semibold">Reserve your seat</div>
                </div>
                <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1.5" size={22} />
              </a>
              <a className="group flex-1 flex items-center justify-between px-5 py-5 cursor-pointer transition-colors duration-200 hover:bg-[#211E19] hover:text-[#EFE8DB]">
                <div>
                  <div className="mono text-[10px] tracking-[0.3em] opacity-60">CAN’T ATTEND?</div>
                  <div className="shippori text-[20px] font-semibold">Sponsor an apprentice — ¥38,000</div>
                </div>
                <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1.5" size={20} />
              </a>
            </div>
          </div>

          {/* COLOPHON */}
          <div className="grid grid-cols-12 mono text-[9px] tracking-[0.18em]" style={{ borderTop: `1px solid ${INK}`, color: '#6a6354' }}>
            <div className="col-span-6 md:col-span-3 px-4 py-3" style={{ borderRight: `1px solid ${INK}` }}>SET IN SHIPPORI MINCHO &amp; INTER</div>
            <div className="col-span-6 md:col-span-3 px-4 py-3" style={{ borderRight: `1px solid ${INK}` }}>TWO INKS ON VENT NOUVEAU 120 GSM</div>
            <div className="col-span-6 md:col-span-2 px-4 py-3" style={{ borderRight: `1px solid ${INK}` }}>EDITION OF 1,500 · N° 0001</div>
            <div className="col-span-6 md:col-span-2 px-4 py-3" style={{ borderRight: `1px solid ${INK}` }}>DESIGN: STUDIO KIBA, KYOTO</div>
            <div className="col-span-12 md:col-span-2 px-4 py-3 flex items-center justify-between">
              <span>TSUGI.ORG</span>
              <span className="shippori text-[12px]" style={{ color: CLAY }}>継</span>
            </div>
          </div>
        </div>

        {/* below-sheet caption */}
        <div className="flex justify-between items-center mt-4 px-1 mono text-[9px] tracking-[0.25em]" style={{ color: '#5d564a' }}>
          <span>POSTER 02 / 06 — REBRAND ANNOUNCEMENT SERIES</span>
          <span>PRINTED & FOLDED BY HAND, AUGUST 2025</span>
        </div>
      </div>
    </div>
  );
}