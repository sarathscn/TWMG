import en from './messages/en.json' with {type:'json'};
import hi from './messages/hi.json' with {type:'json'};
import ar from './messages/ar.json' with {type:'json'};
import ml from './messages/ml.json' with {type:'json'};
import de from './messages/de.json' with {type:'json'};
export type Locale='en'|'hi'|'ar'|'ml'|'de';
export const catalogs:Record<Locale,Record<string,string>>={en,hi,ar,ml,de};
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns=Object.keys(en).filter(key=>/\{\d+\}/.test(key)).sort((a,b)=>b.replace(/\{\d+\}/g,'').length-a.replace(/\{\d+\}/g,'').length).map(key=>{
 const indices:number[]=[];let source='',offset=0;
 for(const match of key.matchAll(/\{(\d+)\}/g)){source+=escape(key.slice(offset,match.index))+'(.+?)';indices.push(Number(match[1]));offset=match.index!+match[0].length}
 return {key,indices,regex:new RegExp('^'+source+escape(key.slice(offset))+'$')};
});
export function translate(locale:string,key:string,...values:unknown[]):string{
 if(!key||typeof key!=='string')return key;
 const language=catalogs[locale as Locale]||catalogs.en;
 const trimmed=key.trim(),prefix=key.slice(0,key.indexOf(trimmed)),suffix=key.slice(key.indexOf(trimmed)+trimmed.length);
 let translated=language[trimmed];
 if(translated===undefined){for(const pattern of patterns){const match=pattern.regex.exec(trimmed);if(match){const args:string[]=[];pattern.indices.forEach((index,i)=>args[index]=match[i+1]);translated=(language[pattern.key]||pattern.key).replace(/\{(\d+)\}/g,(_,n)=>args[Number(n)]||'');break}}}
 if(translated===undefined)return key; // User-entered names, descriptions and international codes stay intact.
 return prefix+translated.replace(/\{(\d+)\}/g,(_,n)=>String(values[Number(n)]??'{'+n+'}'))+suffix;
}
export function translateMessage(locale:string,message:string){
 const translated=translate(locale,message);
 if(locale==='en'||translated!==message||!/[A-Za-z]/.test(message))return translated;
 return translate(locale,'Check the highlighted fields and try again.');
}
