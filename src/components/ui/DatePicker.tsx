import { format, setMonth, setYear } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import { useRef, useEffect, useState } from 'react';
import 'react-day-picker/style.css';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
    date: Date | undefined;
    onSelect: (date: Date | undefined) => void;
    onClose: () => void;
    position: { top: number, left: number };
}

export const DatePicker = ({ date, onSelect, onClose, position }: DatePickerProps) => {
    const pickerRef = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState({ top: position.top, left: position.left });

    // View State: 'calendar', 'years', 'months'
    const [view, setView] = useState<'calendar' | 'years' | 'months'>('calendar');
    const [month, setMonthInPicker] = useState<Date>(date || new Date());

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
    }, [position, view, month]);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Calendar Navigation
    const handlePrevMonth = () => setMonthInPicker(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
    const handleNextMonth = () => setMonthInPicker(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));

    // Generate Years (1900 - 2100)
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
            {/* Custom Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <button
                    onClick={handlePrevMonth}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '999px', color: 'hsl(var(--color-text-secondary))' }}
                    className="hover-bg"
                >
                    <ChevronLeft size={18} />
                </button>

                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        onClick={() => setView(view === 'months' ? 'calendar' : 'months')}
                        style={{
                            fontFamily: 'var(--font-family-display)',
                            background: view === 'months' ? 'hsl(var(--color-brand-primary) / 0.12)' : 'transparent',
                            color: view === 'months' ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-primary))',
                            border: 'none',
                            fontSize: '15px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '4px 8px',
                            borderRadius: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        {format(month, 'MMMM')}
                    </button>
                    <button
                        onClick={() => setView(view === 'years' ? 'calendar' : 'years')}
                        style={{
                            fontFamily: 'var(--font-family-display)',
                            background: view === 'years' ? 'hsl(var(--color-brand-primary) / 0.12)' : 'transparent',
                            color: view === 'years' ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-primary))',
                            border: 'none',
                            fontSize: '15px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '4px 8px',
                            borderRadius: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        {format(month, 'yyyy')}
                    </button>
                </div>

                <button
                    onClick={handleNextMonth}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '999px', color: 'hsl(var(--color-text-secondary))' }}
                    className="hover-bg"
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            <style>{`
                .hover-bg:hover { background-color: hsl(var(--color-text-primary) / 0.06) !important; }
                /* Hide Default DayPicker Navigation to avoid duplication if we wanted to use default */
                .rdp-nav { display: none; }
                .rdp-caption { display: none; } 
                .rdp-day_selected:not([disabled]) { background-color: hsl(var(--color-brand-primary)) !important; color: #FFEFD2 !important; }
                .rdp-day:hover:not(.rdp-day_selected) { background-color: hsl(var(--color-text-primary) / 0.06); }
                .rdp { margin: 0; --rdp-cell-size: 36px; --rdp-accent-color: hsl(var(--color-brand-primary)); }  
            `}</style>

            {/* View Switching */}
            <div style={{ position: 'relative', minHeight: '300px' }}>
                {view === 'calendar' && (
                    <DayPicker
                        mode="single"
                        selected={date}
                        month={month}
                        onMonthChange={setMonthInPicker}
                        onSelect={(d) => {
                            if (d) {
                                onSelect(d);
                            }
                        }}
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
            </div>

            {/* Footer */}
            <div style={{ 
                marginTop: '14px', 
                paddingTop: '12px', 
                borderTop: '1px solid var(--paper-row-line, hsl(var(--color-border)))', 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => {
                            onSelect(undefined);
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
                        onClick={() => {
                            const today = new Date();
                            onSelect(today);
                            setMonthInPicker(today);
                        }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'hsl(var(--color-brand-primary))',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '5px 10px',
                            borderRadius: '999px'
                        }}
                        className="hover-bg"
                    >
                        Today
                    </button>
                </div>
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
