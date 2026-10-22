'use client';
import { useI18n } from './UIProvider';
import { Check } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { recordColors, recordColorNames, recordEmojis } from '../../lib/card-options';
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
    const style: CSSProperties | undefined = record?.color ? { background: record.color, borderColor: record.color, color: '#fff' } : undefined;
    return <span className={className + ' record-icon' + (record?.emoji ? ' has-emoji' : '')} style={style} aria-hidden="true">{record?.emoji || fallback}</span>;
}
// Prefix for option labels in selects, where only text can be shown.
export const emojiLabel = (record: Appearance & { name: string }) => (record.emoji ? record.emoji + ' ' : '') + record.name;
export function AppearancePicker({ color, emoji, onColor, onEmoji }: {
    color?: string;
    emoji?: string;
    onColor: (color: string) => void;
    onEmoji: (emoji: string) => void;
}) {
    const { tr, text } = useI18n();
    return <div className="appearance-picker"><fieldset className="card-color-picker"><legend>{tr("Color")}</legend>{text(recordColors.map(c => <button type="button" key={c} aria-label={tr('Choose ' + recordColorNames[c])} aria-pressed={color === c} style={{ background: c }} onClick={() => onColor(c)}>{text(color === c && <Check size={17}/>)}</button>))}</fieldset><fieldset className="emoji-picker"><legend>{tr("Icon")}</legend>{text(recordEmojis.map(e => <button type="button" key={e || 'default'} aria-label={e ? tr('Choose icon') + ' ' + e : tr('Use default icon')} aria-pressed={(emoji || '') === e} onClick={() => onEmoji(e)}>{e || '·'}</button>))}</fieldset></div>;
}
