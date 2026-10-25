'use client';
import { useI18n, ValidatedForm } from './UIProvider';
import { useState, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, Check, Wallet, Tags } from 'lucide-react';
import { defaultMethods, type Category, type PaymentMethod } from '../../lib/preferences';
import { countries } from '../../lib/countries';
import { ThemedSelect } from './Controls';
import { AppearancePicker, RecordIcon } from './RecordAppearance';
import { Swipeable } from './Swipeable';
import { nextCategoryColor } from '../../lib/colors';
type Save = (kind: string, value: any, action?: string) => Promise<boolean>;
export function CatalogManager({ kind, rows, country, busy, error, save, colorOf }: {
    kind: 'categories' | 'paymentMethods';
    // The colour every chart and list shows for a row, so the editor starts from what you see.
    colorOf?: (row: Category | PaymentMethod) => string;
    rows: (Category | PaymentMethod)[];
    country: string;
    busy: boolean;
    error: string;
    save: Save;
}) {
    const { tr, text, confirmAction } = useI18n();
    const [editing, setEditing] = useState<Category | PaymentMethod | null>(null), [name, setName] = useState(''), [selectedCountry, setSelectedCountry] = useState(country), [filterCountry, setFilterCountry] = useState(country), [color, setColor] = useState(kind === 'paymentMethods' ? '' : nextCategoryColor(rows)), [emoji, setEmoji] = useState(''), [enabled, setEnabled] = useState(true), [formError, setFormError] = useState('');
    const payments = kind === 'paymentMethods';
    function edit(row?: Category | PaymentMethod) { setEditing(row || null); setName(row?.name || ''); setColor(payments ? row?.color || '' : row ? (colorOf?.(row) || row.color || nextCategoryColor(rows)) : nextCategoryColor(rows)); setEmoji(row?.emoji || ''); setSelectedCountry((row as PaymentMethod)?.country || country); setEnabled((row as PaymentMethod)?.enabled ?? true); setFormError(''); }
    // Delete always asks first, whether from the button or a swipe.
    async function remove(row: Category | PaymentMethod) {
        if (await confirmAction('Delete ' + row.name + '? Past transactions keep their details.')) {
            if (await save(kind, row, 'delete') && editing?.id === row.id)
                edit();
        }
    }
    async function submit(e: FormEvent) {
        e.preventDefault();
        setFormError('');
        if (!name.trim()) {
            setFormError('Enter a name.');
            return;
        }
        const value = { id: editing?.id, name: name.trim(), emoji: emoji || undefined, ...(payments ? { country: selectedCountry, enabled, color: color || undefined } : { color: color || nextCategoryColor(rows) }) };
        if (await save(kind, value)) {
            edit();
        }
    }
    return <div className="catalog-layout"><section className="panel catalog-editor"><h3>{text(editing ? 'Edit' : 'Create')} {text(payments ? 'payment method' : 'category')}</h3><ValidatedForm onSubmit={submit}><label>{tr("Name")}<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={tr(payments ? 'e.g. My wallet' : 'e.g. Education')}/></label>{text(payments ? <><label>{tr("Country")}<ThemedSelect required value={selectedCountry} onChange={e => setSelectedCountry(e.target.value)}>{text(countries.map(c => <option key={c}>{c}</option>))}</ThemedSelect></label><label className="checkbox"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/>{tr("Enabled for new transactions")}</label></> : null)}<AppearancePicker color={color} emoji={emoji} onColor={setColor} onEmoji={setEmoji}/>{text((error || formError) && <p className="field-error" role="alert">{text(formError || error, true)}</p>, true)}<div className="catalog-actions"><button className="primary" disabled={busy}><Check size={16}/>{text(editing ? 'Save changes' : 'Create')}</button>{text(editing && <button type="button" className="secondary" onClick={() => edit()}>{tr("Cancel edit")}</button>)}</div></ValidatedForm><p className="form-help">{text(payments ? 'Payment methods describe how you paid. Choose the account that actually holds the money; wallet methods do not create extra expenses. Custom methods are supported for every country.' : 'Renaming or deleting a category keeps the labels and amounts on past records intact. The updated list is used for new entries.')}</p></section><section className="panel catalog-list"><div className="panel-head"><h3>{text(payments ? 'Your payment methods' : 'Your categories')} <span className="count">{text(rows.length)}</span></h3>{text(payments && <ThemedSelect aria-label={tr("Filter country")} value={filterCountry} onChange={e => setFilterCountry(e.target.value)}>{text(countries.map(c => <option key={c}>{c}</option>))}</ThemedSelect>)}</div>{payments && <button className="secondary suggested-methods" disabled={busy} onClick={async () => {
                for (const preset of defaultMethods(filterCountry)) {
                    if (!rows.some(row => (row as PaymentMethod).country === filterCountry && row.name.toLowerCase() === preset.name.toLowerCase())) {
                        if (!await save(kind, { name: preset.name, country: filterCountry, enabled: true }))
                            break;
                    }
                }
            }}>{tr("Add suggested methods for ")}{text(filterCountry)}</button>}{rows.filter(row => !payments || (row as PaymentMethod).country === filterCountry).sort((a, b) => a.name.localeCompare(b.name)).map(row => <Swipeable className="catalog-row" key={row.id} onEdit={() => edit(row)} onDelete={busy ? undefined : () => remove(row)}><RecordIcon record={colorOf ? { ...row, color: colorOf(row) } : row} fallback={payments ? <Wallet size={18}/> : <Tags size={18}/>}/><div><b>{row.name}</b>{text(payments && <small>{text((row as PaymentMethod).country)} · {text((row as PaymentMethod).custom ? 'Custom' : 'Suggested')} · {text((row as PaymentMethod).enabled ? 'Enabled' : 'Disabled')}</small>)}{text(payments && (row as PaymentMethod).source && <a className="text-button" href={(row as PaymentMethod).source} target="_blank" rel="noreferrer">{tr("Provider information \u2197")}</a>)}</div>{payments && <button className="secondary method-toggle" disabled={busy} aria-label={tr(((row as PaymentMethod).enabled ? 'Disable ' : 'Enable ') + row.name)} onClick={() => save(kind, { ...row, enabled: !(row as PaymentMethod).enabled })}>{text((row as PaymentMethod).enabled ? 'Disable' : 'Enable')}</button>}<button className="icon-button" aria-label={tr('Edit ' + row.name)} onClick={() => edit(row)}><Pencil size={16}/></button><button className="icon-button danger" disabled={busy} aria-label={tr('Delete ' + row.name)} onClick={() => remove(row)}><Trash2 size={16}/></button></Swipeable>)}{text(!rows.some(row => !payments || (row as PaymentMethod).country === filterCountry) && <div className="empty"><p>{tr("No entries yet. Create one to get started.")}</p></div>)}</section></div>;
}
export function AccountSettings({ user, profile, profileName, reload }: {
    user: {
        email: string;
        displayName?: string;
        username?: string;
        name: string;
    };
    profile: string;
    profileName: string;
    reload: () => Promise<unknown>;
}) {
    const { tr, text, confirmAction } = useI18n();
    const [displayName, setDisplayName] = useState(user.displayName || ''), [email, setEmail] = useState(user.email), [username, setUsername] = useState(user.username || ''), [password, setPassword] = useState(''), [currentPassword, setCurrentPassword] = useState(''), [newPassword, setNewPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [danger, setDanger] = useState<'delete_profile' | 'delete_account' | ''>(''), [confirmation, setConfirmation] = useState(''), [deletePassword, setDeletePassword] = useState('');
    async function request(value: Record<string, unknown>) {
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const response = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
            const json = await response.json();
            if (!response.ok)
                throw Error(json.error || 'Could not save.');
            return json;
        }
        catch (e) {
            setError((e as Error).message);
            return null;
        }
        finally {
            setBusy(false);
        }
    }
    async function update(e: FormEvent) {
        e.preventDefault();
        const result = await request({ action: 'update', displayName, email, username: username || undefined, password });
        if (result) {
            setPassword('');
            setMessage(result.message);
            await reload();
        }
    }
    async function changePassword(e: FormEvent) {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        const result = await request({ action: 'change_password', currentPassword, newPassword });
        if (result) {
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setMessage(result.message);
        }
    }
    async function remove(e: FormEvent) {
        e.preventDefault();
        const result = await request({ action: danger, profile, confirmation, password: deletePassword });
        if (result) {
            if (danger === 'delete_account') {
                window.location.assign('/login');
                return;
            }
            setDanger('');
            setDeletePassword('');
            setConfirmation('');
            setMessage('Profile and its records deleted.');
            await reload();
        }
    }
    return <section className="panel settings-panel account-settings"><h3>{tr("Account & sign-in")}</h3><p>{tr("Your login username is unique across TWMG. Profile names are used to identify each finance space.")}</p><ValidatedForm onSubmit={update}><label>{tr("Account display name")}<input maxLength={60} value={displayName} onChange={e => setDisplayName(e.target.value)}/></label><label>{tr("Email address")}<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/></label><label>{tr("Login username")}<input required minLength={3} maxLength={30} pattern="[a-z0-9_]{3,30}" autoComplete="username" value={username} onChange={e => setUsername(e.target.value.toLowerCase())} placeholder={tr("Choose a unique username")}/></label><label>{tr("Current password")}<input type="password" autoComplete="current-password" required={email!==user.email||username!==(user.username||'')} value={password} onChange={e => setPassword(e.target.value)} placeholder={tr("Required to change email or username")}/></label><button className="primary" disabled={busy}>{tr("Save account settings")}</button></ValidatedForm><div className="settings-divider"/><h3>{tr("Change password")}</h3><p>{tr("Use your current password to choose a new password for this account.")}</p><ValidatedForm onSubmit={changePassword}><label>{tr("Current password")}<input type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}/></label><label>{tr("New password")}<input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={e => setNewPassword(e.target.value)}/></label><label>{tr("Confirm new password")}<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{tr("Update password")}</button></ValidatedForm>{text(message && <p className="success-message" role="status">{text(message, true)}</p>, true)}{text(error && <p className="field-error" role="alert">{text(error, true)}</p>, true)}<details className="danger-zone"><summary>{tr("Delete profile or account")}</summary><p>{tr("Deletion is permanent. Download a backup first. Deleting the last profile creates a new empty Personal space the next time you enter.")}</p><div className="catalog-actions"><button className="secondary danger" onClick={() => { setDanger('delete_profile'); setConfirmation(''); }}>{tr("Delete ")}{profileName}</button><button className="secondary danger" onClick={() => { setDanger('delete_account'); setConfirmation(''); }}>{tr("Delete my account")}</button></div>{text(danger && <ValidatedForm onSubmit={remove}><p>{text(danger === 'delete_account' ? 'All profiles, records and your sign-in account will be permanently deleted. All sessions will be signed out.' : 'This profile’s accounts, transactions, preferences and history will be permanently deleted.')}</p><label>{tr("Type ")}{text(danger === 'delete_account' ? 'DELETE ACCOUNT' : 'DELETE PROFILE')}<input required value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off"/></label><label>{tr("Re-enter your password")}<input type="password" required autoComplete="current-password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)}/></label><div className="catalog-actions"><button className="primary danger-delete" disabled={busy || confirmation !== (danger === 'delete_account' ? 'DELETE ACCOUNT' : 'DELETE PROFILE')}>{tr("Permanently delete")}</button><button type="button" className="secondary" onClick={() => setDanger('')}>{tr("Cancel")}</button></div></ValidatedForm>)}</details></section>;
}
