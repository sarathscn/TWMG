'use client';
import { useMemo, useState } from 'react';
import { Download, LoaderCircle, X } from 'lucide-react';
import { useI18n } from './UIProvider';
import { DateField } from './Controls';
import { displayMoment } from '../../lib/dates';
import { localDate } from '../../lib/cash-flow';
import type { Data } from '../../lib/finance';
import { buildRecordReport, defaultPreset, fieldChoices, fieldLabel, presetPeriod, reportFileName, withFields, type ReportDoc, type ReportField, type ReportPeriod, type ReportPreset, type ReportTarget } from '../../lib/record-report';
import { reportPdf, saveBlob } from '../../lib/report-pdf';
const PREVIEW_ROWS = 50;
// Shared by every report: draws the PDF and hands it to the browser or the Android app.
export async function downloadReport(doc: ReportDoc, period: ReportPeriod, tr: (s: string, ...a: any[]) => string) {
    saveBlob(reportFileName(doc, period), await reportPdf(doc, { brand: 'TWMG.', generated: tr('Generated {0}', displayMoment(Date.now())), page: (n, total) => tr('Page {0} of {1}', n, total) }));
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
    const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    const [fields, setFields] = useState<ReportField[] | null>(null);
    const built = useMemo(() => buildRecordReport(target, data, period, { money, tr, currency }, today), [target, data, period, currency, tr]);
    const doc = useMemo(() => built && withFields(built, fields, tr), [built, fields, tr]), choices = fieldChoices(built);
    const choose = (p: ReportPreset) => { setPreset(p); setPeriod(presetPeriod(p, today)); };
    const custom = (next: ReportPeriod) => { setPreset(''); setPeriod(next); };
    async function pdf() {
        if (!doc) return;
        setBusy(true); setMessage('');
        try { await downloadReport(doc, period, tr); setMessage(tr('PDF saved.')); }
        catch { setMessage(tr('Could not create the PDF. Please try again.')); }
        setBusy(false);
    }
    return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className="modal record-report" role="dialog" aria-modal="true" aria-labelledby="record-report-title"><div className="modal-head"><div><span className="eyebrow">{doc?.subtitle || tr('Report')}</span><h2 id="record-report-title">{doc?.title || tr('This item is no longer available.')}</h2></div><button className="icon-button" onClick={close} aria-label={tr('Close')}><X size={20}/></button></div>
        {doc && <div className="record-report-body">
            {target.kind !== 'debts' && <div className="record-report-period"><div className="record-report-presets" role="group" aria-label={tr('Period')}>{presets.map(([p, label]) => <button key={p} type="button" className={'filter-chip' + (preset === p ? ' active' : '')} aria-pressed={preset === p} onClick={() => choose(p)}>{tr(label)}</button>)}</div><div className="record-report-dates"><label>{tr('From')}<DateField value={period.from} max={period.to || today} onChange={e => custom({ ...period, from: e.target.value })}/></label><label>{tr('To')}<DateField value={period.to} min={period.from} onChange={e => custom({ ...period, to: e.target.value })}/></label></div></div>}
            <p className="muted record-report-range">{doc.period}</p>
            <div className="record-report-tiles">{doc.tiles.map(t => <div key={t.label}><small>{t.label}</small><b>{t.value}</b></div>)}</div>
            {doc.note && <p className="muted">{doc.note}</p>}
            {choices && choices.filled.length > 0 && <ReportFieldPicker filled={choices.filled} defaults={choices.defaults} selected={fields} change={setFields}/>}
            {doc.tables.map(t => <section key={t.title} className="record-report-table"><h3>{t.title}</h3>{t.rows.length ? <><div className="record-report-scroll"><table><thead><tr>{t.columns.map(c => <th key={c.label} className={c.end ? 'end' : ''}>{c.label}</th>)}</tr></thead><tbody>{t.rows.slice(0, PREVIEW_ROWS).map((r, i) => <tr key={i}>{r.cells.map((v, j) => <td key={j} className={(t.columns[j].end ? 'end ' : '') + (j === r.cells.length - 1 && r.tone ? r.tone === 'in' ? 'positive' : 'negative' : '')}>{v}</td>)}</tr>)}</tbody></table></div>{t.rows.length > PREVIEW_ROWS && <p className="muted">{tr('Showing the first {0} rows. The PDF includes all {1}.', PREVIEW_ROWS, t.rows.length)}</p>}</> : <p className="muted">{t.empty}</p>}</section>)}
        </div>}
        <div className="record-report-foot">{message && <span role="status" className="muted">{message}</span>}<button className="primary" disabled={busy || !doc} onClick={pdf}>{busy ? <LoaderCircle size={16} className="spin"/> : <Download size={16}/>}{tr(busy ? 'Preparing PDF…' : 'Download PDF')}</button></div></div></div>;
}
