import { format, setMonth, setYear } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import { useRef, useEffect, useState, useMemo } from 'react';
import 'react-day-picker/style.css';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { DependencyLinkSection } from './DependencyLinkSection';

interface TimelinePickerProps {
    itemId: string;
    dateRange: { from: string; to: string } | null;
    onSelect: (range: { from: string; to: string } | null) => void;
    onClose: () => void;
    position: { top: number, left: number };
}

export const TimelinePicker = ({ itemId, dateRange, onSelect, onClose, position }: TimelinePickerProps) => {
    const pickerRef = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState({ top: position.top, left: position.left });

    // Dependency links live in this popup too, so an item's dates and what they
    // drag along can be set in one place. Only the count is needed here, to
    // re-measure the popup when chips wrap onto another line.
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const itemDependencies = useBoardStore(state => state.itemDependencies);
    const linkCount = useMemo(
        () => itemDependencies.filter(d => d.boardId === activeBoardId && d.predecessorItemId === itemId).length,
        [itemDependencies, activeBoardId, itemId]
    );

    // Parse initial range
    const initialRange: DateRange | undefined = dateRange?.from && dateRange?.to
        ? { from: new Date(dateRange.from), to: new Date(dateRange.to) }
        : undefined;

    const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(initialRange);

    // View State
    const [view, setView] = useState<'calendar' | 'years' | 'months'>('calendar');
    const [month, setMonthInPicker] = useState<Date>(initialRange?.from || new Date());

    useEffect(() => {
        if (pickerRef.current) {
            const rect = pickerRef.current.getBoundingClientRect();
            let newTop = position.top;
            let newLeft = position.left;

            if (newTop + rect.height + 16 > window.innerHeight) {
                newTop = position.top - rect.height - 40;
            }
            if (newLeft + rect.width + 16 > window.innerWidth) {
                newLeft = window.innerWidth - rect.width - 16;
            }

            if (newTop < 16) newTop = 16;
            if (newLeft < 16) newLeft = 16;

            setStyle({ top: newTop, left: newLeft });
        }
    }, [position, view, month, linkCount]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleSelect = (range: DateRange | undefined) => {
        setSelectedRange(range);

        if (range?.from && range?.to) {
            // Adjust for timezone to ensure we store YYYY-MM-DD correctly
            const formatDate = (d: Date) => {
                const offset = d.getTimezoneOffset();
                const localDate = new Date(d.getTime() - (offset * 60 * 1000));
                return localDate.toISOString().split('T')[0];
            };

            onSelect({
                from: formatDate(range.from),
                to: formatDate(range.to)
            });
        } else if (!range) {
            onSelect(null);
        }
    };

    // Calendar Navigation
    const handlePrevMonth = () => setMonthInPicker(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
    const handleNextMonth = () => setMonthInPicker(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));

    const years = Array.from({ length: 201 }, (_, i) => 1900 + i);
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    return createPortal(
        <div
            ref={pickerRef}
            className="glass-pop"
            style={{
                position: 'fixed',
                top: style.top,
                left: style.left,
                borderRadius: '16px',
                zIndex: 9999,
                width: '320px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'var(--font-family-sans)',
                color: 'hsl(var(--color-text-primary))'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Manual Date Inputs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'hsl(var(--color-text-tertiary))', fontWeight: 600, display: 'block', marginBottom: '4px' }}>From</label>
                    <input
                        type="date"
                        value={selectedRange?.from ? format(selectedRange.from, 'yyyy-MM-dd') : ''}
                        onChange={(e) => {
                            const d = e.target.valueAsDate; // UTC Midnight
                            if (d) {
                                // Fix timezone offset for display/store
                                const offset = d.getTimezoneOffset();
                                const localDate = new Date(d.getTime() + (offset * 60 * 1000));
                                handleSelect({ ...selectedRange, from: localDate });
                            } else {
                                handleSelect({ ...selectedRange, from: undefined });
                            }
                        }}
                        style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '8px',
                            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                            backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                            fontSize: '12.5px',
                            color: 'hsl(var(--color-text-primary))',
                            outline: 'none',
                            fontFamily: 'inherit'
                        }}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'hsl(var(--color-text-tertiary))', fontWeight: 600, display: 'block', marginBottom: '4px' }}>To</label>
                    <input
                        type="date"
                        min={selectedRange?.from ? format(selectedRange.from, 'yyyy-MM-dd') : undefined}
                        value={selectedRange?.to ? format(selectedRange.to, 'yyyy-MM-dd') : ''}
                        onChange={(e) => {
                            const d = e.target.valueAsDate;
                            if (d) {
                                const offset = d.getTimezoneOffset();
                                const localDate = new Date(d.getTime() + (offset * 60 * 1000));
                                handleSelect({ from: selectedRange?.from, to: localDate });
                            } else {
                                handleSelect({ from: selectedRange?.from, to: undefined });
                            }
                        }}
                        style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '8px',
                            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                            backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                            fontSize: '12.5px',
                            color: 'hsl(var(--color-text-primary))',
                            outline: 'none',
                            fontFamily: 'inherit'
                        }}
                    />
                </div>
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <button onClick={handlePrevMonth} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '999px', color: 'hsl(var(--color-text-secondary))' }} className="hover-bg"><ChevronLeft size={18} /></button>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => setView('months')} style={{ fontFamily: 'var(--font-family-display)', fontSize: '15px', background: 'transparent', border: 'none', fontWeight: 600, cursor: 'pointer', color: 'hsl(var(--color-text-primary))' }}>{format(month, 'MMMM')}</button>
                    <button onClick={() => setView('years')} style={{ fontFamily: 'var(--font-family-display)', fontSize: '15px', background: 'transparent', border: 'none', fontWeight: 600, cursor: 'pointer', color: 'hsl(var(--color-text-primary))' }}>{format(month, 'yyyy')}</button>
                </div>
                <button onClick={handleNextMonth} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '999px', color: 'hsl(var(--color-text-secondary))' }} className="hover-bg"><ChevronRight size={18} /></button>
            </div>

            <style>{`
                .hover-bg:hover { background-color: hsl(var(--color-text-primary) / 0.06) !important; }
                .rdp-nav { display: none; }
                .rdp-caption { display: none; } 
                .rdp-day_selected:not([disabled]) { 
                    background-color: hsl(var(--color-brand-primary)) !important; 
                    color: #FFEFD2 !important;
                }
                .rdp-day_range_middle {
                    background-color: hsl(var(--color-brand-primary) / 0.14) !important;
                    color: hsl(var(--color-brand-primary)) !important;
                }
                .rdp-day:hover:not(.rdp-day_selected) { background-color: hsl(var(--color-text-primary) / 0.06); }
                .rdp { margin: 0; --rdp-cell-size: 36px; --rdp-accent-color: hsl(var(--color-brand-primary)); } 
            `}</style>

            {view === 'calendar' && (
                <DayPicker
                    mode="range"
                    selected={selectedRange}
                    month={month}
                    onMonthChange={setMonthInPicker}
                    onSelect={handleSelect}
                    showOutsideDays
                />
            )}

            {/* Years View */}
            {view === 'years' && (
                <div style={{ height: '300px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', paddingRight: '4px' }}>
                    {years.map(year => (
                        <button
                            key={year}
                            onClick={() => {
                                setMonthInPicker(current => setYear(current, year));
                                setView('calendar');
                            }}
                            style={{
                                padding: '8px 4px',
                                border: 'none',
                                borderRadius: '4px',
                                backgroundColor: month.getFullYear() === year ? 'hsl(var(--color-brand-primary))' : 'transparent',
                                color: month.getFullYear() === year ? 'white' : 'hsl(var(--color-text-primary))',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: month.getFullYear() === year ? 600 : 400
                            }}
                            ref={month.getFullYear() === year ? (el) => el?.scrollIntoView({ block: 'center' }) : null}
                        >
                            {year}
                        </button>
                    ))}
                </div>
            )}

            {/* Months View */}
            {view === 'months' && (
                <div style={{ height: '300px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', alignContent: 'start', paddingTop: '16px' }}>
                    {months.map((m, index) => (
                        <button
                            key={m}
                            onClick={() => {
                                setMonthInPicker(current => setMonth(current, index));
                                setView('calendar');
                            }}
                            style={{
                                padding: '12px 8px',
                                border: 'none',
                                borderRadius: '6px',
                                backgroundColor: month.getMonth() === index ? 'hsl(var(--color-brand-primary))' : 'transparent',
                                color: month.getMonth() === index ? 'white' : 'hsl(var(--color-text-primary))',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: month.getMonth() === index ? 600 : 400,
                                textAlign: 'center'
                            }}
                            className="hover-bg"
                        >
                            {m}
                        </button>
                    ))}
                </div>
            )}

            <DependencyLinkSection
                itemId={itemId}
                type="FS"
                label="Finish to Start"
                hint="When this item's dates move, the items above shift with it — each one starting after this finishes."
            />

            <DependencyLinkSection
                itemId={itemId}
                type="FF"
                label="Finish to Finish"
                hint="Same shift, but the items above are tied to this one's end date rather than its start."
                matchDate={selectedRange?.to ? format(selectedRange.to, 'yyyy-MM-dd') : null}
            />

            <DependencyLinkSection
                itemId={itemId}
                type="SS"
                label="Start to Start"
                hint="Same shift again, but tied to this one's start date — the items above begin when it begins."
                matchDate={selectedRange?.from ? format(selectedRange.from, 'yyyy-MM-dd') : null}
            />

            {/* Footer */}
            <div style={{ 
                marginTop: '14px', 
                paddingTop: '12px', 
                borderTop: '1px solid var(--paper-row-line, hsl(var(--color-border)))', 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <button
                    onClick={() => {
                        onSelect(null);
                        onClose();
                    }}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'hsl(var(--color-text-secondary))',
                        fontSize: '12.5px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        padding: '5px 10px',
                        borderRadius: '999px'
                    }}
                    className="hover-bg"
                >
                    Clear
                </button>
                <button
                    onClick={onClose}
                    style={{
                        backgroundColor: 'hsl(var(--color-brand-primary))',
                        border: 'none',
                        color: '#FFEFD2',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '6px 18px',
                        borderRadius: '999px'
                    }}
                >
                    Save
                </button>
            </div>
        </div>,
        document.body
    );
};
