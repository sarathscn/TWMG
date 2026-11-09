'use client';
import { useState, type FormEvent } from 'react';
import { FileText, HandCoins, Plus, ReceiptText, X } from 'lucide-react';
import { useI18n, ValidatedForm } from './UIProvider';
import { ThemedSelect, DateField } from './Controls';
import { RecordIcon } from './RecordAppearance';
import { Swipeable } from './Swipeable';
import { localDate } from '../../lib/cash-flow';
import { currencyScale, fractionDigits, maxAmountMajor, parseMoney } from '../../lib/countries';
import { creditFrequencies, creditSummary, type CreditKind, type CreditRecord } from '../../lib/credit';
const major = (n: number | undefined, currency: string) => n === undefined ? '' : (n / currencyScale(currency)).toFixed(fractionDigits(currency));
type Common = { kind: CreditKind; money: (n: number) => string; date: (s: string) => string };
function Dialog({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
    const { tr } = useI18n();
    return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="credit-title"><div className="modal-head"><div><span className="eyebrow">{tr('A LITTLE MORE CLARITY')}</span><h2 id="credit-title">{title}</h2></div><button className="icon-button" aria-label={tr('Close dialog')} onClick={close}><X size={21}/></button></div>{children}</div></div>;
}
export function CreditPage({ kind, records, money, date, add, edit, remove, pay, report, reverse }: Common & {
    records: CreditRecord[];
    add: () => void;
    edit: (r: CreditRecord) => void;
    remove: (r: CreditRecord) => void;
    pay: (r: CreditRecord) => void;
    report: (id: string) => void;
    reverse: (r: CreditRecord, paymentId: string) => void;
}) {
    const { tr } = useI18n();
    const [open, setOpen] = useState('');
    const today = localDate(), loans = kind === 'loans', rows = records.map(r => ({ r, s: creditSummary(r, today, kind) }));
    const owed = rows.filter(x => x.r.direction !== 'lent').reduce((n, x) => n + x.s.outstanding, 0), lent = rows.filter(x => x.r.direction === 'lent').reduce((n, x) => n + x.s.outstanding, 0);
    return <><div className="page-heading"><div><h1>{tr(loans ? 'Loans' : 'Pay Later')}</h1><p>{tr(loans ? 'Money you borrowed or lent, and what is left to pay.' : 'Buy now, pay later plans and what is still due.')}</p></div><button className="primary" onClick={add}><Plus size={16}/>{tr(loans ? 'Add loan' : 'Add Pay Later')}</button></div>
        <div className="metrics credit-totals"><article className="metric net-worth"><p>{tr(loans ? 'You owe' : 'Total outstanding')}</p><h2>{money(owed)}</h2></article>{loans && <article className="metric"><p>{tr('Owed to you')}</p><h2>{money(lent)}</h2></article>}<article className="metric"><p>{tr('Overdue')}</p><h2>{rows.filter(x => x.s.status === 'Overdue').length}</h2></article></div>
        <div className="account-grid">{rows.map(({ r, s }) => <Swipeable as="article" className="panel item-card credit-card" key={r.id} onEdit={() => edit(r)} onDelete={() => remove(r)}>
            <div className="item-top"><RecordIcon record={r} fallback={loans ? <HandCoins size={21}/> : <ReceiptText size={21}/>}/><span className={'badge credit-status ' + s.status.toLowerCase()}>{tr(s.status)}</span></div>
            <h3>{r.name}</h3><p>{loans ? `${tr(r.direction === 'lent' ? 'Lent to' : 'Borrowed from')} ${r.party}` : r.provider}</p>
            <h2>{money(s.outstanding)} <small>/ {money(r.amount)}</small></h2>
            <div className="progress"><i style={{ width: Math.min(100, s.paid / r.amount * 100) + '%' }}/></div>
            <dl className="credit-facts">{s.nextDue && <div><dt>{tr('Next due')}</dt><dd>{date(s.nextDue)}</dd></div>}<div><dt>{tr('Remaining installments')}</dt><dd>{s.remaining}</dd></div>{r.interestRate !== undefined && <div><dt>{tr('Interest rate')}</dt><dd>{r.interestRate}%</dd></div>}</dl>
            <div className="ledger-actions">{s.outstanding > 0 && <button className="primary" onClick={() => pay(r)}>{tr('Record payment')}</button>}<button className="secondary report-button" onClick={() => report(r.id)}><FileText size={15}/>{tr('Report')}</button>{(r.payments?.length || 0) > 0 && <button className="secondary" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? '' : r.id)}>{tr('Payment history')} ({r.payments!.length})</button>}</div>
            {open === r.id && <ul className="credit-payments">{[...(r.payments || [])].sort((a, b) => b.date.localeCompare(a.date)).map(p => <li key={p.id} className={p.void ? 'reversed' : ''}><span><b>{money(p.amount)}</b><small>{date(p.date)}{p.note ? ' · ' + p.note : ''}{p.void ? ' · ' + tr('Reversed') : ''}</small></span>{!p.void && <button className="text-button" onClick={() => reverse(r, p.id)}>{tr('Reverse')}</button>}</li>)}</ul>}
        </Swipeable>)}<button className="add-card" onClick={add}><Plus /><h3>{tr(loans ? 'Add loan' : 'Add Pay Later')}</h3><p>{tr('The balance updates with every payment you record.')}</p></button></div>
        <div className="info-note"><ReceiptText size={18}/><span>{tr('Payments recorded here reduce this balance only. They do not move money between your accounts, so add a transaction as well if you want an account to change.')}</span></div></>;
}
export function CreditEditor({ kind, value, currency, busy, serverError, close, save }: { kind: CreditKind; value?: CreditRecord; currency: string; busy: boolean; serverError: string; close: () => void; save: (r: CreditRecord) => void }) {
    const { tr } = useI18n();
    const [error, setError] = useState('');
    const [frequency, setFrequency] = useState<string>(value?.frequency || (kind === 'loans' ? 'Monthly' : 'Once')), [direction, setDirection] = useState<string>(value?.direction || 'borrowed');
    const loans = kind === 'loans', paid = (value?.payments || []).filter(p => !p.void).reduce((n, p) => n + p.amount, 0);
    function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault(); setError('');
        const f = new FormData(e.currentTarget), str = (k: string) => String(f.get(k) || '').trim();
        try {
            const amount = parseMoney(str('amount'), currency);
            if (amount <= 0) throw Error('Enter an amount above zero.');
            if (amount < paid) throw Error('The amount cannot be less than what has already been paid.');
            const count = str('installments') ? Number(str('installments')) : undefined, instalment = str('installment') ? parseMoney(str('installment'), currency) : undefined, rate = str('interestRate') ? Number(str('interestRate')) : undefined;
            if (loans && str('due') < str('start')) throw Error('The due date must be after the start date.');
            save({ id: value?.id || crypto.randomUUID(), name: str('name'), amount, frequency, payments: value?.payments || [], ...(value?.color ? { color: value.color } : {}), ...(value?.emoji ? { emoji: value.emoji } : {}), ...(str('description') ? { description: str('description') } : {}), ...(count ? { installments: count } : {}), due: str('due'), ...(loans ? { party: str('party'), direction: direction as 'borrowed' | 'lent', start: str('start'), ...(instalment ? { installment: instalment } : {}), ...(rate !== undefined ? { interestRate: rate } : {}) } : { provider: str('provider') }) });
        } catch (x) { setError(tr((x as Error).message)); }
    }
    return <Dialog title={tr(value ? (loans ? 'Edit loan' : 'Edit Pay Later') : (loans ? 'Add loan' : 'Add Pay Later'))} close={close}><ValidatedForm onSubmit={submit}><div className="form-grid">
        {loans && <label>{tr('Type')}<ThemedSelect aria-label={tr('Type')} value={direction} onChange={e => setDirection(e.target.value)}><option value="borrowed">{tr('I borrowed this')}</option><option value="lent">{tr('I lent this')}</option></ThemedSelect></label>}
        <label>{tr(loans ? 'Loan name' : 'Purchase description')}<input name="name" required maxLength={120} defaultValue={value?.name}/></label>
        {loans ? <label>{tr(direction === 'lent' ? 'Recipient' : 'Lender')}<input name="party" required maxLength={120} defaultValue={value?.party}/></label> : <label>{tr('Merchant or service provider')}<input name="provider" required maxLength={120} defaultValue={value?.provider}/></label>}
        <label>{tr('Original amount')} ({currency})<input name="amount" inputMode="decimal" required maxLength={16} data-max={maxAmountMajor} defaultValue={major(value?.amount, currency)}/></label>
        {loans && <label>{tr('Start date')}<DateField name="start" required defaultValue={value?.start || localDate()}/></label>}
        <label>{tr(loans ? 'Final due date' : 'Payment due date')}<DateField name="due" required defaultValue={value?.due}/></label>
        <label>{tr('Payment frequency')}<ThemedSelect aria-label={tr('Payment frequency')} value={frequency} onChange={e => setFrequency(e.target.value)}>{creditFrequencies.map(x => <option key={x} value={x}>{tr(x)}</option>)}</ThemedSelect></label>
        {frequency !== 'Once' && <label>{tr('Number of installments')}<input name="installments" type="number" inputMode="numeric" min={1} max={600} required={!loans} defaultValue={value?.installments}/></label>}
        {loans && frequency !== 'Once' && <label>{tr('Installment amount')} ({currency})<input name="installment" inputMode="decimal" maxLength={16} defaultValue={major(value?.installment, currency)}/></label>}
        {loans && <label>{tr('Interest rate')} (%)<input name="interestRate" type="number" step="0.01" min={0} max={1000} defaultValue={value?.interestRate}/></label>}
        <label className="wide">{tr('Description')}<input name="description" maxLength={500} defaultValue={value?.description}/></label>
    </div>{loans && <p className="form-help">{tr('Enter the full amount to repay. The interest rate is kept for your reference and is not added automatically.')}</p>}{(error || serverError) && <p className="form-error" role="alert">{error || serverError}</p>}<div className="modal-footer"><button type="button" className="secondary" onClick={close}>{tr('Cancel')}</button><button className="primary" disabled={busy}>{tr('Save')}</button></div></ValidatedForm></Dialog>;
}
export function CreditPaymentDialog({ kind, value, currency, money, busy, serverError, close, save }: { kind: CreditKind; value: CreditRecord; currency: string; money: (n: number) => string; busy: boolean; serverError: string; close: () => void; save: (r: CreditRecord) => void }) {
    const { tr } = useI18n();
    const s = creditSummary(value, localDate(), kind), suggested = Math.min(s.installmentAmount, s.outstanding);
    const [amount, setAmount] = useState(major(suggested, currency)), [error, setError] = useState(''), [id] = useState(() => crypto.randomUUID());
    function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault(); setError('');
        const f = new FormData(e.currentTarget), note = String(f.get('note') || '').trim();
        try {
            const paid = parseMoney(amount, currency);
            if (paid <= 0) throw Error('Enter an amount above zero.');
            if (paid > s.outstanding) throw Error('Payments cannot be more than the amount owed.');
            // The id is fixed for this dialog, so a repeated tap or retry can't record the payment twice.
            save({ ...value, payments: [...(value.payments || []), { id, date: String(f.get('date')), amount: paid, ...(note ? { note } : {}) }] });
        } catch (x) { setError(tr((x as Error).message)); }
    }
    return <Dialog title={tr('Record payment')} close={close}><ValidatedForm onSubmit={submit}><p className="form-help">{value.name} · {tr('Outstanding balance')}: <b>{money(s.outstanding)}</b></p><div className="form-grid">
        <label>{tr('Amount')} ({currency})<input inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)}/></label>
        <label>{tr('Date')}<DateField name="date" required defaultValue={localDate()} max={localDate()}/></label>
        <label className="wide">{tr('Notes')}<input name="note" maxLength={200}/></label>
    </div><div className="credit-pay-shortcuts"><button type="button" className="filter-chip" onClick={() => setAmount(major(s.outstanding, currency))}>{tr('Pay in full')}</button></div>{(error || serverError) && <p className="form-error" role="alert">{error || serverError}</p>}<div className="modal-footer"><button type="button" className="secondary" onClick={close}>{tr('Cancel')}</button><button className="primary" disabled={busy}>{tr('Record payment')}</button></div></ValidatedForm></Dialog>;
}
