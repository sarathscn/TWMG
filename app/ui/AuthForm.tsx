'use client';
import { useI18n, ValidatedForm } from './UIProvider';
import { useState, type FormEvent } from 'react';
import { createClient } from '../../lib/supabase/client';
export function AuthForm() {
    const { tr, text, confirmAction } = useI18n();
    const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setMessage('');
        try {
            const client = createClient();
            if (mode === 'forgot') {
                const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset` });
                if (error)
                    throw error;
                setMessage('Password reset link sent. Check your inbox.');
                return;
            }
            if (mode === 'login' && !email.includes('@')) {
                const result = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: email, password }) });
                const json = await result.json();
                if (!result.ok)
                    throw Error(json.error);
                window.location.assign('/');
                return;
            }
            const { data, error } = mode === 'login' ? await client.auth.signInWithPassword({ email, password }) : await client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/auth/callback' } });
            if (error)
                throw error;
            if (data.session)
                window.location.assign('/');
            else
                setMessage('Check your email to confirm your account, then return here to sign in.');
        }
        catch (e) {
            setMessage((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    return <ValidatedForm className="auth-form" onSubmit={submit}><label>{text(mode === 'login' ? 'Email or username' : 'Email')}<input type={mode === 'login' ? 'text' : 'email'} autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)}/></label>{mode !== 'forgot' && <label>{tr("Password")}<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={e => setPassword(e.target.value)}/></label>}{mode === 'login' && <button type="button" className="text-button auth-forgot" onClick={() => { setMode('forgot'); setMessage(''); }}>{tr("Forgot password?")}</button>}<button className="primary identity-continue" disabled={busy}>{text(busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link')}</button><button type="button" className="identity-signout" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}>{text(mode === 'signup' ? 'Already have an account? Sign in' : mode === 'forgot' ? 'Back to sign in' : 'New here? Create an account')}</button>{text(message && <p className="identity-error" role="status">{text(message, true)}</p>, true)}</ValidatedForm>;
}
