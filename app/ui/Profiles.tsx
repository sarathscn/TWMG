'use client';
import { useI18n, ValidatedForm } from './UIProvider';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ChevronRight, Plus, X, Pencil, Camera, LoaderCircle, ShieldCheck, TrendingUp, LogOut } from 'lucide-react';
import type { Profile } from '../../lib/finance';
import { profileColors, profileEmojis } from '../../lib/profile';
import { ThemedSelect } from './Controls';
import { AuthForm } from './AuthForm';
import { ColorPicker } from './RecordAppearance';
import { countries, countryCurrencies } from '../../lib/countries';
function trapProfileFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab')
        return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]):not([tabindex="-1"]),textarea, [role="combobox"]')).filter(item => item.getClientRects().length > 0);
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
    }
    else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
    }
}
export function ProfileAvatar({ profile, size = 'medium' }: {
    profile?: Partial<Profile>;
    size?: 'small' | 'medium' | 'large' | 'hero';
}) { const { tr, text, confirmAction } = useI18n(); return <span className={'identity-avatar ' + size} style={{ '--profile-color': profile?.color || '#2d6048' } as React.CSSProperties}>{profile?.avatar ? <img src={profile.avatar} alt=""/> : profile?.emoji ? <span>{text(profile.emoji)}</span> : <span>{profile?.name?.slice(0, 1).toUpperCase() || 'P'}</span>}</span>; }
export function LoginScreen({ profiles = [], selected, onSelect, onContinue, onCreate, loading = false, error = '', retry, userName = '', onSkip }: {
    profiles?: Profile[];
    selected?: string;
    onSelect?: (id: string) => void;
    onContinue?: () => void;
    onCreate?: () => void;
    loading?: boolean;
    error?: string;
    retry?: () => void;
    userName?: string;
    onSkip?: () => void;
}) {
    const { tr, text, confirmAction } = useI18n();
    const active = profiles.find(p => p.id === selected) || profiles[0];
    return <div className="identity-screen"><div className="identity-story"><a className="identity-brand" href="/login"><span className="brand-mark"><TrendingUp size={28}/></span><strong>TWMG<span>.</span></strong></a><div className="identity-story-content"><span className="eyebrow">THE WAY MONEY GOES</span><h1><span>{tr("Your money.")}</span><span>{tr("Your world.")}</span><em>{tr("A little clearer.")}</em></h1><p>{tr("One account. Up to three personal spaces.")}<br />{tr("A fresh perspective on every part of your life.")}</p><div className="identity-orbit"><span>🌿</span><span>✈️</span><span>🏡</span><i /><i /></div></div><p className="identity-malayalam">പണം പോകുന്ന വഴി</p></div><div className="identity-main"><div className="identity-top"><span>TWMG — The Way Money Goes</span><ShieldCheck size={18}/></div><div className="identity-card"><span className="eyebrow">{tr("A SPACE THAT'S YOURS")}</span><h2>{text(profiles.length ? 'Choose your profile' : 'Welcome to TWMG')}</h2><p>{text(profiles.length ? `Welcome back${userName ? ', ' + userName.split(' ')[0] : ''}. Where would you like to begin?` : 'Sign in securely, then choose the profile you want to manage.')}</p>{profiles.length ? <><div className="login-profile-grid">{profiles.map(profile => <button className={'login-profile ' + (active?.id === profile.id ? 'selected' : '')} key={profile.id} onClick={() => onSelect?.(profile.id)} aria-pressed={active?.id === profile.id}><ProfileAvatar profile={profile} size="hero"/><b>{profile.name}</b><small>{text(profile.country)}</small>{text(active?.id === profile.id && <span className="selected-tick"><Check size={12}/></span>)}</button>)}{text(profiles.length < 3 && onCreate && <button className="login-profile create-profile" onClick={onCreate}><span className="identity-add"><Plus size={26}/></span><b>{tr("New profile")}</b><small>{tr("Make it yours")}</small></button>)}</div>{active?.bio && <p className="login-bio">{active.bio}</p>}<button className="primary identity-continue" disabled={loading} onClick={onContinue}>{loading ? <LoaderCircle size={18} className="spin"/> : <>{tr("Continue as ")}{active?.name}<ArrowRight size={17}/></>}</button><button className="identity-signout" onClick={async () => { await fetch('/logout', { method: 'POST' }); window.location.assign('/login'); }}><LogOut size={14}/>{tr("Use another account")}</button></> : loading ? <div className="identity-loading"><LoaderCircle className="spin" size={25}/><p>{tr("Getting your profiles ready\u2026")}</p></div> : <><AuthForm />{process.env.NODE_ENV === 'development' && onSkip && <button type="button" className="identity-signout" onClick={onSkip}>Skip sign-in (dev preview)</button>}</>}{text(error && <div className="identity-error" role="alert"><p>{text(error, true)}</p>{text(retry && <button className="text-button" onClick={retry}>{tr("Try again")}</button>)}</div>, true)}</div><footer><span>{tr("Made for a life well spent.")}</span><span>പണം പോകുന്ന വഴി</span></footer></div></div>;
}
export function ProfileSwitcher({ profiles, active, busy, onChoose, onEdit, onCreate, close, onAccount, onSignOut }: {
    profiles: Profile[];
    active: string;
    busy: boolean;
    onChoose: (id: string) => void;
    onEdit: (p: Profile) => void;
    onCreate: () => void;
    close: () => void;
    onAccount: () => void;
    onSignOut: () => void;
}) {
    const { tr, text, confirmAction } = useI18n();
    const dialog = useRef<HTMLDivElement>(null);
    useEffect(() => { const previous = document.activeElement as HTMLElement; dialog.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); return () => previous?.focus({ preventScroll: true }); }, []);
    return <div className="modal-backdrop switcher-backdrop" onMouseDown={e => {
            if (e.target === e.currentTarget)
                close();
        }}><div ref={dialog} className="modal profile-switcher" onKeyDown={trapProfileFocus} role="dialog" aria-modal="true" aria-labelledby="switcher-title"><div className="switcher-handle"/><div className="modal-head"><div><span className="eyebrow">{tr("YOUR PERSONAL SPACES")}</span><h2 id="switcher-title">{tr("Switch profile")}</h2></div><button className="icon-button" onClick={close} aria-label={tr("Close profile switcher")}><X size={21}/></button></div><div className="switcher-list">{profiles.map(p => <div className={'switcher-row ' + (p.id === active ? 'selected' : '')} key={p.id}><button disabled={busy} className="switcher-choose" onClick={() => onChoose(p.id)}><ProfileAvatar profile={p} size="large"/><span><b>{p.name}</b><small>{text(p.country)}</small>{p.bio && <p>{p.bio}</p>}</span><span className="profile-radio">{text(p.id === active && <i />)}</span></button><button disabled={busy} className="icon-button" aria-label={tr('Customize ' + p.name)} onClick={() => onEdit(p)}><Pencil size={15}/></button>{p.id === active && <button className="switcher-account" onClick={onAccount}><ShieldCheck size={14}/>{tr("Account & sign-in")}<ChevronRight size={14}/></button>}</div>)}</div><div className="switcher-footer">{text(profiles.length < 3 && <button onClick={onCreate} disabled={busy}><span className="switcher-add"><Plus size={18}/></span>{tr("Add a profile")}<small>{text(profiles.length)}/3</small></button>)}<button onClick={onSignOut}><LogOut size={17}/>{tr("Sign out")}</button></div></div></div>;
}
export function ProfileEditor({ value, busy, error, close, save }: {
    value?: Profile;
    busy: boolean;
    error: string;
    close: () => void;
    save: (kind: string, v: any, action?: string) => Promise<boolean>;
}) {
    const { tr, text, confirmAction } = useI18n();
    const [name, setName] = useState(value?.name || ''), [bio, setBio] = useState(value?.bio || ''), [avatar, setAvatar] = useState(value?.avatar || ''), [emoji, setEmoji] = useState(value?.emoji || ''), [color, setColor] = useState(value?.color || profileColors[0]), [country, setCountry] = useState(value?.country || 'India'), [photoError, setPhotoError] = useState('');
    const file = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDivElement>(null);
    useEffect(() => { const previous = document.activeElement as HTMLElement; dialog.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus({ preventScroll: true }); return () => previous?.focus({ preventScroll: true }); }, []);
    async function upload(photo?: File) {
        if (!photo)
            return;
        setPhotoError('');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024) {
            setPhotoError('Choose a JPEG, PNG or WebP photo under 5 MB.');
            return;
        }
        const url = URL.createObjectURL(photo);
        try {
            const image = new Image();
            image.src = url;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 160;
            const context = canvas.getContext('2d');
            if (!context)
                throw Error('Photo processing is unavailable.');
            const side = Math.min(image.width, image.height);
            context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 160, 160);
            const result = canvas.toDataURL('image/jpeg', 0.8);
            if (result.length > 60000)
                throw Error('Please choose a simpler or smaller photo.');
            setAvatar(result);
            setEmoji('');
        }
        catch (e) {
            setPhotoError((e as Error).message);
        }
        finally {
            URL.revokeObjectURL(url);
        }
    }
    function submit(e: FormEvent) { e.preventDefault(); save('profile', { id: value?.id, name, bio, avatar, emoji, color, country }, value ? 'profile_update' : 'profile'); }
    return <div className="modal-backdrop" onMouseDown={e => {
            if (e.target === e.currentTarget)
                close();
        }}><div className="modal customize-profile" ref={dialog} onKeyDown={trapProfileFocus} role="dialog" aria-modal="true" aria-labelledby="customize-title"><div className="modal-head"><div><span className="eyebrow">{tr("MAKE IT FEEL LIKE YOU")}</span><h2 id="customize-title">{text(value ? 'Edit profile' : 'Create a profile')}</h2></div><button className="icon-button" aria-label={tr("Close dialog")} onClick={close}><X size={21}/></button></div><ValidatedForm onSubmit={submit}><div className="profile-photo-editor"><button type="button" className="photo-preview" onClick={() => file.current?.click()} aria-label={tr("Choose profile photo")}><ProfileAvatar profile={{ name, avatar, emoji, color }} size="hero"/><span><Camera size={16}/></span></button><div><button type="button" className="text-button" onClick={() => file.current?.click()}>{tr("Change profile photo")}</button><p>{tr("Choose a photo, or pick an avatar below.")}</p>{text(avatar && <button type="button" className="text-button" onClick={() => setAvatar('')}>{tr("Remove photo")}</button>)}</div><input ref={file} aria-hidden="true" tabIndex={-1} className="control-validation" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => upload(e.target.files?.[0])}/></div><fieldset className="emoji-picker"><legend>{tr("Avatar")}</legend>{text(profileEmojis.map((item, i) => <button type="button" key={item} aria-label={tr(i ? 'Choose avatar ' + i : 'Use initials')} aria-pressed={!avatar && emoji === item} onClick={() => { setAvatar(''); setEmoji(item); }}>{text(item || name.slice(0, 1).toUpperCase() || 'P')}</button>))}</fieldset><div className="form-grid"><label>{tr("Profile name")}<input name="name" required maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder={tr("Your profile name")}/></label></div><label>{tr("Bio")}<textarea maxLength={160} value={bio} onChange={e => setBio(e.target.value)} placeholder={tr("A little about this part of your life\u2026")}/><span className="bio-count">{text(bio.length)}/160</span></label><label>{tr("Country")}<ThemedSelect required value={country} onChange={e => setCountry(e.target.value)}>{text(countries.map(c => <option key={c}>{c}</option>))}</ThemedSelect></label><p className="form-help">{tr("Base currency: ")}{text(value?.currency || countryCurrencies[country])}{text(value && value.currency !== countryCurrencies[country] ? ' · Create a new profile to use the new country’s currency.' : '')}</p><ColorPicker value={color} onChange={setColor} legend={tr("Profile accent")}/>{text(!value && <p className="form-help">{tr("A new, independent finance profile. Your country sets its default currency automatically.")}</p>)}{text((error || photoError) && <p className="field-error" role="alert">{text(photoError || error, true)}</p>, true)}<div className="modal-footer"><button type="button" className="secondary" onClick={close}>{tr("Cancel")}</button><button className="primary" disabled={busy}>{text(busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>)}{tr("Save profile")}</button></div></ValidatedForm></div></div>;
}
