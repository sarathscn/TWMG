'use client';
import { useI18n } from './UIProvider';
import { Check, Palette, Pipette, Search, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
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
// How far an arrow key moves within a radio group of tiles, following the reading direction.
function radioStep(e: React.KeyboardEvent) {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    return ({ ArrowDown: 1, ArrowUp: -1, ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 } as Record<string, number>)[e.key];
}
// A small colour mark for lists and dropdowns, in one shape everywhere.
export const ColorDot = ({ color }: { color: string }) => <i className="color-dot" style={{ background: color }} aria-hidden="true"/>;
// The sheet both pickers open in, drawn by the app so it follows the theme. Keeps keyboard focus
// inside, starts on the [data-autofocus] element and hands focus back to the opener on closing.
function PickerSheet({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
    const { tr } = useI18n();
    const titleId = useId(), dialog = useRef<HTMLDivElement>(null);
    const opener = useRef(typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null);
    useEffect(() => { const back = opener.current; dialog.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }); return () => back?.focus({ preventScroll: true }); }, []);
    function keys(e: React.KeyboardEvent) {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key !== 'Tab' || !dialog.current) return;
        const stops = [...dialog.current.querySelectorAll<HTMLElement>('button,input,[role=slider]')].filter(x => x.tabIndex >= 0 && !x.hasAttribute('disabled'));
        const first = stops[0], last = stops[stops.length - 1];
        if (e.shiftKey ? document.activeElement === first : document.activeElement === last) { e.preventDefault(); (e.shiftKey ? last : first)?.focus(); }
    }
    if (typeof document === 'undefined') return null;
    return createPortal(<div className="emoji-sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
        <div ref={dialog} className="emoji-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={keys}>
            <div className="emoji-sheet-head"><h3 id={titleId}>{title}</h3><button type="button" className="icon-button" aria-label={tr('Close')} onClick={close}><X size={19}/></button></div>
            {children}
        </div></div>, document.body);
}
// Themed colour field used everywhere: a compact button showing the current colour, plus a way
// back to the default. The default is no colour unless the form has its own (defaultColor).
export function ColorPicker({ value, onChange, legend, presets = recordColors, defaultColor = '' }: {
    value?: string;
    onChange: (color: string) => void;
    legend: string;
    presets?: readonly string[];
    defaultColor?: string;
}) {
    const { tr, text } = useI18n();
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const current = value && hexColor.test(value) ? value.toLowerCase() : '';
    const name = !current ? tr('Default') : recordColorNames[current] ? tr(recordColorNames[current]) : current;
    return <fieldset className="color-picker color-field"><legend>{text(legend)}<span className="color-current"> · {name}</span></legend>
        <div className="color-field-row">
            <button type="button" ref={trigger} className="color-field-button" aria-haspopup="dialog" aria-expanded={open} aria-label={tr('Change color') + ' · ' + name} onClick={() => setOpen(true)}><span className="color-field-swatch" style={current ? { background: current } : undefined} aria-hidden="true">{!current && <Palette size={17}/>}</span><span>{tr('Change color')}</span></button>
            {current !== defaultColor && <button type="button" className="text-button" onClick={() => { onChange(defaultColor); trigger.current?.focus(); }}>{tr('Use default color')}</button>}
        </div>
        {open && <ColorSheet current={current} presets={presets} isDefault={current === defaultColor} onChange={onChange} reset={() => onChange(defaultColor)} close={() => setOpen(false)}/>}
    </fieldset>;
}
// The colour chooser: a grid of named colour tiles plus a full custom picker (colour area, hue
// slider, hex code). The tiles are a radio group: Tab reaches the chosen colour and the arrow keys
// move between them, while a click or Enter picks and closes. Custom colours apply as they change.
// Selection shows a tick and a ring, not only the colour.
function ColorSheet({ current, presets, isDefault, onChange, reset, close }: {
    current: string;
    presets: readonly string[];
    isDefault: boolean;
    onChange: (color: string) => void;
    reset: () => void;
    close: () => void;
}) {
    const { tr } = useI18n();
    const custom = !!current && !presets.includes(current);
    const [open, setOpen] = useState(custom);
    const [hsv, setHsv] = useState(() => hexToHsv(current || presets[0]));
    const [draft, setDraft] = useState(current || presets[0]);
    const area = useRef<HTMLDivElement>(null), tiles = useRef<HTMLDivElement>(null);
    const colorName = (c: string) => recordColorNames[c] ? tr(recordColorNames[c]) : c;
    function choose(c: string) { onChange(c); setHsv(hexToHsv(c)); setDraft(c); }
    function moveWithKeys(e: React.KeyboardEvent, index: number) {
        const step = radioStep(e);
        if (!step) return;
        e.preventDefault();
        const next = (index + step + presets.length) % presets.length;
        choose(presets[next]);
        tiles.current?.querySelectorAll<HTMLElement>('[role=radio]')[next]?.focus();
    }
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
    const tabStop = presets.includes(current) ? current : presets[0];
    return <PickerSheet title={tr('Change color')} close={close}>
        <div className="emoji-sheet-body color-sheet-body">
            <div className="color-tiles" ref={tiles}>
                <div role="radiogroup" aria-label={tr('Change color')} className="color-group">{presets.map((c, i) => <button type="button" role="radio" key={c} className="color-tile" aria-checked={current === c} tabIndex={c === tabStop ? 0 : -1} aria-label={colorName(c)} data-autofocus={c === tabStop && !custom ? true : undefined} onClick={() => { choose(c); close(); }} onKeyDown={e => moveWithKeys(e, i)}><span className="color-chip" style={{ background: c, color: readableOn(c) }}>{current === c && <Check size={18} strokeWidth={3}/>}</span><span className="color-name" aria-hidden="true">{colorName(c)}</span></button>)}</div>
                <button type="button" className={'color-tile custom-tile' + (custom ? ' is-custom' : '')} aria-label={tr('Custom color')} aria-expanded={open} aria-pressed={custom} data-autofocus={custom ? true : undefined} onClick={() => setOpen(!open)}><span className="color-chip" style={custom ? { background: current, color: readableOn(current) } : undefined}>{custom ? <Check size={18} strokeWidth={3}/> : <Pipette size={16}/>}</span><span className="color-name" aria-hidden="true">{tr('Custom')}</span></button>
            </div>
            {open && <div className="color-custom">
                <div ref={area} className="color-area" role="slider" tabIndex={0} aria-label={tr('Saturation and brightness')} aria-valuetext={draft} style={{ background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,${hsvToHex(hsv.h, 1, 1)})` }} onKeyDown={nudge} onPointerDown={e => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already released */ } pick(e); }} onPointerMove={e => { if (e.buttons) pick(e); }}><span className="color-thumb" style={{ left: hsv.s * 100 + '%', top: (1 - hsv.v) * 100 + '%', background: draft }}/></div>
                <label className="color-hue">{tr("Hue")}<input type="range" min={0} max={359} value={Math.round(hsv.h)} onChange={e => apply({ ...hsv, h: Number(e.target.value), s: hsv.s || 1, v: hsv.v || 1 })}/></label>
                <div className="color-hex"><span className="color-preview" style={{ background: draft }}/><label>{tr("Hex color")}<input value={draft} maxLength={7} spellCheck={false} onChange={e => { const v = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value; setDraft(v); if (hexColor.test(v)) { setHsv(hexToHsv(v)); onChange(v.toLowerCase()); } }} aria-invalid={!hexColor.test(draft)}/></label></div>
            </div>}
        </div>
        <div className="emoji-sheet-foot color-sheet-foot">{!isDefault && <button type="button" className="secondary" onClick={() => { reset(); close(); }}>{tr('Use default color')}</button>}<button type="button" className="primary" onClick={close}>{tr('Done')}</button></div>
    </PickerSheet>;
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
    const body = useRef<HTMLDivElement>(null);
    const q = query.trim().toLowerCase();
    const groups = emojiCatalog.map(c => ({ category: c.category, emojis: q ? c.emojis.filter(([e, words]) => words.includes(q) || e === q || tr(c.category).toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) : c.emojis })).filter(g => g.emojis.length);
    const jump = (category: string) => body.current?.querySelector<HTMLElement>('[data-category="' + category + '"]')?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return <PickerSheet title={tr('Choose icon')} close={close}>
        <label className="emoji-search"><Search size={16}/><input data-autofocus type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={tr('Search icons')} aria-label={tr('Search icons')} maxLength={40}/></label>
        {!q && <div className="emoji-tabs" role="toolbar" aria-label={tr('Icon categories')}>{emojiCatalog.map(c => <button type="button" key={c.category} onClick={() => jump(c.category)}>{c.emojis[0][0]} {tr(c.category)}</button>)}</div>}
        <div className="emoji-sheet-body" ref={body}>{groups.map(g => <section key={g.category} data-category={g.category}><h4>{tr(g.category)}</h4><div className="emoji-grid">{g.emojis.map(([e, words]) => <button type="button" key={e} title={words} aria-label={tr('Choose icon') + ' ' + e} aria-pressed={selected === e} onClick={() => choose(e)}>{e}</button>)}</div></section>)}{!groups.length && <p className="emoji-empty">{tr('No icons match your search.')}</p>}</div>
        <div className="emoji-sheet-foot"><button type="button" className="secondary" onClick={() => choose('')}>{tr('Use default icon')}</button></div>
    </PickerSheet>;
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
