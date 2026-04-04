# Turbopack WASM Double-Encoding Bug Reproduction

Minimal reproduction for a Turbopack bug in Next.js 16.2.x where WASM files
get a 404 on Vercel deployments due to double-encoding of the deployment ID
query parameter.

## The Bug

When Turbopack processes `import * as wasm from "./foo.wasm"`, the WASM chunk
path goes through two URL construction steps that both append the `?dpl=xxx`
deployment suffix:

1. **`.q()` (module registration)** appends the suffix to the stored path:
   `"static/chunks/xxx.wasm"` → `"static/chunks/xxx.wasm?dpl=xxx"`

2. **`N()` (URL construction in `loadWebAssembly`)** splits the path by `/`,
   `encodeURIComponent`'s each segment, then appends the suffix again:
   `"static/chunks/xxx.wasm%3Fdpl%3Dxxx"` → `"/_next/static/chunks/xxx.wasm%3Fdpl%3Dxxx?dpl=xxx"`

The `%3Fdpl%3Dxxx` in the path causes a 404 because no file exists at that path.

## Affected Versions

- **Broken**: Next.js 16.2.0, 16.2.1, 16.2.2
- **Works**: Next.js 16.1.7

In 16.1.7, the equivalent function `.v()` stored paths *without* the suffix,
so `N()` correctly appended it only once.

## How to Reproduce

### Local (works fine — no `?dpl=` parameter locally)

```bash
pnpm install
pnpm build
pnpm start
# Visit http://localhost:3000 — WASM loads successfully
```

### Vercel (fails — `?dpl=` triggers the bug)

1. Deploy this repo to Vercel
2. Visit the preview deployment URL
3. Open browser DevTools → Network tab
4. Observe: a `.wasm` request with `%3Fdpl%3D` in the path returns 404
5. The page shows "WASM loading failed"

## Root Cause in Turbopack Runtime

From the built output (`turbopack-*.js` runtime):

```js
// 16.2.2: .q() appends suffix to stored path
S.q = function(e, t) { m.call(this, `${e}${r}`, t) }  // r = "?dpl=xxx"

// Both versions: N() also appends suffix
function N(e) {
  return `${t}${e.split("/").map(e => encodeURIComponent(e)).join("/")}${r}`
}

// loadWebAssembly calls N() on the already-suffixed path
async loadWebAssembly(e, t, r, n, o) {
  let i = fetch(N(r));  // r already has ?dpl=xxx from .q()
  // ...
}
```

## Workaround

Use `@automerge/automerge-repo/slim` with manual WASM initialization
(base64 or `public/` file) to bypass Turbopack's WASM chunk loading entirely.
