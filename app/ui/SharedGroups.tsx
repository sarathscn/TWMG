'use client';
import { useI18n, ValidatedForm } from './UIProvider';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Users, Plus, Pencil, Trash2, X, Check, LoaderCircle, CheckCircle2, ArrowDownLeft } from 'lucide-react';
import { currencyScale, fractionDigits, maxAmountMajor, parseMoney } from '../../lib/countries';
import { ThemedSelect, DateField } from './Controls';
import { AppearancePicker, RecordIcon } from './RecordAppearance';
import { Swipeable } from './Swipeable';
import { groupMembers, parseMemberNames, sharedMemberBalances, sharedEntries, sharedTotal, splitSharedExpense, type Item, type SharedExpense } from '../../lib/finance';
type Save = (kind: string, value: Item, action?: string) => Promise<boolean>;
type GroupProps = {
    initialTab?: 'details' | 'transactions';
    open?: (id: string) => void;
    money: (n: number) => string;
    date: (s: string) => string;
    edit: (g?: Item) => void;
    remove?: (g: Item) => void;
    transaction: (g: Item, entry?: SharedExpense) => void;
    settle: (g: Item) => void;
};
export function SharedGroups({ groups, ...props }: GroupProps & {
    groups: Item[];
}) {
    const { tr, text, confirmAction } = useI18n();
    return <><div className="shared-groups">{text(groups.map(group => <SharedGroupCard key={group.id} group={group} {...props}/>))}</div>{text(!groups.length && <div className="panel empty"><Users /><h3>{tr("Keep shared expenses together")}</h3><p>{tr("Create a group and add the names of everyone sharing costs.")}</p><button className="secondary" onClick={() => props.edit()}><Plus size={15}/>{tr("Create group")}</button></div>)}<div className="info-note"><Users size={18}/><span>{tr("Member names determine the split. Add and manage transactions separately. These shared costs do not create duplicate account expenses.")}</span></div></>;
}
function SharedGroupCard({ group, money, date, edit, remove, transaction, settle, open, initialTab }: GroupProps & {
    group: Item;
}) {
    const { tr, text, confirmAction } = useI18n();
    const [tab, setTab] = useState<'details' | 'transactions'>(initialTab || 'details');
    const entries = sharedEntries(group), names = groupMembers(group), total = sharedTotal(entries), paid = group.paid || 0, balances = sharedMemberBalances(group);
    const unassigned = entries.filter(e => !names.includes(e.paidBy)).reduce((s, e) => s + e.amount, 0);
    return <Swipeable as="section" className="panel shared-group" onEdit={() => edit(group)} onDelete={remove && (() => remove(group))}><div className="shared-group-heading"><RecordIcon record={group} fallback={<Users size={21}/>}/><div><button className="ledger-title" onClick={() => open ? open(group.id) : setTab('transactions')}><h3>{group.name}</h3></button><p>{text(names.join(', '))} · {text(names.length)}{tr(" people")}</p></div><button className="icon-button" aria-label={tr('Edit group ' + group.name)} onClick={() => edit(group)}><Pencil size={16}/></button></div>
 <div className="group-stats"><div><small>{tr("GROUP TOTAL")}</small><strong>{text(money(total))}</strong></div><div><small>{tr("SETTLED")}</small><strong>{text(money(paid))}</strong></div><div><small>{tr("OUTSTANDING")}</small><strong>{text(money(Math.max(0, total - paid)))}</strong></div></div>
 <div className="group-view-tabs" role="tablist" aria-label={tr('Sections for ' + group.name)}><button role="tab" id={'details-tab-' + group.id} aria-selected={tab === 'details'} aria-controls={'details-' + group.id} onClick={() => setTab('details')}>{tr("Split details ")}<span className="count">{text(names.length)}</span></button><button role="tab" id={'transactions-tab-' + group.id} aria-selected={tab === 'transactions'} aria-controls={'transactions-' + group.id} onClick={() => setTab('transactions')}>{tr("Transactions ")}<span className="count">{text(entries.length)}</span></button></div>
 {tab === 'details' ? <div role="tabpanel" id={'details-' + group.id} aria-labelledby={'details-tab-' + group.id}><div className="member-balance-heading"><span>{tr("Member")}</span><span>{tr("Paid")}</span><span>{tr("Share")}</span><span>{tr("Balance*")}</span></div>{balances.map(member => <div className="member-balance" key={member.name}><b>{member.name}</b><span>{text(money(member.paid))}</span><span>{text(money(member.share))}</span><strong className={member.net > 0 ? 'positive' : ''}>{text(money(Math.abs(member.net)))}<small>{text(member.net > 0 ? 'to receive' : member.net < 0 ? 'to pay' : 'even')}</small></strong></div>)}<p className="split-footnote">{tr("* Paid minus share, before recorded group settlements. ")}{text(unassigned > 0 && `${money(unassigned)} has no assigned payer. Edit those transactions to complete the balances.`)}</p>{text(group.due && <p className="split-footnote">{tr("Settlement due ")}{text(date(group.due))}</p>)}</div> : <div role="tabpanel" id={'transactions-' + group.id} aria-labelledby={'transactions-tab-' + group.id} className="group-transactions">{entries.length ? entries.map(entry => <div className="group-transaction" key={entry.id}><span className="group-entry-icon"><ArrowDownLeft size={15}/></span><div><b>{entry.name}</b><small>{text(date(entry.date))} · {entry.paidBy ? tr('Paid by {0}',entry.paidBy) : tr('Payer not assigned')}</small><small>{tr("Split: ")}{splitSharedExpense(entry, names).map(s => `${s.name} ${money(s.amount)}`).join(' · ')}</small>{entry.notes && <p>{entry.notes}</p>}</div><strong>{text(money(entry.amount))}</strong><button className="icon-button" aria-label={tr('Edit transaction ' + entry.name)} onClick={() => transaction(group, entry)}><Pencil size={14}/></button></div>) : <div className="group-empty">{tr("No transactions yet. Add the first expense to this group.")}</div>}</div>}
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
function validateNames(names: string[]) {
    if (names.length < 2 || names.length > 100)
        throw Error('Add between 2 and 100 member names.');
    if (names.some(n => n.length > 80))
        throw Error('Each member name can have up to 80 characters.');
    if (new Set(names.map(n => n.toLowerCase())).size !== names.length)
        throw Error('Each member needs a unique name.');
}
export function SharedGroupEditor({ value, busy, serverError, close, save, money }: {
    value?: Item;
    busy: boolean;
    serverError: string;
    close: () => void;
    save: Save;
    money: (n: number) => string;
}) {
    const { tr, text, confirmAction } = useI18n();
    const [people, setPeople] = useState(() => value ? groupMembers(value).join(', ') : '');
    const [error, setError] = useState('');
    const [color, setColor] = useState(value?.color || ''), [emoji, setEmoji] = useState(value?.emoji || '');
    const names = parseMemberNames(people), entries = value ? sharedEntries(value) : [], total = sharedTotal(entries);
    const preview = sharedMemberBalances({ id: value?.id || 'preview', name: 'Preview', amount: total, memberNames: names, expenses: entries });
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError('');
        try {
            validateNames(names);
            for (const entry of entries) {
                if (entry.paidBy && !names.includes(entry.paidBy) || entry.participants?.some(n => !names.includes(n)))
                    throw Error('A removed member is used by an existing transaction. Update that transaction before removing the member.');
            }
            const form = new FormData(e.currentTarget);
            await save('shared', { ...value, id: value?.id || crypto.randomUUID(), name: String(form.get('name')).trim(), memberNames: names, party: names.join(', '), members: names.length, due: String(form.get('due') || ''), amount: total, paid: value?.paid || 0, expenses: entries, color: color || undefined, emoji: emoji || undefined });
        }
        catch (e) {
            setError((e as Error).message);
        }
    }
    return <SharedDialog title={tr(value ? 'Edit group details' : 'Create shared group')} close={close}><ValidatedForm onSubmit={submit}><label>{tr("Group name")}<input name="name" defaultValue={value?.name} required maxLength={50} placeholder={tr("e.g. Apartment expenses or Kerala trip")}/></label><AppearancePicker color={color} emoji={emoji} onColor={setColor} onEmoji={setEmoji}/><label>{tr("Member names")}<textarea name="people" value={people} onChange={e => setPeople(e.target.value)} placeholder={tr("Me, Arjun, Meera")} required maxLength={8000}/></label><div className="member-count"><Users size={17}/><b>{text(names.length)}{tr(" members")}</b><span>{tr("Counted automatically from names")}</span></div><p className="form-help">{tr("Separate names with commas or new lines. Include your own name if you share the expenses.")}</p><div className="member-chips">{text(names.map((name, i) => <span key={i}>{name}</span>))}</div><label>{tr("Settlement due date")}<DateField name="due" defaultValue={value?.due}/></label><div className="split-preview"><h3>{tr("Split preview")}</h3><p>{text(entries.length ? 'Current shares across existing transactions.' : 'Transactions added later will split between these members.')}</p>{preview.map((member, i) => <div key={i}><span>{member.name}</span><b>{text(money(member.share))}</b></div>)}{text(!names.length && <p>{tr("Add names to see the split.")}</p>)}</div><p className="form-help separate-help">{tr("Group details and transactions are saved separately. Use Add transaction after saving the group.")}</p>{text((error || serverError) && <p className="field-error" role="alert">{text(error || serverError, true)}</p>, true)}<div className="modal-footer">{text(value && <button type="button" disabled={busy} className="danger icon-button" aria-label={tr("Delete group")} onClick={async () => {
                if (await confirmAction('Delete this group and its shared transactions?'))
                    save('shared', value, 'delete');
            }}><Trash2 size={18}/></button>)}<button type="button" className="secondary" onClick={close}>{tr("Cancel")}</button><SaveButton busy={busy} label={tr("Save group")}/></div></ValidatedForm></SharedDialog>;
}
export function SharedTransactionEditor({ group, entry, currency, busy, serverError, close, save, money }: {
    group: Item;
    entry?: SharedExpense;
    currency: string;
    busy: boolean;
    serverError: string;
    close: () => void;
    save: Save;
    money: (n: number) => string;
}) {
    const { tr, text, confirmAction } = useI18n();
    const names = groupMembers(group), [amount, setAmount] = useState(entry ? (entry.amount / currencyScale(currency)).toFixed(fractionDigits(currency)) : ''), [payer, setPayer] = useState(entry?.paidBy || names[0] || ''), [selected, setSelected] = useState<string[]>(entry?.participants || names), [error, setError] = useState('');
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
                throw Error('Choose at least one member to split this transaction.');
            if (!names.includes(payer))
                throw Error('Choose the member who paid.');
            const form = new FormData(e.currentTarget);
            const value: SharedExpense = { id: entry?.id || crypto.randomUUID(), name: String(form.get('name')).trim(), date: String(form.get('date')), notes: String(form.get('notes') || ''), amount: minor, paidBy: payer, participants: names.filter(n => selected.includes(n)) };
            const entries = sharedEntries(group);
            await persist(entry ? entries.map(e => e.id === entry.id ? value : e) : [...entries, value]);
        }
        catch (e) {
            setError((e as Error).message);
        }
    }
    return <SharedDialog title={tr(entry ? 'Edit shared transaction' : 'Add shared transaction')} close={close}><ValidatedForm onSubmit={submit}><p className="transaction-group-label"><Users size={15}/>{group.name}</p><label>{tr("Description")}<input name="name" defaultValue={entry?.name} required maxLength={120} placeholder={tr("e.g. Groceries, dinner, taxi")}/></label><div className="form-grid"><label>{tr("Amount (")}{text(currency)})<input type="number" min={1 / currencyScale(currency)} max={maxAmountMajor} step={1 / currencyScale(currency)} required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"/></label><label>{tr("Date")}<DateField name="date" required defaultValue={entry?.date || new Date().toISOString().slice(0, 10)}/></label></div><label>{tr("Paid by")}<ThemedSelect value={payer} onChange={e => setPayer(e.target.value)} required><option value="">Choose a member</option>{text(names.map(n => <option key={n} value={n}>{n}</option>))}</ThemedSelect></label><fieldset className="split-members"><legend>{tr("Split between \u00B7 ")}{text(selected.length)}{tr(" selected")}</legend><div className="split-member-options">{text(names.map(name => <label className="checkbox" key={name}><input type="checkbox" checked={selected.includes(name)} onChange={e => setSelected(old => e.target.checked ? [...old, name] : old.filter(n => n !== name))}/>{name}</label>))}</div></fieldset><div className="split-preview"><h3>{tr("Who owes what")}</h3>{splits.map(s => <div key={s.name}><span>{s.name}</span><b>{text(money(s.amount))}</b></div>)}{text(!splits.length && <p>{tr("Select members to calculate shares.")}</p>)}<p>{tr("Split equally. Any remaining minor units are allocated in member order, so shares add up exactly.")}</p></div><label>{tr("Notes (optional)")}<textarea name="notes" maxLength={1000} defaultValue={entry?.notes}/></label>{text((error || serverError) && <p className="field-error" role="alert">{text(error || serverError, true)}</p>, true)}<div className="modal-footer">{text(entry && <button type="button" disabled={busy} className="danger icon-button" aria-label={tr("Delete transaction")} onClick={async () => {
                if (await confirmAction('Delete this shared transaction?')) {
                    setError('');
                    try {
                        await persist(sharedEntries(group).filter(e => e.id !== entry.id));
                    }
                    catch (e) {
                        setError((e as Error).message);
                    }
                }
            }}><Trash2 size={18}/></button>, true)}<button type="button" className="secondary" onClick={close}>{tr("Cancel")}</button><SaveButton busy={busy} label={tr("Save transaction")}/></div></ValidatedForm></SharedDialog>;
}
