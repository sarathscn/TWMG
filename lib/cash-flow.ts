import {totals,type Transaction} from './finance';
export type FlowPeriod='Day'|'Week'|'Month'|'Year';
export type FlowPoint={name:string;label:string;income:number;expense:number};
// All dates here are plain YYYY-MM-DD strings, worked out in UTC so no time zone can shift a day.
const parse=(date:string)=>new Date(date+'T00:00:00Z');
const iso=(date:Date)=>date.toISOString().slice(0,10);
const shift=(date:string,days:number)=>{const d=parse(date);d.setUTCDate(d.getUTCDate()+days);return iso(d)};
const monthEnd=(month:string)=>iso(new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)));
export const localDate=(now=new Date())=>iso(new Date(now.getTime()-now.getTimezoneOffset()*60000));
// The day Day and Week views are about: the one picked on the calendar, else today, else the end of the month being viewed.
export function focusDate(month:string,today:string,picked=''){
 if(picked.startsWith(month))return picked;
 return today.startsWith(month)?today:monthEnd(month);
}
// Day is the focus day, Week the 7 days ending on it, Month and Year the whole calendar period.
export function periodRange(period:string,month:string,today:string,picked=''){
 const focus=focusDate(month,today,picked);
 if(period==='Day')return{start:focus,end:focus};
 if(period==='Week')return{start:shift(focus,-6),end:focus};
 if(period==='Year')return{start:month.slice(0,4)+'-01-01',end:month.slice(0,4)+'-12-31'};
 return{start:month+'-01',end:monthEnd(month)};
}
// The chart's points follow the range itself, so a From/To range draws as correctly as a tab: a point per day up to two months, then a point per month.
export function flowPoints(rows:Transaction[],start:string,end:string,locale:string,scale=1):FlowPoint[]{
 if(start>end)return[];
 const fmt=(date:string,options:Intl.DateTimeFormatOptions)=>parse(date).toLocaleDateString(locale,{timeZone:'UTC',...options});
 const days=Math.round((parse(end).getTime()-parse(start).getTime())/864e5)+1;
 const keys:string[]=[];
 if(days<=62)for(let i=0;i<days;i++)keys.push(shift(start,i));
 else for(let y=Number(start.slice(0,4)),m=Number(start.slice(5,7));`${y}-${String(m).padStart(2,'0')}`<=end.slice(0,7);m===12?(y++,m=1):m++)keys.push(`${y}-${String(m).padStart(2,'0')}`);
 const manyYears=start.slice(0,4)!==end.slice(0,4);
 return keys.map(key=>{
  const s=totals(rows.filter(t=>t.date>=start&&t.date<=end&&t.date.startsWith(key)));
  const name=key.length===7?fmt(key+'-01',manyYears?{month:'short',year:'2-digit'}:{month:'short'}):days===1?fmt(key,{day:'numeric',month:'short'}):days<=7?fmt(key,{weekday:'short',day:'numeric'}):fmt(key,{day:'numeric'});
  const label=key.length===7?fmt(key+'-01',{month:'long',year:'numeric'}):fmt(key,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  return{name,label,income:s.income/scale,expense:s.expense/scale};
 });
}
// The dates a total covers, in the reader's language: "3 Nov 2026" or "28 Oct – 3 Nov 2026".
export const rangeLabel=(start:string,end:string,locale:string)=>new Intl.DateTimeFormat(locale,{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).formatRange(parse(start),parse(end));
