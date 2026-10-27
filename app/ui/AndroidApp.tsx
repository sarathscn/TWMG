'use client';
import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw, CheckCircle2, AlertTriangle, LoaderCircle } from 'lucide-react';
import { useI18n } from './UIProvider';
import { callNative } from './DeviceSecurity';
import { readAppVersion, updateStatus, type AppVersion } from '../../lib/version';
import type { SyncOp } from '../../lib/offline-sync';
// Android-app-only UI: the offline sync indicator and the About page version check. Rendered only
// when the native bridge is present, so the website never shows either.
export type SyncState = { state: 'idle' | 'syncing' | 'offline' | 'failed' | 'auth'; pending: number; failed: number; lastSync?: number; error?: string };

export function SyncIndicator({ status, online, ops, retry, discard }: { status: SyncState; online: boolean; ops: SyncOp[]; retry: (op: SyncOp, keepMine: boolean) => void; discard: (op: SyncOp) => void }) {
    const { tr, text } = useI18n();
    const [open, setOpen] = useState(false);
    const failed = ops.filter(o => o.state === 'failed'), pending = ops.length - failed.length;
    const mode = failed.length ? 'failed' : status.state === 'auth' ? 'auth' : !online ? 'offline' : status.state === 'syncing' && pending ? 'syncing' : pending ? 'pending' : 'synced';
    const label = { failed: tr('Sync failed'), auth: tr('Sign in to sync'), offline: pending ? tr('Offline · {0} waiting', pending) : tr('Offline'), syncing: tr('Syncing…'), pending: tr('{0} waiting to sync', pending), synced: tr('Synced') }[mode];
    const Icon = mode === 'failed' || mode === 'auth' ? AlertTriangle : mode === 'offline' ? CloudOff : mode === 'syncing' ? LoaderCircle : mode === 'pending' ? RefreshCw : CheckCircle2;
    return <><button type="button" className={'sync-pill ' + mode} aria-label={label} title={label} onClick={() => { setOpen(true); callNative('syncNow'); }}><Icon size={14} className={mode === 'syncing' ? 'spin' : ''}/><span>{label}</span></button>
        {open && <><div className="notifications-backdrop" onClick={() => setOpen(false)}/><div className="popover notifications notification-center sync-center" role="dialog" aria-modal="true" aria-label={tr('Sync status')}><span className="sheet-handle" aria-hidden="true"/>
            <div className="notifications-head"><b>{tr('Sync status')}</b><span className="notifications-head-actions"><button type="button" className="text-button" onClick={() => setOpen(false)}>{tr('Done')}</button></span></div>
            <p className="notifications-tip">{text(mode === 'synced' ? tr('Everything on this device is saved online.') : mode === 'offline' ? tr('You are offline. Changes are kept on this device and upload automatically when you reconnect.') : mode === 'auth' ? tr('Your session ended. Sign in again and your waiting changes will upload.') : mode === 'failed' ? tr('The server could not save a change. Nothing was lost: retry it, or discard it to keep the online version.') : tr('Changes are saved on this device and uploading in the background.'))}{status.lastSync ? ' ' + tr('Last synced {0}.', new Date(status.lastSync).toLocaleString()) : ''}</p>
            <div className="notification-list">{ops.map(op => <div key={op.opId} className={'notification-item sync-op' + (op.state === 'failed' ? ' overdue' : '')}><span><b>{text(tr(op.action === 'delete' ? 'Delete {0}' : 'Save {0}', String(op.value?.name || op.kind)))}</b><small>{text(op.state === 'failed' ? (op.error || tr('Sync failed')) : tr('Waiting to sync'))}</small></span>{op.state === 'failed' && <span className="sync-op-actions"><button type="button" className="secondary" onClick={() => retry(op, false)}>{tr('Retry')}</button>{op.conflict && <button type="button" className="secondary" onClick={() => retry(op, true)}>{tr('Keep mine')}</button>}<button type="button" className="text-danger" onClick={() => discard(op)}>{tr('Discard')}</button></span>}</div>)}</div>
            {!ops.length && <p className="notifications-empty">{tr('No changes waiting.')}</p>}
        </div></>}</>;
}

const cacheKey = 'twmg-latest-android';
// About page (Android app only): the installed version from the package, compared with the latest
// release published by the website (/api/app-version). Works offline with the last known release.
export function AndroidVersionPanel() {
    const { tr } = useI18n();
    const [installed] = useState<AppVersion | null>(() => readAppVersion(safeJson(callNative('appVersion'))));
    const [latest, setLatest] = useState<AppVersion | null>(() => { try { return readAppVersion(JSON.parse(localStorage.getItem(cacheKey) || 'null')); } catch { return null; } });
    const [checking, setChecking] = useState(true), [offline, setOffline] = useState(false);
    useEffect(() => {
        let live = true;
        fetch('/api/app-version', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject()).then(x => { const v = readAppVersion(x?.android); if (live && v) { setLatest(v); try { localStorage.setItem(cacheKey, JSON.stringify(v)); } catch { /* keep in memory */ } } }).catch(() => { if (live) setOffline(true); }).finally(() => { if (live) setChecking(false); });
        return () => { live = false; };
    }, []);
    const status = updateStatus(installed, latest);
    const statusText = { 'update-available': tr('Update available'), 'up-to-date': tr('Up to date'), 'newer-than-latest': tr('Newer than the latest release'), unknown: checking ? tr('Checking…') : tr('Could not check for updates') }[status];
    const v = (x: AppVersion | null) => x ? x.versionName + (x.versionCode ? ' (' + tr('build {0}', x.versionCode) + ')' : '') : '—';
    return <section className="panel settings-panel android-version"><h3>{tr('Android app')}</h3><dl>
        <div><dt>{tr('Installed version')}</dt><dd>{v(installed)}</dd></div>
        <div><dt>{tr('Latest available version')}</dt><dd>{v(latest)}{offline && latest ? ' · ' + tr('last known') : ''}</dd></div>
        <div><dt>{tr('Status')}</dt><dd className={'version-status ' + status}>{statusText}</dd></div>
    </dl>{status === 'update-available' && <p className="form-help">{tr('Install the latest TWMG app to get the newest fixes and features.')}</p>}</section>;
}
function safeJson(v: unknown) { try { return typeof v === 'string' ? JSON.parse(v) : null; } catch { return null; } }
