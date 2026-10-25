'use client';
import { useEffect, useRef, useState, type CSSProperties, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, X } from 'lucide-react';
import { useI18n } from './UIProvider';
// Distance (px) a swipe must travel before it edits/deletes, the furthest the row slides,
// and how long (ms) a still finger must hold to open the long-press actions.
const TRIGGER = 80, LIMIT = 120, HOLD = 550;
type Props = HTMLAttributes<HTMLElement> & {
    as?: ElementType;
    onEdit?: () => void;
    onDelete?: () => void;
    children: ReactNode;
};
// Gestures on any list row or card: swipe (touch, pen, or mouse drag on desktop) right to edit,
// left to delete, or long-press (touch/pen) for an Edit/Delete sheet. A mouse drag only starts
// away from buttons, links and fields, so clicks behave as before, and vertical movement hands
// control back to page scrolling.
const interactive = 'button,a,input,select,textarea,label,[role=combobox],[role=switch],[contenteditable=true]';
export function Swipeable({ as: Tag = 'div', onEdit, onDelete, children, className = '', style, ...rest }: Props) {
    const { tr } = useI18n();
    const start = useRef<{ x: number; y: number; id: number; locked: boolean } | null>(null);
    const swiped = useRef(false), ended = useRef(0), hold = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [dx, setDx] = useState(0), [menu, setMenu] = useState(false);
    const enabled = !!(onEdit || onDelete);
    useEffect(() => () => clearTimeout(hold.current), []);
    function reset() { clearTimeout(hold.current); start.current = null; setDx(0); }
    function act(action?: () => void) { setMenu(false); action?.(); }
    // Labels travel as inherited CSS strings so table cells can show them too.
    const swipeStyle = { ...style, '--swipe-x': dx + 'px', '--swipe-edit': JSON.stringify(tr('Edit')), '--swipe-delete': JSON.stringify(tr('Delete')) } as CSSProperties;
    return <><Tag {...rest} className={(className + ' swipeable' + (dx ? ' swiping' : '')).trim()} style={swipeStyle} data-swipe={dx > 0 ? 'edit' : dx < 0 ? 'delete' : undefined} data-swipe-ready={Math.abs(dx) >= TRIGGER ? '' : undefined}
        onPointerDown={(e: React.PointerEvent<HTMLElement>) => {
            swiped.current = false;
            if (!enabled) return;
            const mouse = e.pointerType === 'mouse';
            if (mouse && (e.button !== 0 || (e.target as HTMLElement).closest?.(interactive))) return;
            // Rows nest (a group card holds swipeable transactions): the innermost row owns the gesture.
            const native = e.nativeEvent as PointerEvent & { twmgSwipe?: boolean };
            if (native.twmgSwipe) return;
            native.twmgSwipe = true;
            start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: false };
            clearTimeout(hold.current);
            if (!mouse) hold.current = setTimeout(() => { if (start.current && !start.current.locked) { swiped.current = true; start.current = null; navigator.vibrate?.(12); setMenu(true); } }, HOLD);
        }}
        onPointerMove={(e: React.PointerEvent<HTMLElement>) => {
            const s = start.current;
            if (!s || s.id !== e.pointerId) return;
            const x = e.clientX - s.x, y = e.clientY - s.y;
            if (!s.locked) {
                if (Math.abs(x) > 10 || Math.abs(y) > 10) clearTimeout(hold.current);
                if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) { start.current = null; return; }
                if (Math.abs(x) < 12) return;
                s.locked = swiped.current = true;
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
                window.getSelection()?.removeAllRanges();
            }
            if (e.pointerType === 'mouse') e.preventDefault();
            setDx(Math.max(onDelete ? -LIMIT : 0, Math.min(onEdit ? LIMIT : 0, x)));
        }}
        onPointerUp={() => { const d = dx; if (swiped.current) ended.current = Date.now(); reset(); if (d >= TRIGGER) onEdit?.(); else if (d <= -TRIGGER) onDelete?.(); }}
        onPointerCancel={reset}
        onContextMenu={(e: React.MouseEvent) => { if (enabled && (menu || swiped.current)) e.preventDefault(); }}
        // Only the click that ends a swipe or long-press is swallowed; later clicks (or Enter) work as usual.
        onClickCapture={(e: React.MouseEvent) => { if (swiped.current && Date.now() - ended.current < 600) { e.preventDefault(); e.stopPropagation(); } swiped.current = false; }}>
        {children}
    </Tag>
    {menu && typeof document !== 'undefined' && createPortal(<div className="action-sheet-backdrop" onClick={() => setMenu(false)}><div className="action-sheet" role="menu" aria-label={tr('Actions')} onClick={e => e.stopPropagation()}>
        {onEdit && <button type="button" role="menuitem" onClick={() => act(onEdit)}><Pencil size={17}/>{tr('Edit')}</button>}
        {onDelete && <button type="button" role="menuitem" className="danger-action" onClick={() => act(onDelete)}><Trash2 size={17}/>{tr('Delete')}</button>}
        <button type="button" className="cancel-action" onClick={() => setMenu(false)} autoFocus><X size={17}/>{tr('Cancel')}</button>
    </div></div>, document.body)}</>;
}
