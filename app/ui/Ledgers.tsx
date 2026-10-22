'use client';
import { useI18n } from './UIProvider';
import { Plus, Pencil, ChevronRight, ChevronLeft, Handshake } from 'lucide-react';
import type { ReactNode } from 'react';
import { RecordIcon } from './RecordAppearance';
import { balance, linkedTransactions, partyBalance, sharedEntries, type Data, type Party, type Transaction, type LedgerKind } from '../../lib/finance';
export type Ledger = {
    kind: LedgerKind;
    id: string;
};
export function PartyCards({ data, open, edit, money }: {
    data: Data;
    open: (id: string) => void;
    edit: (p?: Party) => void;
    money: (n: number, c?: string) => string;
}) {
    const { tr, text } = useI18n();
    return <div className="account-grid">{(data.parties || []).map(p => { const count = linkedTransactions('parties', p.id, data.transactions).length; return <article className="panel item-card" key={p.id}><div className="item-top"><RecordIcon record={p} fallback={<Handshake />}/><button className="icon-button" aria-label={tr('Edit party ' + p.name)} onClick={() => edit(p)}><Pencil size={16}/></button></div><button className="ledger-title" onClick={() => open(p.id)}><h3>{p.name}</h3><ChevronRight size={18}/></button><p>{p.notes || tr('Lending, borrowing and repayments')}</p><small className="ledger-count">{text(count)} {tr("Transactions")}</small><button className="secondary" onClick={() => open(p.id)}>{tr("View transactions ")}<ChevronRight size={15}/></button></article>; })}<button className="add-card" onClick={() => edit()}><Plus /><h3>{tr("Create party")}</h3><p>{tr("A separate ledger for each person.")}</p></button></div>;
}
export function LedgerPage({ ledger, data, money, table, back, add, edit, children }: {
    ledger: Ledger;
    data: Data;
    money: (n: number, c?: string) => string;
    table: (rows: Transaction[]) => ReactNode;
    back: () => void;
    add: (value: any) => void;
    edit: () => void;
    children?: ReactNode;
}) {
    const { tr, text } = useI18n();
    const record = ledger.kind === 'parties' ? data.parties?.find(p => p.id === ledger.id) : data[ledger.kind].find(r => r.id === ledger.id);
    if (!record)
        return <section className="panel empty"><h2>{tr("This item is no longer available.")}</h2><button className="secondary" onClick={back}>{tr("Go back")}</button></section>;
    const rows = linkedTransactions(ledger.kind, ledger.id, data.transactions);
    const value = ledger.kind === 'accounts' ? { account: ledger.id } : ledger.kind === 'parties' ? { partyId: ledger.id, debtAction: 'lend', type: 'expense' } : ledger.kind === 'shared' ? { sharedGroupId: ledger.id, type: 'expense' } : { recurringId: ledger.id, type: 'expense', name: record.name, amount: (record as any).amount, category: (record as any).category };
    const currencies = [...new Set(rows.map(t => data.accounts.find(a => a.id === t.account)?.currency).filter(Boolean))] as string[];
    const account = ledger.kind === 'accounts' ? record as any : null;
    const sharedCount = ledger.kind === 'shared' ? sharedEntries(record as any).length : rows.length;
    return <><button className="text-button ledger-back" onClick={back}><ChevronLeft size={16}/>{tr("Back to ")}{text(ledger.kind === 'parties' ? 'debts' : ledger.kind === 'shared' ? 'shared expenses' : ledger.kind === 'recurring' ? 'recurring bills' : 'accounts')}</button><div className="page-heading"><div><div className="eyebrow">{tr("TRANSACTION HISTORY")}</div><h1 className="ledger-heading">{(record.color || record.emoji) && <RecordIcon record={record} fallback={null}/>}{record.name}</h1><p>{text(ledger.kind === 'shared' ? sharedCount : rows.length)} {tr("Transactions")}</p></div><div className="ledger-actions"><button className="secondary" onClick={edit}><Pencil size={15}/>{tr("Edit details")}</button><button className="primary" onClick={() => add(value)}><Plus size={16}/>{tr("Add transaction")}</button></div></div>
 {text(ledger.kind === 'accounts' && <div className="panel ledger-summary"><div className="ledger-summary-top"><div><span>{tr("Current balance")}</span><h2>{text(money(balance(account, data.transactions), account.currency))}</h2></div><span className="badge">{text(account.type)}</span></div>{account.type === 'Credit card' && <div className="ledger-card-details"><span>{text(account.cardType || 'Credit card')}</span><b>•••• {account.lastFour || '— — — —'}</b><span>{tr("Credit limit")}: {text(money(account.limit || 0, account.currency))}</span>{account.due && <span>{tr("Payment due date")}: {text(account.due)}</span>}</div>}<p>{tr("Includes opening balance and both sides of transfers.")}</p></div>)}
 {text(ledger.kind === 'parties' && <div className="panel ledger-summary"><h3>{tr("Party balances")}</h3>{text(currencies.map(c => { const net = partyBalance(ledger.id, rows.filter(t => data.accounts.find(a => a.id === t.account)?.currency === c)); return <p key={c}><b>{text(money(Math.abs(net), c))}</b> · {text(net > 0 ? 'to receive' : net < 0 ? 'to repay' : 'settled')}</p>; }))}{text(!rows.length && <p>{tr("No money lent or borrowed yet.")}</p>)}<p>{tr("Debt movements affect the account balance and stay outside income and spending totals.")}</p></div>)}
 {text(children)}
 <section className="panel report-table"><div className="panel-head"><h3>{text(ledger.kind === 'recurring' ? 'Payment history' : ledger.kind === 'shared' ? 'Linked account transactions' : 'Transactions')}</h3></div>{text(table(rows))}</section></>;
}
