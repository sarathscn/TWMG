'use client';
import { useMemo, useRef, useState } from 'react';
import { Download, LoaderCircle, Share2, X } from 'lucide-react';
import { useI18n } from './UIProvider';
import { DateField, ThemedSelect } from './Controls';
import { callNative } from './DeviceSecurity';
import { displayMoment } from '../../lib/dates';
import { localDate } from '../../lib/cash-flow';
import type { Data } from '../../lib/finance';
import { buildRecordReport, defaultPreset, fieldChoices, fieldLabel, presetPeriod, reportFileName, withFields, type ReportDoc, type ReportField, type ReportPeriod, type ReportPreset, type ReportTarget } from '../../lib/record-report';
import { reportPdf, saveBlob } from '../../lib/report-pdf';
import { summaryUsesCategory } from '../../lib/summary-report';
const PREVIEW_ROWS = 50;
// Shared by every report: draws the PDF and hands it to the browser or the Android app.
type Tr = (s: string, ...a: any[]) => string;
const createPdf = (doc: ReportDoc, tr: Tr) => reportPdf(doc, { brand: 'TWMG.', generated: tr('Generated {0}', displayMoment(Date.now())), page: (n, total) => tr('Page {0} of {1}', n, total) });
export async function downloadReport(doc: ReportDoc, period: ReportPeriod, tr: Tr) { saveBlob(reportFileName(doc, period), await createPdf(doc, tr)); }
const canShareFiles = () => typeof window !== 'undefined' && (typeof (window as any).TWMGAndroid?.shareFile === 'function' || typeof navigator.canShare === 'function');
// The Android app hands the file to the system share sheet; browsers use the Web Share API where they can.
// Some browsers refuse to share after the wait for the PDF, so the file is saved instead of being lost.
async function shareReport(name: string, blob: Blob, title: string): Promise<'shared' | 'saved' | 'cancelled'> {
    if (typeof (window as any).TWMGAndroid?.shareFile === 'function') {
        const url = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
        callNative('shareFile', name, url);
        return 'shared';
    }
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title }); return 'shared'; }
        catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
    }
    saveBlob(name, blob);
    return 'saved';
}
// Which columns the report prints. Lists only fields filled in on at least one row, and always keeps one selected.
export function ReportFieldPicker({ filled, defaults, selected, change }: { filled: ReportField[]; defaults: ReportField[]; selected: ReportField[] | null; change: (next: ReportField[]) => void }) {
    const { tr } = useI18n();
    const active = (selected || defaults).filter(k => filled.includes(k));
    const toggle = (key: ReportField) => { const on = active.includes(key); if (on && active.length === 1) return; change(on ? active.filter(k => k !== key) : [...active, key]); };
    return <div className="record-report-fields"><h3>{tr('Fields in this report')}</h3><div className="record-report-presets" role="group" aria-label={tr('Fields in this report')}>{filled.map(key => <button key={key} type="button" className={'filter-chip' + (active.includes(key) ? ' active' : '')} aria-pressed={active.includes(key)} onClick={() => toggle(key)}>{fieldLabel(key, tr)}</button>)}</div></div>;
}
const presets: [ReportPreset, string][] = [['month', 'This month'], ['quarter', 'Last 3 months'], ['year', 'This year'], ['all', 'All time']];
export function RecordReportDialog({ target, data, currency, money, close }: {
    target: ReportTarget;
    data: Data;
    currency: string;
    money: (n: number, c?: string) => string;
    close: () => void;
}) {
    const { tr } = useI18n();
    const today = localDate();
    const [preset, setPreset] = useState<ReportPreset | ''>(defaultPreset(target.kind)), [period, setPeriod] = useState<ReportPeriod>(presetPeriod(defaultPreset(target.kind), today));
    const [busy, setBusy] = useState<'' | 'save' | 'share'>(''), [message, setMessage] = useState(''), [category, setCategory] = useState(''), running = useRef(false), summary = target.kind === 'summary';
    const [fields, setFields] = useState<ReportField[] | null>(null);
    const built = useMemo(() => buildRecordReport(target, data, period, { money, tr, currency }, today, category), [target, data, period, currency, tr, category]);
    const doc = useMemo(() => built && withFields(built, fields, tr), [built, fields, tr]), choices = fieldChoices(built);
    const choose = (p: ReportPreset) => { setPreset(p); setPeriod(presetPeriod(p, today)); };
    const custom = (next: ReportPeriod) => { setPreset(''); setPeriod(next); };
    // The ref stops a second tap from starting another PDF before the button has redrawn as busy.
    async function pdf(action: 'save' | 'share') {
        if (!doc || running.current) return;
        running.current = true; setBusy(action); setMessage('');
        try {
            const name = reportFileName(doc, period), blob = await createPdf(doc, tr);
            if (action === 'save') { saveBlob(name, blob); setMessage(tr('PDF saved.')); }
            else { const result = await shareReport(name, blob, doc.title); if (result === 'saved') setMessage(tr('PDF saved.')); }
        }
        catch { setMessage(tr('Could not create the PDF. Please try again.')); }
        running.current = false; setBusy('');
    }
    return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className="modal record-report" role="dialog" aria-modal="true" aria-labelledby="record-report-title"><div className="modal-head"><div><span className="eyebrow">{doc?.subtitle || tr('Report')}</span><h2 id="record-report-title">{doc?.title || tr('This item is no longer available.')}</h2></div><button className="icon-button" onClick={close} aria-label={tr('Close')}><X size={20}/></button></div>
        {doc && <div className="record-report-body">
            {target.kind !== 'debts' && !(summary && target.id === 'outstanding') && <div className="record-report-period"><div className="record-report-presets" role="group" aria-label={tr('Period')}>{presets.map(([p, label]) => <button key={p} type="button" className={'filter-chip' + (preset === p ? ' active' : '')} aria-pressed={preset === p} onClick={() => choose(p)}>{tr(label)}</button>)}</div><div className="record-report-dates"><label>{tr('From')}<DateField value={period.from} max={period.to || today} onChange={e => custom({ ...period, from: e.target.value })}/></label><label>{tr('To')}<DateField value={period.to} min={period.from} onChange={e => custom({ ...period, to: e.target.value })}/></label></div></div>}
            {summary && summaryUsesCategory(target.id) && <label className="record-report-category">{tr('Category')}<ThemedSelect aria-label={tr('Category')} value={category} onChange={e => setCategory(e.target.value)}><option value="">{tr('All categories')}</option>{(data.categories || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</ThemedSelect></label>}
            <p className="muted record-report-range">{doc.period}</p>
            <div className="record-report-tiles">{doc.tiles.map(t => <div key={t.label}><small>{t.label}</small><b>{t.value}</b></div>)}</div>
            {doc.note && <p className="muted">{doc.note}</p>}
            {choices && choices.filled.length > 0 && <ReportFieldPicker filled={choices.filled} defaults={choices.defaults} selected={fields} change={setFields}/>}
            {doc.tables.map(t => <section key={t.title} className="record-report-table"><h3>{t.title}</h3>{t.rows.length ? <><div className="record-report-scroll"><table><thead><tr>{t.columns.map(c => <th key={c.label} className={c.end ? 'end' : ''}>{c.label}</th>)}</tr></thead><tbody>{t.rows.slice(0, PREVIEW_ROWS).map((r, i) => <tr key={i}>{r.cells.map((v, j) => <td key={j} className={(t.columns[j].end ? 'end ' : '') + (j === r.cells.length - 1 && r.tone ? r.tone === 'in' ? 'positive' : 'negative' : '')}>{v}</td>)}</tr>)}</tbody></table></div>{t.rows.length > PREVIEW_ROWS && <p className="muted">{tr('Showing the first {0} rows. The PDF includes all {1}.', PREVIEW_ROWS, t.rows.length)}</p>}</> : <p className="muted">{t.empty}</p>}</section>)}
        </div>}
        <div className="record-report-foot">{message && <span role="status" className="muted">{message}</span>}{canShareFiles() && <button className="secondary" disabled={!!busy || !doc} onClick={() => pdf('share')}>{busy === 'share' ? <LoaderCircle size={16} className="spin"/> : <Share2 size={16}/>}{tr('Share')}</button>}<button className="primary" disabled={!!busy || !doc} onClick={() => pdf('save')}>{busy === 'save' ? <LoaderCircle size={16} className="spin"/> : <Download size={16}/>}{tr(busy === 'save' ? 'Preparing PDF…' : 'Download PDF')}</button></div></div></div>;
}
