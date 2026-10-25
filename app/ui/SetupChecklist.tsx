'use client';
import { useEffect, useState } from 'react';
import { Check, ChevronRight, Sparkles, X } from 'lucide-react';
import { useI18n } from './UIProvider';
import { cashLikeTypes, type Data } from '../../lib/finance';
export type SetupStep = 'account' | 'cash' | 'payments' | 'categories' | 'budget' | 'transaction';
// Per-profile, per-device memory of which review pages were opened and whether the card was dismissed.
// Losing it (private mode, cleared storage) only shows the suggestions again.
const key = (profile: string) => 'twmg-setup-' + profile;
function read(profile: string): Record<string, boolean> { try { return JSON.parse(localStorage.getItem(key(profile)) || '{}'); } catch { return {}; } }
function write(profile: string, value: Record<string, boolean>) { try { localStorage.setItem(key(profile), JSON.stringify(value)); } catch { /* storage unavailable */ } }
// First-run suggestions for a new profile. Steps tick off from real data where possible.
export function SetupChecklist({ profile, data, onStep }: {
    profile: string;
    data: Data;
    onStep: (step: SetupStep) => void;
}) {
    const { tr, text } = useI18n();
    const [seen, setSeen] = useState<Record<string, boolean>>({});
    useEffect(() => { setSeen(read(profile)); }, [profile]);
    const steps: { id: SetupStep; title: string; hint: string; done: boolean }[] = [
        { id: 'account', title: 'Add your first account', hint: 'A bank account, card or savings where money lives.', done: data.accounts.some(a => !cashLikeTypes.includes(a.type)) },
        { id: 'cash', title: 'Add a cash wallet', hint: 'Track the cash in your pocket. It can never go below zero.', done: data.accounts.some(a => cashLikeTypes.includes(a.type)) },
        { id: 'payments', title: 'Review payment methods', hint: 'Turn on the UPI apps, cards and wallets you actually use.', done: !!seen.payments || (data.paymentMethods || []).some(m => m.custom) },
        { id: 'categories', title: 'Review categories', hint: 'Rename, recolor or add the categories you spend on.', done: !!seen.categories || (data.categories || []).length > 10 },
        { id: 'budget', title: 'Set a monthly budget', hint: 'Pick a category and a limit to stay on track.', done: data.budgets.length > 0 },
        { id: 'transaction', title: 'Record a transaction', hint: 'Add today’s spending or your latest income.', done: data.transactions.length > 0 },
    ];
    const done = steps.filter(s => s.done).length;
    if (seen.dismissed || done === steps.length) return null;
    function go(step: SetupStep) {
        if (step === 'payments' || step === 'categories') { const next = { ...seen, [step]: true }; setSeen(next); write(profile, next); }
        onStep(step);
    }
    function dismiss() { const next = { ...seen, dismissed: true }; setSeen(next); write(profile, next); }
    return <section className="panel setup-checklist" aria-labelledby="setup-title"><div className="panel-head"><div><h3 id="setup-title"><Sparkles size={16}/>{tr("Get set up")}</h3><p>{text(`${done}/${steps.length}`)} · {tr("A few essentials to make TWMG yours.")}</p></div><button className="icon-button" aria-label={tr("Hide setup suggestions")} onClick={dismiss}><X size={17}/></button></div><div className="setup-progress"><i style={{ width: done / steps.length * 100 + '%' }}/></div>
        <ol>{steps.map(s => <li key={s.id} className={s.done ? 'done' : ''}><span className="setup-check" aria-hidden="true">{s.done ? <Check size={13}/> : null}</span><span><b>{tr(s.title)}</b><small>{tr(s.hint)}</small></span>{!s.done && <button type="button" className="secondary" onClick={() => go(s.id)}>{tr("Start")}<ChevronRight size={14}/></button>}</li>)}</ol>
    </section>;
}
