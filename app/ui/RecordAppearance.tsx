'use client';
import { useI18n } from './UIProvider';
import { Check, Pipette } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { hexColor, readableOn, recordColors, recordColorNames, recordEmojis } from '../../lib/card-options';
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
export function IconPicker({ emoji, onEmoji, legend, defaultLabel = '·' }: {
    emoji?: string;
    onEmoji: (emoji: string) => void;
    legend: string;
    defaultLabel?: string;
}) {
    const { tr, text } = useI18n();
    return <fieldset className="emoji-picker"><legend>{text(legend)}</legend>{text(recordEmojis.map(e => <button type="button" key={e || 'default'} aria-label={e ? tr('Choose icon') + ' ' + e : tr('Use default icon')} aria-pressed={(emoji || '') === e} onClick={() => onEmoji(e)}>{e || defaultLabel}</button>))}</fieldset>;
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
