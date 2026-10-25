import {recordColors} from './card-options.ts';
import type {Account} from './finance.ts';
// Record colours used by every chart, legend, list and report, so a category or account looks the
// same everywhere and a colour change shows up on every screen at once. This is separate from the
// app theme. Categories created before colours could be chosen were all saved with the old default
// green; those (and records with no colour) get a stable colour from the record palette instead of
// all looking identical.
export const defaultCategoryColor='#2d634a';
export const incomeColor='#347b65',expenseColor='#c9ae7a',transferColor='#7b8794';
const palette=recordColors as readonly string[];
const hash=(s:string)=>{let h=0;for(const c of s)h=(Math.imul(h,31)+c.codePointAt(0)!)>>>0;return h};
const chosen=(color?:string)=>!!color&&/^#[0-9a-f]{6}$/i.test(color)&&color.toLowerCase()!==defaultCategoryColor;
// Colours for records without a chosen one: each starts at a palette slot picked from its id, and
// moves to the next free slot if a chosen colour or an earlier record (by id) already has it, so no
// two records look alike while the palette lasts. Loading order never changes the result.
function assign<T>(rows:T[],id:(r:T)=>string,color:(r:T)=>string|undefined){
 const out=new Map<string,string>(),taken=new Set<string>();
 for(const r of rows)if(chosen(color(r))){out.set(id(r),color(r)!.toLowerCase());taken.add(color(r)!.toLowerCase())}
 for(const r of [...rows].filter(r=>!chosen(color(r))).sort((a,b)=>id(a).localeCompare(id(b)))){
  let slot=hash(id(r))%palette.length;
  for(let i=0;i<palette.length&&taken.has(palette[slot]);i++)slot=(slot+1)%palette.length;
  taken.add(palette[slot]);if(taken.size>=palette.length)taken.clear();
  out.set(id(r),palette[slot]);
 }
 return out;
}
export type ColorMaps={category:(name:string)=>string;account:(id?:string)=>string;method:(id?:string)=>string};
// Built once per data load; every screen asks these for a record's colour.
export function colorMaps(categories:{id:string;name:string;color?:string}[]=[],accounts:Pick<Account,'id'|'color'>[]=[],methods:{id:string;color?:string}[]=[]):ColorMaps{
 const byCategoryId=assign(categories,c=>c.id,c=>c.color),catNames=new Map(categories.map(c=>[c.name.trim().toLowerCase(),byCategoryId.get(c.id)!]));
 const acc=assign(accounts,a=>a.id,a=>a.color),pm=assign(methods,m=>m.id,m=>m.color);
 return {
  // A category that was renamed or deleted keeps a stable colour from its name on past records.
  category:name=>catNames.get(name.trim().toLowerCase())||palette[hash('category:'+name)%palette.length],
  account:id=>(id&&acc.get(id))||transferColor,
  method:id=>(id&&pm.get(id))||transferColor,
 };
}
// A colour for a new category that none of the existing ones use yet.
export function nextCategoryColor(categories:{color?:string}[]=[]){const used=new Set(categories.map(c=>c.color?.toLowerCase()));return palette.find(c=>!used.has(c))||palette[categories.length%palette.length]}
