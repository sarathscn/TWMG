'use client';
import { useI18n } from './UIProvider';
import { Children, isValidElement, useEffect, useId, useState, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes } from 'react';
import { Select, Popover } from 'radix-ui';
import { ar, de, hi, enUS } from 'react-day-picker/locale';
import { DayPicker } from 'react-day-picker';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import 'react-day-picker/style.css';
type Option = {
    value: string;
    label: ReactNode;
    disabled?: boolean;
};
function optionsFrom(children: ReactNode): Option[] {
    return Children.toArray(children).flatMap(child => {
        if (!isValidElement<{
            value?: string;
            children?: ReactNode;
            disabled?: boolean;
        }>(child))
            return [];
        if (child.type === 'option')
            return [{ value: String(child.props.value ?? child.props.children ?? ''), label: child.props.children, disabled: child.props.disabled }];
        return optionsFrom(child.props.children);
    });
}
export function ThemedSelect({ children, value, defaultValue, onChange, name, required, disabled, id, className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
    const { tr, text, locale } = useI18n();
    const options = optionsFrom(children), [internal, setInternal] = useState(String(defaultValue ?? options[0]?.value ?? ''));
    const current = value === undefined ? internal : String(value);
    const generated = useId();
    return <Select.Root name={name} value={current} required={required} disabled={disabled} onValueChange={next => { setInternal(next); onChange?.({ target: { value: next }, currentTarget: { value: next } } as any); }}><Select.Trigger id={id || generated} className={'themed-select ' + (className || '')} aria-label={props['aria-label'] ? tr(props['aria-label']) : undefined} aria-required={required}><Select.Value placeholder={text(options.find(o => !o.value)?.label || 'Choose an option')}/><Select.Icon><ChevronDown size={15}/></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" sideOffset={6} collisionPadding={12} className="select-menu" onEscapeKeyDown={e => e.stopPropagation()}><Select.ScrollUpButton className="select-scroll"><ChevronLeft size={14}/></Select.ScrollUpButton><Select.Viewport>{text(options.filter(o => o.value).map((option, i) => <Select.Item key={option.value + '-' + i} value={option.value} disabled={option.disabled} className="select-option"><Select.ItemText>{text(option.label)}</Select.ItemText><Select.ItemIndicator><Check size={15}/></Select.ItemIndicator></Select.Item>))}</Select.Viewport><Select.ScrollDownButton className="select-scroll"><ChevronDown size={14}/></Select.ScrollDownButton></Select.Content></Select.Portal></Select.Root>;
}
const ml = { ...enUS, code: 'ml', localize: { ...enUS.localize, month: (n: any, o: any) => new Intl.DateTimeFormat('ml', { month: o?.width === 'wide' ? 'long' : 'short' }).format(new Date(2024, n, 1)), day: (n: any, o: any) => new Intl.DateTimeFormat('ml', { weekday: o?.width === 'wide' ? 'long' : o?.width === 'narrow' ? 'narrow' : 'short' }).format(new Date(2024, 0, 7 + n)) } };
const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return undefined;
    const d = new Date(value + 'T12:00:00');
    return Number.isNaN(d.getTime()) ? undefined : d;
};
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const parseIsoDate = (value?: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return undefined;
    const date = new Date(value + 'T12:00:00');
    return Number.isNaN(date.getTime()) ? undefined : date;
};
export type CalendarMarker = { date: string; kind: 'transaction' | 'recurring' | 'credit-card' | 'debt' };
export function DashboardCalendar({ month, selected, markers, onMonthChange, onSelect }: {
    month: string;
    selected?: string;
    markers: CalendarMarker[];
    onMonthChange: (month: string) => void;
    onSelect: (date: string) => void;
}) {
    const { tr, text, locale } = useI18n();
    const [open, setOpen] = useState(false), [visibleMonth, setVisibleMonth] = useState(parse(`${month}-01`) || new Date());
    useEffect(() => {
        const next = parse(`${month}-01`);
        if (next)
            setVisibleMonth(next);
    }, [month]);
    const byKind = (kind: CalendarMarker['kind']) => markers.filter(marker => marker.kind === kind).map(marker => parseIsoDate(marker.date)).filter((date): date is Date => !!date);
    const modifierDates = {
        transaction: byKind('transaction'),
        recurring: byKind('recurring'),
        creditCard: byKind('credit-card'),
        debt: byKind('debt')
    };
    function changeMonth(next: Date) {
        setVisibleMonth(next);
        onMonthChange(monthIso(next));
    }
    function shiftMonth(amount: number) {
        const next = new Date(visibleMonth);
        next.setMonth(next.getMonth() + amount);
        changeMonth(next);
    }
    const selectedDate = parseIsoDate(selected);
    return <div className="date-picker dashboard-calendar">
        <button type="button" aria-label={tr("Previous month")} onClick={() => shiftMonth(-1)}><ChevronLeft size={14}/></button>
        <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (next) setVisibleMonth(parse(`${month}-01`) || new Date()); }}>
            <Popover.Trigger asChild><button type="button" className="calendar-label" aria-label={tr("Open calendar")}><CalendarDays size={15}/><span>{text(visibleMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' }))}</span></button></Popover.Trigger>
            <Popover.Portal><Popover.Content sideOffset={8} collisionPadding={12} align="end" className="calendar-popover dashboard-calendar-popover" onEscapeKeyDown={e => e.stopPropagation()}>
                <DayPicker locale={({ ar, de, hi, ml, en: enUS })[locale]} formatters={{ formatCaption: date => date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }), formatDay: date => new Intl.NumberFormat(locale).format(date.getDate()) }} labels={{ labelPrevious: () => tr('Go to previous month'), labelNext: () => tr('Go to next month'), labelDayButton: date => date.toLocaleDateString(locale, { dateStyle: 'full' }) }} mode="single" selected={selectedDate} month={visibleMonth} onMonthChange={changeMonth} onSelect={date => { if (date) { onSelect(iso(date)); setOpen(false); } }} modifiers={modifierDates} modifiersClassNames={{ transaction: 'calendar-marker-transaction', recurring: 'calendar-marker-recurring', creditCard: 'calendar-marker-credit-card', debt: 'calendar-marker-debt' }} showOutsideDays fixedWeeks components={{ Chevron: ({ orientation }) => orientation === 'left' ? <ChevronLeft size={17}/> : <ChevronRight size={17}/> }}/>
                <div className="calendar-legend" aria-label={tr("Calendar events")}>
                    <span><i className="calendar-dot transaction"/>{tr("Transaction date")}</span>
                    <span><i className="calendar-dot recurring"/>{tr("Recurring bill date")}</span>
                    <span><i className="calendar-dot credit-card"/>{tr("Credit card payment date")}</span>
                    <span><i className="calendar-dot debt"/>{tr("Debt date")}</span>
                </div>
            </Popover.Content></Popover.Portal>
        </Popover.Root>
        <button type="button" aria-label={tr("Next month")} onClick={() => shiftMonth(1)}><ChevronRight size={14}/></button>
    </div>;
}
export function DateField({ name, value, defaultValue, onChange, required, min, max, id, ...props }: InputHTMLAttributes<HTMLInputElement>) {
    const { tr, text, locale } = useI18n();
    const [internal, setInternal] = useState(String(defaultValue || '')), [open, setOpen] = useState(false), [month, setMonth] = useState(parse(String(value || defaultValue || '')) || new Date()), [invalid, setInvalid] = useState(false);
    const current = value === undefined ? internal : String(value), selected = parse(current);
    const generated = useId();
    function choose(next: string) { setInternal(next); setInvalid(false); onChange?.({ target: { value: next }, currentTarget: { value: next } } as any); setOpen(false); }
    return <span className="date-field"><input className="control-validation" tabIndex={-1} aria-hidden="true" type="text" name={name} value={current} onChange={() => { }} required={required} onInvalid={e => { e.preventDefault(); setInvalid(true); setOpen(true); }}/><Popover.Root open={open} onOpenChange={next => {
            setOpen(next);
            if (next)
                setMonth(selected || new Date());
        }}><Popover.Trigger asChild><button type="button" id={id || generated} className={'date-trigger ' + (invalid ? 'invalid' : '')} aria-label={tr(props['aria-label'] || (name === 'date' ? 'Transaction date' : name === 'due' ? 'Due date' : 'Choose date'))} aria-required={required}><span className={selected ? '' : 'placeholder'}>{text(selected ? selected.toLocaleDateString(typeof document !== 'undefined' ? document.documentElement.lang : 'en', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Choose a date')}</span><CalendarDays size={16}/></button></Popover.Trigger><Popover.Portal><Popover.Content sideOffset={7} collisionPadding={12} align="start" className="calendar-popover" onEscapeKeyDown={e => e.stopPropagation()}><DayPicker locale={({ ar, de, hi, ml, en: enUS })[locale]} formatters={{ formatCaption: date => date.toLocaleDateString(locale, { month: "long", year: "numeric" }), formatDay: date => new Intl.NumberFormat(locale).format(date.getDate()) }} labels={{ labelPrevious: () => tr('Go to previous month'), labelNext: () => tr('Go to next month'), labelDayButton: (date) => date.toLocaleDateString(locale, { dateStyle: 'full' }) }} mode="single" selected={selected} month={month} onMonthChange={setMonth} onSelect={date => {
            if (date)
                choose(iso(date));
        }} disabled={[...(min ? [{ before: parse(String(min))! }] : []), ...(max ? [{ after: parse(String(max))! }] : [])]} showOutsideDays fixedWeeks components={{ Chevron: ({ orientation }) => orientation === 'left' ? <ChevronLeft size={17}/> : <ChevronRight size={17}/> }}/><div className="calendar-actions"><button type="button" onClick={() => choose('')}>{tr("Clear")}</button><button type="button" disabled={!!min && iso(new Date()) < String(min) || !!max && iso(new Date()) > String(max)} onClick={() => choose(iso(new Date()))}>{tr("Today")}</button></div><Popover.Arrow className="calendar-arrow"/></Popover.Content></Popover.Portal></Popover.Root>{text(invalid && <small className="date-error">{tr("Choose a date.")}</small>, true)}</span>;
}

