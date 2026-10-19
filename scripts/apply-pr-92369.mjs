// Applies the getChunkRelativeUrl fix from https://github.com/vercel/next.js/pull/92369
// to the Turbopack runtime chunk emitted by `next build`, so the fix can be
// tested on a real Vercel deployment without building next-swc from source.
//
// Original (minified):
//   function B(e,t=A){let r=L.test(e)?e.split("/").map(encodeURIComponent).join("/"):e;return`${t}${r}${n}`}
// Patched: split off any existing "?query" before encoding and reuse it instead
// of appending the asset suffix a second time.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = '.next/static/chunks';
const runtimes = readdirSync(dir).filter(
  (f) => f.startsWith('turbopack-') && f.endsWith('.js'),
);

const pattern =
  /function (\w+)\((\w+),(\w+)=(\w+)\)\{let (\w+)=(\w+)\.test\(\2\)\?\2\.split\("\/"\)\.map\(encodeURIComponent\)\.join\("\/"\):\2;return`\$\{\3\}\$\{\5\}\$\{(\w+)\}`\}/g;

let patched = 0;
for (const file of runtimes) {
  const path = join(dir, file);
  const src = readFileSync(path, 'utf8');
  const matches = [...src.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`${file}: expected 1 getChunkRelativeUrl match, found ${matches.length}`);
  }
  const [whole, fn, p, base, baseDefault, enc, re, suffix] = matches[0];
  const replacement =
    `function ${fn}(${p},${base}=${baseDefault}){` +
    `let __qi=${p}.indexOf("?"),__pp=__qi===-1?${p}:${p}.slice(0,__qi),__qs=__qi===-1?${suffix}:${p}.slice(__qi);` +
    `let ${enc}=${re}.test(__pp)?__pp.split("/").map(encodeURIComponent).join("/"):__pp;` +
    `return\`\${${base}}\${${enc}}\${__qs}\`}`;
  writeFileSync(path, src.replace(whole, replacement));
  console.log(`Patched ${file} (PR #92369 getChunkRelativeUrl fix)`);
  patched++;
}

if (patched === 0) throw new Error('No Turbopack runtime chunk found to patch');
