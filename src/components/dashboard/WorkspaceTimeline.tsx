import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { format, addMonths, subMonths, addYears, subYears } from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { buildTimeGrid, computeBarSpan, isCurrentUnit, todayOffset, unitWidthFor, type TimelineViewType } from '../../lib/timelineScale';
import {
    buildTimelineRows, orderRows,
    type TimelineGroupInfo, type TimelineRow, type TimelineSourceColumn, type TimelineSourceItem
} from '../../lib/workspaceTimeline';
import { NAME_COL_WIDTH, ROW_INNER_HEIGHT, BAR_V_INSET } from '../table/timelineGeometry';

const navBtnStyle: CSSProperties = {
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

/**
 * The workspace dashboard's Timeline: the board Timeline view's look, across
 * every board in the workspace. One bar per dated top-level item, coloured by
 * its group; click a name or a bar to open the item on its own board.
 *
 * Read-only on purpose — dragging a bar to reschedule or linking items needs a
 * board's permissions and dependency state; do that on the board itself.
 */
export const WorkspaceTimeline = ({ items, columns, boards, groupsByBoard, isLoading, filterControl, onOpenItem, onOpenBoard, storageKey, fillHeight }: {
    items: TimelineSourceItem[];
    columns: TimelineSourceColumn[];
    boards: { id: string; title: string }[];
    groupsByBoard: Map<string, TimelineGroupInfo[]>;
    isLoading: boolean;
    // The board → group picker, drawn as a Filter button beside the Day / Month / Year switch.
    filterControl: ReactNode;
    onOpenItem: (itemId: string, boardId?: string) => void;
    onOpenBoard?: (boardId: string) => void;
    // localStorage key for the collapsed state, so it is remembered per workspace.
    storageKey: string;
    // The card was resized by the user: use the room it has instead of the 520px cap.
    fillHeight: boolean;
}) => {
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem(storageKey) === '1'; } catch { return false; }
    });
    const toggleCollapsed = () => {
        setCollapsed(prev => {
            const next = !prev;
            try {
                if (next) localStorage.setItem(storageKey, '1');
                else localStorage.removeItem(storageKey);
            } catch { /* private mode — the choice just won't persist */ }
            return next;
        });
    };

    const [viewDate, setViewDate] = useState(() => new Date());
    // Month by default, same as the board: a whole year fits on screen.
    const [viewType, setViewType] = useState<TimelineViewType>('month');
    const timeGrid = useMemo(() => buildTimeGrid(viewDate, viewType), [viewDate, viewType]);
    const unitWidth = unitWidthFor(viewType);
    const gridWidth = timeGrid.length * unitWidth;

    const rows = useMemo(
        () => orderRows(buildTimelineRows({ items, columns, boards, groupsByBoard })),
        [items, columns, boards, groupsByBoard]
    );

    const bars = useMemo(() => {
        const map = new Map<string, NonNullable<ReturnType<typeof computeBarSpan>>>();
        rows.forEach(row => {
            const span = computeBarSpan(row.start, row.end, timeGrid, viewType, unitWidth);
            if (span) map.set(row.id, span);
        });
        return map;
    }, [rows, timeGrid, viewType, unitWidth]);

    const todayLeft = todayOffset(timeGrid, viewType, unitWidth);

    const shift = (direction: 1 | -1) => {
        if (viewType === 'day') setViewDate(d => direction === 1 ? addMonths(d, 1) : subMonths(d, 1));
        else if (viewType === 'month') setViewDate(d => direction === 1 ? addYears(d, 1) : subYears(d, 1));
        else setViewDate(d => direction === 1 ? addYears(d, 5) : subYears(d, 5));
    };

    const title = viewType === 'day' ? format(viewDate, 'MMMM yyyy')
        : viewType === 'month' ? format(viewDate, 'yyyy')
            : `${format(subYears(viewDate, 2), 'yyyy')} - ${format(addYears(viewDate, 2), 'yyyy')}`;

    const renderRow = (row: TimelineRow) => {
        const bar = bars.get(row.id);
        const isNarrowBar = bar ? bar.width < 68 : false;
        const dates = `${format(row.start, 'd MMM yyyy')} – ${format(row.end, 'd MMM yyyy')}`;
        const where = [row.boardTitle, row.groupTitle].filter(Boolean).join(' · ');
        return (
            <div key={row.id} style={{ display: 'flex', height: `${ROW_INNER_HEIGHT}px`, borderBottom: '1px solid var(--paper-row-line, var(--card-grid))', alignItems: 'center' }}>
                <div
                    onClick={() => onOpenItem(row.id, row.boardId)}
                    title={`${row.title}\n${where}`}
                    style={{
                        position: 'sticky', left: 0, zIndex: 6, backgroundColor: 'hsl(var(--paper, var(--card-solid)))',
                        width: `${NAME_COL_WIDTH}px`, flexShrink: 0, height: '100%', boxSizing: 'border-box',
                        borderRight: '1px solid var(--paper-edge, var(--card-grid))', padding: '0 12px 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                        fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden',
                        cursor: 'pointer', color: 'hsl(var(--color-text-primary))', fontWeight: 500
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        <span style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: row.groupColor || 'hsl(var(--color-brand-primary))',
                            flexShrink: 0
                        }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</span>
                    </div>
                    {row.boardTitle && boards.length > 1 && (
                        <button
                            type="button"
                            onClick={(e) => {
                                if (onOpenBoard) {
                                    e.stopPropagation();
                                    onOpenBoard(row.boardId);
                                }
                            }}
                            title={`Open board "${row.boardTitle}"`}
                            style={{
                                flexShrink: 0,
                                maxWidth: '84px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                padding: '2px 7px',
                                borderRadius: '999px',
                                border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))',
                                color: 'hsl(var(--color-text-secondary))',
                                fontSize: '10px',
                                fontWeight: 600,
                                cursor: onOpenBoard ? 'pointer' : 'default'
                            }}
                        >
                            {row.boardTitle}
                        </button>
                    )}
                </div>
                <div style={{
                    position: 'relative', flexShrink: 0, width: `${gridWidth}px`, height: '100%',
                    // One unit-wide line repeated, instead of a div per cell per row.
                    backgroundImage: 'linear-gradient(to right, transparent calc(100% - 1px), var(--paper-row-line, var(--card-grid)) calc(100% - 1px))',
                    backgroundSize: `${unitWidth}px 100%`
                }}>
                    {bar && (
                        <>
                            <div
                                onClick={() => onOpenItem(row.id, row.boardId)}
                                title={`${row.title}\n${where}\n${dates}`}
                                style={{
                                    position: 'absolute', top: `${BAR_V_INSET}px`, bottom: `${BAR_V_INSET}px`,
                                    left: `${bar.left}px`, width: `${bar.width}px`, boxSizing: 'border-box',
                                    backgroundColor: row.groupColor || 'hsl(var(--color-brand-primary))',
                                    borderRadius: '6px', opacity: 0.94,
                                    display: 'flex', alignItems: 'center', justifyContent: isNarrowBar ? 'center' : 'flex-start',
                                    color: '#FFEFD2', fontSize: '11px', fontWeight: 600, letterSpacing: '0.01em', padding: isNarrowBar ? 0 : '0 8px',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', zIndex: 5, cursor: 'pointer',
                                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 2px 6px -2px rgba(21, 42, 0, 0.28)'
                                }}
                            >
                                {!isNarrowBar && (
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</span>
                                )}
                            </div>
                            {isNarrowBar && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: `${bar.left + bar.width + 7}px`,
                                        top: 0,
                                        bottom: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        fontSize: '11.5px',
                                        fontWeight: 500,
                                        color: 'hsl(var(--color-text-secondary))',
                                        whiteSpace: 'nowrap',
                                        pointerEvents: 'none',
                                        zIndex: 4
                                    }}
                                >
                                    {row.title}
                                </div>
                            )}
                            {bar.clippedStart && (
                                <div title="Starts before what's shown" style={{ position: 'absolute', left: `${bar.left + 2}px`, top: `${BAR_V_INSET}px`, bottom: `${BAR_V_INSET}px`, display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.85)', fontSize: '10px', zIndex: 6, pointerEvents: 'none' }}>«</div>
                            )}
                            {bar.clippedEnd && (
                                <div title="Continues past what's shown" style={{ position: 'absolute', left: `${bar.left + bar.width - 12}px`, top: `${BAR_V_INSET}px`, bottom: `${BAR_V_INSET}px`, display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.85)', fontSize: '10px', zIndex: 6, pointerEvents: 'none' }}>»</div>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        // The card material (styles/cards.css); overflow clips the scrolling grid to its rounded corners
        <div className="card-surface dash-widget" style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            {/* Navigator. Left padding leaves room for the card's drag handle. */}
            <div className="widget-header-with-space" style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px 12px',
                padding: '12px 20px',
                transition: 'padding-left 0.18s ease',
                backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))'
            }}>
                <button
                    type="button"
                    className="glass-chip"
                    onClick={toggleCollapsed}
                    aria-expanded={!collapsed}
                    aria-label={collapsed ? 'Expand timeline' : 'Collapse timeline'}
                    title={collapsed ? 'Expand' : 'Collapse'}
                    style={{ ...navBtnStyle, width: '30px', padding: 0 }}
                >
                    <ChevronDown size={16} style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }} />
                </button>
                <h3 className="narai-heading" style={{
                    fontFamily: 'var(--font-family-display)',
                    fontSize: '21px',
                    fontWeight: 500,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                    margin: 0,
                    color: 'hsl(var(--color-text-primary))'
                }}>
                    {title}
                </h3>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" className="glass-chip" onClick={() => shift(-1)} style={{ ...navBtnStyle, width: '30px', padding: 0 }} aria-label="Previous"><ChevronLeft size={16} /></button>
                    <button type="button" className="glass-chip" onClick={() => shift(1)} style={{ ...navBtnStyle, width: '30px', padding: 0 }} aria-label="Next"><ChevronRight size={16} /></button>
                </div>
                <button type="button" className="glass-chip" onClick={() => setViewDate(new Date())} style={navBtnStyle}>Today</button>
                <div className="seg glass-chip">
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

                {/* Filter sits with the date controls. */}
                {filterControl}
            </div>

            {/* Grid. Capped and scrolled: a workspace's timeline can run to hundreds of rows. */}
            {!collapsed && <div style={{ flex: 1, minHeight: 0, maxHeight: fillHeight ? undefined : '520px', overflow: 'auto', borderTop: '1px solid var(--paper-edge, var(--card-border))' }}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 'max-content', position: 'relative' }}>
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--paper-edge, var(--card-border))', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'hsl(var(--paper, var(--card-solid)))' }}>
                        <div style={{
                            position: 'sticky', left: 0, zIndex: 11, backgroundColor: 'hsl(var(--paper, var(--card-solid)))',
                            width: `${NAME_COL_WIDTH}px`, flexShrink: 0, boxSizing: 'border-box',
                            borderRight: '1px solid var(--paper-edge, var(--card-border))', padding: '10px 16px',
                            display: 'flex', alignItems: 'center',
                            fontWeight: 600, fontSize: '10.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(var(--color-text-tertiary))'
                        }}>
                            Item Name
                        </div>
                        {timeGrid.map(unit => {
                            const isCurrent = isCurrentUnit(viewType, unit);
                            return (
                                <div key={unit.toISOString()} style={{
                                    width: `${unitWidth}px`, flexShrink: 0, boxSizing: 'border-box', textAlign: 'center', padding: '8px 0', fontSize: '11px',
                                    borderRight: '1px solid var(--paper-row-line, var(--card-grid))',
                                    backgroundColor: isCurrent ? 'rgba(21, 42, 0, 0.045)' : 'transparent',
                                    color: isCurrent ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))',
                                    fontWeight: isCurrent ? 700 : 600,
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase'
                                }}>
                                    <div>{viewType === 'day' ? format(unit, 'd') : viewType === 'month' ? format(unit, 'MMM') : format(unit, 'yyyy')}</div>
                                    {viewType === 'day' && <div style={{ fontSize: '9.5px', opacity: 0.65, marginTop: '1px' }}>{format(unit, 'EEE')}</div>}
                                    {viewType === 'month' && <div style={{ fontSize: '9.5px', opacity: 0.65, marginTop: '1px', fontWeight: isCurrent ? 600 : 500 }}>{format(unit, 'yyyy')}</div>}
                                </div>
                            );
                        })}
                    </div>

                    {isLoading ? (
                        <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: '13px', color: 'hsl(var(--color-text-tertiary))', position: 'sticky', left: 0 }}>
                            Loading timeline…
                        </div>
                    ) : rows.length === 0 ? (
                        <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: '13px', color: 'hsl(var(--color-text-tertiary))', position: 'sticky', left: 0 }}>
                            No scheduled items yet. An item shows here once it has a Date, Timeline or Due date.
                        </div>
                    ) : (
                        <div style={{ position: 'relative' }}>
                            {todayLeft !== null && (
                                <div style={{
                                    position: 'absolute', left: `${NAME_COL_WIDTH + todayLeft}px`, top: 0, bottom: 0, width: '1.5px',
                                    backgroundColor: '#9E2A2B', zIndex: 4, pointerEvents: 'none', opacity: 0.75
                                }} />
                            )}
                            {rows.map(renderRow)}
                        </div>
                    )}
                </div>
            </div>}
        </div>
    );
};
