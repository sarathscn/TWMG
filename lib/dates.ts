// How dates read on screen: DD/MM/YYYY everywhere. Records keep ISO YYYY-MM-DD, which is what every
// calculation, sort and filter uses; these helpers are only ever for display.
export function displayDate(iso?:string|null){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso||'');return m?`${m[3]}/${m[2]}/${m[1]}`:(iso||'')}
const pad=(n:number)=>String(n).padStart(2,'0');
// A moment such as a change-history entry, in the phone's or browser's own time.
export function displayMoment(value:string|number|Date){const d=new Date(value);if(Number.isNaN(d.getTime()))return '';return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`}
export const localTime=(now=new Date())=>`${pad(now.getHours())}:${pad(now.getMinutes())}`;
