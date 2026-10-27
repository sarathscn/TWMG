'use client';
import { useI18n, ValidatedForm } from './UIProvider';
import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { Compass, LayoutDashboard, ArrowLeftRight, Wallet, CreditCard, Handshake, Users, Repeat, Target, ChartNoAxesCombined, Settings, ChevronDown, ChevronLeft, ChevronRight, Plus, ArrowUpRight, ArrowDownLeft, ArrowRight, Bell, Search, Sun, Moon, PanelLeftClose, Globe, Download, X, Check, MoreHorizontal, Utensils, ShoppingBag, Car, House, Clapperboard, Briefcase, TrendingUp, Sparkles, Plane, ShieldCheck, LogOut, Menu, LoaderCircle, SlidersHorizontal, CheckCircle2, UserRound, Info } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { balance, totals, partyBalance, categories, cashLikeTypes, isCashMethod, nonNegativeTypes, accountReference, validateTransaction, overdrawn, applyFilters, activeFilters, accountActivity, categoryAmount, type Data, type Account, type Transaction, type Profile, type Item, type TxFilters } from '../../lib/finance';
import { colorMaps, incomeColor, expenseColor } from '../../lib/colors';
import { reminders, type Reminder } from '../../lib/reminders';
import { languages, navKeys } from '../../lib/i18n';
import { financeRequest } from '../../lib/api-client';
import { cardColors, cardTypes, readableOn } from '../../lib/card-options';
import { ThemedSelect, DateField, DashboardCalendar, type CalendarMarker } from './Controls';
import { ProfileAvatar, ProfileSwitcher, ProfileEditor, LoginScreen } from './Profiles';
import { CatalogManager, AccountSettings } from './Preferences';
import { countries, countryCurrencies, countryForCurrency, currencyScale, fractionDigits, maxAmountMajor, parseMoney } from '../../lib/countries';
import { LedgerPage, PartyCards, type Ledger } from './Ledgers';
import { groupMembers, sharedEntries, sharedTotal } from '../../lib/finance';
import { SharedGroups, SharedGroupEditor, SharedTransactionEditor, SharedSplitFields } from './SharedGroups';
import { AppearancePicker, RecordIcon, emojiLabel } from './RecordAppearance';
import { Swipeable } from './Swipeable';
import { WelcomeScreen, GuidedTour, CompletionScreen, loadGuide, saveGuide, type TourStep } from './Onboarding';
import { SetupChecklist } from './SetupChecklist';
import { DeviceSettings, PasskeyManager, PanelBoundary, callNative, isAndroidApp } from './DeviceSecurity';
import { SyncIndicator, AndroidVersionPanel, type SyncState } from './AndroidApp';
import { applyOps, applyChanges, loadDecision, sinceFor, offlineAllowed, readSnapshot, writeSnapshot, clearSnapshot, lastUser, isOfflineKind, type SyncOp, type OfflineKind } from '../../lib/offline-sync';
import { validateLinks } from '../../lib/transaction-links';
// Pages a link or notification may open directly with ?view=…
const linkableViews = ['Overview', 'Transactions', 'Finance', 'Settings', 'Accounts', 'Credit cards', 'Debts', 'Shared expenses', 'Recurring', 'Budgets & goals', 'Reports', 'Profiles', 'Categories', 'Payment methods'];
const icons = [LayoutDashboard, ArrowLeftRight, Wallet, CreditCard, Handshake, Users, Repeat, Target, ChartNoAxesCombined, Settings];
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
    const [signedOut, setSignedOut] = useState(false), [chooser, setChooser] = useState(true), [switching, setSwitching] = useState(false), [view, setView] = useState('Overview'), [dark, setDark] = useState(false), [textSize, setTextSize] = useState<'small' | 'medium' | 'large'>('medium'), [collapsed, setCollapsed] = useState(false), [mobile, setMobile] = useState(false), [modal, setModal] = useState<Modal>(null), [notice, setNotice] = useState(''), [saveError, setSaveError] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [filters, setFilters] = useState<TxFilters>({}), [filtersOpen, setFiltersOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 700), [accountMode, setAccountMode] = useState<'spending' | 'balance'>('spending'), [period, setPeriod] = useState('Month'), [month, setMonth] = useState(new Date().toISOString().slice(0, 7)), [notifications, setNotifications] = useState(false), [profileMenu, setProfileMenu] = useState(false), [dateFrom, setDateFrom] = useState(''), [dateTo, setDateTo] = useState('');
    const t = languages[lang], p = profiles.find(x => x.id === profile), currency = p?.currency || 'INR';
    const numberLocale = (c: string) => c !== 'INR' && t.locale === 'en-IN' ? 'en-GB' : t.locale;
    const money = (n: number, c = currency) => new Intl.NumberFormat(numberLocale(c), { style: 'currency', currency: c, maximumFractionDigits: fractionDigits(c), minimumFractionDigits: c === "BHD" ? 3 : n % currencyScale(c) ? fractionDigits(c) : 0 }).format(n / currencyScale(c));
    // Short form for tight spots (donut centre, chart axis): "BHD 1B", "₹10 Cr". The full amount stays in the tooltip.
    const compactMoney = (n: number, c = currency) => new Intl.NumberFormat(numberLocale(c), { style: 'currency', currency: c, notation: 'compact', maximumFractionDigits: 2 }).format(n / currencyScale(c));
    const compactNumber = (v: number) => new Intl.NumberFormat(numberLocale(currency), { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    // An amount that always stays on one line and shrinks to fit its card (see .fit-amount).
    const fit = (value: string, full = value) => <span className="fit-amount" style={{ '--len': value.length } as React.CSSProperties} title={full}>{value}</span>;
    // Cards: the full amount, swapped for the short form when the card is narrow and the amount long.
    const cardMoney = (n: number, c = currency) => { const full = money(n, c); return full.length <= 13 ? fit(full) : <><span className="fit-amount fit-full" style={{ '--len': full.length } as React.CSSProperties} title={full}>{full}</span><span className="fit-amount fit-short" style={{ '--len': compactMoney(n, c).length } as React.CSSProperties} title={full}>{compactMoney(n, c)}</span></>; };
    const fitMoney = (n: number, c = currency, max = 14) => { const full = money(n, c); return full.length > max ? fit(compactMoney(n, c), full) : fit(full); };
    const date = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString(t.locale, { day: 'numeric', month: 'short' });
    // ---- Android app: local-first data (lib/offline-sync.ts, SyncQueue.kt) ----
    // The screen shows the last downloaded data plus queued changes, so it opens and saves instantly;
    // the native queue uploads in the background and fresh server data is merged in when it arrives.
    // The website keeps working directly online.
    const [localFirst, setLocalFirst] = useState(false), [ops, setOps] = useState<SyncOp[]>([]), [sync, setSync] = useState<SyncState>({ state: 'idle', pending: 0, failed: 0 }), [online, setOnline] = useState(true);
    const serverData = useRef<Data | null>(null), serverVersion = useRef<string | null>(null), serverProfile = useRef(''), userId = useRef(''), wasSyncing = useRef(false);
    // Changes already uploaded but not yet in the downloaded copy: still shown, so nothing flickers
    // away between an upload finishing and the refresh arriving. Cleared by every successful load.
    const queued = useRef<SyncOp[]>([]), landed = useRef<SyncOp[]>([]), dropped = useRef(new Set<string>());
    // The profile the user is on, and the order of downloads (see loadDecision).
    const wantProfile = useRef(''), loadSeq = useRef(0), appliedSeq = useRef(0);
    const readOps = (u: string): SyncOp[] => { try { const v = JSON.parse(String(callNative('queueList', u) || '[]')); return Array.isArray(v) ? v : []; } catch { return []; } };
    function showLocal() {
        const list = userId.current ? readOps(userId.current) : [];
        landed.current = [...landed.current, ...queued.current.filter(o => !list.some(x => x.opId === o.opId) && !dropped.current.has(o.opId) && !landed.current.some(x => x.opId === o.opId))];
        queued.current = list; setOps(list);
        if (serverData.current) setData(applyOps(serverData.current, [...landed.current, ...list], serverProfile.current));
    }
    async function load(id?: string, incremental = false): Promise<boolean> {
        const lf = isAndroidApp(), seq = ++loadSeq.current;
        try {
            setError('');
            // Only what changed since the last download, when we already hold this profile's data.
            const since = lf && incremental && id && serverData.current && serverProfile.current === id ? sinceFor(serverVersion.current) : null;
            const x = await financeRequest('/api/finance' + (id ? '?profile=' + encodeURIComponent(id) : '') + (since ? '&since=' + encodeURIComponent(since) : ''));
            if (lf) {
                const decision = loadDecision({ seq, appliedSeq: appliedSeq.current, wanted: wantProfile.current, got: x.profile, incremental: !!x.changes, baseProfile: serverProfile.current });
                if (decision === 'stale') return true;
                if (decision === 'full') return load(x.profile, false);
                appliedSeq.current = seq; wantProfile.current = x.profile;
            }
            setSignedOut(false);
            if (lf) {
                const server: Data = x.changes ? applyChanges(serverData.current!, x.changes) : x.data;
                const previous = lastUser();
                if (previous && previous !== x.user.id) clearSnapshot(previous);
                userId.current = x.user.id; serverData.current = server; serverVersion.current = x.version || null; serverProfile.current = x.profile; landed.current = [];
                writeSnapshot({ user: x.user, profiles: x.profiles, profile: x.profile, data: server, version: x.version || null, verifiedAt: Date.now() });
                callNative('setSyncUser', x.user.id);
                setOnline(true);
                showLocal();
            }
            else
                setData(x.data);
            setProfiles(x.profiles);
            const remembered = localStorage.getItem('twmg-profile');
            const selected = lf ? x.profile : !data && !id && x.profiles.some((p: Profile) => p.id === remembered) ? remembered : x.profile;
            setProfile(selected);
            localStorage.setItem('twmg-profile', selected);
            setUser(x.user);
            return true;
        }
        catch (e) {
            if ((e as {
                status?: number;
            }).status === 401) {
                // The server no longer accepts this session: cached data is not shown to anyone signed out.
                // Queued changes stay on the device and upload after the same account signs in again.
                if (lf) { clearSnapshot(userId.current || lastUser()); serverData.current = null; }
                setSignedOut(true);
                setError('');
            }
            else if (lf && !(e as { status?: number }).status && serverData.current) {
                // No connection: keep working from the device copy.
                setOnline(false);
                return false;
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
    // Open the page a link or notification asked for (?view=Recurring), once data has loaded.
    const [linkedView] = useState(() => { if (typeof window === 'undefined') return ''; const v = new URLSearchParams(window.location.search).get('view') || ''; return linkableViews.includes(v) ? v : ''; });
    const [linkHandled, setLinkHandled] = useState(false);
    useEffect(() => { if (!linkedView || linkHandled || !data || signedOut) return; setLinkHandled(true); setChooser(false); go(linkedView); window.history.replaceState(window.history.state, '', window.location.pathname); }, [data, signedOut]);
    // Inside the Android app, every data change (a bill paid, a due date moved) re-syncs reminders
    // from /api/reminders, so completed items stop notifying straight away.
    useEffect(() => { if (data && !signedOut) callNative('syncReminders', lang); }, [data, signedOut, lang]);
    // Android app: open straight from the device copy when this device still holds the session,
    // then refresh in the background. First sign-in on a device downloads once.
    function start() {
        if (!isAndroidApp()) { load(); return; }
        setLocalFirst(true);
        // Offline app shell (production only: in development it would cache code that is still changing).
        if (process.env.NODE_ENV === 'production') navigator.serviceWorker?.register('/sw.js').catch(() => { /* offline shell is optional */ });
        const u = lastUser(), snap = u ? readSnapshot(u) : null;
        if (snap && offlineAllowed(snap, callNative('hasSession') === true)) {
            userId.current = u; serverData.current = snap.data; serverVersion.current = snap.version; serverProfile.current = snap.profile; wantProfile.current = snap.profile;
            setUser(snap.user); setProfiles(snap.profiles as Profile[]); setProfile(snap.profile); setChooser(false); showLocal();
            try { setSync(JSON.parse(String(callNative('syncStatus') || '{}'))); } catch { /* status arrives with the next event */ }
            load(snap.profile, true);
            return;
        }
        const remembered = localStorage.getItem('twmg-profile') || undefined;
        wantProfile.current = remembered || '';
        load(remembered).then(ok => { if (ok && remembered) setChooser(false); else if (!ok && remembered) { wantProfile.current = ''; load(); } });
    }
    useEffect(() => { start(); setDark(localStorage.getItem('twmg-theme') === 'dark'); const stored = localStorage.getItem('twmg-text-size'); if (stored === 'small' || stored === 'medium' || stored === 'large') setTextSize(stored); }, []);

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
            setFilters(next.filters || {});
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
        if (localFirst && isOfflineKind(kind) && (action === 'save' || action === 'delete') && userId.current && serverData.current && data)
            return saveLocal(kind, value, action);
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
            setSaveError(!(e as { status?: number }).status && localFirst ? 'You are offline. This needs an internet connection.' : (e as Error).message);
            return false;
        }
        finally {
            setBusy(false);
        }
    }
    // Saves on the device first (shown at once) and queues the upload. The same rules the server
    // enforces are checked here, so a change that would be refused is refused straight away.
    function saveLocal(kind: OfflineKind, value: any, action: 'save' | 'delete') {
        setSaveError('');
        try {
            // A change always belongs to the profile whose data is on screen (its accounts, parties…).
            if (serverProfile.current !== profile || wantProfile.current !== profile) throw Error('Your profile is still loading. Try again in a moment.');
            const current = data!, id = String(value?.id || crypto.randomUUID()), record = { ...value, id };
            if (kind === 'transactions') {
                const prior = current.transactions.find(x => x.id === id);
                if (action === 'save') { if (record.type !== 'transfer') { delete record.to; delete record.received; } validateTransaction(record, current.accounts); validateLinks(record, current, currency); }
                const after = action === 'delete' ? current.transactions.filter(x => x.id !== id) : [...current.transactions.filter(x => x.id !== id), record];
                const over = overdrawn(current.accounts, current.transactions, after, [record.account, record.to, prior?.account, prior?.to]);
                if (over.length) throw Error(`${action === 'delete' ? 'Deleting this would take' : 'This would take'} ${over[0].name} below zero. Cash and wallet balances can't be negative.`);
            }
            if (action === 'delete' && kind === 'accounts' && current.transactions.some(t => t.account === id || t.to === id)) throw Error('This account has transaction history. Remove its transactions first.');
            if (action === 'delete' && ['parties', 'shared', 'recurring'].includes(kind) && current.transactions.some(t => t.partyId === id || t.sharedGroupId === id || t.recurringId === id)) throw Error('Remove the linked transactions first.');
            if (action === 'save' && ['parties', 'categories', 'paymentMethods'].includes(kind) && ((current as any)[kind] || []).some((x: any) => x.id !== id && x.name.trim().toLowerCase() === String(record.name || '').trim().toLowerCase() && (kind !== 'paymentMethods' || x.country === record.country))) throw Error('This name already exists.');
            const op: SyncOp = { opId: crypto.randomUUID(), user: userId.current, profile: serverProfile.current, kind, action, id, ...(action === 'save' ? { value: record } : {}), base: serverVersion.current, createdAt: Date.now() };
            if (callNative('queueAdd', JSON.stringify(op)) !== true) throw Error('Could not save on this device. Please try again.');
            showLocal();
            setModal(null);
            setNotice(action === 'delete' ? 'Record removed' : 'Saved');
            return Promise.resolve(true);
        }
        catch (e) {
            setSaveError((e as Error).message);
            return Promise.resolve(false);
        }
    }
    function retrySync(op: SyncOp, keepMine: boolean) { callNative('queueRetry', op.opId, keepMine); showLocal(); }
    async function discardSync(op: SyncOp) {
        if (!(await confirmAction('Discard this change? It is removed from this device and the online version is kept.', 'Discard'))) return;
        dropped.current.add(op.opId); callNative('queueDiscard', op.opId); showLocal(); load(wantProfile.current || serverProfile.current, false);
    }
    // Upload progress from the native queue; fresh server data is merged once an upload finishes.
    useEffect(() => {
        if (!localFirst) return;
        const onNative = (e: Event) => {
            const d = (e as CustomEvent).detail;
            if (d?.type !== 'sync' || !d.data) return;
            setSync(d.data); showLocal();
            if (d.data.state === 'offline') setOnline(false);
            if (d.data.state === 'idle' && wasSyncing.current && serverProfile.current) load(wantProfile.current || serverProfile.current, true);
            wasSyncing.current = d.data.state === 'syncing';
        };
        const up = () => { setOnline(true); callNative('syncNow'); if (serverProfile.current) load(wantProfile.current || serverProfile.current, true); };
        const down = () => setOnline(false);
        const back = () => { if (document.visibilityState === 'visible' && serverProfile.current) load(wantProfile.current || serverProfile.current, true); };
        window.addEventListener('twmg-native', onNative); window.addEventListener('online', up); window.addEventListener('offline', down); document.addEventListener('visibilitychange', back);
        return () => { window.removeEventListener('twmg-native', onNative); window.removeEventListener('online', up); window.removeEventListener('offline', down); document.removeEventListener('visibilitychange', back); };
    }, [localFirst]);
    // Swipe-to-delete always asks first, using the themed confirm dialog.
    async function removeRecord(kind: string, value: any, message = 'Delete this record? This cannot be undone.') { if (await confirmAction(message)) await mutate(kind, value, 'delete'); }
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
    // One colour per category, account and payment method, recomputed whenever data reloads, so a
    // colour edit shows on every chart, legend and list straight away.
    const paint = useMemo(() => colorMaps(data?.categories || [], data?.accounts || [], data?.paymentMethods || []), [data]);
    const spendingOf = (list: Transaction[]) => [...new Set([...categories, ...list.flatMap(x => x.splits?.map(z => z.category) || [x.category])])].map(name => ({ name, value: list.filter(x => x.type === 'expense' && !x.partyId).reduce((s, x) => s + categoryAmount(x, name), 0) })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
    const spending = spendingOf(tx);
    const currencyAccounts = data?.accounts.filter(a => a.currency === currency) || [];
    const accountSlices = (accountMode === 'spending' ? accountActivity(currencyAccounts, tx).map(a => ({ id: a.id, name: a.name, value: a.expense })) : currencyAccounts.map(a => ({ id: a.id, name: a.name, value: balance(a, data?.transactions || []) }))).filter(a => a.value > 0).sort((a, b) => b.value - a.value);
    const accountTotal = accountSlices.reduce((s, a) => s + a.value, 0);
    // Notifications: every open reminder (bills, card payments, debts, shared groups, goals), the same
    // list the Android app notifies about. Clearing hides one until its next due date; it is kept per
    // profile on this device and never changes the bill or its payments.
    const bellRef = useRef<HTMLButtonElement>(null);
    const bell = notifications ? bellRef.current?.getBoundingClientRect() : undefined;
    // Wide screens: a dropdown under the bell. Phones: a bottom sheet (see .notification-center).
    // Lined up with the bell, but always kept on screen (the bell is on the left in right-to-left languages).
    const notifWidth = typeof window === 'undefined' ? 380 : Math.min(380, window.innerWidth - 24);
    const notifAnchor = (bell ? { '--anchor-top': bell.bottom + 8 + 'px', '--anchor-left': Math.min(Math.max(12, bell.right + 8 - notifWidth), window.innerWidth - notifWidth - 12) + 'px' } : {}) as React.CSSProperties;
    const localToday = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const allNotes = useMemo(() => data ? reminders(data, currency, localToday) : [], [data, currency, localToday]);
    const clearedKey = 'twmg-cleared:' + profile, noteKey = (x: Reminder) => x.id + '@' + x.due;
    const [cleared, setCleared] = useState<string[]>([]);
    useEffect(() => { try { setCleared(JSON.parse(localStorage.getItem(clearedKey) || '[]')); } catch { setCleared([]); } }, [clearedKey]);
    const keepCleared = (next: string[]) => { setCleared(next); try { localStorage.setItem(clearedKey, JSON.stringify(next)); } catch { /* storage unavailable: clearing lasts this session */ } };
    const notes = allNotes.filter(x => !cleared.includes(noteKey(x)));
    // Forget cleared entries that are no longer open, so the stored list never grows.
    useEffect(() => { if (data && cleared.some(k => !allNotes.some(x => noteKey(x) === k))) keepCleared(cleared.filter(k => allNotes.some(x => noteKey(x) === k))); }, [allNotes]);
    const dueLabel = (due: string) => { const days = Math.round((Date.parse(due) - Date.parse(localToday)) / 864e5); return days > 1 ? tr('Due in {0} days', days) : days === 1 ? tr('Due tomorrow') : days === 0 ? tr('Due today') : days === -1 ? tr('Overdue by 1 day') : tr('Overdue by {0} days', -days); };
    // Tapping a notification opens the transactions behind it: the bill's, card's or group's own
    // history, or the Debts / Budgets & goals page for those.
    function openNote(x: Reminder) {
        setNotifications(false);
        const [kind, ...rest] = x.id.split(':'), id = rest.join(':');
        const ledgerKind = ({ recurring: 'recurring', card: 'accounts', shared: 'shared' } as Record<string, Ledger['kind']>)[kind];
        go(x.view);
        if (ledgerKind) { const next = { kind: ledgerKind, id }; pushNavigation({ view: x.view, ledger: next }); setLedger(next); }
    }
    // Reports use the period's transactions narrowed by the same filters as the Transactions list.
    const reportTx = applyFilters(tx, filters), reportSum = totals(reportTx), reportSpending = spendingOf(reportTx);
    const reportAccounts = accountActivity(currencyAccounts, reportTx).filter(a => a.income || a.expense);
    const flow = (list: Transaction[]) => list.reduce((s, x) => { const c = data?.accounts.find(a => a.id === x.account)?.currency; if (c !== currency || x.type === 'transfer') return s; return x.type === 'income' ? { ...s, in: s.in + x.amount } : { ...s, out: s.out + x.amount }; }, { in: 0, out: 0 });
    const chart = Array.from({ length: period === 'Year' ? 12 : period === 'Day' ? 1 : period === 'Week' ? 7 : Math.min(31, new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()) }, (_, i) => { const key = period === 'Year' ? `${month.slice(0, 4)}-${String(i + 1).padStart(2, '0')}` : period === 'Day' ? range.start : period === 'Week' ? (() => { const d = new Date(range.start + 'T12:00:00'); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); })() : `${month}-${String(i + 1).padStart(2, '0')}`; const s = totals(tx.filter(t => t.date.startsWith(key))); return { name: period === 'Year' ? new Date(key + '-01T12:00:00').toLocaleDateString(t.locale, { month: 'short' }) : key.slice(-2), income: s.income / currencyScale(currency), expense: s.expense / currencyScale(currency) }; });
    const visible = applyFilters(data?.transactions || [], filters).filter(x => (filter === 'all' || x.type === filter) && `${x.name} ${x.category} ${x.notes || ''} ${x.tags || ''}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
    function pushNavigation(next: { view: string; ledger: Ledger | null; search?: string; filter?: string; filters?: TxFilters; dateFrom?: string; dateTo?: string }) {
        if (typeof window === 'undefined')
            return;
        const current = window.history.state;
        const same = current?.twmg && current.view === next.view && (current.ledger?.id || '') === (next.ledger?.id || '') && (current.ledger?.kind || '') === (next.ledger?.kind || '') && (current.search || '') === (next.search || '') && (current.filter || 'all') === (next.filter || 'all') && (current.dateFrom || '') === (next.dateFrom || '') && (current.dateTo || '') === (next.dateTo || '') && JSON.stringify(current.filters || {}) === JSON.stringify(next.filters || {});
        if (!same)
            window.history.pushState({ twmg: true, ...next }, '', window.location.href);
    }
    function openLedger(kind: Ledger['kind'], id: string) { const next = { kind, id }; pushNavigation({ view, ledger: next, search, filter, dateFrom, dateTo }); setLedger(next); document.querySelector('.main-shell main')?.scrollTo({ top: 0, behavior: 'instant' }); }
    function backFromLedger() { if (window.history.state?.twmg && window.history.state.ledger) window.history.back(); else setLedger(null); }
    function go(v: string, nextFilters: TxFilters = {}) { pushNavigation({ view: v, ledger: null, filters: nextFilters }); setLedger(null); setSaveError(''); setView(v); setMobile(false); setProfileMenu(false); setNotifications(false); document.querySelector('.main-shell main')?.scrollTo({ top: 0, behavior: 'instant' }); setSearch(''); setFilter('all'); setFilters(nextFilters); setDateFrom(''); setDateTo(''); }
    // Dashboard income/expense cards open Transactions already filtered to that type.
    const tourNavigate = (v: string) => { if (view !== v || ledger) go(v); };
    function openTransactions(type: 'income' | 'expense') { go('Transactions'); setFilter(type); }
    // Charts open Transactions filtered to the segment that was tapped (an account or a category).
    function openFiltered(next: TxFilters) { go('Transactions', next); }
    const cardLink = (type: 'income' | 'expense') => ({ role: 'button', tabIndex: 0, 'aria-label': tr(type === 'income' ? 'View income transactions' : 'View expense transactions'), onClick: () => openTransactions(type), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTransactions(type); } } });
    // Breadcrumb trail: Workspace › section › page › open ledger. Every step except the last is a link.
    const viewLabel = (v: string) => t.nav[navKeys.indexOf(v)] || v;
    const parentView = ['Accounts', 'Credit cards', 'Debts', 'Shared expenses', 'Recurring', 'Budgets & goals'].includes(view) ? 'Finance' : ['Account & sign-in', 'Data & privacy', 'Profiles', 'Categories', 'Payment methods', 'Language & theme', 'About'].includes(view) ? 'Settings' : view === 'Reports' ? 'Settings' : '';
    const ledgerName = ledger ? (ledger.kind === 'parties' ? data?.parties?.find(x => x.id === ledger.id) : data?.[ledger.kind].find(x => x.id === ledger.id))?.name : undefined;
    const crumbs: { label: string; to?: string }[] = [{ label: tr('Workspace'), to: 'Overview' }, ...(parentView ? [{ label: viewLabel(parentView), to: parentView }] : []), { label: viewLabel(view), to: ledger ? view : undefined },...(ledgerName ? [{ label: ledgerName }] : [])];
    function exportCSV() { const rows = [['Date', 'Description', 'Type', 'Category', 'Amount', 'Currency', 'Account', 'Payment method', 'Party', 'Shared group', 'Recurring bill'], ...reportTx.map(x => [x.date, x.name, x.type, x.category, (x.amount / currencyScale(data?.accounts.find(a => a.id === x.account)?.currency || currency)).toFixed(fractionDigits(data?.accounts.find(a => a.id === x.account)?.currency || currency)), data?.accounts.find(a => a.id === x.account)?.currency || currency, data?.accounts.find(a => a.id === x.account)?.name || '', x.paymentMethodName || '', data?.parties?.find(p => p.id === x.partyId)?.name || '', data?.shared.find(g => g.id === x.sharedGroupId)?.name || '', data?.recurring.find(b => b.id === x.recurringId)?.name || ''])]; const csv = rows.map(r => r.map(v => '"' + String(v).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"').join(',')).join('\r\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `TWMG-${range.start}-to-${range.end}${activeFilters(filters).length ? '-filtered' : ''}.csv`; a.click(); URL.revokeObjectURL(a.href); setNotice('Report exported'); }
    // Combined filters for Transactions and Reports: every chosen filter must match.
    const setOne = (key: keyof TxFilters, value: string) => setFilters(old => ({ ...old, [key]: value || undefined }));
    const filterName = (key: keyof TxFilters, id: string) => key === 'account' ? data?.accounts.find(a => a.id === id)?.name : key === 'party' ? data?.parties?.find(p => p.id === id)?.name : key === 'category' ? id : key === 'shared' ? (id === 'any' ? tr('Any shared group') : data?.shared.find(g => g.id === id)?.name) : (id === 'any' ? tr('Any recurring bill') : data?.recurring.find(b => b.id === id)?.name);
    const filterLabels: Record<keyof TxFilters, string> = { account: 'Account', party: 'Party', category: 'Category', shared: 'Shared group', recurring: 'Recurring bill' };
    const usedCategories = [...new Set([...(data?.categories || []).map(c => c.name), ...(data?.transactions || []).filter(x => x.type !== 'transfer').flatMap(x => x.splits?.map(z => z.category) || [x.category])])].sort((a, b) => a.localeCompare(b));
    const anyFilter = activeFilters(filters).length > 0;
    const filterCount = activeFilters(filters).length;
    const filterBar = data && <div className={'filter-bar' + (filtersOpen ? ' open' : '')}><div className="filter-row"><button type="button" className={'filter-toggle' + (filterCount ? ' has-filters' : '')} aria-expanded={filtersOpen} aria-controls="filter-selects" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={15}/>{tr('Filters')}{filterCount > 0 && <span className="count">{filterCount}</span>}<ChevronDown size={14} className="filter-chevron"/></button>{(anyFilter || filter !== 'all' || search) && <div className="filter-chips" aria-live="polite">{activeFilters(filters).map(k => <button type="button" key={k} className="filter-chip" style={k === 'account' ? { borderColor: paint.account(filters[k]) } : k === 'category' ? { borderColor: paint.category(filters[k]!) } : undefined} onClick={() => setOne(k, '')} aria-label={tr('Remove filter {0}', tr(filterLabels[k]))}>{(k === 'account' || k === 'category') && <i className="category-dot" style={{ background: k === 'account' ? paint.account(filters[k]) : paint.category(filters[k]!) }}/>}<span>{tr(filterLabels[k])}: <b>{text(filterName(k, filters[k]!) || '—')}</b></span><X size={13}/></button>)}<button type="button" className="text-button" onClick={() => { setFilters({}); setFilter('all'); setSearch(''); }}>{tr('Reset filters')}</button></div>}</div>{filtersOpen && <div className="filter-selects" id="filter-selects">
        <ThemedSelect aria-label={tr('Account')} value={filters.account || ''} onChange={e => setOne('account', e.target.value)}><option value="">All accounts</option>{data.accounts.map(a => <option key={a.id} value={a.id}>{emojiLabel(a)}</option>)}</ThemedSelect>
        <ThemedSelect aria-label={tr('Party')} value={filters.party || ''} onChange={e => setOne('party', e.target.value)}><option value="">All parties</option>{(data.parties || []).map(x => <option key={x.id} value={x.id}>{emojiLabel(x)}</option>)}</ThemedSelect>
        <ThemedSelect aria-label={tr('Category')} value={filters.category || ''} onChange={e => setOne('category', e.target.value)}><option value="">All categories</option>{usedCategories.map(c => <option key={c} value={c}>{emojiLabel({ name: c, emoji: data.categories?.find(x => x.name === c)?.emoji })}</option>)}</ThemedSelect>
        <ThemedSelect aria-label={tr('Shared group')} value={filters.shared || ''} onChange={e => setOne('shared', e.target.value)}><option value="">All shared status</option><option value="any">Any shared group</option>{data.shared.map(g => <option key={g.id} value={g.id}>{emojiLabel(g)}</option>)}</ThemedSelect>
        <ThemedSelect aria-label={tr('Recurring bill')} value={filters.recurring || ''} onChange={e => setOne('recurring', e.target.value)}><option value="">All recurring status</option><option value="any">Any recurring bill</option>{data.recurring.map(b => <option key={b.id} value={b.id}>{emojiLabel(b)}</option>)}</ThemedSelect>
    </div>}</div>;
    const sectionHeader = (title: string, sub: string, kind: string) => <div className="page-heading"><div><h1>{text(title)}</h1><p>{text(sub)}</p></div><button className={'primary ' + (kind === 'transactions' ? 'page-transaction-add' : '')} onClick={() => setModal({ kind, ...(kind === 'accounts' && view === 'Credit cards' ? { value: { type: 'Credit card' } } : {}) })}><Plus size={17}/>{tr("Add ")}{text(kind === 'profile' ? 'profile' : kind === 'transactions' ? 'transaction' : kind === 'accounts' ? 'account' : kind === 'budgets' ? 'budget' : kind === 'goals' ? 'goal' : kind === 'debts' ? 'debt' : kind === 'shared' ? 'group' : kind === 'recurring' ? 'bill' : 'payment')}</button></div>;
    const progress = (v: number, total: number, color = incomeColor) => <div className="progress"><i style={{ width: `${Math.min(100, total ? v / total * 100 : 0)}%`, background: color }}/></div>;
    // Category shown as a small coloured icon button plus its name; tapping it filters by that category.
    const categoryChip = (x: Transaction) => { if (x.type === 'transfer') return <span className="category-chip is-transfer"><span className="category-icon"><ArrowLeftRight size={12}/></span><span>{tr('Transfer')}</span></span>; const c = paint.category(x.category), Icon = categoryIcon(x.category), emoji = data?.categories?.find(k => k.name === x.category)?.emoji; return <button type="button" className="category-chip" onClick={e => { e.stopPropagation(); openFiltered({ category: x.category }); }} aria-label={tr('Show {0} transactions', x.category)}><span className="category-icon" style={{ background: c, color: readableOn(c) }}>{emoji || <Icon size={12}/>}</span><span>{text(x.category)}</span></button>; };
    // Rows become cards on phones (see .tx-table in globals.css), so nothing scrolls sideways.
    const txTable = (rows: Transaction[], compact = false) => <div className="table-wrap"><table className={'tx-table' + (compact ? ' compact' : '')}><thead><tr><th>{tr("Transaction")}</th><th>{tr("Category")}</th><th>{tr("Account")}</th><th>{tr("Date")}</th><th className="amount">{tr("Amount")}</th></tr></thead><tbody>{rows.map(x => { const Icon = categoryIcon(x.category), a = data?.accounts.find(a => a.id === x.account); return <Swipeable as="tr" key={x.id} className="tx-row" tabIndex={0} aria-label={tr('Open {0}', x.name)} onClick={() => setModal({ kind: 'transactions', value: x })} onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' && e.target === e.currentTarget) setModal({ kind: 'transactions', value: x }); }} onEdit={() => setModal({ kind: 'transactions', value: x })} onDelete={() => removeRecord('transactions', x)}><td className="tx-c-name"><div className="tx-name"><span className={'tx-icon ' + (x.type === 'income' ? 'green' : '')}><Icon size={17}/></span><span><b>{x.name}</b><small>{x.type === 'transfer' ? 'Account transfer' : x.partyId ? tr({ lend: 'Money lent', borrow: 'Money borrowed', collect: 'Repayment received', repay: 'Debt repaid' }[x.debtAction || 'lend']) : x.sharedGroupId ? tr('Shared expense') : x.recurringId ? tr('Recurring bill') : x.tags || x.notes || x.paymentMethodName || tr('Completed')}</small></span></div></td><td className="tx-c-category">{text(categoryChip(x))}</td><td className="tx-c-account"><span className="account-dot" style={a ? { background: paint.account(a.id) } : undefined}/><span><b>{a && emojiLabel(a)}</b><small className="tx-account-type">{text(a?.type || '')}{a && accountReference(a) && <> · {accountReference(a)}</>}</small></span></td><td className="tx-c-date">{text(date(x.date))}</td><td className={'tx-c-amount amount ' + (x.type === 'income' ? 'positive' : '')}><b>{text(x.type === 'income' ? '+' : x.type === 'expense' ? '−' : '')}{text(money(x.amount, a?.currency))}</b></td></Swipeable>; })}</tbody></table>{text(!rows.length && <div className="empty"><Search /><h3>{tr("No transactions yet")}</h3><p>{tr("Add a transaction or try another search.")}</p></div>)}</div>;
    async function switchTo(id: string) {
        wantProfile.current = id;
        setSwitching(true);
        const ok = await load(id);
        setSwitching(false);
        if (ok) {
            setProfileMenu(false);
            setChooser(false);
            go('Overview');
        }
    }
    const me = user.displayName || user.name || '';
    // ---- App guide: welcome, tour over the real screens, completion. Progress stays on this device. ----
    const guideWho = user.email || 'guest';
    const [guide, setGuide] = useState<'welcome' | 'tour' | 'complete' | null>(null), [guideStep, setGuideStep] = useState(0);
    const formOpen = () => !!document.querySelector('.modal-backdrop .modal');
    const tourSteps: TourStep[] = [
        { id: 'home', view: 'Overview', target: ['[data-tour=home]'], title: 'Your home screen', body: 'Overview shows your balance, income and spending for the period. Tap the income or expense cards to see those transactions.', hint: 'Choose Next to see how to move around.' },
        { id: 'nav', target: ['.bottom-nav', '.sidebar nav'], title: 'Moving around', body: 'Use these to switch between Overview, Transactions, Finance and Settings. Tap Overview (or the TWMG name) to come back home.', hint: 'Choose Next.' },
        { id: 'add', view: 'Overview', target: ['.nav-add-transaction', '.page-transaction-add'], title: 'Add a transaction', body: 'This button adds income, an expense or a transfer.', hint: 'Tap it now to open the form — the guide continues when it opens. Or choose Next.', done: formOpen },
        { id: 'form', target: ['.modal-backdrop .modal'], title: 'Filling in the form', body: 'Name, amount, account and date are required; category, payment method, tags and notes are optional. If something is missing or invalid, the form points to it. Choose Save to keep it — you will see “Saved successfully” — or Cancel to close without saving.', hint: 'Save or cancel the form when you are ready, then choose Next.', hold: formOpen },
        { id: 'find', view: 'Transactions', target: ['[data-tour=tx-find]'], title: 'Find anything', body: 'Search by name, category, notes or tags, or filter by type, account, party, category, shared group or recurring bill. Active filters show as chips; Reset filters clears them.', hint: 'Choose Next.' },
        { id: 'manage', view: 'Transactions', target: ['.tx-table tbody tr', '[data-tour=tx-list]'], title: 'Open and change records', body: 'Tap a transaction to open it and change its details. Swipe right to edit or left to delete (or drag with a mouse); long-press for both options. Delete is also at the bottom of each form, and it always asks before removing anything.', hint: 'Choose Next.' },
        { id: 'finance', view: 'Finance', target: ['[data-tour=finance]'], title: 'Finance', body: 'Accounts, credit cards, debts and parties, shared expenses, recurring bills, and budgets and goals live here. Open any of them to see its own transactions.', hint: 'Choose Next.' },
        { id: 'settings', view: 'Settings', target: ['[data-tour=settings]'], title: 'Settings', body: 'Manage profiles, categories, payment methods, language and theme, data and privacy, and app information.', hint: 'Choose Next.' },
        { id: 'reports', view: 'Settings', target: ['[data-tour=reports-tile]'], title: 'Reports', body: 'Reports shows income, spending and net cash flow for any dates and filters, by category and account. Download CSV or Print / save PDF creates a file on your device — nothing is sent anywhere.', hint: 'Choose Next.' },
        { id: 'guide', view: 'Settings', target: ['[data-tour=guide-tile]'], title: 'Need a reminder?', body: 'Open App guide here any time to replay this tour from the start.', hint: 'Choose Finish.' },
    ];
    function openGuide(at = 0) { setModal(null); setGuideStep(at); setGuide('tour'); saveGuide(guideWho, { status: 'active', step: at }); }
    function leaveGuide(status: 'done' | 'skipped') { setGuide(null); saveGuide(guideWho, { status, step: 0 }); }
    function tourTo(n: number) { setGuideStep(n); saveGuide(guideWho, { status: 'active', step: n }); }
    // First visit: welcome people with an empty workspace; resume an interrupted tour; otherwise stay quiet.
    useEffect(() => {
        if (!data || signedOut || chooser || guide) return;
        const saved = loadGuide(guideWho);
        if (saved?.status === 'active') { setGuideStep(Math.min(saved.step, tourSteps.length - 1)); setGuide('tour'); }
        else if (!saved && !data.transactions.length) setGuide('welcome');
    }, [!!data, signedOut, chooser, guideWho]);
    // Deleting a group transaction: a linked one is its account transaction, the rest live in the group.
    async function removeSharedEntry(group: Item, entry: import('../../lib/finance').SharedExpense) {
        const tx = entry.transactionId ? data?.transactions.find(t => t.id === entry.transactionId) : undefined;
        if (tx) return removeRecord('transactions', tx, 'Delete this shared transaction?');
        if (!(await confirmAction('Delete this shared transaction?'))) return;
        const expenses = sharedEntries(group).filter(e => e.id !== entry.id), total = sharedTotal(expenses);
        if (total < (group.paid || 0)) { setNotice(tr('The group total cannot be lower than recorded settlements.')); return; }
        await mutate('shared', { ...group, memberNames: groupMembers(group), members: groupMembers(group).length, expenses, amount: total });
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
 <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button collapse-control" aria-label={tr("Toggle sidebar")} onClick={() => setCollapsed(!collapsed)}><PanelLeftClose size={19}/></button><a className="mobile-site-name" href="#" aria-label={tr("TWMG home")} onClick={e => { e.preventDefault(); go('Overview'); }}>TWMG<span>.</span></a><nav className="crumbs" aria-label={tr("Breadcrumb")}>{text(crumbs.map((c, i) => <span className="crumb" key={i}>{i > 0 && <ChevronRight size={13} aria-hidden="true"/>}{c.to && i < crumbs.length - 1 ? <button type="button" className="crumb-link" onClick={() => go(c.to!)}>{c.label}</button> : <b aria-current="page">{c.label}</b>}</span>))}</nav></div><div className="top-actions"><label className="global-search"><Search size={16}/><input placeholder={tr("Search transactions\u2026")} maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setLedger(null); setView('Transactions'); }}/></label>{localFirst && <SyncIndicator status={sync} online={online} ops={ops} retry={retrySync} discard={discardSync}/>}<div className="notification-wrap"><button ref={bellRef} className="icon-button notification-button" aria-label={tr("Notifications")} aria-expanded={notifications} onClick={() => setNotifications(!notifications)}><Bell size={19}/>{notes.length > 0 && <i className="notification-count">{notes.length > 9 ? '9+' : notes.length}</i>}</button></div><button className="header-profile" aria-label={tr("Switch profile")} onClick={() => setProfileMenu(true)}><ProfileAvatar profile={p} size="small"/></button></div></header>
 <main key={view + (ledger ? ':' + ledger.kind + ':' + ledger.id : '')}><div className="welcome-strip"><span><i />{tr("YOUR MONEY, WITH A LITTLE MORE MEANING")}</span><span className="brand-malayalam">പണം പോകുന്ന വഴി</span></div>
 {text(ledger ? <LedgerPage ledger={ledger} data={data} money={money} table={txTable} back={backFromLedger} add={value => setModal({ kind: 'transactions', value })} edit={() => setModal({ kind: ledger.kind, value: ledger.kind === 'parties' ? data.parties?.find(x => x.id === ledger.id) : data[ledger.kind].find(x => x.id === ledger.id) })}>{text(ledger.kind === 'shared' && <SharedGroups initialTab="transactions" groups={data.shared.filter(g => g.id === ledger.id)} money={money} date={date} edit={value => setModal({ kind: 'shared', value })} remove={value => removeRecord('shared', value, 'Delete this group and its shared transactions?')} transaction={openSharedTransaction} removeEntry={removeSharedEntry} me={me} settle={value => setModal({ kind: 'repayment', value: { ...value, source: 'shared' } })}/>)}</LedgerPage> : <>
 {view === 'Overview' && <>
 <div className="page-heading" data-tour="home"><div><div className="eyebrow">{tr("YOUR FINANCIAL PICTURE")}</div><h1>{text(new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening')}, {p?.name || user.displayName || user.name} <span className="wave">☀</span></h1><p>{text(t.subtitle)}</p></div><button className="primary page-transaction-add" onClick={() => setModal({ kind: 'transactions' })}><Plus size={17}/>{text(t.add)}</button></div>
 <div className="dashboard-toolbar"><div className="tabs">{text(['Day', 'Week', 'Month', 'Year'].map(x => <button className={period === x ? 'selected' : ''} key={x} onClick={() => setPeriod(x)}>{text(x)}</button>))}</div><div className="toolbar-right"><DashboardCalendar month={month} selected={dateFrom && dateFrom === dateTo ? dateFrom : undefined} markers={calendarMarkers} onMonthChange={next => { setMonth(next); setDateFrom(''); setDateTo(''); setPeriod('Month'); }} onSelect={selectedDate => { setMonth(selectedDate.slice(0, 7)); setDateFrom(selectedDate); setDateTo(selectedDate); setPeriod('Day'); }}/></div></div>
 <SetupChecklist profile={profile} data={data} onStep={step => step === 'account' ? setModal({ kind: 'accounts' }) : step === 'cash' ? setModal({ kind: 'accounts', value: { type: 'Cash', name: 'Cash wallet' } }) : step === 'payments' ? go('Payment methods') : step === 'categories' ? go('Categories') : step === 'budget' ? setModal({ kind: 'budgets' }) : setModal({ kind: 'transactions' })}/>
 <div className="metrics"><article className="metric net-worth"><div className="metric-top"><span>{text(t.net)}</span><Wallet size={17}/></div><h2>{cardMoney(net + debtNet)}</h2><div className="metric-bottom"><span className="pill"><ShieldCheck size={12}/>{tr("Across your accounts")}</span><svg viewBox="0 0 90 30"><path d="M0 26L10 23L20 24L30 17L40 20L50 10L60 14L70 6L80 8L90 0"/></svg></div></article><article className="metric metric-link" {...cardLink('income')}><div className="metric-top"><span>{tr("Total ")}{text(t.income.toLowerCase())}</span><span className="metric-icon green"><ArrowDownLeft size={17}/></span></div><h2>{cardMoney(sum.income)}</h2><div className="metric-bottom"><span className="positive"><ArrowUpRight size={13}/>{tr("Money coming in")}</span><small>{(n => tr(n === 1 ? '{0} transaction' : '{0} transactions', n))(tx.filter(t => t.type === 'income' && !t.partyId).length)}</small></div></article><article className="metric metric-link" {...cardLink('expense')}><div className="metric-top"><span>{tr("Total ")}{text(t.expense.toLowerCase())}</span><span className="metric-icon peach"><ArrowUpRight size={17}/></span></div><h2>{cardMoney(sum.expense)}</h2><div className="metric-bottom"><span className="muted">{tr("Money going out")}</span><small>{(n => tr(n === 1 ? '{0} transaction' : '{0} transactions', n))(tx.filter(t => t.type === 'expense' && !t.partyId).length)}</small></div></article><article className="metric"><div className="metric-top"><span>{text(t.save)}</span><span className="metric-icon lavender"><Target size={17}/></span></div><h2>{text(sum.income ? ((sum.income - sum.expense) / sum.income * 100).toFixed(1) : '0')}<span className="percent">%</span></h2><div className="metric-bottom"><span className="positive"><TrendingUp size={13}/>{fitMoney(sum.income - sum.expense, currency, 16)}</span><small>{tr("left this period")}</small></div></article></div>
 <div className="dashboard-grid"><section className="panel cashflow"><div className="panel-head"><div><h3>{tr("Cash flow")}</h3><p>{tr("A clearer view of what comes in and goes out.")}</p></div><div className="legend"><span><i style={{ background: incomeColor }}/>{text(t.income)}</span><span><i style={{ background: expenseColor }}/>{text(t.expense)}</span></div></div><div className="cashflow-values"><div><small>{tr("NET CASH FLOW")}</small><strong>{cardMoney(sum.income - sum.expense)}<span><ArrowUpRight size={16}/></span></strong></div><span className="muted">{text(period === 'Month' ? 'This month' : `This ${period.toLowerCase()}`)}</span></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}><defs><linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={incomeColor} stopOpacity={0.22}/><stop offset="95%" stopColor={incomeColor} stopOpacity={0}/></linearGradient><linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor={expenseColor} stopOpacity={0.16}/><stop offset="95%" stopColor={expenseColor} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--line)"/><XAxis dataKey="name" axisLine={false} tickLine={false} minTickGap={35} tick={{ fontSize: 10, fill: '#8a928c' }}/><YAxis width={44} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8a928c' }} tickFormatter={v => compactNumber(Number(v))}/><Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 12 }} formatter={(v: any) => money(Number(v) * currencyScale(currency))}/><Area type="monotone" dataKey="income" name={t.income} stroke={incomeColor} strokeWidth={2.5} fill="url(#incomeFill)"/><Area type="monotone" dataKey="expense" name={t.expense} stroke={expenseColor} strokeWidth={2} fill="url(#expenseFill)"/></AreaChart></ResponsiveContainer></div><div className="chart-foot"><span><span className="tiny-dot"/>{tr("Income and expenses in ")}{text(currency)}</span><button onClick={() => go('Reports')}>{tr("Explore reports ")}<ArrowUpRight size={13}/></button></div></section>
 <section className="panel spending"><div className="panel-head"><div><h3>{tr("Where it went")}</h3><p>{tr("Your spending, at a glance.")}</p></div><button className="icon-button" aria-label={tr("Open expense report")} onClick={() => go('Reports')}><ArrowUpRight size={18}/></button></div><div className="donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={spending.length ? spending : [{ name: 'No expenses', value: 1 }]} dataKey="value" innerRadius={65} outerRadius={87} paddingAngle={spending.length > 1 ? 4 : 0} cornerRadius={5} startAngle={90} endAngle={-270} stroke="none">{spending.length ? spending.map(x => <Cell key={x.name} fill={paint.category(x.name)} className="chart-segment" onClick={() => openFiltered({ category: x.name })}/>) : <Cell className="donut-empty"/>}</Pie>{spending.length > 0 && <Tooltip formatter={(v: any) => money(Number(v))} contentStyle={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--line)' }}/>}</PieChart></ResponsiveContainer><div className="donut-center"><small>{tr("Total spent")}</small><strong>{fitMoney(sum.expense)}</strong></div></div><div className="spending-list">{spending.slice(0, 4).map((x, i) => <button key={x.name} onClick={() => openFiltered({ category: x.name })}><span><i style={{ background: paint.category(x.name) }}/>{text(x.name)}</span><b>{text(money(x.value))}<small>{text((x.value / sum.expense * 100).toFixed(0))}%</small></b></button>)}{text(!spending.length && <p className="spending-empty"><b>{tr("No spending yet this period.")}</b><small>{tr("Add an expense to see where your money goes.")}</small></p>)}</div></section>
 <section className="panel spending account-diagram"><div className="panel-head"><div><h3>{tr("By account")}</h3><p>{tr(accountMode === 'spending' ? 'Money out of each account this period.' : 'What each account holds now.')}</p></div><div className="tabs account-mode" role="tablist" aria-label={tr("Account diagram")}>{text((['spending', 'balance'] as const).map(m => <button key={m} role="tab" aria-selected={accountMode === m} className={accountMode === m ? 'selected' : ''} onClick={() => setAccountMode(m)}>{tr(m === 'spending' ? 'Spending' : 'Balances')}</button>))}</div></div><div className="donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={accountSlices.length ? accountSlices : [{ id: '', name: 'None', value: 1 }]} dataKey="value" innerRadius={65} outerRadius={87} paddingAngle={accountSlices.length > 1 ? 4 : 0} cornerRadius={5} startAngle={90} endAngle={-270} stroke="none">{accountSlices.length ? accountSlices.map(a => <Cell key={a.id} fill={paint.account(a.id)} className="chart-segment" onClick={() => openFiltered({ account: a.id })}/>) : <Cell className="donut-empty"/>}</Pie>{accountSlices.length > 0 && <Tooltip formatter={(v: any) => money(Number(v))} contentStyle={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--line)' }}/>}</PieChart></ResponsiveContainer><div className="donut-center"><small>{tr(accountMode === 'spending' ? 'Money out' : 'Total held')}</small><strong>{fitMoney(accountTotal)}</strong></div></div><div className="spending-list">{accountSlices.slice(0, 5).map(a => <button key={a.id} onClick={() => openFiltered({ account: a.id })} aria-label={tr('View transactions for {0}', a.name)}><span><i style={{ background: paint.account(a.id) }}/>{text(emojiLabel(data.accounts.find(x => x.id === a.id) || a))}</span><b>{text(money(a.value))}<small>{text((a.value / (accountTotal || 1) * 100).toFixed(0))}%</small></b></button>)}{text(!accountSlices.length && <p className="spending-empty"><b>{tr(accountMode === 'spending' ? 'No account spending this period.' : 'No positive balances yet.')}</b><small>{tr("Tap an account in the diagram to see its transactions.")}</small></p>)}</div></section>
 <section className="panel recent"><div className="panel-head"><div><h3>{tr("Recent transactions ")}<span className="count">{text(data.transactions.length)}</span></h3><p>{tr("The little things that add up.")}</p></div><button className="text-button" onClick={() => go('Transactions')}>{tr("View all ")}<ArrowRight size={15}/></button></div>{text(txTable([...data.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), true))}</section>
 <section className="panel budgets"><div className="panel-head"><div><h3>{tr("Monthly budgets")}</h3><p>{tr("A little structure. More peace of mind.")}</p></div><button className="icon-button" aria-label={tr("Manage budgets")} onClick={() => go('Budgets & goals')}><ArrowUpRight size={18}/></button></div>{data.budgets.slice(0, 3).map((b, i) => { const used = spending.find(x => x.name === (b.category || b.name))?.value || 0, Icon = categoryIcon(b.name); return <div className="budget-row" key={b.id}><div><RecordIcon record={b} className={'budget-icon c' + i} fallback={<Icon size={15}/>}/><b>{text(b.name)}</b><small>{text(Math.round(used / b.amount * 100))}%</small></div>{text(progress(used, b.amount, used > b.amount ? '#be6d55' : paint.category(b.category || b.name)))}<p><span>{text(money(used))} <small>{tr("of ")}{text(money(b.amount))}</small></span><small>{text(money(Math.max(0, b.amount - used)))}{tr(" left")}</small></p></div>; })}<button className="budget-link" onClick={() => go('Budgets & goals')}>{tr("Manage budgets ")}<ArrowRight size={14}/></button></section>
 <section className="insight"><span className="insight-icon"><Sparkles size={21}/></span><div><b>{tr("Making room for what matters.")}</b><p>{tr("You\u2019ve kept ")}{text(sum.income ? Math.round((sum.income - sum.expense) / sum.income * 100) : 0)}{tr("% of your income this period. Give that money a purpose with a savings goal.")}</p></div><button onClick={() => go('Budgets & goals')}>{tr("Explore goals ")}<ArrowUpRight size={15}/></button></section>
 <section className="panel upcoming"><div className="panel-head"><h3>{tr("On the horizon")}</h3><button className="text-button" onClick={() => go('Recurring')}>{tr("View all ")}<ArrowRight size={14}/></button></div>{data.recurring.slice(0, 2).map((r, i) => <div className="upcoming-row" key={r.id}><RecordIcon record={r} className={'service-icon ' + (i === 0 ? 'netflix' : 'internet')} fallback={i === 0 ? 'N' : <Globe size={20}/>}/><span><b>{r.name}</b><small>{text(r.due && date(r.due))} · {text(r.type)}</small></span><strong>{text(money(r.amount))}</strong></div>)}</section></div>
 </>}
 {text(view === 'Finance' && <><div className="page-heading"><div><h1>{tr("Finance")}</h1><p>{tr("Your accounts, commitments and plans in one place.")}</p></div></div><div className="more-grid" data-tour="finance">{text([2, 3, 4, 5, 6, 7].map(i => { const Icon = icons[i]; return <button className="panel more-tile" key={navKeys[i]} onClick={() => go(navKeys[i])}><span className="more-icon"><Icon size={23}/></span><span><b>{text(t.nav[i])}</b><small>{text(['Accounts and balances', 'Card limits and repayments', 'Lending and borrowing', 'Groups and shared costs', 'Bills and subscriptions', 'Spending plans and savings goals'][i - 2])}</small></span><ChevronRight size={17}/></button>; }))}</div></>)}
 {view === 'Settings' && <><div className="page-heading"><div><h1>{tr("Settings")}</h1><p>{tr("Make TWMG work for you.")}</p></div></div><div className="more-grid" data-tour="settings">{text([['Profiles', Users, 'Your independent finance spaces'], ['Categories', Target, 'Organize income and spending'], ['Payment methods', Wallet, 'Manage country-specific payment methods'], ['Reports', ChartNoAxesCombined, 'Totals, breakdowns, CSV and PDF exports', 'reports-tile'], ['Language & theme', Globe, 'Language, appearance and accessibility'], ['Data & privacy', ShieldCheck, 'Backups, exports and data controls'], ['App guide', Compass, 'Replay the tour of the app', 'guide-tile'], ['About', Info, 'App information and version']].map(([name, Icon, description, tour]: any) => <button className="panel more-tile" key={name} data-tour={tour} onClick={() => name === 'App guide' ? openGuide(0) : go(name)}><span className="more-icon"><Icon size={23}/></span><span><b>{text(name)}</b><small>{text(description)}</small></span><ChevronRight size={17}/></button>))}</div></>}
 {text(view === 'Language & theme' && <><div className="page-heading"><div><h1>{tr("Language & theme")}</h1><p>{tr("A workspace that feels like you.")}</p></div></div><section className="panel settings-panel"><label>{tr("Language")}<ThemedSelect aria-label={tr("Language")} value={lang} onChange={e => setLang(e.target.value)}>{text(Object.entries(languages).map(([k, v]) => <option key={k} value={k}>{v.label}</option>))}</ThemedSelect></label><label>{tr("Theme")}<ThemedSelect aria-label={tr("Theme")} value={dark ? 'dark' : 'light'} onChange={e => setDark(e.target.value === 'dark')}><option value="light">{tr("Light")}</option><option value="dark">{tr("Dark")}</option></ThemedSelect></label><label>{tr("Text size")}<ThemedSelect aria-label={tr("Text size")} value={textSize} onChange={e => setTextSize(e.target.value as 'small' | 'medium' | 'large')}><option value="small">{tr("Small")}</option><option value="medium">{tr("Medium")}</option><option value="large">{tr("Large")}</option></ThemedSelect></label><p>{tr("Your language, text size and appearance preferences are saved on this device.")}</p></section></>)}
 {text(view === 'About' && <><div className="page-heading"><div><h1>{tr("About TWMG")}</h1><p>{tr("The Way Money Goes · പണം പോകുന്ന വഴി")}</p></div></div><div className="about-layout"><section className="panel settings-panel about-panel"><span className="brand-mark"><TrendingUp size={25}/></span><h2>TWMG</h2><p>{tr("Hey there! Thanks for stopping by.")}</p><h3>{tr("Why this app exists")}</h3><p>{tr("Let’s be honest: tracking where your hard-earned cash goes shouldn't require a monthly subscription. Everywhere you look, basic finance trackers are locked behind paywalls. So, I decided to build something different.")}</p><h3>{tr("Built with AI, fueled by passion")}</h3><p>{tr("In this AI generation, The Way Money Goes was created by Sarath Chandran C to keep things simple, accessible, and purely AI-driven. No corporate bloat, no forced subscriptions—just a straightforward way to watch your expenses.")}</p><h3>{tr("A quick heads-up")}</h3><p>{tr("Since this is an independent project, you might stumble upon a bug or two along the way. If you do, bear with me! The best part? It is, and always will be, 100% free to use.")}</p><h3>{tr("Support the Creator")}</h3><p>{tr("If this app helps you keep your finances in check and you'd like to support its ongoing development (or just buy me a meal to keep the code flowing), you can drop a contribution here:")}</p><a className="primary about-support" href="https://buymeacoffee.com/sarathscn" target="_blank" rel="noreferrer">☕ {tr("Buy Me a Coffee / Support the Dev")}</a><p>{tr("Thanks for using the app and being part of the journey!")}</p></section><aside className="about-side"><section className="panel settings-panel about-info"><h3>{tr("App info")}</h3><dl><div><dt>{tr("Platform")}</dt><dd>{tr(localFirst ? 'Android app' : 'Web · Mobile web')}</dd></div><div><dt>{tr("Languages")}</dt><dd>{tr("English · हिन्दी · العربية · മലയാളം · Deutsch")}</dd></div><div><dt>{tr("Price")}</dt><dd>{tr("Free, no subscriptions")}</dd></div></dl><button className="secondary" onClick={() => go('Data & privacy')}>{tr("Data & privacy")}</button></section>{localFirst && <AndroidVersionPanel/>}</aside></div></>)} {text((['Categories', 'Payment methods'].includes(view)) && <><div className="page-heading"><div><h1>{text(view)}</h1><p>{tr("Personalize the way you track your money.")}</p></div></div><CatalogManager key={profile + view} kind={view === 'Categories' ? 'categories' : 'paymentMethods'} rows={view === 'Categories' ? data.categories || [] : data.paymentMethods || []} colorOf={row => view === 'Categories' ? paint.category(row.name) : paint.method(row.id)} country={p?.country || 'India'} busy={busy} error={saveError} save={mutate}/></>, true)}
 {text(view === 'Transactions' && <>{text(sectionHeader(t.nav[1], 'Every little detail, all in one place.', 'transactions'))}<section className="panel" data-tour="tx-list"><div className="list-toolbar" data-tour="tx-find"><label className="search-box"><Search size={17}/><input maxLength={100} value={search} onChange={e => setSearch(e.target.value)} placeholder={tr("Search name, category, notes or tags")}/></label><div className="list-toolbar-row"><ThemedSelect aria-label={tr("Transaction type")} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All transactions</option><option value="income">Income</option><option value="expense">Expenses</option><option value="transfer">Transfers</option></ThemedSelect><span className="muted list-count">{text(visible.length)}{tr(" transactions")}</span></div></div>{text(filterBar)}{text((activeFilters(filters).length > 0 || filter !== 'all' || search) && <div className="filter-totals">{(() => { const f = flow(visible); return <><span>{tr("Money in")}<b className="positive">{text(money(f.in))}</b></span><span>{tr("Money out")}<b>{text(money(f.out))}</b></span><span>{tr("Net")}<b>{text(money(f.in - f.out))}</b></span><small>{tr("Totals in {0}; transfers are not counted.", currency)}</small></>; })()}</div>)}{text(txTable(visible))}</section></>)}
 {(view === 'Accounts' || view === 'Credit cards') && <>{text(sectionHeader(t.nav[view === 'Accounts' ? 2 : 3], view === 'Accounts' ? 'All your money. One clear picture.' : 'Stay in control of what you owe.', 'accounts'))}<div className="account-grid">{data.accounts.filter(a => view === 'Accounts' || a.type === 'Credit card').map((a, i) => { const amount = balance(a, data.transactions); return <Swipeable as="article" onEdit={() => setModal({ kind: 'accounts', value: a })} onDelete={() => removeRecord('accounts', a)} className={'panel account-card ' + (a.type === 'Credit card' ? 'credit-account' : '')} style={{ borderTop: `4px solid ${paint.account(a.id)}` }} key={a.id}><div className="account-card-top"><RecordIcon record={{ ...a, color: paint.account(a.id) }} className="account-bank-icon" fallback={a.type === 'Credit card' ? <CreditCard /> : <Wallet />}/><span>{text(a.type)}{a.type !== 'Credit card' && accountReference(a) && <small className="account-reference">{accountReference(a)}</small>}</span></div><button className="ledger-title" onClick={() => openLedger('accounts', a.id)}><h3>{a.name}</h3><ChevronRight size={17}/></button>{a.type === 'Credit card' && <div className="card-reference" style={{ background: paint.account(a.id) }}><span>{text(a.cardType || 'Credit card')}</span><span className="card-last-four">•••• {a.lastFour || '— — — —'}</span></div>}<button className="text-button" onClick={() => openLedger('accounts', a.id)}>{tr("View transactions ")}<ArrowRight size={14}/></button><small>{text(a.currency)}{tr(" ACCOUNT")}</small><h2>{text(money(amount, a.currency))}</h2>{text(a.type === 'Credit card' ? <><div className="credit-info"><span>{tr("Credit limit")}</span><b>{text(money(a.limit || 0, a.currency))}</b></div>{text(progress(Math.max(0, -amount), a.limit || 1))}<p>{tr("Available ")}{text(money((a.limit || 0) + Math.min(0, amount), a.currency))}{text(a.due && ` · Due ${date(a.due)}`)}</p><button className="secondary" onClick={() => setModal({ kind: 'transactions', value: { type: 'transfer', to: a.id, name: 'Credit card repayment', category: 'Other' } })}>{tr("Make a repayment ")}<ArrowUpRight size={14}/></button></> : <p><ShieldCheck size={14}/>{tr(" Manually tracked \u00B7 Always in your control")}</p>)}</Swipeable>; })}<button className="add-card" onClick={() => setModal({ kind: 'accounts', ...(view === 'Credit cards' ? { value: { type: 'Credit card' } } : {}) })}><Plus /><h3>{tr("Add an account")}</h3><p>{tr("Give every rupee a home.")}</p></button></div><div className="info-note"><ShieldCheck size={18}/><span>{tr("Accounts are tracked manually. Different currencies are kept separate; no unverified exchange rates are applied.")}</span></div></>}
 {view === 'Budgets & goals' && <>{text(sectionHeader(t.nav[7], 'Make a plan for today. Make room for tomorrow.', 'budgets'))}<div className="section-label"><h2>{tr("Monthly budgets")}</h2><span>{text(new Date(month + '-15').toLocaleDateString(t.locale, { month: 'long', year: 'numeric' }))}</span></div><div className="account-grid">{data.budgets.map((b, i) => { const used = spending.find(x => x.name === (b.category || b.name))?.value || 0; return <Swipeable as="article" className="panel item-card" key={b.id} onEdit={() => setModal({ kind: 'budgets', value: b })} onDelete={() => removeRecord('budgets', b)}><div className="item-top"><RecordIcon record={b} fallback={<Target size={21}/>}/></div><button className="ledger-title" onClick={() => setModal({ kind: 'budgets', value: b })}><h3>{b.name}</h3><ChevronRight size={17}/></button><h2>{text(money(used))} <small>/ {text(money(b.amount))}</small></h2>{text(progress(used, b.amount, used > b.amount ? '#be6d55' : paint.category(b.category || b.name)))}<p>{text(used > b.amount ? 'Over budget by ' + money(used - b.amount) : money(b.amount - used) + ' left to spend')}</p></Swipeable>; })}</div><div className="section-label"><h2>{tr("Savings goals")}</h2><button className="secondary" onClick={() => setModal({ kind: 'goals' })}><Plus size={16}/>{tr("New goal")}</button></div><div className="account-grid">{data.goals.map((g, i) => <Swipeable as="article" className="panel item-card goal-card" key={g.id} onEdit={() => setModal({ kind: 'goals', value: g })} onDelete={() => removeRecord('goals', g)}><div className="item-top">{g.color || g.emoji ? <RecordIcon record={g} fallback={<Target size={21}/>}/> : <span className="goal-emoji">{text(i % 2 === 0 ? '🗻' : '🌱')}</span>}</div><button className="ledger-title" onClick={() => setModal({ kind: 'goals', value: g })}><h3>{g.name}</h3><ChevronRight size={17}/></button><h2>{text(money(g.amount))} <small>/ {text(money(g.target || 0))}</small></h2>{text(progress(g.amount, g.target || 1))}<p>{text(Math.round(g.amount / (g.target || 1) * 100))}{tr("% of the way there")}{text(g.due && ` · ${date(g.due)}`)}</p><button className="secondary" onClick={() => setModal({ kind: 'contribute', value: g })}><Plus size={14}/>{tr("Add savings")}</button></Swipeable>)}</div><p className="muted">{tr("Goal contributions track earmarked savings; they do not create income or move account balances.")}</p></>}
 {text(view === 'Shared expenses' && <>{text(sectionHeader(t.nav[5], 'One group. Every shared expense, together.', 'shared'))}<SharedGroups groups={data.shared} money={money} date={date} open={id => openLedger('shared', id)} edit={value => setModal({ kind: 'shared', value })} remove={value => removeRecord('shared', value, 'Delete this group and its shared transactions?')} transaction={openSharedTransaction} removeEntry={removeSharedEntry} me={me} settle={value => setModal({ kind: 'repayment', value: { ...value, source: 'shared' } })}/></>)}
 {view === 'Debts' && <><div className="page-heading"><div><h1>{tr("Debts & parties")}</h1><p>{tr("Open a party to see lending, borrowing and repayments.")}</p></div><button className="primary" onClick={() => setModal({ kind: 'parties' })}><Plus size={16}/>{tr("Create party")}</button></div><PartyCards data={data} money={money} open={id => openLedger('parties', id)} edit={value => setModal({ kind: 'parties', value })} remove={value => removeRecord('parties', value)}/>{data.debts.length > 0 && <section className="panel report-table"><div className="panel-head"><div><h3>{tr("Existing debt records")}</h3><p>{tr("Preserved balances. New party transactions are tracked separately.")}</p></div><button className="secondary" onClick={() => setModal({ kind: 'debts' })}><Plus size={15}/>{tr("Add debt record")}</button></div>{data.debts.map(x => <Swipeable className="legacy-debt" key={x.id} onEdit={() => setModal({ kind: 'debts', value: x })} onDelete={() => removeRecord('debts', x)}>{(x.color || x.emoji) && <RecordIcon record={x} fallback={<Handshake size={17}/>}/>}<span><button type="button" className="ledger-title legacy-debt-title" onClick={() => setModal({ kind: 'debts', value: x })}><b>{text(x.party)} · {x.name}</b></button><small>{text(x.type)}{tr(" \u00B7 Outstanding ")}{text(money(x.amount - (x.paid || 0)))}</small></span><button className="secondary" onClick={() => setModal({ kind: 'repayment', value: { ...x, source: 'debts' } })}>{tr("Record repayment")}</button></Swipeable>)}</section>}</>}
 {view === 'Recurring' && <>{text(sectionHeader('Recurring bills', 'Open a bill to see its payment history.', 'recurring'))}<div className="account-grid">{data.recurring.map(x => <Swipeable as="article" className="panel item-card" key={x.id} onEdit={() => setModal({ kind: 'recurring', value: x })} onDelete={() => removeRecord('recurring', x)}><div className="item-top"><RecordIcon record={x} fallback={<Repeat />}/></div><span className="badge">{text(x.type)}</span><button className="ledger-title" onClick={() => openLedger('recurring', x.id)}><h3>{x.name}</h3><ChevronRight size={18}/></button><h2>{text(money(x.amount))}</h2><p>{text(x.due && `Due ${date(x.due)}`)} · {text(data.transactions.filter(t => t.recurringId === x.id).length)}{tr(" payments")}</p><div className="ledger-actions"><button className="secondary" onClick={() => openLedger('recurring', x.id)}>{tr("View transactions")}</button><button className="secondary" onClick={() => setModal({ kind: 'transactions', value: { recurringId: x.id, name: x.name, amount: x.amount, type: 'expense', category: x.category } })}>{tr("Record payment")}</button></div></Swipeable>)}</div>{text(!data.recurring.length && <div className="panel empty">{tr("Add your first recurring bill.")}</div>)}<div className="info-note"><Bell size={18}/>{tr("Schedules are reminders. Each recorded payment creates one linked account transaction.")}</div></>}
 {view === 'Reports' && <>{text(sectionHeader(t.nav[8], 'Turn your money story into a clearer next step.', 'transactions'))}<div className="panel report-filters"><label>{tr("From")}<DateField value={dateFrom || range.start} onChange={e => setDateFrom(e.target.value)}/></label><label>{tr("To")}<DateField value={dateTo || range.end} min={dateFrom} onChange={e => setDateTo(e.target.value)}/></label><button className="secondary" onClick={exportCSV}><Download size={16}/>{tr("Download CSV")}</button><button className="secondary" onClick={() => window.print()}><Download size={16}/>{tr("Print / save PDF")}</button></div><section className="panel report-filter-panel">{text(filterBar)}</section><div className="metrics report-metrics">{text([['Income', reportSum.income], ['Expenses', reportSum.expense], ['Net cash flow', reportSum.income - reportSum.expense]].map(([n, v]) => <article className="metric" key={n}><p>{text(n)}</p><h2>{text(money(Number(v)))}</h2></article>))}</div><section className="panel"><div className="panel-head"><h3>{tr("Spending by category")}</h3><span>{text(range.start)} — {text(range.end)} · {text(currency)}</span></div>{reportSpending.map(x => <div className="report-row" key={x.name}><b><i className="category-dot" style={{ background: paint.category(x.name) }}/>{text(x.name)}</b>{text(progress(x.value, reportSum.expense, paint.category(x.name)))}<strong>{text(money(x.value))}</strong><span>{text((x.value / (reportSum.expense || 1) * 100).toFixed(1))}%</span></div>)}{text(!reportSpending.length && <div className="empty">{tr("No expenses in this date range.")}</div>)}</section><section className="panel"><div className="panel-head"><h3>{tr("By account")}</h3><span>{tr("Money in and out of each account")}</span></div>{reportAccounts.map(a => <div className="report-row" key={a.id}><b><i className="category-dot" style={{ background: paint.account(a.id) }}/>{text(a.name)}</b>{text(progress(a.expense, Math.max(...reportAccounts.map(x => x.expense), 1), paint.account(a.id)))}<strong>{text(money(a.expense))}</strong><span className="positive">+{text(money(a.income))}</span></div>)}{text(!reportAccounts.length && <div className="empty">{tr("No account activity for these filters.")}</div>)}</section><section className="panel report-table"><div className="panel-head"><h3>{tr("Period transactions")}</h3><span>{tr("Only accounts denominated in ")}{text(currency)}</span></div>{text(txTable(reportTx))}</section></>}
 {['Account & sign-in', 'Profiles', 'Data & privacy'].includes(view) && <><div className="page-heading"><div><h1>{text(view)}</h1><p>{tr("A workspace that feels like you.")}</p></div></div><div className="settings-grid">{view === 'Profiles' && (<section className="panel settings-panel profile-management"><h3>{tr("Your profiles ")}<span className="count">{text(profiles.length)}/3</span></h3><p>{tr("Each profile has independent accounts, records, country and currency.")}</p>{profiles.map(x => <div className="settings-profile-row" key={x.id}><button className="settings-profile" disabled={switching} aria-label={tr('Switch to ' + x.name)} aria-pressed={x.id === profile} onClick={() => switchTo(x.id)}><ProfileAvatar profile={x}/><span><b>{x.name}</b><small>{tr(x.country)}</small></span></button><button className="secondary profile-customize" aria-label={tr('Customize ' + x.name)} onClick={() => setModal({ kind: 'profile-edit', value: x })}>{tr('Customize')}</button></div>)}<div className="profile-management-actions"><button className="secondary" onClick={() => setProfileMenu(true)}>{tr("Switch profile")}</button>{text(profiles.length < 3 && <button className="secondary" onClick={() => setModal({ kind: 'profile' })}><Plus size={16}/>{tr("Create profile")}</button>)}</div></section>)}{(view === 'Account & sign-in' || view === 'Profiles') && (<><AccountSettings key={profile} user={user} profile={profile} profileName={p?.name || 'profile'} reload={() => load()}/><PanelBoundary><PasskeyManager/></PanelBoundary><PanelBoundary><DeviceSettings/></PanelBoundary></>)}{view === 'Data & privacy' && (<section className="panel settings-panel"><h3>{tr("Data & privacy")}</h3><p>{tr("Your records are stored in a relational database and scoped to your authenticated identity and selected profile.")}</p><button className="secondary" onClick={exportCSV}><Download size={16}/>{tr("Export this period")}</button><BackupTools data={data} onImport={async (value) => { await mutate('backup', { data: value }, 'import'); }}/><p>{tr("Signed in as ")}{user.email}</p><button className="text-button" onClick={async () => { await fetch('/logout', { method: 'POST' }); window.location.assign('/login'); }}><LogOut size={16}/>{tr("Sign out")}</button></section>)}</div></>}

 </>, true)}
 </main>
 </div>
 <nav className="bottom-nav" aria-label={tr("Main navigation")}>{text([0, 1].map(i => { const Icon = icons[i]; return <button key={i} aria-current={view === navKeys[i] ? 'page' : undefined} className={view === navKeys[i] ? 'active' : ''} onClick={() => go(navKeys[i])}><Icon size={20}/><span>{text(t.nav[i])}</span></button>; }))}<button className="nav-add-transaction" aria-label={tr("Add transaction")} onClick={() => setModal({ kind: 'transactions' })}><span className="nav-add-icon"><Plus size={25}/></span></button><button aria-current={view === 'Finance' ? 'page' : undefined} className={view === 'Finance' || [2, 3, 4, 5, 6, 7].some(i => view === navKeys[i]) ? 'active' : ''} onClick={() => go('Finance')}><Wallet size={20}/><span>{tr("Finance")}</span></button><button aria-label={tr("Settings")} aria-current={view === 'Settings' ? 'page' : undefined} className={['Settings', 'Account & sign-in', 'Data & privacy', 'Profiles', 'Categories', 'Payment methods', 'Reports', 'Language & theme', 'About'].includes(view) ? 'active' : ''} onClick={() => go('Settings')}><Settings size={21}/><span>{tr("Settings")}</span></button></nav>
 {text(notice && <div className="toast" role="status"><CheckCircle2 size={18}/>{text(notice, true)}<button onClick={() => setNotice('')} aria-label={tr("Dismiss")}><X size={15}/></button></div>, true)}
 {text(error && <div className="toast error" role="alert">{text(error, true)}<button onClick={() => load(profile)}>{tr("Retry")}</button></div>, true)}
 {text(saveError && !modal && !error && <div className="toast error" role="alert">{text(saveError, true)}<button onClick={() => setSaveError('')} aria-label={tr("Dismiss")}><X size={15}/></button></div>, true)}
 {text(profileMenu && <ProfileSwitcher profiles={profiles} active={profile} busy={switching} onChoose={switchTo} onEdit={value => { setProfileMenu(false); setModal({ kind: 'profile-edit', value }); }} onCreate={() => { setProfileMenu(false); setModal({ kind: 'profile' }); }} close={() => setProfileMenu(false)} onAccount={() => { setProfileMenu(false); go('Profiles'); }} onSignOut={async () => {
            setProfileMenu(false);
            if (localFirst) {
                const waiting = userId.current ? readOps(userId.current).length : 0;
                if (waiting && !(await confirmAction(tr('{0} changes have not been uploaded yet. Signing out removes them from this device.', waiting), 'Sign out'))) return;
            }
            const res = await fetch('/logout', { method: 'POST' }).catch(() => null);
            if (localFirst && !res?.ok) { setNotice('Connect to the internet to sign out.'); return; }
            if (localFirst && userId.current) { callNative('clearLocal', userId.current); clearSnapshot(userId.current); }
            window.location.assign('/login');
        }}/>)}{notifications && <><div className="notifications-backdrop" onClick={() => setNotifications(false)}/><div className="popover notifications notification-center" role="dialog" aria-modal="true" aria-label={tr("Notifications")} style={notifAnchor}><span className="sheet-handle" aria-hidden="true"/><div className="notifications-head"><b>{tr("Notifications")}</b><span className="notifications-head-actions">{notes.length > 0 && <button type="button" className="text-button" onClick={() => keepCleared([...cleared, ...notes.map(noteKey)])}>{tr("Clear all")}</button>}<button type="button" className="text-button" onClick={() => setNotifications(false)}>{tr("Done")}</button></span></div>{notes.length > 0 && <p className="notifications-tip">{tr("Tap to open · swipe left to clear")}</p>}<div className="notification-list">{notes.map(x => <Swipeable key={noteKey(x)} className={'notification-item' + (x.due < localToday ? ' overdue' : x.due === localToday ? ' today' : '')} role="button" tabIndex={0} aria-label={tr('Open {0}', x.name)} deleteLabel="Clear" onClick={() => openNote(x)} onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNote(x); } else if (e.key === 'Delete' || e.key === 'Backspace') keepCleared([...cleared, noteKey(x)]); }} onDelete={() => keepCleared([...cleared, noteKey(x)])}><span><b>{text(tr(x.kind === 'card' ? '{0} payment due' : x.kind === 'goal' ? '{0} goal deadline' : '{0} is due', x.name))}</b><small>{text(dueLabel(x.due))} · {text(date(x.due))}</small></span><strong>{text(x.kind === 'goal' ? tr('{0} still to save', money(x.amount, x.currency)) : money(x.amount, x.currency))}</strong></Swipeable>)}</div>{text(!notes.length && <p className="notifications-empty">{tr("You\u2019re all caught up.")}</p>)}{allNotes.length > notes.length && <button type="button" className="text-button notifications-restore" onClick={() => keepCleared([])}>{tr("Show cleared ({0})", allNotes.length - notes.length)}</button>}</div></>}{text(profileDialog)}{guide === 'welcome' && <WelcomeScreen name={p?.name || me || 'there'} start={() => openGuide(0)} skip={() => leaveGuide('skipped')}/>}{guide === 'tour' && <GuidedTour steps={tourSteps} step={guideStep} setStep={tourTo} navigate={tourNavigate} skip={() => leaveGuide('skipped')} complete={() => { setGuide('complete'); saveGuide(guideWho, { status: 'done', step: 0 }); }}/>}{guide === 'complete' && <CompletionScreen finish={() => { leaveGuide('done'); go('Overview'); }}/>}{text(modal && !['profile', 'profile-edit'].includes(modal.kind) && (modal.kind === 'shared-transaction' ? <SharedTransactionEditor group={modal.value} entry={modal.entry} me={me} currency={currency} busy={busy} serverError={saveError} close={() => setModal(null)} save={mutate} money={money}/> : modal.kind === 'shared' ? <SharedGroupEditor value={modal.value} me={me} parties={data.parties} busy={busy} serverError={saveError} close={() => setModal(null)} save={mutate} money={money}/> : <Editor modal={modal} me={me} countryName={p?.country || 'India'} profile={profile} data={data} currency={currency} busy={busy} serverError={saveError} close={() => setModal(null)} save={mutate} money={money}/>), true)}
 </div>;
}
function Editor({ modal, me, profile, data, currency, countryName, busy, serverError, close, save, money }: {
    me: string;
    countryName: string;
    serverError: string;
    profile: string;
    modal: NonNullable<Modal>;
    data: Data;
    currency: string;
    busy: boolean;
    close: () => void;
    save: (k: string, v: any, a?: string) => Promise<boolean>;
    money: (n: number, c?: string) => string;
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
    // Cash and wallet accounts always pay with the "Cash" method, and "Cash" needs a cash account.
    const cashMethodFor = (acc?: Account) => acc && cashLikeTypes.includes(acc.type) ? (data.paymentMethods || []).find(m => isCashMethod(m.name) && m.enabled && m.country === (acc.country || countryForCurrency(acc.currency, countryName))) : undefined;
    const [methodId, setMethodId] = useState<string>(value?.paymentMethod || cashMethodFor(data.accounts.find(a => a.id === (value?.account || data.accounts[0]?.id)))?.id || '');
    function chooseAccount(id: string) {
        const acc = data.accounts.find(a => a.id === id), cash = cashMethodFor(acc);
        setFromId(id);
        setCur(acc?.currency || currency);
        if (cash) setMethodId(cash.id);
        else if (isCashMethod((data.paymentMethods || []).find(m => m.id === methodId)?.name)) setMethodId('');
    }
    function chooseMethod(id: string) {
        setMethodId(id);
        if (!isCashMethod((data.paymentMethods || []).find(m => m.id === id)?.name) || (fromAccount && cashLikeTypes.includes(fromAccount.type))) return;
        const acc = data.accounts.find(a => cashLikeTypes.includes(a.type) && a.currency === (fromAccount?.currency || currency)) || data.accounts.find(a => cashLikeTypes.includes(a.type));
        if (acc) { setFromId(acc.id); setCur(acc.currency); }
    }
    const available = fromAccount && nonNegativeTypes.includes(fromAccount.type) ? balance(fromAccount, data.transactions.filter(t => t.id !== value?.id)) : undefined;
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
                v = { ...v, type: accountType, country, currency: cur, opening: minor(f.get('opening')), ...look, ...(accountType === 'Credit card' ? { limit: minor(f.get('limit')), due: str('due'), cardType: str('cardType'), lastFour: str('lastFour') || undefined } : {}), ...(['Bank account', 'Savings'].includes(accountType) ? { institution: str('institution').trim(), lastFour: str('lastFour') || undefined } : {}), ...(['Wallet', 'Digital Wallet'].includes(accountType) ? { institution: str('institution').trim(), reference: str('reference').trim() || undefined } : {}) };
            else if (kind === 'transactions') {
                if (linkKind === 'shared') {
                    if (!str('paidBy')) throw Error('Choose who paid.');
                    if (!f.getAll('participants').length) throw Error('Select at least one participant to split this transaction.');
                }
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
    const category = (name = 'category', initial = value?.category) => <ThemedSelect name={name} defaultValue={initial || editorCategories[0] || 'Other'} aria-label={tr("Category")} required>{text([...new Set([...editorCategories, 'Other'])].map(c => <option key={c} value={c}>{emojiLabel({ name: c, emoji: (data.categories || []).find(x => x.name === c)?.emoji })}</option>))}</ThemedSelect>;
    const accountSelect = (name: string, initial?: string) => <ThemedSelect name={name} value={name === 'to' ? toId : fromId} onChange={e => {
            if (name === 'to')
                setToId(e.target.value);
            else
                chooseAccount(e.target.value);
        }} required aria-label={tr(name === 'to' ? 'Destination account' : 'Account')}><option value="">{tr("Choose account")}</option>{data.accounts.filter(a => kind !== 'transactions' || !['shared', 'recurring'].includes(linkKind) || a.currency === currency).map(a => <option key={a.id} value={a.id}>{emojiLabel(a)} · {text(a.type)}{accountReference(a) && <> · {accountReference(a)}</>}</option>)}</ThemedSelect>;
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
            }}><option value="none">Everyday income / expense / transfer</option><option value="party">Debt party · lending / borrowing / repayment</option><option value="shared">Shared expense group</option><option value="recurring">Recurring bill payment</option></ThemedSelect></label>{linkKind !== 'none' && <div className="transaction-link-fields"><label>{text(linkKind === 'party' ? 'Debt party' : linkKind === 'shared' ? 'Shared group' : 'Recurring bill')}<ThemedSelect aria-label={tr(linkKind === 'party' ? 'Debt party' : linkKind === 'shared' ? 'Shared group' : 'Recurring bill')} required value={linkId} onChange={e => setLinkId(e.target.value)}><option value="">Choose {linkKind === 'party' ? 'party' : linkKind === 'shared' ? 'group' : 'bill'}</option>{(linkKind === 'party' ? data.parties || [] : linkKind === 'shared' ? data.shared : data.recurring).map(r => <option key={r.id} value={r.id}>{emojiLabel(r)}</option>)}</ThemedSelect></label>{text(!(linkKind === 'party' ? data.parties?.length : linkKind === 'shared' ? data.shared.length : data.recurring.length) && <p className="form-help">{tr("Create a ")}{text(linkKind === 'party' ? 'party in Debts' : linkKind === 'shared' ? 'shared group' : 'recurring bill')}{tr(" first, then record its transactions here.")}</p>)}{text(linkKind === 'party' && <><label>{tr("Debt movement")}<ThemedSelect aria-label={tr("Debt movement")} value={debtAction} onChange={e => { setDebtAction(e.target.value); setType(['borrow', 'collect'].includes(e.target.value) ? 'income' : 'expense'); }}><option value="lend">Lend money · money out</option><option value="borrow">Borrow money · money in</option><option value="collect">Receive repayment · money in</option><option value="repay">Repay borrowing · money out</option></ThemedSelect></label><p className="form-help">{tr("Changes the account balance without counting as income or spending.")}</p></>)}{linkKind === 'shared' && selectedGroup && <SharedSplitFields key={linkId} group={selectedGroup} me={me} paidBy={value?.paidBy} participants={value?.participants} currency={currency} money={money}/>}</div>}{text(linkKind === 'none' && <div className="tabs form-tabs">{text(['expense', 'income', 'transfer'].map(x => <button type="button" className={type === x ? 'selected' : ''} onClick={() => setType(x)} key={x}>{text(x[0].toUpperCase() + x.slice(1))}</button>))}</div>)}</>}
 {!['repayment', 'contribute'].includes(kind) && <label>{text(kind === 'profile' ? 'Profile name' : 'Name / description')}<input required name="name" maxLength={kind === 'profile' ? 60 : 50} placeholder={tr(kind === 'transactions' ? 'What was it for?' : 'Give it a name')} defaultValue={value?.name}/></label>}
 {['accounts', 'parties', 'budgets', 'goals', 'debts', 'recurring'].includes(kind) && <AppearancePicker color={color} emoji={emoji} onColor={setColor} onEmoji={setEmoji}/>}
 {kind === 'profile' ? <><label>{tr("Country")}<ThemedSelect required value={country} onChange={e => { setCountry(e.target.value); setCur(({ India: 'INR', 'Saudi Arabia': 'SAR', 'United States': 'USD', Germany: 'EUR', 'United Arab Emirates': 'AED', 'United Kingdom': 'GBP' } as any)[e.target.value]); }}>{text(countries.map(c => <option key={c}>{c}</option>))}</ThemedSelect></label><p className="form-help">{tr("A fresh, independent workspace. You can create up to three profiles.")}</p></> : kind === 'accounts' ? <><div className="form-grid"><label>{tr("Country")}<ThemedSelect required value={country} onChange={e => { setCountry(e.target.value); setCur(countryCurrencies[e.target.value]); }}>{text(countries.map(c => <option key={c}>{c}</option>))}</ThemedSelect></label><label>{tr("Account type")}<ThemedSelect required name="accountType" value={accountType} onChange={e => setAccountType(e.target.value)}>{text(['Bank account', 'Savings', 'Cash', 'Wallet', 'Digital Wallet', 'Credit card'].map(c => <option key={c}>{c}</option>))}</ThemedSelect></label></div>{text(amount('opening', 'Opening balance', value?.opening || 0))}{['Bank account', 'Savings'].includes(accountType) && <div className="credit-fields"><h3>{tr("Bank details")}</h3><div className="form-grid"><label>{tr("Bank name")}<input name="institution" required maxLength={60} autoComplete="off" placeholder={tr("e.g. HDFC Bank")} defaultValue={value?.institution}/></label><label>{tr("Last 4 digits")}<input name="lastFour" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} minLength={4} autoComplete="off" placeholder="1234" defaultValue={value?.lastFour}/></label></div><p className="form-help">{tr("Only the last four digits are stored. Never enter your full account number.")}</p></div>}{['Wallet', 'Digital Wallet'].includes(accountType) && <div className="credit-fields"><h3>{tr("Wallet details")}</h3><div className="form-grid"><label>{tr("Wallet or provider")}<input name="institution" required maxLength={60} autoComplete="off" placeholder={tr("e.g. Paytm, PhonePe, BenefitPay")} defaultValue={value?.institution}/></label><label>{tr("Reference")}<input name="reference" maxLength={30} pattern="[A-Za-z0-9@._\-]{2,30}" autoComplete="off" placeholder={tr("Last 4 digits or wallet ID")} defaultValue={value?.reference}/></label></div><p className="form-help">{tr("Use the last few digits or your wallet ID so you can recognise it. Never enter a full card or account number.")}</p></div>}{accountType === 'Credit card' && <><p className="form-help">{tr("Enter an outstanding opening balance as a negative amount.")}</p><div className="credit-fields"><h3>{tr("Credit card details")}</h3>{text(amount('limit', 'Credit card limit', value?.limit))}<label>{tr("Payment due date")}<DateField name="due" defaultValue={value?.due}/></label><div className="form-grid"><label>{tr("Card type")}<ThemedSelect name="cardType" defaultValue={value?.cardType || 'Visa'}>{text(cardTypes.map(type => <option key={type}>{type}</option>))}</ThemedSelect></label><label>{tr("Last 4 digits")}<input name="lastFour" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} minLength={4} placeholder="1234" defaultValue={value?.lastFour}/></label></div><p className="form-help">{tr("Only the last four digits are stored for reference.")}</p></div></>}</> : <>
 {['contribute', 'repayment'].includes(kind) && <p className="form-help">{value.name}{text(kind === 'repayment' ? ` · Outstanding ${money(value.amount - (value.paid || 0))}` : '')}</p>}{text(kind !== 'parties' && amount())}
 {kind === 'transactions' ? <><div className="form-grid"><label>{tr("From / account")}{text(accountSelect('account', value?.account))}{text(available !== undefined && <small className={'available-balance' + (available <= 0 ? ' is-zero' : '')}>{tr("Available: ")}{text(money(available, fromAccount!.currency))}</small>)}</label><label>{tr("Date")}<DateField name="date" required defaultValue={value?.date || new Date().toISOString().slice(0, 10)}/></label></div>{text(type === 'transfer' ? <><label>{tr("To account")}{text(accountSelect('to', value?.to))}</label>{text(amount('received', 'Amount received (required across currencies)', value?.received))}<p className="form-help">{tr("Transfers and card repayments don\u2019t count as income or expenses. Enter the exact received amount for cross-currency transfers.")}</p></> : <label>{tr("Category")}{text(category())}</label>)}<label>{tr("Payment method")}<ThemedSelect name="paymentMethod" aria-label={tr("Payment method")} value={methodId} onChange={e => chooseMethod(e.target.value)}><option value="">Not specified</option>{(data.paymentMethods || []).filter(m => (m.country === methodCountry && m.enabled) || m.id === value?.paymentMethod).map(m => <option key={m.id} value={m.id}>{emojiLabel(m)}{!m.enabled ? ' (disabled)' : ''}</option>)}{text(value?.paymentMethod && !(data.paymentMethods || []).some(m => m.id === value.paymentMethod) && <option value={value.paymentMethod}>{value.paymentMethodName || 'Previous method'} (removed)</option>)}</ThemedSelect></label><label>{tr("Tags")}<input name="tags" defaultValue={value?.tags} placeholder={tr("e.g. personal, weekend")} maxLength={100}/></label><label>{tr("Notes")}<textarea name="notes" defaultValue={value?.notes} maxLength={2000} placeholder={tr("Anything you\u2019d like to remember\u2026")}/></label></> : !['contribute', 'repayment'].includes(kind) && <>{text(kind === 'goals' && amount('target', 'Target amount', value?.target))}{text(['budgets', 'recurring'].includes(kind) && <label>{tr("Category")}{text(category())}</label>)}{text(kind === 'debts' && <label>{tr("Direction")}<ThemedSelect name="debtType" defaultValue={value?.type || 'Lent'}><option>Lent</option><option>Borrowed</option></ThemedSelect></label>)}{text(['debts', 'shared'].includes(kind) && <label>{text(kind === 'debts' ? 'Person' : 'People (comma separated)')}<input name="party" defaultValue={value?.party} required maxLength={120}/></label>)}{text(kind === 'shared' && <label>{tr("Number of people")}<input name="members" type="number" min="2" max="100" required defaultValue={value?.members || 2}/></label>)}{text(kind === 'recurring' && <label>{tr("Frequency")}<ThemedSelect name="frequency" defaultValue={value?.type || 'Monthly'}><option>Monthly</option><option>Weekly</option><option>Yearly</option></ThemedSelect></label>)}{kind === 'parties' && <label>{tr("Notes")}<textarea name="notes" maxLength={1000} defaultValue={value?.notes}/></label>}{text(!['budgets', 'parties'].includes(kind) && <label>{tr("Due / target date")}<DateField name="due" defaultValue={value?.due}/></label>)}</>}
 </>}
 {text(value?.id && <><button type="button" className="text-button" onClick={async () => {
                try {
                    const x = await financeRequest(`/api/finance?profile=${profile}&history=${value.id}`);
                    setHistory(x.history || []);
                }
                catch (e) {
                    setFormError((e as Error).message);
                }
            }}>{tr("View change history")}</button>{history && <div className="history-list">{history.length ? history.map((x, i) => <p key={i}>{text(x.action)} · {text(new Date(x.created).toLocaleString())}<small>{x.after && JSON.parse(x.after).name}</small></p>) : <p>{tr("No changes recorded yet. Sample records start without history.")}</p>}</div>}</>, true)}{text((formError || serverError) && <p className="field-error" role="alert">{text(formError || serverError, true)}</p>, true)}<div className="modal-footer">{text(value?.id && !['repayment', 'contribute'].includes(kind) && <button type="button" className="danger text-danger" disabled={busy} onClick={async () => {
                if (await confirmAction('Delete this record? This cannot be undone.'))
                    save(kind, value, 'delete');
            }}>{tr("Delete")}</button>)}<button type="button" className="secondary" onClick={close}>{tr("Cancel")}</button><button className="primary" disabled={busy || kind === 'profile' && false}>{text(busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>)} {text(busy ? 'Saving…' : 'Save ' + (kind === 'profile' ? 'profile' : kind === 'transactions' ? 'transaction' : 'changes'))}</button></div>
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

