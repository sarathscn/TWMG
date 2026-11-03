'use client';
// Last resort when the page frame itself fails: it replaces the whole document, so it carries its own styles.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
    return <html lang="en"><body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box', background: '#f6f6f1', color: '#293b31', fontFamily: 'system-ui,sans-serif', textAlign: 'center' }}><div role="alert"><h1 style={{ fontSize: 20, margin: '0 0 8px' }}>TWMG couldn&apos;t open</h1><p style={{ color: '#5f6b5d', fontSize: 14, margin: '0 0 20px' }}>Your saved data is safe. Please try again.</p><button type="button" onClick={reset} style={{ background: '#2d6048', color: '#fff', border: 0, borderRadius: 10, padding: '12px 22px', fontWeight: 600, fontSize: 14 }}>Try again</button></div></body></html>;
}
