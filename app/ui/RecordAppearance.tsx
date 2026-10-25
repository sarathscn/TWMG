'use client';
import { useI18n } from './UIProvider';
import { Check, Pipette, Search, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { hexColor, readableOn, recordColors, recordColorNames, emojiCatalog } from '../../lib/card-options';
export type Appearance = {
    color?: string;
    emoji?: string;
};
// The icon every list, card and ledger uses for a record: its chosen emoji, or the
// default icon, on its chosen color. Records without a color keep the neutral style.
export function RecordIcon({ record, fallback, className = 'tx-icon' }: {
    record?: Appearance;
    fallback: ReactNode;
    className?: string;
}) {
    const style: CSSProperties | undefined = record?.color ? { background: record.color, borderColor: record.color, color: readableOn(record.color) } : undefined;
    return <span className={className + ' record-icon' + (record?.emoji ? ' has-emoji' : '')} style={style} aria-hidden="true">{record?.emoji || fallback}</span>;
}
// Prefix for option labels in selects, where only text can be shown.
export const emojiLabel = (record: Appearance & { name: string }) => (record.emoji ? record.emoji + ' ' : '') + record.name;
// Colour maths for the custom picker (hue 0–360, saturation/value 0–1).
function hexToHsv(hex: string) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s: max ? d / max : 0, v: max };
}
function hsvToHex(h: number, s: number, v: number) {
    const f = (k: number) => { const x = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(x, 4 - x, 1)); };
    return '#' + [f(5), f(3), f(1)].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}
// Themed colour chooser used everywhere: preset swatches plus a full custom picker
// (colour area, hue slider, hex code). Drawn by the app, so it follows light/dark mode.
export function ColorPicker({ value, onChange, legend, presets = recordColors }: {
    value?: string;
    onChange: (color: string) => void;
    legend: string;
    presets?: readonly string[];
}) {
    const { tr, text } = useI18n();
    const current = value && hexColor.test(value) ? value.toLowerCase() : '';
    const custom = !!current && !presets.includes(current);
    const [open, setOpen] = useState(false);
    const [hsv, setHsv] = useState(() => hexToHsv(current || presets[0]));
    const [draft, setDraft] = useState(current || presets[0]);
    const area = useRef<HTMLDivElement>(null);
    useEffect(() => { if (current && current !== hsvToHex(hsv.h, hsv.s, hsv.v)) { setHsv(hexToHsv(current)); setDraft(current); } }, [current]);
    function apply(next: { h: number; s: number; v: number }) { setHsv(next); const hex = hsvToHex(next.h, next.s, next.v); setDraft(hex); onChange(hex); }
    function pick(e: ReactPointerEvent<HTMLDivElement>) {
        const box = area.current?.getBoundingClientRect();
        if (!box) return;
        apply({ h: hsv.h, s: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), v: Math.min(1, Math.max(0, 1 - (e.clientY - box.top) / box.height)) });
    }
    function nudge(e: React.KeyboardEvent) {
        const step = e.shiftKey ? 0.1 : 0.02, k = e.key;
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) return;
        e.preventDefault();
        apply({ h: hsv.h, s: Math.min(1, Math.max(0, hsv.s + (k === 'ArrowRight' ? step : k === 'ArrowLeft' ? -step : 0))), v: Math.min(1, Math.max(0, hsv.v + (k === 'ArrowUp' ? step : k === 'ArrowDown' ? -step : 0))) });
    }
    return <fieldset className="card-color-picker color-picker"><legend>{text(legend)}</legend>
        {text(presets.map(c => <button type="button" key={c} aria-label={tr('Choose ' + (recordColorNames[c] || c))} aria-pressed={current === c} style={{ background: c, color: readableOn(c) }} onClick={() => { onChange(c); setHsv(hexToHsv(c)); setDraft(c); }}>{text(current === c && <Check size={17}/>)}</button>))}
        <button type="button" className={'custom-swatch' + (custom ? ' is-custom' : '')} aria-label={tr('Custom color')} aria-expanded={open} aria-pressed={custom} style={custom ? { background: current, color: readableOn(current) } : undefined} onClick={() => setOpen(!open)}>{custom ? <Check size={17}/> : <Pipette size={15}/>}</button>
        {open && <div className="color-custom">
            <div ref={area} className="color-area" role="slider" tabIndex={0} aria-label={tr('Saturation and brightness')} aria-valuetext={draft} style={{ background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,${hsvToHex(hsv.h, 1, 1)})` }} onKeyDown={nudge} onPointerDown={e => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already released */ } pick(e); }} onPointerMove={e => { if (e.buttons) pick(e); }}><span className="color-thumb" style={{ left: hsv.s * 100 + '%', top: (1 - hsv.v) * 100 + '%', background: draft }}/></div>
            <label className="color-hue">{tr("Hue")}<input type="range" min={0} max={359} value={Math.round(hsv.h)} onChange={e => apply({ ...hsv, h: Number(e.target.value), s: hsv.s || 1, v: hsv.v || 1 })}/></label>
            <div className="color-hex"><span className="color-preview" style={{ background: draft }}/><label>{tr("Hex color")}<input value={draft} maxLength={7} spellCheck={false} onChange={e => { const v = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value; setDraft(v); if (hexColor.test(v)) { setHsv(hexToHsv(v)); onChange(v.toLowerCase()); } }} aria-invalid={!hexColor.test(draft)}/></label></div>
        </div>}
    </fieldset>;
}
// The record icon field: shows only the chosen emoji, and opens a bottom sheet with a
// searchable, categorised emoji collection. Drawn by the app, so it follows the theme.
export function IconPicker({ emoji, onEmoji, legend, defaultLabel = '·' }: {
    emoji?: string;
    onEmoji: (emoji: string) => void;
    legend: string;
    defaultLabel?: string;
}) {
    const { tr, text } = useI18n();
    const [open, setOpen] = useState(false);
    return <div className="emoji-field"><span className="emoji-field-label">{text(legend)}</span><div className="emoji-field-row">
        <button type="button" className="emoji-field-button" aria-haspopup="dialog" aria-expanded={open} aria-label={emoji ? tr('Change icon') + ' ' + emoji : tr('Choose icon')} onClick={() => setOpen(true)}><span className="emoji-current" aria-hidden="true">{emoji || defaultLabel}</span><span>{tr(emoji ? 'Change icon' : 'Choose icon')}</span></button>
        {emoji && <button type="button" className="text-button" onClick={() => onEmoji('')}>{tr('Use default icon')}</button>}
    </div>{open && <EmojiSheet selected={emoji || ''} close={() => setOpen(false)} choose={e => { onEmoji(e); setOpen(false); }}/>}</div>;
}
function EmojiSheet({ selected, close, choose }: { selected: string; close: () => void; choose: (emoji: string) => void }) {
    const { tr } = useI18n();
    const [query, setQuery] = useState('');
    const search = useRef<HTMLInputElement>(null), body = useRef<HTMLDivElement>(null);
    useEffect(() => { const previous = document.activeElement as HTMLElement | null; search.current?.focus({ preventScroll: true }); return () => previous?.focus({ preventScroll: true }); }, []);
    const q = query.trim().toLowerCase();
    const groups = emojiCatalog.map(c => ({ category: c.category, emojis: q ? c.emojis.filter(([e, words]) => words.includes(q) || e === q || tr(c.category).toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) : c.emojis })).filter(g => g.emojis.length);
    const jump = (category: string) => body.current?.querySelector<HTMLElement>('[data-category="' + category + '"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (typeof document === 'undefined') return null;
    return createPortal(<div className="emoji-sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
        <div className="emoji-sheet" role="dialog" aria-modal="true" aria-labelledby="emoji-sheet-title" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }}>
            <div className="emoji-sheet-head"><h3 id="emoji-sheet-title">{tr('Choose icon')}</h3><button type="button" className="icon-button" aria-label={tr('Close')} onClick={close}><X size={19}/></button></div>
            <label className="emoji-search"><Search size={16}/><input ref={search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={tr('Search icons')} aria-label={tr('Search icons')} maxLength={40}/></label>
            {!q && <div className="emoji-tabs" role="toolbar" aria-label={tr('Icon categories')}>{emojiCatalog.map(c => <button type="button" key={c.category} onClick={() => jump(c.category)}>{c.emojis[0][0]} {tr(c.category)}</button>)}</div>}
            <div className="emoji-sheet-body" ref={body}>{groups.map(g => <section key={g.category} data-category={g.category}><h4>{tr(g.category)}</h4><div className="emoji-grid">{g.emojis.map(([e, words]) => <button type="button" key={e} title={words} aria-label={tr('Choose icon') + ' ' + e} aria-pressed={selected === e} onClick={() => choose(e)}>{e}</button>)}</div></section>)}{!groups.length && <p className="emoji-empty">{tr('No icons match your search.')}</p>}</div>
            <div className="emoji-sheet-foot"><button type="button" className="secondary" onClick={() => choose('')}>{tr('Use default icon')}</button></div>
        </div></div>, document.body);
}
export function AppearancePicker({ color, emoji, onColor, onEmoji }: {
    color?: string;
    emoji?: string;
    onColor: (color: string) => void;
    onEmoji: (emoji: string) => void;
}) {
    const { tr } = useI18n();
    return <div className="appearance-picker"><ColorPicker value={color} onChange={onColor} legend={tr("Color")}/><IconPicker emoji={emoji} onEmoji={onEmoji} legend={tr("Icon")}/></div>;
}
