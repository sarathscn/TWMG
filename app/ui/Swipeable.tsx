'use client';
import { useRef, useState, type CSSProperties, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import { useI18n } from './UIProvider';
// Distance (px) a swipe must travel before it edits/deletes, and the furthest the row slides.
const TRIGGER = 80, LIMIT = 120;
type Props = HTMLAttributes<HTMLElement> & {
    as?: ElementType;
    onEdit?: () => void;
    onDelete?: () => void;
    children: ReactNode;
};
// Touch/pen swipe on any list row or card: swipe right to edit, left to delete.
// Mouse input is ignored so desktop clicks and text selection behave as before,
// and vertical movement hands control back to normal page scrolling.
export function Swipeable({ as: Tag = 'div', onEdit, onDelete, children, className = '', style, ...rest }: Props) {
    const { tr } = useI18n();
    const start = useRef<{ x: number; y: number; id: number; locked: boolean } | null>(null);
    const swiped = useRef(false);
    const [dx, setDx] = useState(0);
    const enabled = !!(onEdit || onDelete);
    function reset() { start.current = null; setDx(0); }
    // Labels travel as inherited CSS strings so table cells can show them too.
    const swipeStyle = { ...style, '--swipe-x': dx + 'px', '--swipe-edit': JSON.stringify(tr('Edit')), '--swipe-delete': JSON.stringify(tr('Delete')) } as CSSProperties;
    return <Tag {...rest} className={(className + ' swipeable' + (dx ? ' swiping' : '')).trim()} style={swipeStyle} data-swipe={dx > 0 ? 'edit' : dx < 0 ? 'delete' : undefined} data-swipe-ready={Math.abs(dx) >= TRIGGER ? '' : undefined}
        onPointerDown={(e: React.PointerEvent<HTMLElement>) => { swiped.current = false; if (enabled && e.pointerType !== 'mouse') start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: false }; }}
        onPointerMove={(e: React.PointerEvent<HTMLElement>) => {
            const s = start.current;
            if (!s || s.id !== e.pointerId) return;
            const x = e.clientX - s.x, y = e.clientY - s.y;
            if (!s.locked) {
                if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) { start.current = null; return; }
                if (Math.abs(x) < 12) return;
                s.locked = swiped.current = true;
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
            }
            setDx(Math.max(onDelete ? -LIMIT : 0, Math.min(onEdit ? LIMIT : 0, x)));
        }}
        onPointerUp={() => { const d = dx; reset(); if (d >= TRIGGER) onEdit?.(); else if (d <= -TRIGGER) onDelete?.(); }}
        onPointerCancel={reset}
        onClickCapture={(e: React.MouseEvent) => { if (swiped.current) { e.preventDefault(); e.stopPropagation(); swiped.current = false; } }}>
        {children}
    </Tag>;
}
