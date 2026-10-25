'use client';
import {createContext,useContext,useEffect,useId,useRef,useState,type ReactNode,type FormHTMLAttributes} from 'react';
import {AlertDialog} from 'radix-ui';
import {languages} from '../../lib/i18n';
import {translate,translateMessage,type Locale} from '../../lib/localization';
type Context={locale:Locale;setLocale:(locale:string)=>void;tr:(key:string,...values:unknown[])=>string;text:(value:ReactNode,message?:boolean)=>ReactNode;confirmAction:(message:string,confirmLabel?:string)=>Promise<boolean>};
const Context=createContext<Context|null>(null);
export function UIProvider({children}:{children:ReactNode}){
 const [locale,setLanguage]=useState<Locale>('en'),[confirmation,setConfirmation]=useState<{message:string;confirmLabel?:string;resolve:(result:boolean)=>void}|null>(null);
 const pending=useRef(confirmation);pending.current=confirmation;
 function setLocale(value:string){if(value in languages){setLanguage(value as Locale);localStorage.setItem('twmg-lang',value);document.documentElement.lang=value;document.documentElement.dir=value==='ar'?'rtl':'ltr'}}
 // While the on-screen keyboard is up (a text field has focus on a touch screen), mark the page so
 // fixed bars like the bottom navigation step aside instead of riding up above the keyboard.
 useEffect(()=>{
  const root=document.documentElement,touch=matchMedia('(pointer:coarse)');
  const typing=(el:Element|null)=>el instanceof HTMLElement&&(el.isContentEditable||el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement||(el instanceof HTMLInputElement&&!['checkbox','radio','range','button','submit','reset','file','color'].includes(el.type)));
  const sync=()=>root.classList.toggle('keyboard-open',touch.matches&&typing(document.activeElement));
  const later=()=>setTimeout(sync,60);
  document.addEventListener('focusin',sync);document.addEventListener('focusout',later);
  return()=>{document.removeEventListener('focusin',sync);document.removeEventListener('focusout',later);root.classList.remove('keyboard-open')};
 },[]);
 useEffect(()=>{setLocale(localStorage.getItem('twmg-lang')||'en');document.documentElement.dataset.theme=localStorage.getItem('twmg-theme')||'light';return()=>pending.current?.resolve(false)},[]);
 useEffect(()=>{
  const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&!!target.closest('input,textarea,select,[contenteditable="true"]');
  const guard=(event:Event)=>{
   if(event.type==='keydown'){
    const key=(event as KeyboardEvent).key.toLowerCase(),keyboard=event as KeyboardEvent;
    if(key==='f12'||(keyboard.ctrlKey||keyboard.metaKey)&&keyboard.shiftKey&&['i','j','c'].includes(key)||(keyboard.ctrlKey||keyboard.metaKey)&&['u','s'].includes(key))event.preventDefault();
    return;
   }
   if(editable(event.target))return;
   if(event.type==='copy'||event.type==='cut'||event.type==='contextmenu'||event.type==='selectstart'||event.type==='dragstart')event.preventDefault();
  };
  document.addEventListener('copy',guard);document.addEventListener('cut',guard);document.addEventListener('contextmenu',guard);document.addEventListener('selectstart',guard);document.addEventListener('dragstart',guard);document.addEventListener('keydown',guard);
  return()=>{document.removeEventListener('copy',guard);document.removeEventListener('cut',guard);document.removeEventListener('contextmenu',guard);document.removeEventListener('selectstart',guard);document.removeEventListener('dragstart',guard);document.removeEventListener('keydown',guard)};
 },[]);
 useEffect(()=>{if(!confirmation)return;const main=document.querySelector<HTMLElement>('.main-shell main'),overflow=main?.style.overflow;if(main)main.style.overflow='hidden';return()=>{if(main)main.style.overflow=overflow||''}},[confirmation]);
 const tr=(key:string,...values:unknown[])=>translate(locale,key,...values);
 function text(value:ReactNode,message=false):ReactNode{if(typeof value==='string')return message?translateMessage(locale,value):tr(value);if(typeof value==='number')return new Intl.NumberFormat(languages[locale].locale).format(value);if(Array.isArray(value))return value.map(v=>text(v,message));return value}
 function confirmAction(message:string,confirmLabel='Delete'){return new Promise<boolean>(resolve=>setConfirmation(current=>{current?.resolve(false);return {message,confirmLabel,resolve}}))}
 function finish(value:boolean){confirmation?.resolve(value);setConfirmation(null)}
 return <Context.Provider value={{locale,setLocale,tr,text,confirmAction}}>{children}<AlertDialog.Root open={!!confirmation} onOpenChange={open=>{if(!open)finish(false)}}><AlertDialog.Portal><AlertDialog.Overlay className="confirm-overlay"/><AlertDialog.Content className="confirm-dialog" onEscapeKeyDown={event=>event.stopPropagation()}><AlertDialog.Title>{tr('Please confirm')}</AlertDialog.Title><AlertDialog.Description>{confirmation&&tr(confirmation.message)}</AlertDialog.Description><div className="confirm-actions"><AlertDialog.Cancel className="secondary" onClick={()=>finish(false)}>{tr('Cancel')}</AlertDialog.Cancel><AlertDialog.Action className="primary destructive" onClick={()=>finish(true)}>{tr(confirmation?.confirmLabel||'Delete')}</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root></Context.Provider>;
}
export function useI18n(){const value=useContext(Context);if(!value)throw Error('UIProvider is required');return value}
export function ValidatedForm({children,onSubmit,...props}:FormHTMLAttributes<HTMLFormElement>){
 const {tr}=useI18n(),[error,setError]=useState(''),id=useId();
 function show(target:HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement){
  const validity=target.validity;
  const message=validity.valueMissing||!target.value.trim()?tr('This field is required.'):validity.typeMismatch?tr('Enter a valid email address.'):validity.tooShort?tr('Use at least {0} characters.',(target as HTMLInputElement).minLength):validity.rangeUnderflow?tr('Enter {0} or more.',(target as HTMLInputElement).min):validity.rangeOverflow?tr('Enter {0} or less.',(target as HTMLInputElement).max):validity.stepMismatch?tr('Use the currency’s allowed decimal places.'):validity.patternMismatch?tr((target as HTMLInputElement).maxLength===4?'Enter exactly four digits.':(target as HTMLInputElement).pattern.includes('.')?'Use 3–30 lowercase letters, numbers, dots or underscores.':'Use 3–30 lowercase letters, numbers or underscores.'):tr('Enter a valid value.');
  const label=target.labels?.[0]?.textContent?.split('\n')[0]?.trim();
  setError(label?`${label}: ${message}`:message);target.setAttribute('aria-invalid','true');target.setAttribute('aria-describedby',id);
  const visible=target.matches('.control-validation,[aria-hidden="true"]')||target.tabIndex===-1?target.closest('label, .date-field')?.querySelector<HTMLElement>('button'):target;
  visible?.setAttribute('aria-invalid','true');visible?.setAttribute('aria-describedby',id);visible?.focus();
 }
 return <form {...props} onInvalidCapture={event=>{event.preventDefault();show(event.target as HTMLInputElement)}} onInputCapture={event=>{const target=event.target as HTMLElement;target.removeAttribute('aria-invalid');target.removeAttribute('aria-describedby');setError('')}} onSubmit={event=>{const blank=Array.from(event.currentTarget.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input[required]:not([type=checkbox]):not([type=radio]),textarea[required]')).find(input=>!input.value.trim());if(blank){event.preventDefault();show(blank);return}setError('');onSubmit?.(event)}}>{error&&<div id={id} className="field-error" role="alert">{error}</div>}{children}</form>;
}
