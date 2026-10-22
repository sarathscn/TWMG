'use client';
import packageJson from '../../package.json';
import { useI18n, ValidatedForm } from './UIProvider';
import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { LayoutDashboard, ArrowLeftRight, Wallet, CreditCard, Handshake, Users, Repeat, Target, ChartNoAxesCombined, Settings, ChevronDown, ChevronLeft, ChevronRight, Plus, ArrowUpRight, ArrowDownLeft, ArrowRight, Bell, Search, Sun, Moon, PanelLeftClose, Globe, Download, X, Check, MoreHorizontal, Utensils, ShoppingBag, Car, House, Clapperboard, Briefcase, TrendingUp, Sparkles, Plane, ShieldCheck, Trash2, Pencil, LogOut, Menu, LoaderCircle, SlidersHorizontal, CheckCircle2, UserRound, Info } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { balance, totals, partyBalance, categories, type Data, type Account, type Transaction, type Profile, type Item } from '../../lib/finance';
import { languages, navKeys } from '../../lib/i18n';
import { financeRequest } from '../../lib/api-client';
import { cardColors, cardTypes } from '../../lib/card-options';
import { ThemedSelect, DateField, DashboardCalendar, type CalendarMarker } from './Controls';
import { ProfileAvatar, ProfileSwitcher, ProfileEditor, LoginScreen } from './Profiles';
import { CatalogManager, AccountSettings } from './Preferences';
import { countries, countryCurrencies, countryForCurrency, currencyScale, fractionDigits, maxAmountMajor, parseMoney } from '../../lib/countries';
import { LedgerPage, PartyCards, type Ledger } from './Ledgers';
import { groupMembers } from '../../lib/finance';
import { SharedGroups, SharedGroupEditor, SharedTransactionEditor } from './SharedGroups';
import { AppearancePicker, RecordIcon, emojiLabel } from './RecordAppearance';
const appVersion = packageJson.version;
const icons = [LayoutDashboard, ArrowLeftRight, Wallet, CreditCard, Handshake, Users, Repeat, Target, ChartNoAxesCombined, Settings];
const colors = ['#2c7767', '#9aba9b', '#d0b783', '#9caaaf', '#d8dcd5', '#c9b5a3'];
const categoryIcon = (c: string) => c.includes('Food') ? Utensils : c.includes('Shopping') ? ShoppingBag : c.includes('Transport') ? Car : c.includes('Home') ? House : c.includes('Salary') || c.includes('Freelance') ? Briefcase : Clapperboard;
type Modal = {
    kind: string;
    value?: any;
    entry?: any;
} | null;
export default function FinanceApp() {
    const { tr, text, confirmAction } = useI18n();
    const { locale: lang, setLocale: setLang } = useI18n();
    const [ledger, setLedger] = useState<Ledger | null>(null);
    const [data, setData] = useState<Data | null>(null), [profiles, setProfiles] = useState<Profile[]>([]), [profile, setProfile] = useState(''), [user, setUser] = useState<{
        name: string;
        email: string;
        username?: string;
        displayName?: string;
    }>({ name: '', email: '' });
    const [signedOut, setSignedOut] = useState(false), [chooser, setChooser] = useState(true), [switching, setSwitching] = useState(false), [view, setView] = useState('Overview'), [dark, setDark] = useState(false), [textSize, setTextSize] = useState<'small' | 'medium' | 'large'>('medium'), [collapsed, setCollapsed] = useState(false), [mobile, setMobile] = useState(false), [modal, setModal] = useState<Modal>(null), [notice, setNotice] = useState(''), [saveError, setSaveError] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [period, setPeriod] = useState('Month'), [month, setMonth] = useState(new Date().toISOString().slice(0, 7)), [notifications, setNotifications] = useState(false), [profileMenu, setProfileMenu] = useState(false), [dateFrom, setDateFrom] = useState(''), [dateTo, setDateTo] = useState('');
    const t = languages[lang], p = profiles.find(x => x.id === profile), currency = p?.currency || 'INR';
    const money = (n: number, c = currency) => new Intl.NumberFormat(t.locale, { style: 'currency', currency: c, maximumFractionDigits: fractionDigits(c), minimumFractionDigits: c === "BHD" ? 3 : n % currencyScale(c) ? fractionDigits(c) : 0 }).format(n / currencyScale(c));
    const date = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString(t.locale, { day: 'numeric', month: 'short' });
    async function load(id?: string) {
        try {
            setError('');
            const x = await financeRequest('/api/finance' + (id ? '?profile=' + encodeURIComponent(id) : ''));
            setSignedOut(false);
            setData(x.data);
            setProfiles(x.profiles);
            const remembered = localStorage.getItem('twmg-profile');
            const selected = !data && !id && x.profiles.some((p: Profile) => p.id === remembered) ? remembered : x.profile;
            setProfile(selected);
            localStorage.setItem('twmg-profile', selected);
            setUser(x.user);
            return true;
        }
        catch (e) {
            if ((e as {
                status?: number;
            }).status === 401) {
                setSignedOut(true);
                setError('');
            }
            else
                setError((e as Error).message);
            return false;
        }
    }
    // Dev-only: lets `next dev` show the workspace without signing in. Nothing is sent to Supabase; writes still need a real session.
    function skipSignIn() {
        const preview: Profile = { id: 'dev-preview', name: 'Preview', country: 'India', currency: 'INR' };
        setData({ accounts: [], transactions: [], budgets: [], goals: [], debts: [], shared: [], recurring: [], parties: [], categories: [], paymentMethods: [] });
        setProfiles([preview]);
        setProfile(preview.id);
        setUser({ name: 'Preview', email: '' });
        setSignedOut(false);
        setError('');
        setChooser(false);
    }
    useEffect(() => { load(); setDark(localStorage.getItem('twmg-theme') === 'dark'); const stored = localStorage.getItem('twmg-text-size'); if (stored === 'small' || stored === 'medium' || stored === 'large') setTextSize(stored); }, []);

    useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('twmg-theme', dark ? 'dark' : 'light'); }, [dark]);
    useEffect(() => { document.documentElement.dataset.textSize = textSize; localStorage.setItem('twmg-text-size', textSize); }, [textSize]);
    useEffect(() => {
        if (notice) {
            const id = setTimeout(() => setNotice(''), 4500);
            return () => clearTimeout(id);
        }
    }, [notice]);
    useEffect(() => {
        const fn = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.defaultPrevented) {
                setModal(null);
                setProfileMenu(false);
                setNotifications(false);
            }
        };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, []);
    useEffect(() => {
        const initial = { twmg: true, view: 'Overview', ledger: null, search: '', filter: 'all', dateFrom: '', dateTo: '' };
        if (!window.history.state?.twmg)
            window.history.replaceState(initial, '', window.location.href);
        const restore = (event: PopStateEvent) => {
            const next = event.state;
            if (!next?.twmg)
                return;
            setLedger(next.ledger || null);
            setView(next.view || 'Overview');
            setSearch(next.search || '');
            setFilter(next.filter || 'all');
            setDateFrom(next.dateFrom || '');
            setDateTo(next.dateTo || '');
            setMobile(false);
            setProfileMenu(false);
            setNotifications(false);
            requestAnimationFrame(() => document.querySelector('.main-shell main')?.scrollTo({ top: 0, behavior: 'instant' }));
        };
        window.addEventListener('popstate', restore);
        return () => window.removeEventListener('popstate', restore);
    }, []);
    async function mutate(kind: string, value: any, action = 'save') {
        setBusy(true);
        setSaveError('');
        try {
            const x = await financeRequest('/api/finance', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, value, action, profile: action === 'profile_update' ? value.id : profile, id: value?.id }) });
            await load(action === 'profile' || action === 'profile_update' ? x.id : profile);
            setModal(null);
            setNotice(action === 'delete' ? 'Record removed' : action === 'profile' ? 'Your new profile is ready' : 'Saved successfully');
            return true;
        }
        catch (e) {
            setSaveError((e as Error).message);
            return false;
        }
        finally {
            setBusy(false);
        }
    }
    const popupOpen = !!modal || notifications || profileMenu;
    useEffect(() => { setSaveError(''); }, [modal]);
    useEffect(() => {
        if (!popupOpen)
            return;
        const content = document.querySelector<HTMLElement>('.main-shell main');
        const contentOverflow = content?.style.overflow || '';
        if (content)
            content.style.overflow = 'hidden';
        const body = document.body, html = document.documentElement;
        const y = window.scrollY, x = window.scrollX;
        const previous = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width, overflow: body.style.overflow, htmlOverflow: html.style.overflow };
        body.style.position = 'fixed';
        body.style.top = `-${y}px`;
        body.style.left = '0';
        body.style.right = '0';
        body.style.width = '100%';
        body.style.overflow = 'hidden';
        html.style.overflow = 'hidden';
        return () => {
            if (content)
                content.style.overflow = contentOverflow;
            Object.assign(body.style, { position: previous.position, top: previous.top, left: previous.left, right: previous.right, width: previous.width, overflow: previous.overflow });
            html.style.overflow = previous.htmlOverflow;
            window.scrollTo({ left: x, top: y, behavior: 'instant' });
        };
    }, [popupOpen]);
    const valid = data?.transactions.filter(x => { const a = data.accounts.find(a => a.id === x.account); return a?.currency === currency; }) || [];
    const range = useMemo(() => {
        let start = month + '-01', end = month + '-' + String(new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()).padStart(2, '0');
        if (period === 'Year') {
            start = month.slice(0, 4) + '-01-01';
            end = month.slice(0, 4) + '-12-31';
        }
        if (period === 'Week') {
            const d = new Date(month + '-20T12:00:00');
            d.setDate(d.getDate() - 6);
            start = d.toISOString().slice(0, 10);
            end = month + '-20';
        }
        if (period === 'Day')
            start = end = month + '-20';
        return { start: dateFrom || start, end: dateTo || end };
    }, [month, period, dateFrom, dateTo]);
    const tx = valid.filter(x => x.date >= range.start && x.date <= range.end), sum = totals(tx), net = data?.accounts.filter(a => a.currency === currency).reduce((s, a) => s + balance(a, data.transactions), 0) || 0;
    const calendarMarkers: CalendarMarker[] = [
        ...(data?.transactions || []).map(x => ({ date: x.date, kind: 'transaction' as const })),
        ...(data?.recurring || []).filter(x => !!x.due).map(x => ({ date: x.due!, kind: 'recurring' as const })),
        ...(data?.accounts || []).filter(x => x.type === 'Credit card' && !!x.due).map(x => ({ date: x.due!, kind: 'credit-card' as const })),
        ...(data?.debts || []).filter(x => !!x.due).map(x => ({ date: x.due!, kind: 'debt' as const }))
    ];
    const debtNet = (data?.parties || []).reduce((s, p) => s + partyBalance(p.id, valid), 0) + (data?.debts || []).reduce((s, d) => s + (d.type === 'Borrowed' ? -1 : 1) * (d.amount - (d.paid || 0)), 0);
    const spending = [...new Set([...categories, ...tx.flatMap(x => x.splits?.map(z => z.category) || [x.category])])].map(name => ({ name, value: tx.filter(x => x.type === 'expense' && !x.partyId).reduce((s, x) => s + (x.splits?.length ? x.splits.filter(z => z.category === name).reduce((s, z) => s + z.amount, 0) : x.category === name ? x.amount : 0), 0) })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
    const chart = Array.from({ length: period === 'Year' ? 12 : period === 'Day' ? 1 : period === 'Week' ? 7 : Math.min(31, new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()) }, (_, i) => { const key = period === 'Year' ? `${month.slice(0, 4)}-${String(i + 1).padStart(2, '0')}` : period === 'Day' ? range.start : period === 'Week' ? (() => { const d = new Date(range.start + 'T12:00:00'); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); })() : `${month}-${String(i + 1).padStart(2, '0')}`; const s = totals(tx.filter(t => t.date.startsWith(key))); return { name: period === 'Year' ? new Date(key + '-01T12:00:00').toLocaleDateString(t.locale, { month: 'short' }) : key.slice(-2), income: s.income / currencyScale(currency), expense: s.expense / currencyScale(currency) }; });
    const visible = (data?.transactions || []).filter(x => (filter === 'all' || x.type === filter) && `${x.name} ${x.category} ${x.notes || ''} ${x.tags || ''}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
    function pushNavigation(next: { view: string; ledger: Ledger | null; search?: string; filter?: string; dateFrom?: string; dateTo?: string }) {
        if (typeof window === 'undefined')
            return;
        const current = window.history.state;
        const same = current?.twmg && current.view === next.view && (current.ledger?.id || '') === (next.ledger?.id || '') && (current.ledger?.kind || '') === (next.ledger?.kind || '') && (current.search || '') === (next.search || '') && (current.filter || 'all') === (next.filter || 'all') && (current.dateFrom || '') === (next.dateFrom || '') && (current.dateTo || '') === (next.dateTo || '');
        if (!same)
            window.history.pushState({ twmg: true, ...next }, '', window.location.href);
    }
    function openLedger(kind: Ledger['kind'], id: string) { const next = { kind, id }; pushNavigation({ view, ledger: next, search, filter, dateFrom, dateTo }); setLedger(next); document.querySelector('.main-shell main')?.scrollTo({ top: 0, behavior: 'instant' }); }
    function backFromLedger() { if (window.history.state?.twmg && window.history.state.ledger) window.history.back(); else setLedger(null); }
    function go(v: string) { pushNavigation({ view: v, ledger: null }); setLedger(null); setSaveError(''); setView(v); setMobile(false); setProfileMenu(false); setNotifications(false); document.querySelector('.main-shell main')?.scrollTo({ top: 0, behavior: 'instant' }); setSearch(''); setFilter('all'); setDateFrom(''); setDateTo(''); }
    function exportCSV() { const rows = [['Date', 'Description', 'Type', 'Category', 'Amount', 'Currency', 'Account', 'Payment method'], ...tx.map(x => [x.date, x.name, x.type, x.category, (x.amount / currencyScale(data?.accounts.find(a => a.id === x.account)?.currency || currency)).toFixed(fractionDigits(data?.accounts.find(a => a.id === x.account)?.currency || currency)), data?.accounts.find(a => a.id === x.account)?.currency || currency, data?.accounts.find(a => a.id === x.account)?.name || '', x.paymentMethodName || ''])]; const csv = rows.map(r => r.map(v => '"' + String(v).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"').join(',')).join('\r\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `TWMG-${month}.csv`; a.click(); URL.revokeObjectURL(a.href); setNotice('Report exported'); }
    const sectionHeader = (title: string, sub: string, kind: string) => <div className="page-heading"><div><h1>{text(title)}</h1><p>{text(sub)}</p></div><button className={'primary ' + (kind === 'transactions' ? 'page-transaction-add' : '')} onClick={() => setModal({ kind, ...(kind === 'accounts' && view === 'Credit cards' ? { value: { type: 'Credit card' } } : {}) })}><Plus size={17}/>{tr("Add ")}{text(kind === 'profile' ? 'profile' : kind === 'transactions' ? 'transaction' : kind === 'accounts' ? 'account' : kind === 'budgets' ? 'budget' : kind === 'goals' ? 'goal' : kind === 'debts' ? 'debt' : kind === 'shared' ? 'group' : kind === 'recurring' ? 'bill' : 'payment')}</button></div>;
    const progress = (v: number, total: number, color = '#327a68') => <div className="progress"><i style={{ width: `${Math.min(100, total ? v / total * 100 : 0)}%`, background: color }}/></div>;
    const txTable = (rows: Transaction[], compact = false) => <div className="table-wrap"><table><thead><tr><th>{tr("Transaction")}</th><th>{tr("Category")}</th><th>{tr("Account")}</th><th>{tr("Date")}</th><th className="amount">{tr("Amount")}</th>{text(!compact && <th />)}</tr></thead><tbody>{rows.map(x => { const Icon = categoryIcon(x.category), a = data?.accounts.find(a => a.id === x.account); return <tr key={x.id}><td><div className="tx-name"><span className={'tx-icon ' + (x.type === 'income' ? 'green' : '')}><Icon size={17}/></span><span><b>{x.name}</b><small>{x.type === 'transfer' ? 'Account transfer' : x.partyId ? tr({ lend: 'Money lent', borrow: 'Money borrowed', collect: 'Repayment received', repay: 'Debt repaid' }[x.debtAction || 'lend']) : x.sharedGroupId ? tr('Shared expense') : x.recurringId ? tr('Recurring bill') : x.tags || x.notes || x.paymentMethodName || tr('Completed')}</small></span></div></td><td><span className="badge">{text(x.type === 'transfer' ? 'Transfer' : x.category)}</span></td><td><span className="account-dot" style={a?.color ? { background: a.color } : undefined}/><span><b>{a && emojiLabel(a)}</b><small className="tx-account-type">{text(a?.type || '')}{a?.type === 'Credit card' && <> · •••• {a.lastFour || '— — — —'}</>}</small></span></td><td>{text(date(x.date))}</td><td className={'amount ' + (x.type === 'income' ? 'positive' : '')}><b>{text(x.type === 'income' ? '+' : x.type === 'expense' ? '−' : '')}{text(money(x.amount, a?.currency))}</b></td>{!compact && <td><button className="icon-button" aria-label={tr('Edit ' + x.name)} onClick={() => setModal({ kind: 'transactions', value: x })}><Pencil size={15}/></button></td>}</tr>; })}</tbody></table>{text(!rows.length && <div className="empty"><Search /><h3>{tr("No transactions yet")}</h3><p>{tr("Add a transaction or try another search.")}</p></div>)}</div>;
    async function switchTo(id: string) {
        setSwitching(true);
        const ok = await load(id);
        setSwitching(false);
        if (ok) {
            setProfileMenu(false);
            setChooser(false);
            go('Overview');
        }
    }
    function openSharedTransaction(value: Item, entry?: import('../../lib/finance').SharedExpense) {
        if (entry?.transactionId) {
            const tx = data?.transactions.find(t => t.id === entry.transactionId);
            if (tx)
                setModal({ kind: 'transactions', value: tx });
        }
        else
            setModal({ kind: 'shared-transaction', value, entry });
    }
    const profileDialog = modal && (modal.kind === 'profile' || modal.kind === 'profile-edit') ? <ProfileEditor value={modal.value} busy={busy} error={saveError} close={() => setModal(null)} save={mutate}/> : null;
    if (!data || signedOut)
        return <LoginScreen loading={!error && !signedOut} error={error} retry={() => load()} onSkip={process.env.NODE_ENV === 'development' ? skipSignIn : undefined}/>;
    if (chooser)
        return <><LoginScreen profiles={profiles} selected={profile} onSelect={setProfile} onContinue={() => switchTo(profile)} onCreate={() => setModal({ kind: 'profile' })} loading={switching} error={error} userName={user.displayName || user.name}/>{text(profileDialog)}</>;
    return <div className={'app ' + (collapsed ? 'collapsed ' : '') + (mobile ? 'mobile-open' : '')}>
 <aside className="sidebar"><a className="brand" href="#" onClick={e => { e.preventDefault(); go('Overview'); }}><span className="brand-mark"><TrendingUp size={25}/></span><span><strong>TWMG<span className="brand-period">.</span></strong><small>THE WAY MONEY GOES</small></span></a>
 <small className="nav-label">{tr("WORKSPACE")}</small><nav>{text([['Overview', LayoutDashboard], ['Transactions', ArrowLeftRight], ['Finance', Wallet], ['Settings', Settings]].map(([name, Icon]: any) => <button key={name} className={(view === name || (name === 'Finance' && ['Accounts', 'Credit cards', 'Debts', 'Shared expenses', 'Recurring', 'Budgets & goals'].includes(view)) || (name === 'Settings' && ['Account & sign-in', 'Data & privacy', 'Profiles', 'Categories', 'Payment methods', 'Reports', 'Language & theme', 'About'].includes(view))) ? 'active' : ''} onClick={() => go(name)}><Icon size={19}/><span>{text(name)}</span></button>))}</nav>
 <div className="sidebar-bottom"><div className="clarity-card"><span>✧</span><b>{tr("Small steps. Big possibilities.")}</b><p>{tr("Your future self will thank you.")}</p><button onClick={() => go('Budgets & goals')}>{tr("Set a savings goal ")}<ArrowUpRight size={14}/></button></div><div className="user-row"><span className="user-avatar">{(user.displayName || user.name).slice(0, 1)}</span><span><b>{user.displayName || user.name.split(' ')[0]}</b><small>{tr("Personal workspace")}</small></span></div></div></aside>
 <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button collapse-control" aria-label={tr("Toggle sidebar")} onClick={() => setCollapsed(!collapsed)}><PanelLeftClose size={19}/></button><a className="mobile-site-name" href="#" aria-label={tr("TWMG home")} onClick={e => { e.preventDefault(); go('Overview'); }}>TWMG<span>.</span></a><span>{tr("Workspace")}</span><ChevronRight size={13}/><b>{text(t.nav[navKeys.indexOf(view)] || view)}</b></div><div className="top-actions"><label className="global-search"><Search size={16}/><input placeholder={tr("Search transactions\u2026")} maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setLedger(null); setView('Transactions'); }}/><kbd>⌕</kbd></label><div className="notification-wrap"><button className="icon-button notification-button" aria-label={tr("Notifications")} onClick={() => setNotifications(!notifications)}><Bell size={19}/><i /></button>{notifications && <div className="popover notifications"><b>{tr("Coming up next")}</b>{data.recurring.map(x => <div key={x.id}><span>{x.name}<small>{text(x.due && date(x.due))}</small></span><b>{text(money(x.amount))}</b></div>)}{text(!data.recurring.length && <p>{tr("You\u2019re all caught up.")}</p>)}</div>}</div><button className="header-profile" aria-label={tr("Switch profile")} onClick={() => setProfileMenu(true)}><ProfileAvatar profile={p} size="small"/></button></div></header>
 <main><div className="welcome-strip"><span><i />{tr("YOUR MONEY, WITH A LITTLE MORE MEANING")}</span><span className="brand-malayalam">പണം പോകുന്ന വഴി</span></div>
 {text(ledger ? <LedgerPage ledger={ledger} data={data} money={money} table={txTable} back={backFromLedger} add={value => setModal({ kind: 'transactions', value })} edit={() => setModal({ kind: ledger.kind, value: ledger.kind === 'parties' ? data.parties?.find(x => x.id === ledger.id) : data[ledger.kind].find(x => x.id === ledger.id) })}>{text(ledger.kind === 'shared' && <SharedGroups initialTab="transactions" groups={data.shared.filter(g => g.id === ledger.id)} money={money} date={date} edit={value => setModal({ kind: 'shared', value })} transaction={openSharedTransaction} settle={value => setModal({ kind: 'repayment', value: { ...value, source: 'shared' } })}/>)}</LedgerPage> : <>
 {view === 'Overview' && <>
 <div className="page-heading"><div><div className="eyebrow">{tr("YOUR FINANCIAL PICTURE")}</div><h1>{text(new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening')}, {p?.name || user.displayName || user.name} <span className="wave">☀</span></h1><p>{text(t.subtitle)}</p></div><button className="primary page-transaction-add" onClick={() => setModal({ kind: 'transactions' })}><Plus size={17}/>{text(t.add)}</button></div>
 <div className="dashboard-toolbar"><div className="tabs">{text(['Day', 'Week', 'Month', 'Year'].map(x => <button className={period === x ? 'selected' : ''} key={x} onClick={() => setPeriod(x)}>{text(x)}</button>))}</div><div className="toolbar-right"><DashboardCalendar month={month} selected={dateFrom && dateFrom === dateTo ? dateFrom : undefined} markers={calendarMarkers} onMonthChange={next => { setMonth(next); setDateFrom(''); setDateTo(''); setPeriod('Month'); }} onSelect={selectedDate => { setMonth(selectedDate.slice(0, 7)); setDateFrom(selectedDate); setDateTo(selectedDate); setPeriod('Day'); }}/></div></div>
 <div className="metrics"><article className="metric net-worth"><div className="metric-top"><span>{text(t.net)}</span><Wallet size={17}/></div><h2>{text(money(net + debtNet))}</h2><div className="metric-bottom"><span className="pill"><ShieldCheck size={12}/>{tr("Across your accounts")}</span><svg viewBox="0 0 90 30"><path d="M0 26L10 23L20 24L30 17L40 20L50 10L60 14L70 6L80 8L90 0"/></svg></div></article><article className="metric"><div className="metric-top"><span>{tr("Total ")}{text(t.income.toLowerCase())}</span><span className="metric-icon green"><ArrowDownLeft size={17}/></span></div><h2>{text(money(sum.income))}</h2><div className="metric-bottom"><span className="positive"><ArrowUpRight size={13}/>{tr("Money coming in")}</span><small>{text(tx.filter(t => t.type === 'income' && !t.partyId).length)}{tr(" transactions")}</small></div></article><article className="metric"><div className="metric-top"><span>{tr("Total ")}{text(t.expense.toLowerCase())}</span><span className="metric-icon peach"><ArrowUpRight size={17}/></span></div><h2>{text(money(sum.expense))}</h2><div className="metric-bottom"><span className="muted">{tr("Money going out")}</span><small>{text(tx.filter(t => t.type === 'expense' && !t.partyId).length)}{tr(" transactions")}</small></div></article><article className="metric"><div className="metric-top"><span>{text(t.save)}</span><span className="metric-icon lavender"><Target size={17}/></span></div><h2>{text(sum.income ? ((sum.income - sum.expense) / sum.income * 100).toFixed(1) : '0')}<span className="percent">%</span></h2><div className="metric-bottom"><span className="positive"><TrendingUp size={13}/>{text(money(sum.income - sum.expense))}</span><small>{tr("left this period")}</small></div></article></div>
 <div className="dashboard-grid"><section className="panel cashflow"><div className="panel-head"><div><h3>{tr("Cash flow")}</h3><p>{tr("A clearer view of what comes in and goes out.")}</p></div><div className="legend"><span><i />{text(t.income)}</span><span><i />{text(t.expense)}</span></div></div><div className="cashflow-values"><div><small>{tr("NET CASH FLOW")}</small><strong>{text(money(sum.income - sum.expense))}<span><ArrowUpRight size={16}/></span></strong></div><span className="muted">{text(period === 'Month' ? 'This month' : `This ${period.toLowerCase()}`)}</span></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}><defs><linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#548b74" stopOpacity={0.22}/><stop offset="95%" stopColor="#548b74" stopOpacity={0}/></linearGradient><linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d0b783" stopOpacity={0.16}/><stop offset="95%" stopColor="#d0b783" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--line)"/><XAxis dataKey="name" axisLine={false} tickLine={false} minTickGap={35} tick={{ fontSize: 10, fill: '#8a928c' }}/><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8a928c' }} tickFormatter={v => v >= 1000 ? `${v / 1000}k` : `${v}`}/><Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 12 }} formatter={(v: any) => money(Number(v) * currencyScale(currency))}/><Area type="monotone" dataKey="income" name={t.income} stroke="#347b65" strokeWidth={2.5} fill="url(#incomeFill)"/><Area type="monotone" dataKey="expense" name={t.expense} stroke="#c9ae7a" strokeWidth={2} fill="url(#expenseFill)"/></AreaChart></ResponsiveContainer></div><div className="chart-foot"><span><span className="tiny-dot"/>{tr("Income and expenses in ")}{text(currency)}</span><button onClick={() => go('Reports')}>{tr("Explore reports ")}<ArrowUpRight size={13}/></button></div></section>
 <section className="panel spending"><div className="panel-head"><div><h3>{tr("Where it went")}</h3><p>{tr("Your spending, at a glance.")}</p></div><button className="icon-button" aria-label={tr("Open expense report")} onClick={() => go('Reports')}><ArrowUpRight size={18}/></button></div><div className="donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={spending.length ? spending : [{ name: 'No expenses', value: 1 }]} dataKey="value" innerRadius={65} outerRadius={87} paddingAngle={spending.length > 1 ? 4 : 0} cornerRadius={5} startAngle={90} endAngle={-270} stroke="none">{spending.length ? spending.map((x, i) => <Cell key={x.name} fill={colors[i % colors.length]}/>) : <Cell className="donut-empty"/>}</Pie>{spending.length > 0 && <Tooltip formatter={(v: any) => money(Number(v))} contentStyle={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--line)' }}/>}</PieChart></ResponsiveContainer><div className="donut-center"><small>{tr("Total spent")}</small><strong>{text(money(sum.expense))}</strong></div></div><div className="spending-list">{spending.slice(0, 4).map((x, i) => <button key={x.name} onClick={() => { go('Transactions'); setSearch(x.name); }}><span><i style={{ background: colors[i] }}/>{text(x.name)}</span><b>{text(money(x.value))}<small>{text((x.value / sum.expense * 100).toFixed(0))}%</small></b></button>)}{text(!spending.length && <p className="spending-empty"><b>{tr("No spending yet this period.")}</b><small>{tr("Add an expense to see where your money goes.")}</small></p>)}</div></section>
 <section className="panel recent"><div className="panel-head"><div><h3>{tr("Recent transactions ")}<span className="count">{text(data.transactions.length)}</span></h3><p>{tr("The little things that add up.")}</p></div><button className="text-button" onClick={() => go('Transactions')}>{tr("View all ")}<ArrowRight size={15}/></button></div>{text(txTable([...data.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), true))}</section>
 <section className="panel budgets"><div className="panel-head"><div><h3>{tr("Monthly budgets")}</h3><p>{tr("A little structure. More peace of mind.")}</p></div><button className="icon-button" aria-label={tr("Manage budgets")} onClick={() => go('Budgets & goals')}><ArrowUpRight size={18}/></button></div>{data.budgets.slice(0, 3).map((b, i) => { const used = spending.find(x => x.name === (b.category || b.name))?.value || 0, Icon = categoryIcon(b.name); return <div className="budget-row" key={b.id}><div><RecordIcon record={b} className={'budget-icon c' + i} fallback={<Icon size={15}/>}/><b>{text(b.name)}</b><small>{text(Math.round(used / b.amount * 100))}%</small></div>{text(progress(used, b.amount, i === 1 ? '#c5a66a' : '#7ca38a'))}<p><span>{text(money(used))} <small>{tr("of ")}{text(money(b.amount))}</small></span><small>{text(money(Math.max(0, b.amount - used)))}{tr(" left")}</small></p></div>; })}<button className="budget-link" onClick={() => go('Budgets & goals')}>{tr("Manage budgets ")}<ArrowRight size={14}/></button></section>
 <section className="insight"><span className="insight-icon"><Sparkles size={21}/></span><div><b>{tr("Making room for what matters.")}</b><p>{tr("You\u2019ve kept ")}{text(sum.income ? Math.round((sum.income - sum.expense) / sum.income * 100) : 0)}{tr("% of your income this period. Give that money a purpose with a savings goal.")}</p></div><button onClick={() => go('Budgets & goals')}>{tr("Explore goals ")}<ArrowUpRight size={15}/></button></section>
 <section className="panel upcoming"><div className="panel-head"><h3>{tr("On the horizon")}</h3><button className="text-button" onClick={() => go('Recurring')}>{tr("View all ")}<ArrowRight size={14}/></button></div>{data.recurring.slice(0, 2).map((r, i) => <div className="upcoming-row" key={r.id}><RecordIcon record={r} className={'service-icon ' + (i === 0 ? 'netflix' : 'internet')} fallback={i === 0 ? 'N' : <Globe size={20}/>}/><span><b>{r.name}</b><small>{text(r.due && date(r.due))} · {text(r.type)}</small></span><strong>{text(money(r.amount))}</strong></div>)}</section></div>
 </>}
 {text(view === 'Finance' && <><div className="page-heading"><div><h1>{tr("Finance")}</h1><p>{tr("Your accounts, commitments and plans in one place.")}</p></div></div><div className="more-grid">{text([2, 3, 4, 5, 6, 7].map(i => { const Icon = icons[i]; return <button className="panel more-tile" key={navKeys[i]} onClick={() => go(navKeys[i])}><span className="more-icon"><Icon size={23}/></span><span><b>{text(t.nav[i])}</b><small>{text(['Accounts and balances', 'Card limits and repayments', 'Lending and borrowing', 'Groups and shared costs', 'Bills and subscriptions', 'Spending plans and savings goals'][i - 2])}</small></span><ChevronRight size={17}/></button>; }))}</div></>)}
 {view === 'Settings' && <><div className="page-heading"><div><h1>{tr("Settings")}</h1><p>{tr("Make TWMG work for you.")}</p></div></div><div className="more-grid">{text([['Profiles', Users, 'Your independent finance spaces'], ['Categories', Target, 'Organize income and spending'], ['Payment methods', Wallet, 'Manage country-specific payment methods'], ['Language & theme', Globe, 'Language, appearance and accessibility'], ['Data & privacy', ShieldCheck, 'Backups, exports and data controls'], ['About', Info, 'App information and version']].map(([name, Icon, description]: any) => <button className="panel more-tile" key={name} onClick={() => go(name)}><span className="more-icon"><Icon size={23}/></span><span><b>{text(name)}</b><small>{text(description)}</small></span><ChevronRight size={17}/></button>))}</div></>}
 {text(view === 'Language & theme' && <><div className="page-heading"><div><h1>{tr("Language & theme")}</h1><p>{tr("A workspace that feels like you.")}</p></div></div><section className="panel settings-panel"><label>{tr("Language")}<ThemedSelect aria-label={tr("Language")} value={lang} onChange={e => setLang(e.target.value)}>{text(Object.entries(languages).map(([k, v]) => <option key={k} value={k}>{v.label}</option>))}</ThemedSelect></label><label>{tr("Theme")}<ThemedSelect aria-label={tr("Theme")} value={dark ? 'dark' : 'light'} onChange={e => setDark(e.target.value === 'dark')}><option value="light">{tr("Light")}</option><option value="dark">{tr("Dark")}</option></ThemedSelect></label><label>{tr("Text size")}<ThemedSelect aria-label={tr("Text size")} value={textSize} onChange={e => setTextSize(e.target.value as 'small' | 'medium' | 'large')}><option value="small">{tr("Small")}</option><option value="medium">{tr("Medium")}</option><option value="large">{tr("Large")}</option></ThemedSelect></label><p>{tr("Your language, text size and appearance preferences are saved on this device.")}</p></section></>)}
 {text(view === 'About' && <><div className="page-heading"><div><h1>{tr("About TWMG")}</h1><p>{tr("The Way Money Goes · പണം പോകുന്ന വഴി")}</p></div></div><section className="panel settings-panel about-panel"><span className="brand-mark"><TrendingUp size={25}/></span><h2>TWMG</h2><p>{tr("Hey there! Thanks for stopping by.")}</p><h3>{tr("Why this app exists")}</h3><p>{tr("Let’s be honest: tracking where your hard-earned cash goes shouldn't require a monthly subscription. Everywhere you look, basic finance trackers are locked behind paywalls. So, I decided to build something different.")}</p><h3>{tr("Built with AI, fueled by passion")}</h3><p>{tr("In this AI generation, The Way Money Goes was created by Sarath Chandran C to keep things simple, accessible, and purely AI-driven. No corporate bloat, no forced subscriptions—just a straightforward way to watch your expenses.")}</p><h3>{tr("A quick heads-up")}</h3><p>{tr("Since this is an independent project, you might stumble upon a bug or two along the way. If you do, bear with me! The best part? It is, and always will be, 100% free to use.")}</p><h3>{tr("Support the Creator")}</h3><p>{tr("If this app helps you keep your finances in check and you'd like to support its ongoing development (or just buy me a meal to keep the code flowing), you can drop a contribution here:")}</p><a className="primary about-support" href="https://buymeacoffee.com/sarathscn" target="_blank" rel="noreferrer">☕ {tr("Buy Me a Coffee / Support the Dev")}</a><p>{tr("Thanks for using the app and being part of the journey!")}</p><dl><div><dt>{tr("Version")}</dt><dd>{appVersion}</dd></div><div><dt>{tr("Platform")}</dt><dd>{tr("Web · Mobile web")}</dd></div><div><dt>{tr("Languages")}</dt><dd>{tr("English · हिन्दी · العربية · മലയാളം · Deutsch")}</dd></div></dl><button className="secondary" onClick={() => go('Data & privacy')}>{tr("Data & privacy")}</button></section></>)} {text((['Categories', 'Payment methods'].includes(view)) && <><div className="page-heading"><div><h1>{text(view)}</h1><p>{tr("Personalize the way you track your money.")}</p></div></div><CatalogManager key={profile + view} kind={view === 'Categories' ? 'categories' : 'paymentMethods'} rows={view === 'Categories' ? data.categories || [] : data.paymentMethods || []} country={p?.country || 'India'} busy={busy} error={saveError} save={mutate}/></>, true)}
 {text(view === 'Transactions' && <>{text(sectionHeader(t.nav[1], 'Every little detail, all in one place.', 'transactions'))}<section className="panel"><div className="list-toolbar"><label className="search-box"><Search size={17}/><input maxLength={100} value={search} onChange={e => setSearch(e.target.value)} placeholder={tr("Search name, category, notes or tags")}/></label><ThemedSelect aria-label={tr("Transaction type")} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All transactions</option><option value="income">Income</option><option value="expense">Expenses</option><option value="transfer">Transfers</option></ThemedSelect><span className="muted">{text(visible.length)}{tr(" transactions")}</span></div>{text(txTable(visible))}</section></>)}
 {(view === 'Accounts' || view === 'Credit cards') && <>{text(sectionHeader(t.nav[view === 'Accounts' ? 2 : 3], view === 'Accounts' ? 'All your money. One clear picture.' : 'Stay in control of what you owe.', 'accounts'))}<div className="account-grid">{data.accounts.filter(a => view === 'Accounts' || a.type === 'Credit card').map((a, i) => { const amount = balance(a, data.transactions); return <article className={'panel account-card ' + (a.type === 'Credit card' ? 'credit-account' : '')} style={a.color || a.type === 'Credit card' ? { borderTop: `4px solid ${a.color || cardColors[0]}` } : undefined} key={a.id}><div className="account-card-top"><RecordIcon record={a} className="account-bank-icon" fallback={a.type === 'Credit card' ? <CreditCard /> : <Wallet />}/><span>{text(a.type)}</span><button className="icon-button" aria-label={tr('Edit ' + a.name)} onClick={() => setModal({ kind: 'accounts', value: a })}><Pencil size={16}/></button></div><button className="ledger-title" onClick={() => openLedger('accounts', a.id)}><h3>{a.name}</h3><ChevronRight size={17}/></button>{a.type === 'Credit card' && <div className="card-reference" style={{ background: a.color || cardColors[0] }}><span>{text(a.cardType || 'Credit card')}</span><span className="card-last-four">•••• {a.lastFour || '— — — —'}</span></div>}<button className="text-button" onClick={() => openLedger('accounts', a.id)}>{tr("View transactions ")}<ArrowRight size={14}/></button><small>{text(a.currency)}{tr(" ACCOUNT")}</small><h2>{text(money(amount, a.currency))}</h2>{text(a.type === 'Credit card' ? <><div className="credit-info"><span>{tr("Credit limit")}</span><b>{text(money(a.limit || 0, a.currency))}</b></div>{text(progress(Math.max(0, -amount), a.limit || 1))}<p>{tr("Available ")}{text(money((a.limit || 0) + Math.min(0, amount), a.currency))}{text(a.due && ` · Due ${date(a.due)}`)}</p><button className="secondary" onClick={() => setModal({ kind: 'transactions', value: { type: 'transfer', to: a.id, name: 'Credit card repayment', category: 'Other' } })}>{tr("Make a repayment ")}<ArrowUpRight size={14}/></button></> : <p><ShieldCheck size={14}/>{tr(" Manually tracked \u00B7 Always in your control")}</p>)}</article>; })}<button className="add-card" onClick={() => setModal({ kind: 'accounts', ...(view === 'Credit cards' ? { value: { type: 'Credit card' } } : {}) })}><Plus /><h3>{tr("Add an account")}</h3><p>{tr("Give every rupee a home.")}</p></button></div><div className="info-note"><ShieldCheck size={18}/><span>{tr("Accounts are tracked manually. Different currencies are kept separate; no unverified exchange rates are applied.")}</span></div></>}
 {view === 'Budgets & goals' && <>{text(sectionHeader(t.nav[7], 'Make a plan for today. Make room for tomorrow.', 'budgets'))}<div className="section-label"><h2>{tr("Monthly budgets")}</h2><span>{text(new Date(month + '-15').toLocaleDateString(t.locale, { month: 'long', year: 'numeric' }))}</span></div><div className="account-grid">{data.budgets.map((b, i) => { const used = spending.find(x => x.name === (b.category || b.name))?.value || 0; return <article className="panel item-card" key={b.id}><div className="item-top"><RecordIcon record={b} fallback={<Target size={21}/>}/><button className="icon-button" aria-label={tr('Edit ' + b.name)} onClick={() => setModal({ kind: 'budgets', value: b })}><Pencil size={15}/></button></div><h3>{b.name}</h3><h2>{text(money(used))} <small>/ {text(money(b.amount))}</small></h2>{text(progress(used, b.amount, used > b.amount ? '#be6d55' : colors[i % colors.length]))}<p>{text(used > b.amount ? 'Over budget by ' + money(used - b.amount) : money(b.amount - used) + ' left to spend')}</p></article>; })}</div><div className="section-label"><h2>{tr("Savings goals")}</h2><button className="secondary" onClick={() => setModal({ kind: 'goals' })}><Plus size={16}/>{tr("New goal")}</button></div><div className="account-grid">{data.goals.map((g, i) => <article className="panel item-card goal-card" key={g.id}><div className="item-top">{g.color || g.emoji ? <RecordIcon record={g} fallback={<Target size={21}/>}/> : <span className="goal-emoji">{text(i % 2 === 0 ? '🗻' : '🌱')}</span>}<button className="icon-button" aria-label={tr('Edit ' + g.name)} onClick={() => setModal({ kind: 'goals', value: g })}><Pencil size={15}/></button></div><h3>{g.name}</h3><h2>{text(money(g.amount))} <small>/ {text(money(g.target || 0))}</small></h2>{text(progress(g.amount, g.target || 1))}<p>{text(Math.round(g.amount / (g.target || 1) * 100))}{tr("% of the way there")}{text(g.due && ` · ${date(g.due)}`)}</p><button className="secondary" onClick={() => setModal({ kind: 'contribute', value: g })}><Plus size={14}/>{tr("Add savings")}</button></article>)}</div><p className="muted">{tr("Goal contributions track earmarked savings; they do not create income or move account balances.")}</p></>}
 {text(view === 'Shared expenses' && <>{text(sectionHeader(t.nav[5], 'One group. Every shared expense, together.', 'shared'))}<SharedGroups groups={data.shared} money={money} date={date} open={id => openLedger('shared', id)} edit={value => setModal({ kind: 'shared', value })} transaction={openSharedTransaction} settle={value => setModal({ kind: 'repayment', value: { ...value, source: 'shared' } })}/></>)}
 {view === 'Debts' && <><div className="page-heading"><div><h1>{tr("Debts & parties")}</h1><p>{tr("Open a party to see lending, borrowing and repayments.")}</p></div><button className="primary" onClick={() => setModal({ kind: 'parties' })}><Plus size={16}/>{tr("Create party")}</button></div><PartyCards data={data} money={money} open={id => openLedger('parties', id)} edit={value => setModal({ kind: 'parties', value })}/>{data.debts.length > 0 && <section className="panel report-table"><div className="panel-head"><div><h3>{tr("Existing debt records")}</h3><p>{tr("Preserved balances. New party transactions are tracked separately.")}</p></div><button className="secondary" onClick={() => setModal({ kind: 'debts' })}><Plus size={15}/>{tr("Add debt record")}</button></div>{data.debts.map(x => <div className="legacy-debt" key={x.id}>{(x.color || x.emoji) && <RecordIcon record={x} fallback={<Handshake size={17}/>}/>}<span><b>{text(x.party)} · {x.name}</b><small>{text(x.type)}{tr(" \u00B7 Outstanding ")}{text(money(x.amount - (x.paid || 0)))}</small></span><button className="secondary" onClick={() => setModal({ kind: 'repayment', value: { ...x, source: 'debts' } })}>{tr("Record repayment")}</button><button className="icon-button" aria-label={tr('Edit ' + x.name)} onClick={() => setModal({ kind: 'debts', value: x })}><Pencil size={15}/></button></div>)}</section>}</>}
 {view === 'Recurring' && <>{text(sectionHeader('Recurring bills', 'Open a bill to see its payment history.', 'recurring'))}<div className="account-grid">{data.recurring.map(x => <article className="panel item-card" key={x.id}><div className="item-top"><RecordIcon record={x} fallback={<Repeat />}/><button className="icon-button" aria-label={tr('Edit ' + x.name)} onClick={() => setModal({ kind: 'recurring', value: x })}><Pencil size={15}/></button></div><span className="badge">{text(x.type)}</span><button className="ledger-title" onClick={() => openLedger('recurring', x.id)}><h3>{x.name}</h3><ChevronRight size={18}/></button><h2>{text(money(x.amount))}</h2><p>{text(x.due && `Due ${date(x.due)}`)} · {text(data.transactions.filter(t => t.recurringId === x.id).length)}{tr(" payments")}</p><div className="ledger-actions"><button className="secondary" onClick={() => openLedger('recurring', x.id)}>{tr("View transactions")}</button><button className="secondary" onClick={() => setModal({ kind: 'transactions', value: { recurringId: x.id, name: x.name, amount: x.amount, type: 'expense', category: x.category } })}>{tr("Record payment")}</button></div></article>)}</div>{text(!data.recurring.length && <div className="panel empty">{tr("Add your first recurring bill.")}</div>)}<div className="info-note"><Bell size={18}/>{tr("Schedules are reminders. Each recorded payment creates one linked account transaction.")}</div></>}
 {view === 'Reports' && <>{text(sectionHeader(t.nav[8], 'Turn your money story into a clearer next step.', 'transactions'))}<div className="panel report-filters"><label>{tr("From")}<DateField value={dateFrom || range.start} onChange={e => setDateFrom(e.target.value)}/></label><label>{tr("To")}<DateField value={dateTo || range.end} min={dateFrom} onChange={e => setDateTo(e.target.value)}/></label><button className="secondary" onClick={exportCSV}><Download size={16}/>{tr("Download CSV")}</button><button className="secondary" onClick={() => window.print()}><Download size={16}/>{tr("Print / save PDF")}</button></div><div className="metrics report-metrics">{text([['Income', sum.income], ['Expenses', sum.expense], ['Net cash flow', sum.income - sum.expense]].map(([n, v]) => <article className="metric" key={n}><p>{text(n)}</p><h2>{text(money(Number(v)))}</h2></article>))}</div><section className="panel"><div className="panel-head"><h3>{tr("Spending by category")}</h3><span>{text(range.start)} — {text(range.end)} · {text(currency)}</span></div>{spending.map((x, i) => <div className="report-row" key={x.name}><b>{text(x.name)}</b>{text(progress(x.value, sum.expense, colors[i % colors.length]))}<strong>{text(money(x.value))}</strong><span>{text((x.value / sum.expense * 100).toFixed(1))}%</span></div>)}{text(!spending.length && <div className="empty">{tr("No expenses in this date range.")}</div>)}</section><section className="panel report-table"><div className="panel-head"><h3>{tr("Period transactions")}</h3><span>{tr("Only accounts denominated in ")}{text(currency)}</span></div>{text(txTable(tx))}</section></>}
 {['Account & sign-in', 'Profiles', 'Data & privacy'].includes(view) && <><div className="page-heading"><div><h1>{text(view)}</h1><p>{tr("A workspace that feels like you.")}</p></div></div><div className="settings-grid">{view === 'Profiles' && (<section className="panel settings-panel profile-management"><h3>{tr("Your profiles ")}<span className="count">{text(profiles.length)}/3</span></h3><p>{tr("Each profile has independent accounts, records, country and currency.")}</p>{profiles.map(x => <div className="settings-profile-row" key={x.id}><button className="settings-profile" disabled={switching} aria-label={tr('Switch to ' + x.name)} aria-pressed={x.id === profile} onClick={() => switchTo(x.id)}><ProfileAvatar profile={x}/><span><b>{x.name}</b><small>{tr(x.country)}</small></span></button><button className="icon-button" aria-label={tr('Customize ' + x.name)} onClick={() => setModal({ kind: 'profile-edit', value: x })}><Pencil size={16}/></button></div>)}<div className="profile-management-actions"><button className="secondary" onClick={() => setProfileMenu(true)}>{tr("Switch profile")}</button>{text(profiles.length < 3 && <button className="secondary" onClick={() => setModal({ kind: 'profile' })}><Plus size={16}/>{tr("Create profile")}</button>)}</div></section>)}{(view === 'Account & sign-in' || view === 'Profiles') && (<AccountSettings key={profile} user={user} profile={profile} profileName={p?.name || 'profile'} reload={() => load()}/>)}{view === 'Data & privacy' && (<section className="panel settings-panel"><h3>{tr("Data & privacy")}</h3><p>{tr("Your records are stored in a relational database and scoped to your authenticated identity and selected profile.")}</p><button className="secondary" onClick={exportCSV}><Download size={16}/>{tr("Export this period")}</button><BackupTools data={data} onImport={async (value) => { await mutate('backup', { data: value }, 'import'); }}/><p>{tr("Signed in as ")}{user.email}</p><button className="text-button" onClick={async () => { await fetch('/logout', { method: 'POST' }); window.location.assign('/login'); }}><LogOut size={16}/>{tr("Sign out")}</button></section>)}</div></>}

 </>, true)}
 </main>
 </div>
 <nav className="bottom-nav" aria-label={tr("Main navigation")}>{text([0, 1].map(i => { const Icon = icons[i]; return <button key={i} aria-current={view === navKeys[i] ? 'page' : undefined} className={view === navKeys[i] ? 'active' : ''} onClick={() => go(navKeys[i])}><Icon size={20}/><span>{text(t.nav[i])}</span></button>; }))}<button className="nav-add-transaction" aria-label={tr("Add transaction")} onClick={() => setModal({ kind: 'transactions' })}><span className="nav-add-icon"><Plus size={25}/></span></button><button aria-current={view === 'Finance' ? 'page' : undefined} className={view === 'Finance' || [2, 3, 4, 5, 6, 7].some(i => view === navKeys[i]) ? 'active' : ''} onClick={() => go('Finance')}><Wallet size={20}/><span>{tr("Finance")}</span></button><button aria-label={tr("Settings")} aria-current={view === 'Settings' ? 'page' : undefined} className={['Settings', 'Account & sign-in', 'Data & privacy', 'Profiles', 'Categories', 'Payment methods', 'Reports', 'Language & theme', 'About'].includes(view) ? 'active' : ''} onClick={() => go('Settings')}><Settings size={21}/><span>{tr("Settings")}</span></button></nav>
 {text(notice && <div className="toast" role="status"><CheckCircle2 size={18}/>{text(notice, true)}<button onClick={() => setNotice('')} aria-label={tr("Dismiss")}><X size={15}/></button></div>, true)}
 {text(error && <div className="toast error" role="alert">{text(error, true)}<button onClick={() => load(profile)}>{tr("Retry")}</button></div>, true)}
 {text(profileMenu && <ProfileSwitcher profiles={profiles} active={profile} busy={switching} onChoose={switchTo} onEdit={value => { setProfileMenu(false); setModal({ kind: 'profile-edit', value }); }} onCreate={() => { setProfileMenu(false); setModal({ kind: 'profile' }); }} close={() => setProfileMenu(false)} onAccount={() => { setProfileMenu(false); go('Profiles'); }} onSignOut={async () => { setProfileMenu(false); await fetch('/logout', { method: 'POST' }); window.location.assign('/login'); }}/>)}{text(profileDialog)}{text(modal && !['profile', 'profile-edit'].includes(modal.kind) && (modal.kind === 'shared-transaction' ? <SharedTransactionEditor group={modal.value} entry={modal.entry} currency={currency} busy={busy} serverError={saveError} close={() => setModal(null)} save={mutate} money={money}/> : modal.kind === 'shared' ? <SharedGroupEditor value={modal.value} busy={busy} serverError={saveError} close={() => setModal(null)} save={mutate} money={money}/> : <Editor modal={modal} countryName={p?.country || 'India'} profile={profile} data={data} currency={currency} busy={busy} serverError={saveError} close={() => setModal(null)} save={mutate} money={money}/>), true)}
 </div>;
}
function Editor({ modal, profile, data, currency, countryName, busy, serverError, close, save, money }: {
    countryName: string;
    serverError: string;
    profile: string;
    modal: NonNullable<Modal>;
    data: Data;
    currency: string;
    busy: boolean;
    close: () => void;
    save: (k: string, v: any, a?: string) => Promise<boolean>;
    money: (n: number) => string;
}) {
    const { tr, text, confirmAction } = useI18n();
    const [accountType, setAccountType] = useState(modal.value?.type || 'Bank account');
    const [color, setColor] = useState<string>(modal.value?.color || ''), [emoji, setEmoji] = useState<string>(modal.value?.emoji || '');
    const look = { color: color || undefined, emoji: emoji || undefined };
    const [history, setHistory] = useState<any[] | null>(null);
    const { kind, value } = modal;
    const [type, setType] = useState(value?.type || 'expense'), [formError, setFormError] = useState(''), [country, setCountry] = useState(value?.country || countryForCurrency(value?.currency || currency, countryName)), [cur, setCur] = useState(value?.currency || data.accounts.find(a => a.id === value?.account)?.currency || (kind === 'transactions' ? data.accounts[0]?.currency : currency) || currency);
    useEffect(() => {
        const el = document.querySelector<HTMLDivElement>('.modal');
        const previous = document.activeElement as HTMLElement;
        el?.querySelector<HTMLInputElement>('input')?.focus();
        const trap = (e: KeyboardEvent) => {
            if (e.key !== 'Tab' || !el)
                return;
            const items = Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href]'));
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        };
        document.addEventListener('keydown', trap);
        return () => { document.removeEventListener('keydown', trap); previous?.focus({ preventScroll: true }); };
    }, []);
    const [linkKind, setLinkKind] = useState(value?.partyId ? 'party' : value?.sharedGroupId ? 'shared' : value?.recurringId ? 'recurring' : 'none'), [linkId, setLinkId] = useState(value?.partyId || value?.sharedGroupId || value?.recurringId || ''), [debtAction, setDebtAction] = useState(value?.debtAction || 'lend');
    const selectedGroup = data.shared.find(g => g.id === linkId), memberNames = selectedGroup ? groupMembers(selectedGroup) : [];
    const [fromId, setFromId] = useState(value?.account || data.accounts[0]?.id || ''), [toId, setToId] = useState(value?.to || data.accounts[0]?.id || '');
    const minor = (s: FormDataEntryValue | null, c = cur) => parseMoney(String(s || '0'), c);
    const editorCategories = [...new Set([...(data.categories || []).map(c => c.name), ...(value?.category ? [value.category] : []), ...(value?.splits?.map((s: any) => s.category) || [])])];
    const fromAccount = data.accounts.find(a => a.id === fromId);
    const methodCountry = fromAccount?.country || countryForCurrency(fromAccount?.currency || currency, countryName);
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setFormError('');
        const f = new FormData(e.currentTarget), str = (n: string) => String(f.get(n) || '');
        try {
            if (kind === 'profile') {
                await save('profile', { name: str('name'), country, currency: cur }, 'profile');
                return;
            }
            if (kind === 'contribute') {
                await save('goals', { ...value, amount: value.amount + minor(f.get('amount')) });
                return;
            }
            if (kind === 'repayment') {
                const amount = minor(f.get('amount'));
                if (amount <= 0 || amount > value.amount - (value.paid || 0))
                    throw Error('Enter an amount up to the outstanding balance.');
                const { source, ...rest } = value;
                await save(source, { ...rest, paid: (value.paid || 0) + amount });
                return;
            }
            let v: any = { id: value?.id, name: str('name') };
            if (kind === 'parties') {
                await save(kind, { ...v, notes: str('notes'), ...look });
                return;
            }
            if (kind === 'accounts')
                v = { ...v, type: accountType, country, currency: cur, opening: minor(f.get('opening')), ...look, ...(accountType === 'Credit card' ? { limit: minor(f.get('limit')), due: str('due'), cardType: str('cardType'), lastFour: str('lastFour') || undefined } : {}) };
            else if (kind === 'transactions') {
                v = { ...v, type, amount: minor(f.get('amount')), account: str('account'), to: type === 'transfer' ? str('to') : undefined, received: type === 'transfer' && str('received') ? minor(f.get('received'), data.accounts.find(a => a.id === str('to'))?.currency || cur) : undefined, date: str('date'), category: str('category') || 'Other', notes: str('notes'), tags: str('tags'), paymentMethod: str('paymentMethod') || undefined, paymentMethodName: value?.paymentMethodName, partyId: linkKind === 'party' ? linkId : undefined, debtAction: linkKind === 'party' ? debtAction : undefined, sharedGroupId: linkKind === 'shared' ? linkId : undefined, recurringId: linkKind === 'recurring' ? linkId : undefined, paidBy: linkKind === 'shared' ? str('paidBy') : undefined, participants: linkKind === 'shared' ? f.getAll('participants').map(String) : undefined };
                // Category splitting was removed from the transaction editor. Keep
                // legacy split data readable, but never create new split records.
                delete v.splits;
            }
            else
                v = { ...v, amount: minor(f.get('amount')), target: kind === 'goals' ? minor(f.get('target')) : undefined, category: str('category'), due: str('due'), party: str('party'), members: kind === 'shared' ? Number(str('members')) : undefined, type: kind === 'debts' ? str('debtType') : kind === 'recurring' ? str('frequency') : undefined, paid: value?.paid || 0, ...look };
            await save(kind, v);
        }
        catch (e) {
            setFormError((e as Error).message);
        }
    }
    const title = kind === 'profile' ? tr('Create a profile') : kind === 'repayment' ? tr('Record repayment') : kind === 'contribute' ? tr('Add savings') : tr(value?.id?'Edit {0}':'Add {0}',tr(({transactions:'transaction',accounts:'account',budgets:'budget',goals:'savings goal',debts:'debt',parties:'party',shared:'shared expense',recurring:'recurring payment'} as Record<string,string>)[kind]||'transaction'));
    const amount = (name = 'amount', label = 'Amount', initial = value?.amount) => { const c = name === 'received' ? (data.accounts.find(a => a.id === toId)?.currency || cur) : cur; return <label>{text(label)}<div className="money-input"><span>{text(c)}</span><input key={name + c} name={name} type="number" min={name === 'opening' ? -maxAmountMajor : 1 / currencyScale(c)} max={maxAmountMajor} step={1 / currencyScale(c)} required={name !== 'received'} defaultValue={initial === undefined ? '' : initial / currencyScale(c)} placeholder={tr(c === 'BHD' ? '0.000' : '0.00')}/></div></label>; };
    const category = (name = 'category', initial = value?.category) => <ThemedSelect name={name} defaultValue={initial || editorCategories[0] || 'Other'} aria-label={tr("Category")} required>{text([...new Set([...editorCategories, 'Other'])].map(c => <option key={c} value={c}>{c}</option>))}</ThemedSelect>;
    const accountSelect = (name: string, initial?: string) => <ThemedSelect name={name} value={name === 'to' ? toId : fromId} onChange={e => {
            if (name === 'to')
                setToId(e.target.value);
            else {
                setFromId(e.target.value);
                setCur(data.accounts.find(a => a.id === e.target.value)?.currency || currency);
            }
        }} required aria-label={tr(name === 'to' ? 'Destination account' : 'Account')}><option value="">{tr("Choose account")}</option>{data.accounts.filter(a => kind !== 'transactions' || !['shared', 'recurring'].includes(linkKind) || a.currency === currency).map(a => <option key={a.id} value={a.id}>{emojiLabel(a)} · {text(a.type)}{a.type === 'Credit card' && <> · •••• {a.lastFour || '— — — —'}</>}</option>)}</ThemedSelect>;
    return <div className="modal-backdrop" onMouseDown={e => {
            if (e.target === e.currentTarget)
                close();
        }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><span className="eyebrow">{tr("A LITTLE MORE CLARITY")}</span><h2 id="modal-title">{text(title)}</h2></div><button className="icon-button" aria-label={tr("Close dialog")} onClick={close}><X size={21}/></button></div><ValidatedForm onSubmit={submit}>
 {kind === 'transactions' && <><label>{tr("Transaction for")}<ThemedSelect aria-label={tr("Transaction for")} value={linkKind} onChange={e => {
                setLinkKind(e.target.value);
                setLinkId('');
                setDebtAction('lend');
                setType('expense');
                if (['shared', 'recurring'].includes(e.target.value)) {
                    const a = data.accounts.find(a => a.currency === currency);
                    setFromId(a?.id || '');
                    setCur(currency);
                }
            }}><option value="none">Everyday income / expense / transfer</option><option value="party">Debt party · lending / borrowing / repayment</option><option value="shared">Shared expense group</option><option value="recurring">Recurring bill payment</option></ThemedSelect></label>{linkKind !== 'none' && <div className="transaction-link-fields"><label>{text(linkKind === 'party' ? 'Debt party' : linkKind === 'shared' ? 'Shared group' : 'Recurring bill')}<ThemedSelect aria-label={tr(linkKind === 'party' ? 'Debt party' : linkKind === 'shared' ? 'Shared group' : 'Recurring bill')} required value={linkId} onChange={e => setLinkId(e.target.value)}><option value="">Choose {linkKind === 'party' ? 'party' : linkKind === 'shared' ? 'group' : 'bill'}</option>{(linkKind === 'party' ? data.parties || [] : linkKind === 'shared' ? data.shared : data.recurring).map(r => <option key={r.id} value={r.id}>{emojiLabel(r)}</option>)}</ThemedSelect></label>{text(!(linkKind === 'party' ? data.parties?.length : linkKind === 'shared' ? data.shared.length : data.recurring.length) && <p className="form-help">{tr("Create a ")}{text(linkKind === 'party' ? 'party in Debts' : linkKind === 'shared' ? 'shared group' : 'recurring bill')}{tr(" first, then record its transactions here.")}</p>)}{text(linkKind === 'party' && <><label>{tr("Debt movement")}<ThemedSelect aria-label={tr("Debt movement")} value={debtAction} onChange={e => { setDebtAction(e.target.value); setType(['borrow', 'collect'].includes(e.target.value) ? 'income' : 'expense'); }}><option value="lend">Lend money · money out</option><option value="borrow">Borrow money · money in</option><option value="collect">Receive repayment · money in</option><option value="repay">Repay borrowing · money out</option></ThemedSelect></label><p className="form-help">{tr("Changes the account balance without counting as income or spending.")}</p></>)}{linkKind === 'shared' && selectedGroup && <div key={linkId}><label>{tr("Paid by")}<ThemedSelect name="paidBy" defaultValue={value?.paidBy || memberNames[0]} required>{text(memberNames.map(n => <option key={n}>{n}</option>))}</ThemedSelect></label><fieldset className="split-members"><legend>{tr("Split between")}</legend>{text(memberNames.map(n => <label className="checkbox" key={n}><input name="participants" value={n} type="checkbox" defaultChecked={!value?.participants || value.participants.includes(n)}/>{text(n)}</label>))}</fieldset><p className="form-help">{tr("The expense appears once in your account and updates this group\u2019s member splits.")}</p></div>}</div>}{text(linkKind === 'none' && <div className="tabs form-tabs">{text(['expense', 'income', 'transfer'].map(x => <button type="button" className={type === x ? 'selected' : ''} onClick={() => setType(x)} key={x}>{text(x[0].toUpperCase() + x.slice(1))}</button>))}</div>)}</>}
 {!['repayment', 'contribute'].includes(kind) && <label>{text(kind === 'profile' ? 'Profile name' : 'Name / description')}<input required name="name" maxLength={kind === 'profile' ? 60 : 50} placeholder={tr(kind === 'transactions' ? 'What was it for?' : 'Give it a name')} defaultValue={value?.name}/></label>}
 {['accounts', 'parties', 'budgets', 'goals', 'debts', 'recurring'].includes(kind) && <AppearancePicker color={color} emoji={emoji} onColor={setColor} onEmoji={setEmoji}/>}
 {kind === 'profile' ? <><label>{tr("Country")}<ThemedSelect required value={country} onChange={e => { setCountry(e.target.value); setCur(({ India: 'INR', 'Saudi Arabia': 'SAR', 'United States': 'USD', Germany: 'EUR', 'United Arab Emirates': 'AED', 'United Kingdom': 'GBP' } as any)[e.target.value]); }}>{text(countries.map(c => <option key={c}>{c}</option>))}</ThemedSelect></label><p className="form-help">{tr("A fresh, independent workspace. You can create up to three profiles.")}</p></> : kind === 'accounts' ? <><div className="form-grid"><label>{tr("Country")}<ThemedSelect required value={country} onChange={e => { setCountry(e.target.value); setCur(countryCurrencies[e.target.value]); }}>{text(countries.map(c => <option key={c}>{c}</option>))}</ThemedSelect></label><label>{tr("Account type")}<ThemedSelect required name="accountType" value={accountType} onChange={e => setAccountType(e.target.value)}>{text(['Bank account', 'Savings', 'Cash', 'Wallet', 'Digital Wallet', 'Credit card'].map(c => <option key={c}>{c}</option>))}</ThemedSelect></label></div>{text(amount('opening', 'Opening balance', value?.opening || 0))}{accountType === 'Credit card' && <><p className="form-help">{tr("Enter an outstanding opening balance as a negative amount.")}</p><div className="credit-fields"><h3>{tr("Credit card details")}</h3>{text(amount('limit', 'Credit card limit', value?.limit))}<label>{tr("Payment due date")}<DateField name="due" defaultValue={value?.due}/></label><div className="form-grid"><label>{tr("Card type")}<ThemedSelect name="cardType" defaultValue={value?.cardType || 'Visa'}>{text(cardTypes.map(type => <option key={type}>{type}</option>))}</ThemedSelect></label><label>{tr("Last 4 digits")}<input name="lastFour" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} minLength={4} placeholder="1234" defaultValue={value?.lastFour}/></label></div><p className="form-help">{tr("Only the last four digits are stored for reference.")}</p></div></>}</> : <>
 {['contribute', 'repayment'].includes(kind) && <p className="form-help">{value.name}{text(kind === 'repayment' ? ` · Outstanding ${money(value.amount - (value.paid || 0))}` : '')}</p>}{text(kind !== 'parties' && amount())}
 {kind === 'transactions' ? <><div className="form-grid"><label>{tr("From / account")}{text(accountSelect('account', value?.account))}</label><label>{tr("Date")}<DateField name="date" required defaultValue={value?.date || new Date().toISOString().slice(0, 10)}/></label></div>{text(type === 'transfer' ? <><label>{tr("To account")}{text(accountSelect('to', value?.to))}</label>{text(amount('received', 'Amount received (required across currencies)', value?.received))}<p className="form-help">{tr("Transfers and card repayments don\u2019t count as income or expenses. Enter the exact received amount for cross-currency transfers.")}</p></> : <label>{tr("Category")}{text(category())}</label>)}<label>{tr("Payment method")}<ThemedSelect name="paymentMethod" defaultValue={value?.paymentMethod || ''}><option value="">Not specified</option>{(data.paymentMethods || []).filter(m => (m.country === methodCountry && m.enabled) || m.id === value?.paymentMethod).map(m => <option key={m.id} value={m.id}>{m.name}{!m.enabled ? ' (disabled)' : ''}</option>)}{text(value?.paymentMethod && !(data.paymentMethods || []).some(m => m.id === value.paymentMethod) && <option value={value.paymentMethod}>{value.paymentMethodName || 'Previous method'} (removed)</option>)}</ThemedSelect></label><label>{tr("Tags")}<input name="tags" defaultValue={value?.tags} placeholder={tr("e.g. personal, weekend")} maxLength={100}/></label><label>{tr("Notes")}<textarea name="notes" defaultValue={value?.notes} maxLength={2000} placeholder={tr("Anything you\u2019d like to remember\u2026")}/></label></> : !['contribute', 'repayment'].includes(kind) && <>{text(kind === 'goals' && amount('target', 'Target amount', value?.target))}{text(['budgets', 'recurring'].includes(kind) && <label>{tr("Category")}{text(category())}</label>)}{text(kind === 'debts' && <label>{tr("Direction")}<ThemedSelect name="debtType" defaultValue={value?.type || 'Lent'}><option>Lent</option><option>Borrowed</option></ThemedSelect></label>)}{text(['debts', 'shared'].includes(kind) && <label>{text(kind === 'debts' ? 'Person' : 'People (comma separated)')}<input name="party" defaultValue={value?.party} required maxLength={120}/></label>)}{text(kind === 'shared' && <label>{tr("Number of people")}<input name="members" type="number" min="2" max="100" required defaultValue={value?.members || 2}/></label>)}{text(kind === 'recurring' && <label>{tr("Frequency")}<ThemedSelect name="frequency" defaultValue={value?.type || 'Monthly'}><option>Monthly</option><option>Weekly</option><option>Yearly</option></ThemedSelect></label>)}{kind === 'parties' && <label>{tr("Notes")}<textarea name="notes" maxLength={1000} defaultValue={value?.notes}/></label>}{text(!['budgets', 'parties'].includes(kind) && <label>{tr("Due / target date")}<DateField name="due" defaultValue={value?.due}/></label>)}</>}
 </>}
 {text(value?.id && <><button type="button" className="text-button" onClick={async () => {
                try {
                    const x = await financeRequest(`/api/finance?profile=${profile}&history=${value.id}`);
                    setHistory(x.history || []);
                }
                catch (e) {
                    setFormError((e as Error).message);
                }
            }}>{tr("View change history")}</button>{history && <div className="history-list">{history.length ? history.map((x, i) => <p key={i}>{text(x.action)} · {text(new Date(x.created).toLocaleString())}<small>{x.after && JSON.parse(x.after).name}</small></p>) : <p>{tr("No changes recorded yet. Sample records start without history.")}</p>}</div>}</>, true)}{text((formError || serverError) && <p className="field-error" role="alert">{text(formError || serverError, true)}</p>, true)}<div className="modal-footer">{text(value?.id && !['repayment', 'contribute'].includes(kind) && <button type="button" className="danger icon-button" aria-label={tr("Delete record")} disabled={busy} onClick={async () => {
                if (await confirmAction('Delete this record? This cannot be undone.'))
                    save(kind, value, 'delete');
            }}><Trash2 size={18}/></button>)}<button type="button" className="secondary" onClick={close}>{tr("Cancel")}</button><button className="primary" disabled={busy || kind === 'profile' && false}>{text(busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>)} {text(busy ? 'Saving…' : 'Save ' + (kind === 'profile' ? 'profile' : kind === 'transactions' ? 'transaction' : 'changes'))}</button></div>
 </ValidatedForm></div></div>;
}
function BackupTools({ data, onImport }: {
    data: Data;
    onImport: (data: Data) => Promise<void>;
}) {
    const { tr, text, confirmAction } = useI18n();
    const [pending, setPending] = useState<Data | null>(null), [error, setError] = useState('');
    function download() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, data }, null, 2)], { type: 'application/json' })); a.download = 'twmg-backup.json'; a.click(); URL.revokeObjectURL(a.href); }
    return <div className="backup-tools"><button className="secondary" onClick={download}><Download size={15}/>{tr("Full JSON backup")}</button><label className="import-label">{tr("Import a TWMG backup")}<input type="file" accept=".json,application/json" onChange={async (e) => {
            setError('');
            setPending(null);
            try {
                const file = e.target.files?.[0];
                if (!file)
                    return;
                if (file.size > 180000)
                    throw Error('Choose a backup under 180 KB.');
                const x = JSON.parse(await file.text());
                if (x.version !== 1 || !x.data || !Array.isArray(x.data.accounts))
                    throw Error('Choose a TWMG version 1 backup.');
                setPending(x.data);
            }
            catch (e) {
                setError((e as Error).message);
            }
        }}/></label>{text(pending && <div className="import-preview"><p>{text(pending.accounts.length)}{tr(" accounts \u00B7 ")}{text(pending.transactions?.length || 0)}{tr(" transactions. Imports append copies to this profile and may create duplicates. Maximum 200 records.")}</p><button className="secondary" onClick={async () => { await onImport(pending); setPending(null); }}>{tr("Import these records")}</button><button className="text-button" onClick={() => setPending(null)}>{tr("Cancel")}</button></div>)}{text(error && <p className="field-error">{text(error, true)}</p>, true)}</div>;
}

