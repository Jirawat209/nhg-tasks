import { Star } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { formatNumberValue } from '../../utils/format';
import type { Column } from '../../types';
import { tintLabel } from '../../lib/labelTint';

const LABEL: React.CSSProperties = {
    fontSize: '9.5px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'hsl(var(--color-text-tertiary))'
};

/**
 * The roll-up shown for one column on a group's header line, or under a
 * parent's sub-items: a slim status breakdown, a date range, an average
 * rating, a total, avatars or a file count, depending on the column's type.
 * `agg` is that column's entry from computeAggregates, `totalCount` the number
 * of rows it summarises.
 */
export const SummaryCell = ({ col, agg, totalCount }: {
    col: Column;
    agg: any;
    totalCount: number;
    color?: string;
}) => {
    const activeBoardMembers = useBoardStore(state => state.activeBoardMembers);

    return (
        <>
            {col.type === 'status' && (() => {
                if (!agg || totalCount === 0) {
                    return <div style={{ width: '100%', height: '6px', borderRadius: '999px', background: 'hsl(var(--color-text-primary) / 0.07)' }} />;
                }
                const values = agg.values as any[];
                const counts: Record<string, number> = {};
                values.forEach(v => {
                    const val = v || 'default';
                    counts[val] = (counts[val] || 0) + 1;
                });
                const options = Array.isArray(col.options) ? col.options : [];
                const doneOption = options.find(o => /^(done|complete|completed)$/i.test(o.label));
                const doneCount = doneOption ? (counts[doneOption.id] || counts[doneOption.label] || 0) : 0;
                const segments = options
                    .map(opt => ({ opt, count: counts[opt.id] || counts[opt.label] || 0 }))
                    .filter(s => s.count > 0);

                return (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <div style={{ display: 'flex', gap: '2px', height: '6px', width: '100%' }}>
                            {segments.map(({ opt, count }) => (
                                <div
                                    key={opt.id}
                                    title={`${opt.label}: ${count} of ${totalCount}`}
                                    style={{
                                        flex: count,
                                        borderRadius: '999px',
                                        backgroundColor: tintLabel(opt.color)
                                    }}
                                />
                            ))}
                            {counts['default'] ? (
                                <div
                                    title={`No status: ${counts['default']} of ${totalCount}`}
                                    style={{ flex: counts['default'], borderRadius: '999px', background: 'hsl(var(--color-text-primary) / 0.1)' }}
                                />
                            ) : null}
                        </div>
                        {doneOption && (
                            <div style={{ ...LABEL, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                                {doneCount}/{totalCount} {doneOption.label}
                            </div>
                        )}
                    </div>
                );
            })()}
            {(col.type === 'date' || col.type === 'due_date' || col.type === 'timeline') && (() => {
                if (!agg || !agg.min) return null;
                const d1 = new Date(agg.min).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                const d2 = new Date(agg.max).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'hsl(var(--color-text-primary))', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {d1 === d2 ? d1 : `${d1} – ${d2}`}
                        </span>
                        <span style={LABEL}>Span</span>
                    </div>
                );
            })()}
            {col.type === 'priority' && (() => {
                // Reads the average defensively: a shape without an avg must show
                // nothing rather than throw and take the whole board down with it.
                if (!agg?.count || typeof agg.avg !== 'number') return null;
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Star size={13} color="#A76400" fill="#A76400" />
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', fontVariantNumeric: 'tabular-nums' }}>{agg.avg.toFixed(1)}</span>
                        <span style={LABEL}>avg</span>
                    </div>
                );
            })()}
            {col.type === 'number' && (() => {
                const aggregation = col.aggregation || 'sum';

                let result: number | string = 0;

                if (aggregation === 'none' || !agg || agg.count === 0) {
                    if (aggregation === 'none') {
                        return (
                            <div
                                onClick={() => useBoardStore.getState().setColumnAggregation(col.id, 'sum')}
                                style={{ width: '100%', height: '100%', cursor: 'pointer' }}
                                title="Click to show a total"
                            />
                        );
                    }
                    result = '–';
                } else {
                    switch (aggregation) {
                        case 'sum':
                            result = agg.sum || 0;
                            break;
                        case 'avg':
                            result = parseFloat(((agg.sum || 0) / agg.count).toFixed(2));
                            break;
                        case 'min':
                            result = Math.min(...agg.values);
                            break;
                        case 'max':
                            result = Math.max(...agg.values);
                            break;
                        case 'count':
                            result = agg.count;
                            break;
                    }
                }

                const nextAggregation = {
                    'sum': 'avg',
                    'avg': 'min',
                    'min': 'max',
                    'max': 'count',
                    'count': 'sum',
                    'none': 'sum'
                } as const;

                const displayResult = (typeof result === 'number' && aggregation !== 'count')
                    ? formatNumberValue(result, col)
                    : result;

                return (
                    <button
                        onClick={() => useBoardStore.getState().setColumnAggregation(col.id, nextAggregation[aggregation] as any)}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '2px 10px',
                            borderRadius: '10px'
                        }}
                        title="Click to change the calculation"
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-text-primary) / 0.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', fontVariantNumeric: 'tabular-nums' }}>{displayResult}</span>
                        <span style={LABEL}>{aggregation}</span>
                    </button>
                );
            })()}
            {col.type === 'people' && (() => {
                // Matches the cells this row summarises: ids with no visible
                // member behind them are left out rather than counted.
                const uniqueIds: string[] = (agg?.uniqueIds || []).filter(
                    (id: string) => activeBoardMembers.some(m => m.user_id === id)
                );
                if (uniqueIds.length === 0) return null;
                const maxVisible = 4;
                return (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {uniqueIds.slice(0, maxVisible).map((userId, idx) => {
                            const member = activeBoardMembers.find(m => m.user_id === userId);
                            const profileData = Array.isArray(member?.profiles) ? member.profiles[0] : member?.profiles;
                            const profile = profileData || {};
                            const name = profile.full_name || profile.email || 'Unknown';
                            const initial = name[0]?.toUpperCase() || '?';

                            return (
                                <div key={userId} title={name} style={{
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    backgroundColor: profile?.avatar_url ? 'transparent' : 'hsl(var(--color-brand-primary))',
                                    color: '#FFEFD2',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '9.5px',
                                    fontWeight: 600,
                                    boxShadow: '0 0 0 2px hsl(var(--paper-head, var(--color-bg-surface)))',
                                    marginLeft: idx > 0 ? '-6px' : '0',
                                    zIndex: idx + 1,
                                    overflow: 'hidden',
                                    position: 'relative'
                                }}>
                                    {profile?.avatar_url ? (
                                        <img
                                            src={profile.avatar_url}
                                            alt=""
                                            referrerPolicy="no-referrer"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        initial
                                    )}
                                </div>
                            );
                        })}
                        {uniqueIds.length > maxVisible && (
                            <div style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                backgroundColor: 'hsl(var(--color-text-primary) / 0.1)',
                                color: 'hsl(var(--color-text-secondary))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '9.5px',
                                fontWeight: 600,
                                boxShadow: '0 0 0 2px hsl(var(--paper-head, var(--color-bg-surface)))',
                                marginLeft: '-6px',
                                zIndex: maxVisible + 1,
                                position: 'relative'
                            }}>
                                +{uniqueIds.length - maxVisible}
                            </div>
                        )}
                    </div>
                );
            })()}
            {col.type === 'files' && (() => {
                const fileCount = agg?.count || 0;
                if (fileCount === 0) return null;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>{fileCount}</span>
                        <span style={LABEL}>files</span>
                    </div>
                );
            })()}
        </>
    );
};
