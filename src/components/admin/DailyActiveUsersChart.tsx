import { useState, useEffect, useMemo } from 'react';
import { Activity } from 'lucide-react';
import { fetchDashboardStats } from '../../lib/activityStats';

interface DayBucket {
    key: string;
    label: string;
    fullLabel: string;
    count: number;
    users: { name: string; email: string }[];
}

const DAYS = 30;
const CHART_WIDTH = 900;
const CHART_HEIGHT = 200;
const PADDING_LEFT = 32;
const PADDING_BOTTOM = 24;
const PADDING_TOP = 16;

const toDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortLabel = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fullLabel = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export const DailyActiveUsersChart = () => {
    const [buckets, setBuckets] = useState<DayBucket[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);

        const days: Date[] = [];
        for (let i = DAYS - 1; i >= 0; i--) {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - i);
            days.push(d);
        }

        const { daily } = await fetchDashboardStats();
        const usersByDay = new Map(daily.map(entry => [entry.day, entry.users]));

        setBuckets(days.map(d => {
            const key = toDayKey(d);
            const users = usersByDay.get(key) || [];
            return { key, label: shortLabel(d), fullLabel: fullLabel(d), count: users.length, users };
        }));
        setLoading(false);
    };

    const maxCount = useMemo(() => Math.max(1, ...buckets.map(b => b.count)), [buckets]);
    const yTicks = useMemo(() => {
        const top = Math.max(1, Math.ceil(maxCount / 5) * 5);
        return [0, Math.round(top / 2), top];
    }, [maxCount]);

    const plotWidth = CHART_WIDTH - PADDING_LEFT;
    const plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    const colWidth = plotWidth / DAYS;
    const barWidth = Math.min(24, colWidth - 4);

    const totalActive30d = useMemo(() => {
        const seen = new Set<string>();
        buckets.forEach(b => b.users.forEach(u => seen.add(u.email || u.name)));
        return seen.size;
    }, [buckets]);

    return (
        <div className="card-surface" style={{ padding: '22px 24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="admin-tile" style={{ width: '38px', height: '38px', '--tile-color': '#2A4A12' } as React.CSSProperties}>
                        <Activity size={18} />
                    </div>
                    <div>
                        <h3 className="narai-heading" style={{
                            margin: 0,
                            fontFamily: 'var(--font-family-display)',
                            fontSize: '18px',
                            fontWeight: 600,
                            color: 'hsl(var(--color-text-primary))'
                        }}>
                            Daily Active Users (Last 30 Days)
                        </h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'hsl(var(--color-text-secondary))' }}>
                            Based on recorded activity, including logins · <strong>{totalActive30d}</strong> unique users in this period
                        </p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))', fontSize: '13.5px' }}>Loading chart…</div>
            ) : (
                <div style={{ position: 'relative', marginTop: '14px' }}>
                    <svg
                        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
                    >
                        {yTicks.map(tick => {
                            const y = PADDING_TOP + plotHeight - (tick / yTicks[yTicks.length - 1]) * plotHeight;
                            return (
                                <g key={tick}>
                                    <line
                                        x1={PADDING_LEFT} x2={CHART_WIDTH}
                                        y1={y} y2={y}
                                        stroke="rgba(21, 42, 0, 0.08)" strokeWidth={1}
                                    />
                                    <text x={PADDING_LEFT - 8} y={y + 4} textAnchor="end" fontSize="11" fill="hsl(var(--color-text-tertiary))">
                                        {tick}
                                    </text>
                                </g>
                            );
                        })}

                        {buckets.map((bucket, i) => {
                            const x = PADDING_LEFT + i * colWidth + (colWidth - barWidth) / 2;
                            const scaledHeight = (bucket.count / yTicks[yTicks.length - 1]) * plotHeight;
                            const barHeight = bucket.count > 0 ? Math.max(4, scaledHeight) : 4;
                            const y = PADDING_TOP + plotHeight - barHeight;
                            const isHovered = hoverIndex === i;
                            const showLabel = i === 0 || i === buckets.length - 1 || i % 5 === 0;

                            return (
                                <g key={bucket.key}>
                                    <rect
                                        x={PADDING_LEFT + i * colWidth}
                                        y={PADDING_TOP}
                                        width={colWidth}
                                        height={plotHeight}
                                        fill="transparent"
                                        tabIndex={0}
                                        onMouseEnter={() => setHoverIndex(i)}
                                        onMouseLeave={() => setHoverIndex(null)}
                                        onFocus={() => setHoverIndex(i)}
                                        onBlur={() => setHoverIndex(null)}
                                        style={{ cursor: 'pointer', outline: 'none' }}
                                    />
                                    <rect
                                        x={x} y={y}
                                        width={barWidth} height={barHeight}
                                        rx={5} ry={5}
                                        fill={bucket.count > 0 ? '#2A4A12' : 'rgba(21, 42, 0, 0.08)'}
                                        opacity={isHovered ? 1 : bucket.count > 0 ? 0.88 : 1}
                                        style={{ transition: 'opacity 0.15s', pointerEvents: 'none' }}
                                    />
                                    {showLabel && (
                                        <text
                                            x={x + barWidth / 2}
                                            y={CHART_HEIGHT - 6}
                                            textAnchor="middle"
                                            fontSize="10"
                                            fill="hsl(var(--color-text-tertiary))"
                                        >
                                            {bucket.label}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>

                    {hoverIndex !== null && buckets[hoverIndex] && (() => {
                        const bucket = buckets[hoverIndex];
                        const posRatio = hoverIndex / (buckets.length - 1);
                        let leftPct: number;
                        let translateX: string;
                        if (posRatio < 0.12) {
                            leftPct = (PADDING_LEFT + hoverIndex * colWidth) / CHART_WIDTH * 100;
                            translateX = '0%';
                        } else if (posRatio > 0.88) {
                            leftPct = (PADDING_LEFT + (hoverIndex + 1) * colWidth) / CHART_WIDTH * 100;
                            translateX = '-100%';
                        } else {
                            leftPct = (PADDING_LEFT + hoverIndex * colWidth + colWidth / 2) / CHART_WIDTH * 100;
                            translateX = '-50%';
                        }
                        return (
                            <div style={{
                                position: 'absolute',
                                left: `${leftPct}%`,
                                top: '0px',
                                transform: `translate(${translateX}, -100%)`,
                                backgroundColor: '#152A00',
                                color: '#FFEFD2',
                                borderRadius: '12px',
                                padding: '10px 14px',
                                fontSize: '12px',
                                minWidth: '160px',
                                maxWidth: '220px',
                                boxShadow: '0 12px 24px -8px rgba(21, 42, 0, 0.45)',
                                zIndex: 10,
                                pointerEvents: 'none'
                            }}>
                                <div style={{ fontWeight: 600, marginBottom: '2px' }}>{bucket.fullLabel}</div>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: '#E1FFB3', marginBottom: bucket.users.length ? '6px' : 0 }}>
                                    {bucket.count} active {bucket.count === 1 ? 'user' : 'users'}
                                </div>
                                {bucket.users.length > 0 && (
                                    <div style={{ maxHeight: '140px', overflowY: 'auto' }}>
                                        {bucket.users.slice(0, 10).map((u, idx) => (
                                            <div key={idx} style={{ color: 'rgba(255, 239, 210, 0.86)', fontSize: '11px', lineHeight: '1.6' }}>
                                                {u.name}
                                            </div>
                                        ))}
                                        {bucket.users.length > 10 && (
                                            <div style={{ color: 'rgba(255, 239, 210, 0.6)', fontSize: '11px', marginTop: '2px' }}>
                                                +{bucket.users.length - 10} more
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
};
