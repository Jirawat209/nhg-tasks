import { useState, useMemo } from 'react';
import { itemColumns } from '../../lib/columnScope';
import { 
    format, 
    startOfMonth, 
    endOfMonth, 
    startOfWeek, 
    endOfWeek, 
    eachDayOfInterval, 
    isSameMonth, 
    isSameDay, 
    addMonths, 
    subMonths,
    addDays,
    subDays,
    addYears,
    subYears,
    startOfYear,
    endOfYear,
    eachMonthOfInterval
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';

export const CalendarView = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewType, setViewType] = useState<'day' | 'month' | 'year'>('month');
    
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const boards = useBoardStore(state => state.boards);
    const searchQuery = useBoardStore(state => state.searchQuery);
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);
    const setActiveItem = useBoardStore(state => state.setActiveItem);

    const activeBoard = useMemo(() => boards.find(b => b.id === activeBoardId), [boards, activeBoardId]);
    
    const filteredItems = useMemo(() => {
        if (!activeBoard) return [];
        let items = [...activeBoard.items];

        if (searchQuery) {
            items = items.filter(item => (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()));
        }

        if (!showHiddenItems) {
            items = items.filter(item => !item.isHidden);
        }

        if (activeBoard.filters && activeBoard.filters.length > 0) {
            activeBoard.filters.forEach(filter => {
                if (filter.values && filter.values.length > 0) {
                    items = items.filter(item => {
                        if (filter.columnId === '__group__') {
                            return filter.values.includes(item.groupId);
                        }

                        const val = item.values[filter.columnId];
                        return Array.isArray(val) ? val.some(v => filter.values.includes(v)) : filter.values.includes(val);
                    });
                }
            });
        }

        return items;
    }, [activeBoard, searchQuery, showHiddenItems]);
    
    const timeColumns = useMemo(
        () => itemColumns(activeBoard?.columns || []).filter(c => c.type === 'timeline' || c.type === 'date' || c.type === 'due_date'),
        [activeBoard]
    );

    const getItemsForDay = (day: Date) => {
        if (!activeBoard || timeColumns.length === 0) return [];
        const d = new Date(day).setHours(0, 0, 0, 0);

        return filteredItems.filter(item => {
            for (const col of timeColumns) {
                const val = item.values?.[col.id];
                if (!val) continue;

                let start: Date | null = null;
                let end: Date | null = null;

                if (col.type === 'timeline') {
                    if (val.from) start = new Date(val.from);
                    if (val.to) end = new Date(val.to);
                } else {
                    start = new Date(val);
                    end = new Date(val);
                }

                if (!start || !end) continue;

                const s = new Date(start).setHours(0, 0, 0, 0);
                const e = new Date(end).setHours(0, 0, 0, 0);
                return d >= s && d <= e;
            }
            return false;
        });
    };

    const handleNext = () => {
        if (viewType === 'day') setCurrentDate(addDays(currentDate, 1));
        else if (viewType === 'month') setCurrentDate(addMonths(currentDate, 1));
        else setCurrentDate(addYears(currentDate, 1));
    };

    const handlePrev = () => {
        if (viewType === 'day') setCurrentDate(subDays(currentDate, 1));
        else if (viewType === 'month') setCurrentDate(subMonths(currentDate, 1));
        else setCurrentDate(subYears(currentDate, 1));
    };

    if (!activeBoard) return null;

    const navBtnStyle: React.CSSProperties = {
        height: '30px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '999px',
        cursor: 'pointer',
        color: 'hsl(var(--color-text-primary))',
        padding: '0 12px',
        fontSize: '12.5px',
        fontWeight: 500,
        transition: 'background-color 0.15s, color 0.15s'
    };

    const renderHeader = () => (
        <div className="calendar-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h2 className="narai-heading" style={{
                    fontFamily: 'var(--font-family-display)',
                    fontSize: '22px',
                    fontWeight: 500,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                    color: 'hsl(var(--color-text-primary))',
                    margin: 0,
                    minWidth: '140px'
                }}>
                    {viewType === 'day' ? format(currentDate, 'MMMM d, yyyy') : 
                     viewType === 'month' ? format(currentDate, 'MMMM yyyy') : 
                     format(currentDate, 'yyyy')}
                </h2>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" onClick={handlePrev} className="glass-chip" style={{ ...navBtnStyle, width: '30px', padding: 0 }} aria-label="Previous">
                        <ChevronLeft size={16} />
                    </button>
                    <button type="button" onClick={handleNext} className="glass-chip" style={{ ...navBtnStyle, width: '30px', padding: 0 }} aria-label="Next">
                        <ChevronRight size={16} />
                    </button>
                </div>
                <button 
                    type="button"
                    className="glass-chip"
                    style={navBtnStyle}
                    onClick={() => setCurrentDate(new Date())}
                >
                    Today
                </button>

                <div className="seg glass-chip" style={{ marginLeft: '6px' }}>
                    {(['day', 'month', 'year'] as const).map(type => (
                        <button
                            key={type}
                            type="button"
                            className={`seg-btn${viewType === type ? ' is-active' : ''}`}
                            onClick={() => setViewType(type)}
                            style={{ textTransform: 'capitalize', height: '26px', padding: '0 12px', fontSize: '12px' }}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderDayView = () => {
        const dayItems = getItemsForDay(currentDate);
        return (
            <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
                <div style={{ maxWidth: '640px', margin: '0 auto' }}>
                    <div className="bh-eyebrow" style={{ marginBottom: '4px' }}>
                        DAILY SCHEDULE
                    </div>
                    <h3 className="narai-heading" style={{
                        fontFamily: 'var(--font-family-display)',
                        fontSize: '22px',
                        fontWeight: 500,
                        letterSpacing: '-0.015em',
                        borderBottom: '1px solid var(--paper-edge, var(--card-border))',
                        paddingBottom: '10px',
                        margin: 0,
                        color: 'hsl(var(--color-text-primary))'
                    }}>
                        Tasks for {format(currentDate, 'EEEE, MMM d')}
                    </h3>
                    {dayItems.length === 0 ? (
                        <p style={{ color: 'hsl(var(--color-text-tertiary))', textAlign: 'center', marginTop: '40px', fontSize: '13.5px' }}>
                            No tasks scheduled for this day.
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                            {dayItems.map(item => {
                                const group = activeBoard.groups.find(g => g.id === item.groupId);
                                return (
                                    <div 
                                        key={item.id}
                                        onClick={() => setActiveItem(item.id)}
                                        className="card-surface calendar-pick"
                                        style={{
                                            padding: '12px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            borderRadius: '12px'
                                        }}
                                    >
                                        <span style={{
                                            width: '9px',
                                            height: '9px',
                                            borderRadius: '50%',
                                            backgroundColor: group?.color || 'hsl(var(--color-brand-primary))',
                                            flexShrink: 0
                                        }} />
                                        <span style={{ fontWeight: 500, fontSize: '13.5px', color: 'hsl(var(--color-text-primary))' }}>
                                            {item.title}
                                        </span>
                                        <span style={{
                                            marginLeft: 'auto',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            letterSpacing: '0.06em',
                                            textTransform: 'uppercase',
                                            color: 'hsl(var(--color-text-tertiary))'
                                        }}>
                                            {group?.title}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderMonthView = () => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);
        const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

        return (
            <div className="calendar-month-body">
                <div className="calendar-grid-header">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="weekday-label">{day}</div>
                    ))}
                </div>
                <div className="calendar-grid">
                    {calendarDays.map((day, idx) => {
                        const dayItems = getItemsForDay(day);
                        const isCurrentMonth = isSameMonth(day, monthStart);
                        const isToday = isSameDay(day, new Date());
                        return (
                            <div 
                                key={idx} 
                                className={`calendar-day ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
                                onClick={() => {
                                    if (!isCurrentMonth) setCurrentDate(day);
                                    setViewType('day');
                                    setCurrentDate(day);
                                }}
                            >
                                <div className="day-number">{format(day, 'd')}</div>
                                <div className="day-content">
                                    {dayItems.map(item => {
                                        const group = activeBoard.groups.find(g => g.id === item.groupId);
                                        return (
                                            <div 
                                                key={item.id} 
                                                onClick={(e) => { e.stopPropagation(); setActiveItem(item.id); }}
                                                className="calendar-item-bar"
                                                style={{ backgroundColor: group?.color || 'hsl(var(--color-brand-primary))' }}
                                                title={item.title}
                                            >
                                                {item.title}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderYearView = () => {
        const yearStart = startOfYear(currentDate);
        const yearEnd = endOfYear(yearStart);
        const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });

        return (
            <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', 
                    gap: '16px' 
                }}>
                    {months.map(month => {
                        const mStart = startOfMonth(month);
                        const mEnd = endOfMonth(mStart);
                        const sDate = startOfWeek(mStart);
                        const eDate = endOfWeek(mEnd);
                        const days = eachDayOfInterval({ start: sDate, end: eDate });

                        return (
                            <div 
                                key={month.toISOString()}
                                onClick={() => {
                                    setCurrentDate(month);
                                    setViewType('month');
                                }}
                                className="card-surface calendar-pick"
                                style={{ padding: '14px' }}
                            >
                                <div style={{
                                    fontFamily: 'var(--font-family-display)',
                                    fontSize: '16.5px',
                                    fontWeight: 500,
                                    letterSpacing: '-0.015em',
                                    marginBottom: '8px',
                                    textAlign: 'center',
                                    color: 'hsl(var(--color-text-primary))'
                                }}>
                                    {format(month, 'MMMM')}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                                    {['S','M','T','W','T','F','S'].map((d, i) => (
                                        <div key={i} style={{ fontSize: '9.5px', fontWeight: 600, textAlign: 'center', color: 'hsl(var(--color-text-tertiary))', paddingBottom: '2px' }}>{d}</div>
                                    ))}
                                    {days.map((day, i) => {
                                        const hasItems = getItemsForDay(day).length > 0;
                                        const isM = isSameMonth(day, month);
                                        return (
                                            <div 
                                                key={i} 
                                                style={{ 
                                                    fontSize: '9.5px', 
                                                    textAlign: 'center', 
                                                    padding: '2.5px 0',
                                                    color: (isM && hasItems) ? '#FFEFD2' : isM ? 'hsl(var(--color-text-primary))' : 'hsl(var(--color-text-tertiary) / 0.45)',
                                                    backgroundColor: (isM && hasItems) ? 'hsl(var(--color-brand-primary))' : 'transparent',
                                                    borderRadius: '4px',
                                                    fontWeight: (isM && hasItems) ? 700 : 400
                                                }}
                                            >
                                                {format(day, 'd')}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="board-sheet calendar-container">
            {renderHeader()}
            {viewType === 'day' && renderDayView()}
            {viewType === 'month' && renderMonthView()}
            {viewType === 'year' && renderYearView()}

            <style>{`
                .calendar-container {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    height: 100%;
                    background-color: hsl(var(--paper, var(--color-bg-surface)));
                    border-color: var(--paper-edge, var(--card-border));
                }
                .calendar-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 20px;
                    background-color: hsl(var(--paper-head, var(--color-bg-subtle)));
                    border-bottom: 1px solid var(--paper-edge, var(--card-border));
                    flex-shrink: 0;
                }
                .calendar-month-body {
                    flex: 1;
                    min-height: 0;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                .calendar-grid-header {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    background-color: hsl(var(--paper, var(--color-bg-surface)));
                    border-bottom: 1px solid var(--paper-edge, var(--card-border));
                }
                .weekday-label {
                    padding: 9px 8px;
                    text-align: center;
                    font-size: 10.5px;
                    font-weight: 600;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    color: hsl(var(--color-text-tertiary));
                    border-right: 1px solid var(--paper-row-line, var(--card-grid));
                }
                .weekday-label:last-child {
                    border-right: none;
                }
                .calendar-grid {
                    flex: 1;
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    grid-auto-rows: 1fr;
                    overflow-y: auto;
                }
                .calendar-day {
                    min-height: 96px;
                    border-right: 1px solid var(--paper-row-line, var(--card-grid));
                    border-bottom: 1px solid var(--paper-row-line, var(--card-grid));
                    padding: 6px;
                    display: flex;
                    flex-direction: column;
                    cursor: pointer;
                    transition: background-color 0.15s;
                }
                /* The sheet's edge is the outer line: no second one on the last column or row */
                .calendar-day:nth-child(7n) {
                    border-right: none;
                }
                .calendar-day:nth-last-child(-n + 7) {
                    border-bottom: none;
                }
                .calendar-day:hover {
                    background-color: rgba(21, 42, 0, 0.03);
                }
                .calendar-day.other-month {
                    background-color: rgba(21, 42, 0, 0.02);
                }
                .calendar-day.other-month .day-number {
                    opacity: 0.45;
                }
                .calendar-day.today {
                    background-color: rgba(21, 42, 0, 0.045);
                }
                .day-number {
                    font-size: 12px;
                    color: hsl(var(--color-text-secondary));
                    margin-bottom: 5px;
                    font-weight: 600;
                    width: 22px;
                    height: 22px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .calendar-day.today .day-number {
                    color: #FFEFD2;
                    background-color: hsl(var(--color-brand-primary));
                    border-radius: 50%;
                    box-shadow: 0 2px 5px -1px rgba(21, 42, 0, 0.35);
                }
                .day-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                    overflow: hidden;
                }
                .calendar-item-bar {
                    font-size: 11px;
                    font-weight: 600;
                    color: #FFEFD2;
                    padding: 3px 8px;
                    border-radius: 6px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    cursor: pointer;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 1px 3px rgba(21, 42, 0, 0.2);
                    transition: filter 0.15s, transform 0.15s;
                }
                .calendar-item-bar:hover {
                    filter: brightness(1.08);
                    transform: translateY(-0.5px);
                }
            `}</style>
        </div>
    );
};


