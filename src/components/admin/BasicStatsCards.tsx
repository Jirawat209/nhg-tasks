import { useState, useEffect } from 'react';
import { fetchDashboardStats, DASHBOARD_WINDOW_DAYS } from '../../lib/activityStats';

const WINDOW_DAYS = DASHBOARD_WINDOW_DAYS;
const PERIOD_LABEL = `Last ${WINDOW_DAYS} days`;

interface Stat {
    label: string;
    value: number;
    hint: string;
}

interface Stats {
    boardsUpdated: number;
    peoplePosted: number;
    updatesInBoards: number;
    peopleJoined: number;
    peopleContributed: number;
    peopleSignedIn: number;
}

const EMPTY: Stats = {
    boardsUpdated: 0,
    peoplePosted: 0,
    updatesInBoards: 0,
    peopleJoined: 0,
    peopleContributed: 0,
    peopleSignedIn: 0
};

export const BasicStatsCards = () => {
    const [stats, setStats] = useState<Stats>(EMPTY);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const { summary, joined } = await fetchDashboardStats();
            setStats({
                boardsUpdated: summary.boardsUpdated,
                peoplePosted: summary.peoplePosted,
                updatesInBoards: summary.updates,
                peopleJoined: joined,
                peopleContributed: summary.contributed,
                peopleSignedIn: summary.signedIn
            });
        } finally {
            setLoading(false);
        }
    };

    const summaryStats: Stat[] = [
        { label: 'Boards updated', value: stats.boardsUpdated, hint: 'Distinct boards with recorded activity in this period' },
        { label: 'People posted', value: stats.peoplePosted, hint: 'People who posted at least one update on an item' },
        { label: 'Updates in boards', value: stats.updatesInBoards, hint: 'Total updates posted on items across all boards' }
    ];

    const peopleStats: Stat[] = [
        { label: 'People joined', value: stats.peopleJoined, hint: 'Accounts created in this period' },
        { label: 'People contributed', value: stats.peopleContributed, hint: 'People who changed something — items, boards, columns, members' },
        { label: 'People signed in', value: stats.peopleSignedIn, hint: 'People who signed in at least once' }
    ];

    return (
        <div style={{ marginBottom: '24px' }}>
            <h2 className="narai-heading" style={{
                fontFamily: 'var(--font-family-display)',
                fontSize: '20px',
                fontWeight: 600,
                color: 'hsl(var(--color-text-primary))',
                margin: '0 0 2px 0'
            }}>
                Platform Engagement
            </h2>
            <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>
                Activity across the whole system over the last {WINDOW_DAYS} days.
            </p>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                gap: '18px'
            }}>
                <StatPanel title="Board Summary" period={PERIOD_LABEL} color="#152A00" stats={summaryStats} loading={loading} />
                <StatPanel title="People Activity" period={PERIOD_LABEL} color="#7D4B00" stats={peopleStats} loading={loading} />
            </div>
        </div>
    );
};

interface StatPanelProps {
    title: string;
    period: string;
    color: string;
    stats: Stat[];
    loading: boolean;
}

const StatPanel = ({ title, period, color, stats, loading }: StatPanelProps) => (
    <div className="admin-panel-lit" style={{
        '--panel-color': color,
        padding: '20px 24px 22px',
        color: '#FFEFD2'
    } as React.CSSProperties}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <h3 style={{
                margin: 0,
                fontFamily: 'var(--font-family-display)',
                fontSize: '17px',
                fontWeight: 600,
                color: '#FFEFD2'
            }}>
                {title}
            </h3>
            <span style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                padding: '3px 10px',
                borderRadius: '999px',
                backgroundColor: 'rgba(255, 239, 210, 0.14)',
                color: '#FFEFD2'
            }}>
                {period}
            </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {stats.map(stat => (
                <div key={stat.label} style={{ textAlign: 'center' }} title={stat.hint}>
                    <div style={{
                        fontFamily: 'var(--font-family-display)',
                        fontSize: '34px',
                        fontWeight: 600,
                        lineHeight: 1.1,
                        fontVariantNumeric: 'tabular-nums',
                        color: '#FFEFD2'
                    }}>
                        {loading ? '–' : stat.value.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'rgba(255, 239, 210, 0.82)', marginTop: '6px', fontWeight: 500 }}>
                        {stat.label}
                    </div>
                </div>
            ))}
        </div>
    </div>
);
