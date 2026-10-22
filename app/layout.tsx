import type { Metadata } from 'next';
import './globals.css';
import {UIProvider} from './ui/UIProvider';
export const metadata: Metadata = {title:'TWMG — The Way Money Goes | പണം പോകുന്ന വഴി',description:'A little clarity. A lot more freedom. Your personal finance companion.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><UIProvider>{children}</UIProvider></body></html>}
