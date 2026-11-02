// When the bottom navigation hides: scrolling down hides it, scrolling up brings it back. It always
// shows on pages too short to need the space, near the top, and at the end of a page (rubber-band
// overscroll is ignored, so bouncing at either end never flips it).
export type NavScroll={lastY:number;travel:number;hidden:boolean};
export const navStart=(y=0):NavScroll=>({lastY:y,travel:0,hidden:false});
const hideAfter=16,showAfter=8,topZone=24,endZone=4,shortPage=120;
export function nextNavScroll(prev:NavScroll,scrollTop:number,scrollable:number):NavScroll{
 const max=Math.max(0,scrollable),y=Math.min(max,Math.max(0,scrollTop));
 if(max<shortPage||y<=topZone||y>=max-endZone)return {lastY:y,travel:0,hidden:false};
 const delta=y-prev.lastY;
 if(!delta)return prev;
 // Direction changed: start measuring again, so small finger jitter doesn't toggle the bar.
 const travel=Math.sign(delta)===Math.sign(prev.travel)?prev.travel+delta:delta;
 const hidden=travel>=hideAfter?true:travel<=-showAfter?false:prev.hidden;
 return {lastY:y,travel,hidden};
}
