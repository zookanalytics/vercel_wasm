# Turbopack WASM Double-Encoding Bug Reproduction

Minimal reproduction for a Turbopack bug where WASM files get a 404 when
assets carry a `?dpl=` deployment ID suffix, because the suffix is
double-encoded into the WASM URL.

Reported in [vercel/next.js#92356](https://github.com/vercel/next.js/issues/92356).
Proposed fix: [vercel/next.js#92369](https://github.com/vercel/next.js/pull/92369).

## Status (2026-10-20)

- **Vercel: no longer reproduces as of Next.js 16.3.** Since
  [#92164](https://github.com/vercel/next.js/pull/92164), first released in
  16.3.0, hashed assets on Vercel are served from
  `/_next/static/immutable/chunks/…` without `?dpl=`. The runtime's asset
  suffix is empty, so the WASM URL is built correctly.
- **Self-hosting with a deployment ID: still broken** in 16.4.2 and
  16.5.0-canary.17. The runtime code is unchanged, so any build that adds
  `?dpl=` to assets (for example with `NEXT_DEPLOYMENT_ID`) still 404s.

Results on Vercel:

| Version | Result |
|---|---|
| Next.js 16.2.2 (tag [`repro-16.2.2`](https://github.com/zookanalytics/vercel_wasm/tree/repro-16.2.2)) | Broken |
| Same code, only `next` bumped to 16.4.2 (branch [`test/next-16.4.2-only`](https://github.com/zookanalytics/vercel_wasm/tree/test/next-16.4.2-only)) | Works |
| `main`: all dependencies updated, Next.js 16.4.2, Node 24 | Works |

## The Bug

When Turbopack processes `import * as wasm from "./foo.wasm"`, the WASM chunk
path goes through two URL construction steps that both append the `?dpl=xxx`
deployment suffix:

1. **`.q()` (module registration)** appends the suffix to the stored path:
   `"static/chunks/xxx.wasm"` → `"static/chunks/xxx.wasm?dpl=xxx"`

2. **The URL builder (`getChunkRelativeUrl`)** splits the path by `/`,
   `encodeURIComponent`'s each segment, then appends the suffix again:
   `"static/chunks/xxx.wasm%3Fdpl%3Dxxx"` → `"/_next/static/chunks/xxx.wasm%3Fdpl%3Dxxx?dpl=xxx"`

The `%3Fdpl%3Dxxx` in the path causes a 404 because no file exists at that path.

## Affected Versions

- **Broken when assets carry `?dpl=`**: Next.js 16.2.0 through 16.5.0-canary.17
  (tested 16.2.2, 16.4.2, 16.5.0-canary.17)
- **Broken on Vercel**: Next.js 16.2.x (tested 16.2.2)
- **Works on Vercel**: Next.js 16.3.0+ (tested 16.4.2)
- **Works**: Next.js 16.1.7

In 16.1.7, the equivalent function `.v()` stored paths *without* the suffix,
so the URL builder correctly appended it only once.

## How to Reproduce

### Local (works fine — no `?dpl=` parameter locally)

```bash
pnpm install
pnpm build
pnpm start
# Visit http://localhost:3000 — WASM loads successfully
```

### Local with a deployment ID (reproduces the bug)

Setting `NEXT_DEPLOYMENT_ID` makes Next.js add a `?dpl=` suffix to assets:

```bash
NEXT_DEPLOYMENT_ID=dpl_localtest123 pnpm build
NEXT_DEPLOYMENT_ID=dpl_localtest123 pnpm start
# Visit http://localhost:3000 — the .wasm request 404s
```

### Vercel (Next.js 16.2.x only)

1. Check out tag `repro-16.2.2` and deploy it with `vercel`
2. Visit the preview deployment URL
3. Open browser DevTools → Network tab
4. Observe: a `.wasm` request with `%3Fdpl%3D` in the path returns 404
5. The page shows "WASM loading failed"

### Testing the proposed fix

Branch [`test/pr-92369-fix`](https://github.com/zookanalytics/vercel_wasm/tree/test/pr-92369-fix)
runs `scripts/apply-pr-92369.mjs` after `next build`. The script applies the
`getChunkRelativeUrl` change from #92369 to the emitted Turbopack runtime
chunk. With `NEXT_DEPLOYMENT_ID` set, the WASM URL becomes
`…/xxx.wasm?dpl=xxx` and loads.

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

In 16.4.2 and the 16.5 canary, the URL builder is exposed as `.h()` (the WASM
loader calls `fetch(e.h(t))`). It now encodes segments only when the path has
characters outside `[A-Za-z0-9\-_.!~*'()/]`. The `?` and `=` from the suffix
that `.q()` already added trigger that encoding, so the result is still
`xxx.wasm%3Fdpl%3Dxxx?dpl=xxx`:

```js
// 16.4.2
$.q = function(e, t) { y.call(this, `${e}${n}`, t) }  // n = "?dpl=xxx"
let L = /[^A-Za-z0-9\-_.!~*'()/]/;
function B(e, t = A) {  // exposed as $.h
  let r = L.test(e) ? e.split("/").map(encodeURIComponent).join("/") : e;
  return `${t}${r}${n}`;
}
```

The suffix `n` comes from the runtime `<script src>` query string (or
`self.TURBOPACK_ASSET_SUFFIX`). On Vercel with 16.3+, the script is loaded from
`/_next/static/immutable/chunks/…` without a query, so `n` is empty and the
bug doesn't trigger.
