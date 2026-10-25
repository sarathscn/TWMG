'use client';
import { useEffect, useState } from 'react';
import { BellRing, Fingerprint, KeyRound, Plus, Trash2 } from 'lucide-react';
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
    scheduleReminders(json: string): void;
};
export const androidBridge = () => (typeof window !== 'undefined' ? (window as unknown as { TWMGAndroid?: Partial<AndroidBridge> }).TWMGAndroid : undefined);
const hasDeviceFeatures = () => typeof androidBridge()?.appLockAvailable === 'function';
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
        {keys.length ? <ul className="passkey-list">{keys.map(k => <li key={k.id}><span><b>{k.friendly_name || tr('Passkey')}</b><small>{tr("Added ")}{text(new Date(k.created_at).toLocaleDateString())}{k.last_used_at ? ' · ' + tr('Last used ') + new Date(k.last_used_at).toLocaleDateString() : ''}</small></span><button type="button" className="icon-button" aria-label={tr("Delete passkey")} disabled={busy} onClick={() => remove(k)}><Trash2 size={16}/></button></li>)}</ul> : <p className="muted">{tr("No passkeys yet.")}</p>}
        <button type="button" className="secondary" disabled={busy} onClick={add}><Plus size={16}/>{tr("Add a passkey")}</button>{text(message && <p className="form-help" role="status">{text(message, true)}</p>, true)}</section>;
}
// Android-only settings: biometric app lock and local bill reminders.
export function DeviceSettings() {
    const { tr } = useI18n();
    const [ready, setReady] = useState(false), [lockAvailable, setLockAvailable] = useState(false), [lock, setLock] = useState(false), [reminders, setReminders] = useState(false);
    useEffect(() => {
        const b = androidBridge();
        if (!hasDeviceFeatures() || !b) return;
        setReady(true); setLockAvailable(!!b.appLockAvailable?.()); setLock(!!b.appLockEnabled?.()); setReminders(!!b.remindersEnabled?.());
        // Native confirms changes after the biometric prompt or permission dialog.
        const onNative = (e: Event) => { const d = (e as CustomEvent).detail || {}; if (d.type === 'appLock') setLock(!!d.enabled); if (d.type === 'reminders') setReminders(!!d.enabled); };
        window.addEventListener('twmg-native', onNative);
        return () => window.removeEventListener('twmg-native', onNative);
    }, []);
    if (!ready) return null;
    return <section className="panel settings-panel device-panel"><h3>{tr("This device")}</h3>
        <label className="device-toggle"><span><Fingerprint size={18}/><span><b>{tr("App lock")}</b><small>{tr(lockAvailable ? 'Unlock TWMG with your fingerprint, face or screen lock.' : 'Set up a fingerprint, face or screen lock on this phone to use App lock.')}</small></span></span><input type="checkbox" role="switch" checked={lock} disabled={!lockAvailable} onChange={e => androidBridge()?.setAppLockEnabled?.(e.target.checked)}/></label>
        <label className="device-toggle"><span><BellRing size={18}/><span><b>{tr("Bill reminders")}</b><small>{tr("Notifications for recurring bills, card payments and debts that are due.")}</small></span></span><input type="checkbox" role="switch" checked={reminders} onChange={e => androidBridge()?.setRemindersEnabled?.(e.target.checked)}/></label>
    </section>;
}
