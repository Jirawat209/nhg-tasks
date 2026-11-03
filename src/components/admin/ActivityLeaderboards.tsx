import { useState, useEffect } from 'react';
import { fetchDashboardStats } from '../../lib/activityStats';

const WEEKS = 4;
const LIST_MAX_HEIGHT = 360;

interface BoardRow {
    boardId: string;
    title: string;
    items: number;
    updates: number;
}

interface PersonRow {
    userId: string;
    name: string;
    avatarUrl: string | null;
    weeks: number[];
    total: number;
}

const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};

const weekLabel = (start: Date, end: Date) => {
    const from = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const to = end.toLocaleDateString(
        undefined,
        start.getMonth() === end.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' }
    );
    return `${from} – ${to}`;
};

export const ActivityLeaderboards = () => {
    const [boards, setBoards] = useState<BoardRow[]>([]);
    const [creators, setCreators] = useState<PersonRow[]>([]);
    const [communicators, setCommunicators] = useState<PersonRow[]>([]);
    const [weekLabels, setWeekLabels] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        load();
    }, []);

    const load = async () => {
        setLoading(true);
        try {
            const today = startOfToday();
            const labels: string[] = [];
            for (let w = 0; w < WEEKS; w++) {
                const end = new Date(today);
                end.setDate(end.getDate() - (WEEKS - 1 - w) * 7);
                const start = new Date(end);
                start.setDate(start.getDate() - 6);
                labels.push(weekLabel(start, end));
            }
            setWeekLabels(labels);

            const stats = await fetchDashboardStats();
            setBoards(stats.boards);
            setCreators(stats.creators);
            setCommunicators(stats.communicators);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ marginTop: '24px' }}>
            <Section title="Trending Boards" subtitle={`in the last ${WEEKS} weeks`} count={boards.length}>
                <table style={tableStyle}>
                    <thead>
                        <tr style={headRowStyle}>
                            <th style={{ ...thStyle, width: '48px' }}>#</th>
                            <th style={thStyle}>Board</th>
                            <th style={{ ...thStyle, ...numHeadStyle }}>Items Created</th>
                            <th style={{ ...thStyle, ...numHeadStyle }}>Updates Posted</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <LoadingRow colSpan={4} />
                        ) : boards.length === 0 ? (
                            <EmptyRow colSpan={4} />
                        ) : boards.map((b, i) => (
                            <tr key={b.boardId} style={bodyRowStyle}>
                                <td style={{ ...tdStyle, ...rankStyle }}>{i + 1}</td>
                                <td style={{ ...tdStyle, fontWeight: 600 }}>{b.title}</td>
                                <td style={{ ...tdStyle, ...numStyle }}>{b.items.toLocaleString()}</td>
                                <td style={{ ...tdStyle, ...numStyle }}>{b.updates.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Section>

            <Section title="Top Creators" subtitle={`items created in the last ${WEEKS} weeks`} count={creators.length}>
                <PeopleTable people={creators} weekLabels={weekLabels} loading={loading} />
            </Section>

            <Section title="Top Communicators" subtitle={`updates posted in the last ${WEEKS} weeks`} count={communicators.length}>
                <PeopleTable people={communicators} weekLabels={weekLabels} loading={loading} />
            </Section>
        </div>
    );
};

const Section = ({ title, subtitle, count, children }: { title: string; subtitle: string; count: number; children: React.ReactNode }) => (
    <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' }}>
            <h3 className="narai-heading" style={{
                margin: 0,
                fontFamily: 'var(--font-family-display)',
                fontSize: '18px',
                fontWeight: 600,
                color: 'hsl(var(--color-text-primary))'
            }}>
                {title}
            </h3>
            <span style={{ fontSize: '12.5px', color: 'hsl(var(--color-text-tertiary))' }}>
                {subtitle}{count > 0 && ` · ${count} total`}
            </span>
        </div>
        <div className="card-surface" style={{
            overflowX: 'auto',
            overflowY: 'auto',
            maxHeight: `${LIST_MAX_HEIGHT}px`
        }}>
            {children}
        </div>
    </div>
);

const PeopleTable = ({ people, weekLabels, loading }: { people: PersonRow[]; weekLabels: string[]; loading: boolean }) => (
    <table style={tableStyle}>
        <thead>
            <tr style={headRowStyle}>
                <th style={{ ...thStyle, width: '48px' }}>#</th>
                <th style={thStyle}>Person</th>
                {weekLabels.map(label => (
                    <th key={label} style={{ ...thStyle, ...numHeadStyle }}>{label}</th>
                ))}
            </tr>
        </thead>
        <tbody>
            {loading ? (
                <LoadingRow colSpan={2 + weekLabels.length} />
            ) : people.length === 0 ? (
                <EmptyRow colSpan={2 + weekLabels.length} />
            ) : people.map((p, i) => (
                <tr key={p.userId} style={bodyRowStyle}>
                    <td style={{ ...tdStyle, ...rankStyle }}>{i + 1}</td>
                    <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                backgroundColor: p.avatarUrl ? 'transparent' : '#2A4A12',
                                color: '#FFEFD2',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 700,
                                overflow: 'hidden',
                                flexShrink: 0
                            }}>
                                {p.avatarUrl ? (
                                    <img
                                        src={p.avatarUrl}
                                        alt=""
                                        referrerPolicy="no-referrer"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    (p.name[0] || '?').toUpperCase()
                                )}
                            </div>
                            <span style={{ fontWeight: 600 }}>{p.name}</span>
                        </div>
                    </td>
                    {p.weeks.map((count, w) => (
                        <td key={w} style={{ ...tdStyle, ...numStyle, color: count === 0 ? 'hsl(var(--color-text-tertiary))' : 'hsl(var(--color-text-primary))' }}>
                            {count.toLocaleString()}
                        </td>
                    ))}
                </tr>
            ))}
        </tbody>
    </table>
);

const LoadingRow = ({ colSpan }: { colSpan: number }) => (
    <tr><td colSpan={colSpan} style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))', fontSize: '13px' }}>Loading…</td></tr>
);

const EmptyRow = ({ colSpan }: { colSpan: number }) => (
    <tr><td colSpan={colSpan} style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))', fontSize: '13px' }}>No activity in this period</td></tr>
);

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const headRowStyle: React.CSSProperties = { backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))', borderBottom: '1px solid var(--paper-edge, hsl(var(--color-border)))' };
const bodyRowStyle: React.CSSProperties = { borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))' };
const thStyle: React.CSSProperties = {
    padding: '11px 20px',
    textAlign: 'left',
    fontSize: '10.5px',
    fontWeight: 700,
    color: 'hsl(var(--color-text-tertiary))',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))',
    boxShadow: 'inset 0 -1px 0 var(--paper-edge, hsl(var(--color-border)))'
};
const numHeadStyle: React.CSSProperties = { textAlign: 'right' };
const tdStyle: React.CSSProperties = { padding: '12px 20px', fontSize: '13.5px', color: 'hsl(var(--color-text-primary))' };
const numStyle: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 };
const rankStyle: React.CSSProperties = { color: 'hsl(var(--color-text-tertiary))', fontSize: '12.5px', fontWeight: 600 };
