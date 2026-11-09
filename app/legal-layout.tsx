import type { ReactNode } from 'react';
import Link from 'next/link';
import { legal } from '../lib/legal';
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
    return <main className="legal-page"><Link className="legal-back" href="/">← TWMG</Link><h1>{title}</h1><p className="legal-updated">Last updated: {legal.updated}</p>{children}<footer className="legal-footer"><Link href="/terms">Terms and Conditions</Link><Link href="/privacy">Privacy Policy</Link></footer></main>;
}
export const Section = ({ title, children }: { title: string; children: ReactNode }) => <section><h2>{title}</h2>{children}</section>;
