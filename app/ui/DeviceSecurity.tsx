'use client';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { BellRing, Fingerprint, KeyRound, Plus} from 'lucide-react';
import { useI18n } from './UIProvider';
import { createClient } from '../../lib/supabase/client';
import { passkeysAvailable, passkeyMessage } from '../../lib/passkeys';
type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };
// Native features exposed by the TWMG Android app (MainActivity.NativeBridge). Absent in browsers.
type AndroidBridge = {
    appLockAvailable(): boolean;
    appLockEnabled(): boolean;
    setAppLockEnabled(enabled: boolean): void;
    remindersEnabled(): boolean;
    setRemindersEnabled(enabled: boolean): void;
    syncReminders(lang: string): void;
    // Offline change queue (SyncQueue.kt) and installed version.
    queueAdd(op: string): boolean;
    queueList(user: string): string;
    queueDiscard(opId: string): void;
    queueRetry(opId: string, keepMine: boolean): void;
    syncNow(): void;
    syncStatus(): string;
    setSyncUser(user: string): void;
    clearLocal(user: string): void;
    hasSession(): boolean;
    appVersion(): string;
};
// True only inside the TWMG Android app build that has the offline queue.
export const isAndroidApp = () => typeof bridge()?.queueAdd === 'function';
const bridge = () => (typeof window !== 'undefined' ? (window as unknown as { TWMGAndroid?: Partial<AndroidBridge> }).TWMGAndroid : undefined);
// Calls a native method without ever letting a native failure break the page: a Java exception
// surfaces in WebView as a thrown JS error, which would otherwise take down the whole screen.
export function callNative<K extends keyof AndroidBridge>(name: K, ...args: Parameters<AndroidBridge[K]>): ReturnType<AndroidBridge[K]> | undefined {
    const b = bridge(), fn = b?.[name] as ((...a: unknown[]) => unknown) | undefined;
    if (typeof fn !== 'function') return undefined;
    try { return fn.apply(b, args) as ReturnType<AndroidBridge[K]>; } catch { return undefined; }
}
const hasDeviceFeatures = () => typeof bridge()?.appLockAvailable === 'function';
// Keeps an optional panel's failure inside the panel instead of replacing the whole page.
export class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? null : this.props.children; }
}
// Passkey sign-in for this account. Supabase Auth stores only the public-key credential.
export function PasskeyManager() {
    const { tr, text, confirmAction } = useI18n();
    const [enabled, setEnabled] = useState(false), [keys, setKeys] = useState<Passkey[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    async function refresh() { const { data, error } = await createClient().auth.passkey.list(); if (!error) setKeys((data || []) as Passkey[]); }
    useEffect(() => { passkeysAvailable().then(on => { setEnabled(on); if (on) refresh(); }); }, []);
    if (!enabled) return null;
    async function add() {
        setBusy(true); setMessage('');
        try { const { error } = await createClient().auth.registerPasskey(); if (error) throw error; setMessage('Passkey added. You can now sign in with it.'); await refresh(); }
        catch (e) { setMessage(passkeyMessage(e)); }
        finally { setBusy(false); }
    }
    async function remove(key: Passkey) {
        if (!await confirmAction('Delete this passkey? You can still sign in with your password.')) return;
        setBusy(true);
        const { error } = await createClient().auth.passkey.delete({ passkeyId: key.id });
        setMessage(error ? error.message : 'Passkey removed.');
        await refresh(); setBusy(false);
    }
    return <section className="panel settings-panel passkeys-panel"><h3><KeyRound size={17}/>{tr("Passkeys")}</h3><p>{tr("Sign in with your fingerprint, face or screen lock instead of a password. Your biometrics never leave your device.")}</p>
        {keys.length ? <ul className="passkey-list">{keys.map(k => <li key={k.id}><span><b>{k.friendly_name || tr('Passkey')}</b><small>{tr("Added ")}{text(new Date(k.created_at).toLocaleDateString())}{k.last_used_at ? ' · ' + tr('Last used ') + new Date(k.last_used_at).toLocaleDateString() : ''}</small></span><button type="button" className="secondary text-danger" disabled={busy} onClick={() => remove(k)}>{tr("Remove")}</button></li>)}</ul> : <p className="muted">{tr("No passkeys yet.")}</p>}
        <button type="button" className="secondary" disabled={busy} onClick={add}><Plus size={16}/>{tr("Add a passkey")}</button>{text(message && <p className="form-help" role="status">{text(message, true)}</p>, true)}</section>;
}
// Android-only settings: biometric app lock and local bill reminders.
export function DeviceSettings() {
    const { tr } = useI18n();
    const [ready, setReady] = useState(false), [lockAvailable, setLockAvailable] = useState(false), [lock, setLock] = useState(false), [reminders, setReminders] = useState(false);
    useEffect(() => {
        if (!hasDeviceFeatures()) return;
        setReady(true); setLockAvailable(!!callNative('appLockAvailable')); setLock(!!callNative('appLockEnabled')); setReminders(!!callNative('remindersEnabled'));
        // Native confirms changes after the biometric prompt or permission dialog.
        const onNative = (e: Event) => { const d = (e as CustomEvent).detail || {}; if (d.type === 'appLock') setLock(!!d.enabled); if (d.type === 'reminders') setReminders(!!d.enabled); };
        window.addEventListener('twmg-native', onNative);
        return () => window.removeEventListener('twmg-native', onNative);
    }, []);
    if (!ready) return null;
    return <section className="panel settings-panel device-panel"><h3>{tr("This device")}</h3>
        <label className="device-toggle"><span><Fingerprint size={18}/><span><b>{tr("App lock")}</b><small>{tr(lockAvailable ? 'Unlock TWMG with your fingerprint, face or screen lock.' : 'Set up a fingerprint, face or screen lock on this phone to use App lock.')}</small></span></span><input type="checkbox" role="switch" checked={lock} disabled={!lockAvailable} onChange={e => callNative('setAppLockEnabled', e.target.checked)}/></label>
        <label className="device-toggle"><span><BellRing size={18}/><span><b>{tr("Bill reminders")}</b><small>{tr("Card bills, recurring payments, debts and goals: a reminder 7 days before, then follow-ups until it's paid.")}</small></span></span><input type="checkbox" role="switch" checked={reminders} onChange={e => callNative('setRemindersEnabled', e.target.checked)}/></label>
    </section>;
}
