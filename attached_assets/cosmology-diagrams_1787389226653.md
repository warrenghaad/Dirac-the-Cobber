# Cosmology, Cosmograms & Knowledge Diagrams

Use this recipe for visual maps of how a civilization understood the cosmos, the body, time, or knowledge — Mesopotamian world maps, Egyptian Duat diagrams, Mesoamerican calendars, Vedic yantras, Buddhist mandalas, kabbalistic Trees of Life, alchemical emblems, medieval *mappae mundi*, Renaissance memory theaters, Sufi cosmograms, and modern educational concept-diagrams in the same lineage.

This recipe is also the right call for *curriculum-facing* knowledge diagrams (concept maps, geometry trees, strand-and-thread overviews) when the designer wants them rendered in a period-style register rather than as a flat modern UI graphic.

## Prompt scaffold

1. **Subject line** — "[Tradition]-style cosmogram / yantra / mandala / world-map depicting [concept]."
2. **Tradition and period** — exact: "Akkadian *Imago Mundi* clay-tablet world map, c. 700 BCE"; "Tibetan Vajrayana sand mandala convention, Gelug school"; "Hermetic alchemical emblem in the style of Michael Maier's *Atalanta Fugiens*, 1617"; "Early Vedic Sri Yantra, traditional construction."
3. **Underlying geometric structure** — name it. Cosmograms *are* geometry:
   - "Concentric circles divided into eight directional sectors by a square inscribed at 45°"
   - "Nine interlocking triangles (five downward, four upward) forming the Sri Yantra around a central bindu"
   - "Tree of ten sephirot connected by 22 paths in the standard Lurianic arrangement"
   - "Mesoamerican quincunx — four directional quadrants around a central fifth axis"
   - "Square temple-plan mandala (vastu-purusha-mandala) divided into an 8×8 or 9×9 grid"
4. **Symbolic content placed on the geometry** — what occupies each zone, sector, or node. Be specific: "the four cardinal directions marked by their tutelary beasts (Aries/east, Cancer/north, …)"; "each of the seven planetary spheres labeled with its classical glyph"; "the four world-quarters of the Mexica universe each colored its proper color (east-red, north-black, west-white, south-blue) with its tree and bird."
5. **Color and pigment palette** — period-faithful: lapis blue, malachite green, vermilion, gold leaf, lampblack on cream parchment; or polychrome sand pigments; or the muted earth tones of clay-tablet incision (no color, just texture).
6. **Medium being emulated** — "incised clay tablet, raking light"; "tempera and gold leaf on parchment"; "ink on cosmic-blue paper with white and gold pigment"; "polychrome sand mandala on a flat ritual platform"; "engraving on copper plate, black-and-white with rich hatching."
7. **Composition and framing** — "perfectly centered, symmetrical, edge-to-edge"; "framed within a square cartouche with a decorative outer border in the period idiom"; "single page of a codex with text columns flanking the diagram." Cosmograms almost always want flat-on orthographic.
8. **Text handling** — labels are *expected* in many cosmograms, but image models can't render real script reliably. State: "labels shown as plausible script in the period idiom, no requirement of readable text" or "no text labels — purely diagrammatic." Choose deliberately.
9. **Style register** — "Faithful reconstruction in the visual conventions of [the named medium], museum-quality reference, flat and graphic, no perspective."
10. **Negative cues** — "no New-Age sacred-geometry-poster aesthetics, no neon glows, no Photoshop lens flares, no fantasy stock-art clichés, no anachronistic mixing of traditions (no Tree of Life inside a Sri Yantra inside a zodiac wheel unless explicitly requested), no readable modern lettering, no rainbow gradients, no 3D bevels, no glossy plastic finish."

## Aspect ratio

- Centered radial cosmogram (mandala, yantra, world map, zodiac wheel) → `1:1`
- Vertical hierarchical diagram (Tree of Life, cosmic axis with heavens-above-earth-above-underworld) → `3:4`
- Horizontal narrative diagram (Egyptian Book of the Dead vignette, sequential cosmic ages) → `16:9`
- Diagram embedded in a codex page with marginal text → `3:4`

## Model

- Default: `gpt_image_2`.
- For a clean cutout cosmogram to drop into curriculum materials, use `gpt_image_1_5` with `background: "transparent"`.

## Worked example prompt

```
Akkadian Babylonian Map of the World (the "Imago Mundi"), c. 700-500 BCE, faithfully reconstructed as a clay tablet study image.

Geometric structure: a flat circular disk of the earth surrounded by the cosmic ocean (the *marratu*), the ocean ringed by seven or eight triangular "nagû" regions pointing radially outward. Babylon shown as a small rectangle near the center, the Euphrates as a vertical band running south from the northern mountains through Babylon to the southern marshes, neighboring cities and regions marked as small circles and rectangles in their geographic positions.

Symbolic content placed on the geometry: Babylon central, the Euphrates axis vertical, the bitter sea ringing the inhabited world, the outer nagû labeled with plausible cuneiform (no requirement of textual accuracy).

Color and material: no color — this is an incised clay tablet, warm tan with darker firing streaks, slightly chipped at the edges, cuneiform legend in horizontal cases at the top and bottom of the tablet outside the map disk.

Medium emulated: faithful reconstruction as an Old Babylonian incised clay tablet.

Composition and framing: centered map disk occupying the middle two-thirds of the tablet, ruled horizontal cases of cuneiform legend above and below, flat-on orthographic top-down view, edge-to-edge.

Text handling: cuneiform labels shown as plausible signs in the period idiom, no requirement of readable text.

Lighting: soft raking light from the upper left at a low angle so each incised line casts a tiny shadow and the cosmic-ocean ring reads clearly.

Style: museum-quality study image of a written artifact, faithful archaeological reconstruction, ultra-sharp.

Negative: no New-Age sacred-geometry-poster aesthetics, no neon glows, no rainbow gradients, no readable modern lettering, no anachronistic projection (no Mercator, no graticule), no 3D bevels, no glossy finish.
```

Aspect ratio: `1:1`. Model: `gpt_image_2`. Filename: `babylonian_imago_mundi_tablet_v1`.

## Common follow-ups to offer

- A "key" companion image with the same diagram cleanly redrawn and labeled in modern English for classroom use (handoff: this becomes a UI-mockup-style infographic via `ui-mockups.md`).
- The same cosmic concept rendered in a different tradition's idiom (e.g. Babylonian Imago Mundi vs. medieval *T-O* mappa mundi vs. Mexica four-quarters cosmogram) as a comparative set.
- A 3D photoreal staging of the same diagram as a built object (sand mandala on a temple floor, parchment unrolled on a scholar's desk) — handoff to `scenes.md`.
- A geometry-only "construction diagram" variant showing the underlying grid without symbolic content — handoff to `geometry-art.md`.
