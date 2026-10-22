'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, LoaderCircle, ShieldCheck, TrendingUp } from 'lucide-react';
import { useI18n, ValidatedForm } from './UIProvider';
import { createClient } from '../../lib/supabase/client';

export function PasswordResetScreen() {
    const { tr, text } = useI18n();
    const [ready, setReady] = useState(false), [session, setSession] = useState(false), [busy, setBusy] = useState(false), [complete, setComplete] = useState(false), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [error, setError] = useState('');
    useEffect(() => {
        const client = createClient();
        let active = true;
        const check = async () => {
            const result = await client.auth.getSession();
            if (!active)
                return;
            setSession(!!result.data.session && !result.error);
            setReady(true);
        };
        check();
        const { data } = client.auth.onAuthStateChange((_event, current) => {
            if (active && current) {
                setSession(true);
                setReady(true);
            }
        });
        return () => { active = false; data.subscription.unsubscribe(); };
    }, []);
    async function submit(event: FormEvent) {
        event.preventDefault();
        setError('');
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }
        setBusy(true);
        try {
            const client = createClient();
            const result = await client.auth.updateUser({ password });
            if (result.error)
                throw result.error;
            await fetch('/logout', { method: 'POST' });
            await client.auth.signOut();
            setComplete(true);
        }
        catch (caught) {
            setError((caught as Error).message || 'Could not update your password.');
        }
        finally {
            setBusy(false);
        }
    }
    return <div className="identity-screen recovery-screen"><div className="identity-story"><a className="identity-brand" href="/login"><span className="brand-mark"><TrendingUp size={28}/></span><strong>TWMG<span>.</span></strong></a><div className="identity-story-content"><span className="eyebrow">THE WAY MONEY GOES</span><h1><span>{tr("Your money.")}</span><span>{tr("Your world.")}</span><em>{tr("A little clearer.")}</em></h1><p>{tr("A secure way back into your account.")}</p></div><p className="identity-malayalam">പണം പോകുന്ന വഴി</p></div><div className="identity-main"><div className="identity-top"><span>TWMG — The Way Money Goes</span><ShieldCheck size={18}/></div><div className="identity-card"><span className="eyebrow">{tr("ACCOUNT RECOVERY")}</span><h2>{complete ? tr("Password updated") : tr("Reset your password")}</h2>{complete ? <><p>{tr("Your password has been updated. Sign in with your new password.")}</p><a className="primary identity-continue" href="/login">{tr("Back to sign in")}<ArrowRight size={17}/></a></> : !ready ? <div className="identity-loading"><LoaderCircle className="spin" size={25}/><p>{tr("Checking your reset link…")}</p></div> : !session ? <div className="identity-error" role="alert"><p>{tr("This reset link is invalid or has expired.")}</p><a className="text-button" href="/login">{tr("Request a new link")}</a></div> : <ValidatedForm className="auth-form" onSubmit={submit}><p>{tr("Choose a new password with at least 8 characters.")}</p><label>{tr("New password")}<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)}/></label><label>{tr("Confirm new password")}<input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)}/></label>{text(error && <p className="identity-error" role="alert">{text(error, true)}</p>, true)}<button className="primary identity-continue" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : tr("Update password")}<ArrowRight size={17}/></button></ValidatedForm>}<a className="identity-signout" href="/login">{tr("Back to sign in")}</a></div><footer><span>{tr("Made for a life well spent.")}</span><span>പണം പോകുന്ന വഴി</span></footer></div></div>;
}
