# RDE Wave-Count Atlas — site

Scroll-driven 3D presentation of the paper *"A wave-count stability atlas for the
Koch–Kurosaka–Knowlen–Kutz rotating detonation engine analog."*

**Live:** see the Vercel deployment for this repo.
**Science repo (code + data + paper source):** https://github.com/abc000cool/rde-wave-atlas

## What it is

A single static page. One continuous three.js world is scrubbed by scroll position
through eight beats: the glowing annular combustor with 1→4 detonation waves, the
annulus unwrapping into the model's periodic line, 5,856 simulation tiles assembling
into the regime atlas, the wave-count staircase, the continuation "trap" and its
ignition spark, the six-laboratory data pins, honest limits, and the finale.

## Files

| file | role |
|---|---|
| `index.html` | markup, styles, and the scroll→overlay driver (beat opacity, count-ups, progress ring) |
| `rde-scene.js` | the entire 3D world: shaders, camera keyframes, atlas instancing, post-processing |
| `rde-wave-count-atlas.pdf` | the paper, served from the "Read the paper" button |

three.js 0.160 and its `UnrealBloomPass` load from jsDelivr as ES modules; there is
no build step and no bundler.

## Local development

ES modules and the dynamic `import('./rde-scene.js')` need a real HTTP origin, so
open it through a server rather than `file://`:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Notes

- Scroll length is set by the `[data-spacer]` height (`1150vh`); every animation is
  keyed to normalized scroll progress `p ∈ [0,1]`, so changing that height retimes
  the whole film without touching the keyframes.
- Beats are declared in markup as `data-w="start,end"` (in `p`), and animated numbers
  as `data-count="value,start,end"` — no JS edit is needed to retime copy.
- `prefers-reduced-motion: reduce` collapses the page to a static, readable
  long-form layout with a single rendered frame behind it.
- Mobile lowers the ring tessellation, atlas grid, star count, and pixel ratio.

Origin: authored in Claude Design as `RDE Atlas.dc.html` and ported to a standalone
static page (the Design runtime `support.js` requires an injected React and only runs
inside the editor).
