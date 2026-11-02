'use client';
import { useEffect } from 'react';
import { navStart, nextNavScroll } from '../../lib/nav-scroll';
// Marks the page while the bottom navigation should step aside (see .nav-hidden in globals.css).
// A class on the root instead of React state, so scrolling never re-renders the charts and lists.
// People who ask for reduced motion keep the bar in place. Each page has its own scroller, so the
// bar comes back whenever `page` changes.
export function useBottomNavScroll(page: string) {
    useEffect(() => { document.documentElement.classList.remove('nav-hidden'); }, [page]);
    useEffect(() => {
        const root = document.documentElement, calm = matchMedia('(prefers-reduced-motion: reduce)');
        let state = navStart(), scroller: HTMLElement | null = null, frame = 0;
        const onScroll = (e: Event) => {
            const target = e.target;
            if (!(target instanceof HTMLElement) || !target.matches('.main-shell>main') || frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                if (target !== scroller) { scroller = target; state = navStart(target.scrollTop); }
                state = calm.matches ? navStart(target.scrollTop) : nextNavScroll(state, target.scrollTop, target.scrollHeight - target.clientHeight);
                root.classList.toggle('nav-hidden', state.hidden);
            });
        };
        const onCalm = () => { if (calm.matches) root.classList.remove('nav-hidden'); };
        document.addEventListener('scroll', onScroll, { capture: true, passive: true });
        calm.addEventListener('change', onCalm);
        return () => { cancelAnimationFrame(frame); document.removeEventListener('scroll', onScroll, { capture: true }); calm.removeEventListener('change', onCalm); root.classList.remove('nav-hidden'); };
    }, []);
}
