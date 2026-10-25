'use client';
import { useI18n, ValidatedForm } from './UIProvider';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Users, Plus, X, Check, LoaderCircle, CheckCircle2, ArrowDownLeft } from 'lucide-react';
import { currencyScale, fractionDigits, maxAmountMajor, parseMoney } from '../../lib/countries';
import { ThemedSelect, DateField } from './Controls';
import { AppearancePicker, RecordIcon, emojiLabel } from './RecordAppearance';
import { Swipeable } from './Swipeable';
import { groupMembers, groupSelf, parseMemberNames, removedMembers, sharedMemberBalances, sharedEntries, sharedTotal, splitSharedExpense, withoutMembers, type Item, type Party, type SharedExpense } from '../../lib/finance';
type Save = (kind: string, value: Item, action?: string) => Promise<boolean>;
type GroupProps = {
    initialTab?: 'details' | 'transactions';
    open?: (id: string) => void;
    money: (n: number) => string;
    date: (s: string) => string;
    edit: (g?: Item) => void;
    remove?: (g: Item) => void;
    transaction: (g: Item, entry?: SharedExpense) => void;
    removeEntry?: (g: Item, entry: SharedExpense) => void;
    settle: (g: Item) => void;
    me?: string;
};
export function SharedGroups({ groups, ...props }: GroupProps & {
    groups: Item[];
}) {
    const { tr, text, confirmAction } = useI18n();
    return <><div className="shared-groups">{text(groups.map(group => <SharedGroupCard key={group.id} group={group} {...props}/>))}</div>{text(!groups.length && <div className="panel empty"><Users /><h3>{tr("Keep shared expenses together")}</h3><p>{tr("Create a group and add the names of everyone sharing costs.")}</p><button className="secondary" onClick={() => props.edit()}><Plus size={15}/>{tr("Create group")}</button></div>)}<div className="info-note"><Users size={18}/><span>{tr("Member names determine the split. Add and manage transactions separately. These shared costs do not create duplicate account expenses.")}</span></div></>;
}
function SharedGroupCard({ group, money, date, edit, remove, transaction, removeEntry, settle, open, initialTab, me = '' }: GroupProps & {
    group: Item;
}) {
    const { tr, text, confirmAction } = useI18n();
    const [tab, setTab] = useState<'details' | 'transactions'>(initialTab || 'details');
    const entries = sharedEntries(group), names = groupMembers(group), total = sharedTotal(entries), paid = group.paid || 0, balances = sharedMemberBalances(group), self = groupSelf(group, me), label = (n: string) => memberLabel(n, self, tr('You'));
    const unassigned = entries.filter(e => !names.includes(e.paidBy)).reduce((s, e) => s + e.amount, 0);
    return <Swipeable as="section" className="panel shared-group" onEdit={() => edit(group)} onDelete={remove && (() => remove(group))}><div className="shared-group-heading"><RecordIcon record={group} fallback={<Users size={21}/>}/><div><button className="ledger-title" onClick={() => open ? open(group.id) : setTab('transactions')}><h3>{group.name}</h3></button><p>{text(names.map(label).join(', '))} · {text(names.length)}{tr(" people")}</p></div></div>
 <div className="group-stats"><div><small>{tr("GROUP TOTAL")}</small><strong>{text(money(total))}</strong></div><div><small>{tr("SETTLED")}</small><strong>{text(money(paid))}</strong></div><div><small>{tr("OUTSTANDING")}</small><strong>{text(money(Math.max(0, total - paid)))}</strong></div></div>
 <div className="group-view-tabs" role="tablist" aria-label={tr('Sections for ' + group.name)}><button role="tab" id={'details-tab-' + group.id} aria-selected={tab === 'details'} aria-controls={'details-' + group.id} onClick={() => setTab('details')}>{tr("Split details ")}<span className="count">{text(names.length)}</span></button><button role="tab" id={'transactions-tab-' + group.id} aria-selected={tab === 'transactions'} aria-controls={'transactions-' + group.id} onClick={() => setTab('transactions')}>{tr("Transactions ")}<span className="count">{text(entries.length)}</span></button></div>
 {tab === 'details' ? <div role="tabpanel" id={'details-' + group.id} aria-labelledby={'details-tab-' + group.id}><div className="member-balance-heading"><span>{tr("Member")}</span><span>{tr("Paid")}</span><span>{tr("Share")}</span><span>{tr("Balance*")}</span></div>{balances.map(member => <div className="member-balance" key={member.name}><b>{text(label(member.name))}</b><span>{text(money(member.paid))}</span><span>{text(money(member.share))}</span><strong className={member.net > 0 ? 'positive' : ''}>{text(money(Math.abs(member.net)))}<small>{text(member.net > 0 ? 'to receive' : member.net < 0 ? 'to pay' : 'even')}</small></strong></div>)}<p className="split-footnote">{tr("* Paid minus share, before recorded group settlements. ")}{text(unassigned > 0 && `${money(unassigned)} has no assigned payer. Edit those transactions to complete the balances.`)}</p>{text(group.due && <p className="split-footnote">{tr("Settlement due ")}{text(date(group.due))}</p>)}</div> : <div role="tabpanel" id={'transactions-' + group.id} aria-labelledby={'transactions-tab-' + group.id} className="group-transactions">{entries.length ? entries.map(entry => <Swipeable className="group-transaction" key={entry.id} onEdit={() => transaction(group, entry)} onDelete={removeEntry && (() => removeEntry(group, entry))}><span className="group-entry-icon"><ArrowDownLeft size={15}/></span><div><button type="button" className="ledger-title group-entry-title" onClick={() => transaction(group, entry)}><b>{entry.name}</b></button><small>{text(date(entry.date))} · {entry.paidBy ? tr('Paid by {0}', label(entry.paidBy)) : tr('Payer not assigned')}</small><small>{tr("Split: ")}{splitSharedExpense(entry, names).map(s => `${label(s.name)} ${money(s.amount)}`).join(' · ')}</small>{entry.notes && <p>{entry.notes}</p>}</div><strong>{text(money(entry.amount))}</strong></Swipeable>) : <div className="group-empty">{tr("No transactions yet. Add the first expense to this group.")}</div>}</div>}
 <div className="group-actions"><button className="secondary" disabled={entries.length >= 100} onClick={() => { setTab('transactions'); transaction(group); }}><Plus size={15}/>{tr("Add transaction")}</button><button className="text-button" disabled={paid >= total} onClick={() => settle(group)}><CheckCircle2 size={15}/>{tr("Record settlement")}</button></div></Swipeable>;
}
function SharedDialog({ title, close, children }: {
    title: string;
    close: () => void;
    children: ReactNode;
}) {
    const { tr, text, confirmAction } = useI18n();
    useEffect(() => {
        const dialog = document.querySelector<HTMLElement>('.modal');
        const previous = document.activeElement as HTMLElement;
        dialog?.querySelector<HTMLInputElement>('input,textarea')?.focus();
        const trap = (e: KeyboardEvent) => {
            if (e.key !== 'Tab' || !dialog)
                return;
            const fields = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea'));
            if (e.shiftKey && document.activeElement === fields[0]) {
                e.preventDefault();
                fields.at(-1)?.focus();
            }
            else if (!e.shiftKey && document.activeElement === fields.at(-1)) {
                e.preventDefault();
                fields[0]?.focus();
            }
        };
        document.addEventListener('keydown', trap);
        return () => { document.removeEventListener('keydown', trap); previous?.focus({ preventScroll: true }); };
    }, []);
    return <div className="modal-backdrop" onMouseDown={e => {
            if (e.target === e.currentTarget)
                close();
        }}><div className="modal group-editor" role="dialog" aria-modal="true" aria-labelledby="shared-dialog-title"><div className="modal-head"><div><span className="eyebrow">{tr("BETTER TOGETHER")}</span><h2 id="shared-dialog-title">{text(title)}</h2></div><button className="icon-button" aria-label={tr("Close dialog")} onClick={close}><X size={21}/></button></div>{text(children)}</div></div>;
}
function SaveButton({ busy, label }: {
    busy: boolean;
    label: string;
}) { const { tr, text, confirmAction } = useI18n(); return <button className="primary" disabled={busy}>{text(busy ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>)} {text(label)}</button>; }
function validateNames(names: string[], self?: string) {
    if (!names.some(n => n !== self))
        throw Error('Select at least one participant to share this group with.');
    if (names.length < 2 || names.length > 100)
        throw Error('Add between 2 and 100 member names.');
    if (names.some(n => n.length > 80))
        throw Error('Each member name can have up to 80 characters.');
    if (new Set(names.map(n => n.toLowerCase())).size !== names.length)
        throw Error('Each member needs a unique name.');
}
// "You (Sarath)" for the signed-in user, the plain name for everyone else.
export const memberLabel = (name: string, self: string | undefined, you: string) => name === self ? you + ' (' + name + ')' : name;
export function SharedGroupEditor({ value, me, parties = [], busy, serverError, close, save, money }: {
    value?: Item;
    me: string;
    parties?: Party[];
    busy: boolean;
    serverError: string;
    close: () => void;
    save: Save;
    money: (n: number) => string;
}) {
    const { tr, text, confirmAction } = useI18n();
    // New groups always start with the signed-in user, who can't be removed.
    const self = value ? groupSelf(value, me) : (me.trim().slice(0, 80) || 'Me');
    const [members, setMembers] = useState<string[]>(() => value ? groupMembers(value) : [self!]);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');
    const [color, setColor] = useState(value?.color || ''), [emoji, setEmoji] = useState(value?.emoji || '');
    const entries = value ? sharedEntries(value) : [], total = sharedTotal(entries), others = members.filter(n => n !== self);
    const removed = value ? removedMembers(groupMembers(value), members) : [];
    let previewEntries = entries, previewError = '';
    try { previewEntries = withoutMembers(entries, removed); } catch (e) { previewError = (e as Error).message; }
    const preview = sharedMemberBalances({ id: value?.id || 'preview', name: 'Preview', amount: total, memberNames: members, expenses: previewEntries });
    const suggestions = parties.filter(p => !members.some(m => m.toLowerCase() === p.name.trim().toLowerCase())).slice(0, 12);
    const merged = (input: string) => { const next = [...members]; for (const name of parseMemberNames(input).map(n => n.slice(0, 80))) if (!next.some(m => m.toLowerCase() === name.toLowerCase())) next.push(name); return next; };
    function add(input: string) {
        setError('');
        const next = merged(input);
        if (next.length > 100) { setError('Add between 2 and 100 member names.'); return; }
        setMembers(next);
        setDraft('');
    }
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError('');
        // Read the form before any await: React clears currentTarget once the handler yields.
        const form = new FormData(e.currentTarget);
        try {
            // A name still typed in the box counts, so it isn't lost on save.
            const names = draft.trim() ? merged(draft) : members;
            validateNames(names, self);
            const expenses = withoutMembers(entries, removed);
            const affected = expenses.filter((x, i) => x !== entries[i]).length;
            if (affected && !(await confirmAction(tr('Remove {0} from the group? They will be taken out of {1} transaction splits and the shares recalculated.', removed.join(', '), affected), tr('Remove'))))
                return;
            await save('shared', { ...value, id: value?.id || crypto.randomUUID(), name: String(form.get('name')).trim(), memberNames: names, self: self && names.includes(self) ? self : undefined, party: names.join(', '), members: names.length, due: String(form.get('due') || ''), amount: total, paid: value?.paid || 0, expenses, color: color || undefined, emoji: emoji || undefined });
        }
        catch (e) {
            setError((e as Error).message);
        }
    }
    return <SharedDialog title={tr(value ? 'Edit group details' : 'Create shared group')} close={close}><ValidatedForm onSubmit={submit}><label>{tr("Group name")}<input name="name" defaultValue={value?.name} required maxLength={50} placeholder={tr("e.g. Apartment expenses or Kerala trip")}/></label><AppearancePicker color={color} emoji={emoji} onColor={setColor} onEmoji={setEmoji}/>
        <fieldset className="member-picker"><legend>{tr("Members")}</legend>
            <div className="member-chips editable" aria-live="polite">{text(members.map(name => <span key={name} className={name === self ? 'is-self' : ''}>{text(memberLabel(name, self, tr('You')))}{name !== self && <button type="button" aria-label={tr('Remove {0}', name)} onClick={() => { setError(''); setMembers(m => m.filter(x => x !== name)); }}><X size={13}/></button>}</span>))}</div>
            <div className="member-add"><input value={draft} maxLength={400} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); if (draft.trim()) add(draft); } }} placeholder={tr("Add a person, e.g. Arjun")} aria-label={tr("Add a person")}/><button type="button" className="secondary" disabled={!draft.trim()} onClick={() => add(draft)}><Plus size={15}/>{tr("Add")}</button></div>
            {text(suggestions.length > 0 && <div className="member-suggestions"><small>{tr("From your debt parties")}</small>{suggestions.map(p => <button type="button" key={p.id} onClick={() => add(p.name)}><Plus size={12}/>{text(emojiLabel(p))}</button>)}</div>)}
        </fieldset>
        <div className="member-count"><Users size={17}/><b>{text(members.length)}{tr(" members")}</b><span>{others.length ? tr('{0} sharing with you', others.length) : tr('Select at least one participant')}</span></div><p className="form-help">{tr("Members are added to Debts & parties automatically, so you can track what each person owes.")}</p><label>{tr("Settlement due date")}<DateField name="due" defaultValue={value?.due}/></label><div className="split-preview"><h3>{tr("Split preview")}</h3><p>{text(entries.length ? 'Current shares across existing transactions.' : 'Transactions added later will split between these members.')}</p>{text(previewError ? <p className="field-error">{text(previewError, true)}</p> : preview.map((member, i) => <div key={i}><span>{text(memberLabel(member.name, self, tr('You')))}</span><b>{text(money(member.share))}</b></div>))}</div><p className="form-help separate-help">{tr("Group details and transactions are saved separately. Use Add transaction after saving the group.")}</p>{text((error || serverError) && <p className="field-error" role="alert">{text(error || serverError, true)}</p>, true)}<div className="modal-footer">{text(value && <button type="button" disabled={busy} className="danger text-danger" onClick={async () => {
                if (await confirmAction('Delete this group and its shared transactions?'))
                    save('shared', value, 'delete');
            }}>{tr("Delete")}</button>)}<button type="button" className="secondary" onClick={close}>{tr("Cancel")}</button><SaveButton busy={busy} label={tr("Save group")}/></div></ValidatedForm></SharedDialog>;
}
export function SharedTransactionEditor({ group, entry, me = '', currency, busy, serverError, close, save, money }: {
    group: Item;
    me?: string;
    entry?: SharedExpense;
    currency: string;
    busy: boolean;
    serverError: string;
    close: () => void;
    save: Save;
    money: (n: number) => string;
}) {
    const { tr, text, confirmAction } = useI18n();
    const names = groupMembers(group), self = groupSelf(group, me), [amount, setAmount] = useState(entry ? (entry.amount / currencyScale(currency)).toFixed(fractionDigits(currency)) : ''), [payer, setPayer] = useState(entry?.paidBy || self || ''), [selected, setSelected] = useState<string[]>(entry?.participants || names), [error, setError] = useState('');
    const minor = Math.round((Number(amount) || 0) * currencyScale(currency));
    const splits = splitSharedExpense({ id: 'preview', name: 'Preview', amount: minor, date: '', paidBy: payer, participants: selected }, names);
    async function persist(expenses: SharedExpense[]) {
        const total = sharedTotal(expenses);
        if (total < (group.paid || 0))
            throw Error('The group total cannot be lower than recorded settlements.');
        return save('shared', { ...group, memberNames: names, party: names.join(', '), members: names.length, expenses, amount: total });
    }
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError('');
        try {
            if (parseMoney(amount, currency) <= 0)
                throw Error('Enter a positive amount.');
            if (!selected.length)
                throw Error('Select at least one participant to split this transaction.');
            if (!names.includes(payer))
                throw Error('Choose who paid.');
            const form = new FormData(e.currentTarget);
            const value: SharedExpense = { id: entry?.id || crypto.randomUUID(), name: String(form.get('name')).trim(), date: String(form.get('date')), notes: String(form.get('notes') || ''), amount: minor, paidBy: payer, participants: names.filter(n => selected.includes(n)) };
            const entries = sharedEntries(group);
            await persist(entry ? entries.map(e => e.id === entry.id ? value : e) : [...entries, value]);
        }
        catch (e) {
            setError((e as Error).message);
        }
    }
    return <SharedDialog title={tr(entry ? 'Edit shared transaction' : 'Add shared transaction')} close={close}><ValidatedForm onSubmit={submit}><p className="transaction-group-label"><Users size={15}/>{group.name}</p><label>{tr("Description")}<input name="name" defaultValue={entry?.name} required maxLength={120} placeholder={tr("e.g. Groceries, dinner, taxi")}/></label><div className="form-grid"><label>{tr("Amount (")}{text(currency)})<input type="number" min={1 / currencyScale(currency)} max={maxAmountMajor} step={1 / currencyScale(currency)} required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"/></label><label>{tr("Date")}<DateField name="date" required defaultValue={entry?.date || new Date().toISOString().slice(0, 10)}/></label></div><label>{tr("Paid by")}<ThemedSelect value={payer} onChange={e => setPayer(e.target.value)} required><option value="">{tr('Choose who paid')}</option>{text(names.map(n => <option key={n} value={n}>{memberLabel(n, self, tr('You'))}</option>))}</ThemedSelect></label><fieldset className="split-members"><legend>{tr("Split between \u00B7 ")}{text(selected.length)}{tr(" selected")}</legend><div className="split-member-options">{text(names.map(name => <label className="checkbox" key={name}><input type="checkbox" checked={selected.includes(name)} onChange={e => setSelected(old => e.target.checked ? [...old, name] : old.filter(n => n !== name))}/>{memberLabel(name, self, tr('You'))}</label>))}</div></fieldset><div className="split-preview"><h3>{tr("Who owes what")}</h3>{splits.map(s => <div key={s.name}><span>{memberLabel(s.name, self, tr('You'))}</span><b>{text(money(s.amount))}</b></div>)}{text(!splits.length && <p>{tr("Select members to calculate shares.")}</p>)}<p>{tr("Split equally. Any remaining minor units are allocated in member order, so shares add up exactly.")}</p></div><label>{tr("Notes (optional)")}<textarea name="notes" maxLength={1000} defaultValue={entry?.notes}/></label>{text((error || serverError) && <p className="field-error" role="alert">{text(error || serverError, true)}</p>, true)}<div className="modal-footer">{text(entry && <button type="button" disabled={busy} className="danger text-danger" onClick={async () => {
                if (await confirmAction('Delete this shared transaction?')) {
                    setError('');
                    try {
                        await persist(sharedEntries(group).filter(e => e.id !== entry.id));
                    }
                    catch (e) {
                        setError((e as Error).message);
                    }
                }
            }}>{tr("Delete")}</button>, true)}<button type="button" className="secondary" onClick={close}>{tr("Cancel")}</button><SaveButton busy={busy} label={tr("Save transaction")}/></div></ValidatedForm></SharedDialog>;
}
// Paid by and split fields for an account transaction linked to a group. Mounted per group, so
// choosing another group starts fresh. Shares follow the amount typed in the surrounding form.
export function SharedSplitFields({ group, me = '', paidBy, participants, currency, money }: {
    group: Item;
    me?: string;
    paidBy?: string;
    participants?: string[];
    currency: string;
    money: (n: number) => string;
}) {
    const { tr, text } = useI18n();
    const names = groupMembers(group), self = groupSelf(group, me);
    const [payer, setPayer] = useState(paidBy && names.includes(paidBy) ? paidBy : self || '');
    const [selected, setSelected] = useState<string[]>(() => participants?.filter(n => names.includes(n)) || names);
    const [amount, setAmount] = useState(0);
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const form = box.current?.closest('form');
        const read = () => setAmount(parseMoney(String(new FormData(form!).get('amount') || '0'), currency));
        if (!form) return;
        read();
        form.addEventListener('input', read);
        return () => form.removeEventListener('input', read);
    }, [currency]);
    const splits = splitSharedExpense({ id: 'preview', name: 'Preview', amount, date: '', paidBy: payer, participants: selected }, names);
    return <div ref={box}><label>{tr("Paid by")}<ThemedSelect name="paidBy" value={payer} onChange={e => setPayer(e.target.value)} required aria-label={tr("Paid by")}><option value="">{tr('Choose who paid')}</option>{text(names.map(n => <option key={n} value={n}>{memberLabel(n, self, tr('You'))}</option>))}</ThemedSelect></label>
        <fieldset className="split-members"><legend>{tr("Split between · ")}{text(selected.length)}{tr(" selected")}</legend><div className="split-member-options">{text(names.map(n => <label className="checkbox" key={n}><input name="participants" value={n} type="checkbox" checked={selected.includes(n)} onChange={e => setSelected(old => e.target.checked ? names.filter(x => x === n || old.includes(x)) : old.filter(x => x !== n))}/>{text(memberLabel(n, self, tr('You')))}</label>))}</div></fieldset>
        {text(!selected.length && <p className="field-error" role="alert">{tr('Select at least one participant to split this transaction.')}</p>)}
        {text(amount > 0 && splits.length > 0 && <div className="split-preview"><h3>{tr("Who owes what")}</h3>{splits.map(s => <div key={s.name}><span>{text(memberLabel(s.name, self, tr('You')))}</span><b>{text(money(s.amount))}</b></div>)}</div>)}
        <p className="form-help">{tr("The expense appears once in your account and updates this group’s member splits.")}</p></div>;
}
