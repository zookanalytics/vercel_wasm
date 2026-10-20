'use client';

import { useEffect, useState } from 'react';

export default function Home() {
  const [status, setStatus] = useState<string>('Loading WASM...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initAutomerge() {
      try {
        // This dynamic import triggers WASM loading via Turbopack's chunk system.
        // The fullfat entry of @automerge/automerge-repo imports @automerge/automerge,
        // which resolves to the "browser" export condition: fullfat_bundler.js.
        // That file does: import * as wasm from "./automerge_wasm_bg.wasm"
        //
        // Turbopack transforms this into:
        //   1. A module registered via .q() which appends ?dpl=xxx suffix
        //   2. A loadWebAssembly() call that passes the path through N()
        //   3. N() encodeURIComponent's each path segment (encoding the ?dpl= already in it)
        //      then appends ?dpl=xxx again
        //
        // Result: /_next/static/chunks/xxx.wasm%3Fdpl%3Dyyy?dpl=yyy (404)
        const { Repo } = await import('@automerge/automerge-repo');

        const repo = new Repo({ network: [], storage: undefined });
        const handle = repo.create<{ text: string }>();
        handle.change((doc) => {
          doc.text = 'Hello from Automerge!';
        });

        const doc = handle.doc();
        setStatus(`WASM loaded successfully! Document text: "${doc?.text}"`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Failed to initialize Automerge:', err);
        setError(message);
        setStatus('WASM loading failed');
      }
    }

    void initAutomerge();
  }, []);

  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>Turbopack WASM Loading Test</h1>
      <p>
        <strong>Status:</strong> {status}
      </p>
      {error && (
        <div style={{ color: 'red', marginTop: '1rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      <hr style={{ margin: '2rem 0' }} />
      <details>
        <summary>What this tests</summary>
        <p>
          This page dynamically imports <code>@automerge/automerge-repo</code>,
          which internally loads a WASM binary via Turbopack&apos;s chunk system.
        </p>
        <p>
          <strong>Works locally</strong> because there is no <code>?dpl=</code>{' '}
          deployment ID suffix.
        </p>
        <p>
          <strong>Fails when assets carry a <code>?dpl=</code> suffix</strong>{' '}
          (Vercel with Next.js 16.2.x, or <code>NEXT_DEPLOYMENT_ID</code> when
          self-hosting) because Turbopack&apos;s <code>.q()</code> function
          appends <code>?dpl=xxx</code> to the WASM path, then the URL builder
          encodeURIComponent&apos;s the path segment (turning <code>?</code>{' '}
          into <code>%3F</code>) and appends <code>?dpl=xxx</code> again. The
          double-encoded URL 404s.
        </p>
        <p>
          <strong>Works on Vercel with Next.js 16.3+</strong> because hashed
          assets are served from <code>/_next/static/immutable/</code> without{' '}
          <code>?dpl=</code>, and <strong>with Next.js 16.1.7</strong> because
          it used <code>.v()</code> which stored paths without the suffix.
        </p>
      </details>
    </main>
  );
}
