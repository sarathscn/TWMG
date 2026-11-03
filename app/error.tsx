'use client';
import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { callNative } from './ui/DeviceSecurity';
import { useI18n } from './ui/UIProvider';
// Shown when a screen fails to render, instead of a blank page. Saved data isn't affected.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const { tr } = useI18n();
    useEffect(() => { console.error('Screen failed to render', error.digest || error.name); callNative('startupReady', 'error'); }, [error]);
    return <main className="app-error" role="alert"><h1>{tr('Something went wrong on this screen')}</h1><p>{tr('Your saved data is safe. Try again, or reload the app if this keeps happening.')}</p><div><button type="button" className="primary" onClick={reset}><RefreshCw size={15}/>{tr('Try again')}</button><button type="button" className="secondary" onClick={() => window.location.assign('/')}>{tr('Reload the app')}</button></div></main>;
}
