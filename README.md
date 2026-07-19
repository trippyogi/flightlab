# flightlab

Interactive golf physics laboratory built with React, TypeScript, Vite, react-three-fiber, drei, and zustand.

## v0 scope

- App shell that lands directly in the Impact instrument with a module rail.
- Pure deterministic `src/sim` package for Impact D-plane/trajectory and Green rolling/capture behavior.
- Impact controls, readouts, receipt toggles, nine-flight quick selects, and captured ghost traces.
- Green controls for distance, slope, fall line, stimp, aim, and pace with a live roll path and capture ring.
- Module manifests for Impact, Green, and future Gained work.

## Commands

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
npm run qa:visual
```

Use `npm run qa:visual` before calling a view/camera/UI change ready. It starts a local Vite server, captures desktop and mobile screenshots for Impact Player/Top/Side and Green, fails on browser/page errors, and writes screenshots to `qa-artifacts/` for inspection.

The sims are intentionally independent of three.js so the numbers can be reused by tests, future CLI tooling, and rendering layers.
