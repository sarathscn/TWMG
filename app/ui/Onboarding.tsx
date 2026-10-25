'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Check, Compass, X } from 'lucide-react';
import { useI18n } from './UIProvider';
// First-run welcome, a guided tour over the real interface, and a completion screen.
// Steps point at elements that exist on screen (by CSS selector); the tour never covers or
// disables them, so people can follow along by actually using the app.
export type TourStep = {
    id: string;
    // The section to open before the step, so the highlighted control is on screen.
    view?: string;
    // Candidate selectors; the first one that is visible is highlighted. None: a centred card.
    target?: string[];
    title: string;
    body: string;
    // What to do next, in words. Shown under the explanation.
    hint?: string;
    // The step finishes by itself once this is true (for example, the form was opened).
    done?: () => boolean;
    // While true, Next waits (for example, until an open form is saved or cancelled).
    hold?: () => boolean;
};
type Saved = { status: 'active' | 'done' | 'skipped'; step: number };
const storageKey = (who: string) => 'twmg-guide:' + (who || 'guest').toLowerCase();
// Progress is kept on this device per signed-in account (or "guest" in the dev preview),
// so it survives restarts and never touches finance data.
export function loadGuide(who: string): Saved | null {
    try { const v = JSON.parse(localStorage.getItem(storageKey(who)) || 'null'); return v && ['active', 'done', 'skipped'].includes(v.status) ? { status: v.status, step: Number(v.step) || 0 } : null; } catch { return null; }
}
export function saveGuide(who: string, value: Saved) { try { localStorage.setItem(storageKey(who), JSON.stringify(value)); } catch { /* storage unavailable: the guide simply shows again */ } }
const visible = (el: Element | null): el is HTMLElement => { if (!(el instanceof HTMLElement)) return false; const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
const find = (selectors?: string[]) => { for (const s of selectors || []) { const el = Array.from(document.querySelectorAll(s)).find(visible); if (el) return el; } return null; };

export function WelcomeScreen({ name, start, skip }: { name: string; start: () => void; skip: () => void }) {
    const { tr } = useI18n();
    const first = useRef<HTMLButtonElement>(null);
    useEffect(() => { first.current?.focus(); }, []);
    const features: [string, string][] = [['🧾', 'Record income, spending and transfers in seconds'], ['🏦', 'Keep every account, card and wallet in one place'], ['🤝', 'Track money lent, borrowed and shared with friends'], ['🔔', 'Plan budgets, savings goals and recurring bills'], ['📊', 'See where your money goes with charts and reports']];
    return <div className="guide-backdrop" role="dialog" aria-modal="true" aria-labelledby="guide-welcome-title"><div className="guide-sheet">
        <span className="guide-badge"><Compass size={22}/></span>
        <h2 id="guide-welcome-title">{tr('Welcome to TWMG, {0}!', name)}</h2>
        <p>{tr('TWMG — The Way Money Goes — helps you see where your money comes from and where it goes, without spreadsheets or subscriptions.')}</p>
        <ul className="guide-features">{features.map(([icon, text]) => <li key={text}><span aria-hidden="true">{icon}</span>{tr(text)}</li>)}</ul>
        <p className="guide-note">{tr('A short tour shows you around the real app. It takes about a minute and you can leave at any time.')}</p>
        <div className="guide-actions"><button type="button" className="secondary" onClick={skip}>{tr('Skip tutorial')}</button><button ref={first} type="button" className="primary" onClick={start}>{tr('Get started')}<ArrowRight size={16}/></button></div>
    </div></div>;
}

export function CompletionScreen({ finish }: { finish: () => void }) {
    const { tr } = useI18n();
    const button = useRef<HTMLButtonElement>(null);
    useEffect(() => { button.current?.focus(); }, []);
    return <div className="guide-backdrop" role="dialog" aria-modal="true" aria-labelledby="guide-done-title"><div className="guide-sheet">
        <span className="guide-badge done"><Check size={22}/></span>
        <h2 id="guide-done-title">{tr('You’re all set!')}</h2>
        <p>{tr('Here’s what you can do now:')}</p>
        <ul className="guide-features">{[['➕', 'Add transactions with the + button'], ['🔎', 'Find anything with search and filters'], ['👆', 'Tap a record to open it, swipe to edit or delete'], ['💼', 'Manage accounts, debts and plans in Finance'], ['📊', 'Open Reports from Settings for totals and exports']].map(([icon, text]) => <li key={text}><span aria-hidden="true">{icon}</span>{tr(text)}</li>)}</ul>
        <p className="guide-note">{tr('You can replay this guide any time from Settings → App guide.')}</p>
        <div className="guide-actions"><button ref={button} type="button" className="primary" onClick={finish}>{tr('Start using the app')}<ArrowRight size={16}/></button></div>
    </div></div>;
}

// The tour itself. `navigate` opens a section of the app; `onStep` saves progress.
export function GuidedTour({ steps, step, setStep, navigate, skip, complete }: { steps: TourStep[]; step: number; setStep: (n: number) => void; navigate: (view: string) => void; skip: () => void; complete: () => void }) {
    const { tr } = useI18n();
    const current = steps[step];
    const [rect, setRect] = useState<DOMRect | null>(null), [held, setHeld] = useState(false);
    const title = useRef<HTMLHeadingElement>(null);
    const next = () => step + 1 >= steps.length ? complete() : setStep(step + 1);
    // Open the step's section, then bring its control into view.
    useEffect(() => {
        if (!current) return;
        if (current.view) navigate(current.view);
        // A section taller than the screen starts just below the docked card instead of under it.
        const t = setTimeout(() => { const el = find(current.target); if (el) { const tall = el.getBoundingClientRect().height > window.innerHeight * 0.55; el.style.scrollMarginTop = tall ? '200px' : ''; el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'smooth' }); } title.current?.focus({ preventScroll: true }); }, 250);
        return () => clearTimeout(t);
    }, [step]);
    // Follow the highlighted control as the page scrolls, resizes or re-renders, and watch for
    // the action that completes the step.
    useEffect(() => {
        let frame = 0, finished = false;
        const tick = () => {
            const el = find(current?.target);
            const r = el?.getBoundingClientRect() || null;
            setRect(old => old && r && old.x === r.x && old.y === r.y && old.width === r.width && old.height === r.height ? old : r);
            setHeld(!!current?.hold?.());
            if (!finished && current?.done?.()) { finished = true; next(); return; }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [step]);
    if (!current) return null;
    const pad = 8, vw = typeof window === 'undefined' ? 1024 : window.innerWidth, vh = typeof window === 'undefined' ? 768 : window.innerHeight;
    const spot: CSSProperties | undefined = rect ? { top: Math.max(4, rect.top - pad), left: Math.max(4, rect.left - pad), width: Math.min(vw - 8, rect.width + pad * 2), height: Math.min(vh - 8, rect.height + pad * 2) } : undefined;
    // The card goes on the side with more room so it never covers what it explains. When the
    // highlight fills the screen (an open form), it docks compactly at the top, away from Save.
    const room = 230, above = rect ? rect.top - pad : 0, under = rect ? vh - rect.bottom - pad : 0;
    const docked = !!rect && above < room && under < room;
    const card: CSSProperties = !rect ? { top: '50%', transform: 'translateY(-50%)' } : docked ? { top: 8 } : under >= above ? { top: rect.bottom + pad + 10 } : { bottom: vh - rect.top + pad + 10 };
    return <div className="guide-layer" aria-live="polite">
        {spot ? <div className="guide-spot" style={spot}/> : <div className="guide-dim"/>}
        <section className={'guide-card' + (rect ? '' : ' centred') + (docked ? ' docked' : '')} style={card} role="dialog" aria-modal="false" aria-labelledby="guide-step-title">
            <div className="guide-card-head"><span className="guide-progress">{tr('Step {0} of {1}', step + 1, steps.length)}</span><button type="button" className="icon-button" aria-label={tr('Skip tutorial')} onClick={skip}><X size={16}/></button></div>
            <div className="guide-bar" aria-hidden="true"><i style={{ width: ((step + 1) / steps.length * 100) + '%' }}/></div>
            <h3 id="guide-step-title" ref={title} tabIndex={-1}>{tr(current.title)}</h3>
            <p>{tr(current.body)}</p>
            {current.hint && <p className="guide-hint">{tr(held ? 'Save or cancel the form to continue.' : current.hint)}</p>}
            <div className="guide-card-actions"><button type="button" className="text-button" onClick={skip}>{tr('Skip tutorial')}</button><span/>
                {step > 0 && <button type="button" className="secondary" disabled={held} onClick={() => setStep(step - 1)}><ArrowLeft size={14}/>{tr('Back')}</button>}
                <button type="button" className="primary" disabled={held} onClick={next}>{tr(step + 1 >= steps.length ? 'Finish' : 'Next')}<ArrowRight size={14}/></button></div>
        </section>
    </div>;
}
