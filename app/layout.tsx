import type { Metadata, Viewport } from 'next';
import './globals.css';
import {UIProvider} from './ui/UIProvider';
import {devAndroidStub} from './dev-android-stub';
export const metadata: Metadata = {title:'TWMG — The Way Money Goes | പണം പോകുന്ന വഴി',description:'A little clarity. A lot more freedom. Your personal finance companion.',icons:{icon:'/favicon.svg'}};
// The keyboard resizes the page so focused fields stay visible; pinch-zoom stays available.
export const viewport: Viewport = {width:'device-width',initialScale:1,interactiveWidget:'resizes-content'};
// Applies the saved theme and text size before the first paint, so a dark-mode reader never sees a white flash.
const appearanceBoot="try{var d=document.documentElement,t=localStorage.getItem('twmg-theme'),s=localStorage.getItem('twmg-text-size');if(t)d.dataset.theme=t;if(s)d.dataset.textSize=s}catch(e){}";
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body><script dangerouslySetInnerHTML={{__html:appearanceBoot}}/>{process.env.NODE_ENV==='development'&&<script dangerouslySetInnerHTML={{__html:devAndroidStub}}/>}<UIProvider>{children}</UIProvider></body></html>}
