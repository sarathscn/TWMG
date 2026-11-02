import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {navStart,nextNavScroll} from '../lib/nav-scroll.ts';
const run=(ys:number[],max=2000,from=navStart(200))=>ys.reduce((s,y)=>nextNavScroll(s,y,max),from);
test('The bottom bar hides scrolling down and returns scrolling up',()=>{
 assert.equal(run([230]).hidden,true);
 assert.equal(run([230,226]).hidden,true,'a small wobble back is ignored');
 assert.equal(run([230,220]).hidden,false);
 assert.equal(run([205]).hidden,false,'a small move down is ignored');
});
test('It stays visible on short pages and at both ends, and ignores overscroll',()=>{
 assert.equal(nextNavScroll(navStart(40),100,110).hidden,false,'page too short to need the room');
 assert.equal(run([230,20]).hidden,false,'near the top');
 assert.equal(run([230,1998]).hidden,false,'at the end of the page');
 assert.equal(run([230,2300]).hidden,false,'bouncing past the end');
 const bounce=run([230,-40]);assert.equal(bounce.hidden,false);assert.equal(bounce.lastY,0,'bouncing above the top');
 assert.equal(nextNavScroll({lastY:500,travel:40,hidden:true},500,2000).hidden,true,'no movement changes nothing');
});
test('Reduced motion, keyboard focus and the app guide all keep the bar available',()=>{
 const hook=readFileSync('app/ui/useBottomNavScroll.ts','utf8'),css=readFileSync('app/globals.css','utf8');
 assert.match(hook,/calm\.matches \? navStart\(target\.scrollTop\)/,'reduced motion never hides it');
 assert.match(css,/html\.nav-hidden:not\(:has\(\.guide-layer\)\) \.bottom-nav:not\(:focus-within\)\{/);
 assert.match(css,/prefers-reduced-motion:reduce\)\{\*,\*:before,\*:after\{animation:none!important;transition:none!important\}/);
 assert.match(css,/prefers-reduced-transparency:reduce\),\(prefers-contrast:more\)/,'solid surfaces on request');
 for(const f of ['app/ui/Onboarding.tsx','app/ui/RecordAppearance.tsx'])assert.ok(!/behavior: 'smooth'/.test(readFileSync(f,'utf8').replace(/\? 'auto' : 'smooth'/g,'')),f+' respects reduced motion');
});
test('Colour tiles are a labelled radio group, and no text is under 10px',()=>{
 const ui=readFileSync('app/ui/RecordAppearance.tsx','utf8'),css=readFileSync('app/globals.css','utf8');
 assert.match(ui,/role="radiogroup"/);
 assert.match(ui,/role="radio"[^>]*aria-checked=\{current === c\}[^>]*tabIndex=\{c === tabStop \? 0 : -1\}[^>]*aria-label=\{colorName\(c\)\}/);
 assert.match(ui,/ArrowRight: rtl \? -1 : 1/,'arrow keys follow reading direction');
 assert.match(css,/\.color-tile\[aria-checked=true\] \.color-chip/);
 const sizes=[...css.matchAll(/font-size:([\d.]+)px/g)].map(m=>Number(m[1]));
 assert.ok(sizes.every(n=>n>=10),'smallest font '+Math.min(...sizes));
 assert.match(css,/--muted:#5f6b5d/,'muted text reaches 4.5:1 on light surfaces');
});
