// In-memory "database" for the local-only demo build of this app.
// Nothing here ever leaves the browser: it is seeded once, then persisted to
// localStorage so edits survive a reload, matching what a real backend would
// feel like without actually having one.

export type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

const STORAGE_KEY = 'saturday_mock_db_v1';
const SEED_VERSION = 11;

const uid = () => crypto.randomUUID();

function avatarDataUri(initials: string, bg: string): string {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><circle cx='40' cy='40' r='40' fill='${bg}'/><text x='50%' y='54%' font-family='Arial, sans-serif' font-size='28' fill='#fff' text-anchor='middle' dominant-baseline='middle'>${initials}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function daysFromNow(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
}

function buildSeed(): Tables {
    const now = new Date().toISOString();

    // Fixed ids, so a saved demo login still matches its profile after a reseed.
    const SA = '00000000-0000-4000-8000-000000000001';
    const IT = '00000000-0000-4000-8000-000000000002';
    const U1 = '00000000-0000-4000-8000-000000000003';

    const profiles: Row[] = [
        {
            id: SA, email: 'alex.morgan@nhgtasks.local', full_name: 'Alex Morgan',
            avatar_url: avatarDataUri('AM', '#2a4a12'), system_role: 'super_admin',
            is_approved: true, is_active: true, auth_type: 'internal', ui_theme: null,
            created_at: now
        },
        {
            id: IT, email: 'jordan.lee@nhgtasks.local', full_name: 'Jordan Lee',
            avatar_url: avatarDataUri('JL', '#A76400'), system_role: 'it_admin',
            is_approved: true, is_active: true, auth_type: 'internal', ui_theme: null,
            created_at: now
        },
        {
            id: U1, email: 'sam.taylor@nhgtasks.local', full_name: 'Sam Taylor',
            avatar_url: avatarDataUri('ST', '#6B3B52'), system_role: 'user',
            is_approved: true, is_active: true, auth_type: 'internal', ui_theme: null,
            created_at: now
        }
    ];

    const workspaces: Row[] = [
        { id: uid(), title: 'Marketing Team', order: 0, owner_id: SA, parent_id: null },
        { id: uid(), title: 'Product Launch', order: 1, owner_id: SA, parent_id: null }
    ];
    const [ws1, ws2] = workspaces;

    const statusOptions = [
        { id: uid(), label: 'Default', color: '#6E6655' },
        { id: uid(), label: 'Done', color: '#152A00' },
        { id: uid(), label: 'Stuck', color: '#250719' },
        { id: uid(), label: 'Working on it', color: '#A76400' }
    ];

    const boards: Row[] = [];
    const columns: Row[] = [];
    const groups: Row[] = [];
    const items: Row[] = [];
    const boardMembers: Row[] = [];

    const makeBoard = (workspaceId: string, title: string, order: number, description: string) => {
        const boardId = uid();
        boards.push({
            id: boardId, workspace_id: workspaceId, title, description, order,
            is_archived: false, is_private: false, is_favorite: order === 0
        });

        const statusCol = { id: uid(), title: 'Status', type: 'status', order: 0, width: 140, options: statusOptions };
        const ownerCol = { id: uid(), title: 'Owner', type: 'people', order: 1, width: 140 };
        const dueCol = { id: uid(), title: 'Due Date', type: 'due_date', order: 2, width: 140 };
        const priorityCol = { id: uid(), title: 'Priority', type: 'priority', order: 3, width: 120 };
        const notesCol = { id: uid(), title: 'Notes', type: 'text', order: 4, width: 220 };
        [statusCol, ownerCol, dueCol, priorityCol, notesCol].forEach(c => {
            columns.push({ ...c, board_id: boardId, aggregation: 'none', scope: 'item' });
        });

        boardMembers.push({ id: uid(), board_id: boardId, user_id: SA, role: 'owner', last_viewed_at: now, settings: null });
        boardMembers.push({ id: uid(), board_id: boardId, user_id: IT, role: 'member', last_viewed_at: null, settings: null });

        const groupDefs = [
            { title: 'To Do', color: '#2E7D8C' },
            { title: 'In Progress', color: '#C98A1F' },
            { title: 'Done', color: '#3F7D32' }
        ];
        const taskNames = [
            'Draft campaign brief', 'Design social banners', 'Review budget allocation',
            'Schedule kickoff meeting', 'Collect stakeholder feedback', 'Finalize copywriting',
            'Set up tracking dashboard', 'Coordinate with agency', 'QA landing page', 'Publish launch email'
        ];
        let taskIdx = 0;
        groupDefs.forEach((g, gIdx) => {
            const groupId = uid();
            groups.push({ id: groupId, board_id: boardId, title: g.title, color: g.color, order: gIdx, is_archived: false });

            const count = 3;
            for (let i = 0; i < count; i++) {
                const itemId = uid();
                const name = taskNames[taskIdx % taskNames.length];
                taskIdx++;
                const statusChoice = gIdx === 2 ? statusOptions[1] : statusOptions[i % statusOptions.length];
                // Priority is a 1–5 star rating (PriorityCell), stored as a plain number.
                const priorityRating = [4, 2, 0][(i + gIdx) % 3] || null;
                const owner = [SA, IT, U1][i % 3];
                items.push({
                    id: itemId, board_id: boardId, group_id: groupId, title: name,
                    values: {
                        [statusCol.id]: statusChoice.id,
                        [ownerCol.id]: [owner],
                        [dueCol.id]: daysFromNow((i + 1) * 3 - gIdx * 2),
                        [priorityCol.id]: priorityRating,
                        [notesCol.id]: ''
                    },
                    updates: [], updates_count: 0, last_update_at: null, files: [],
                    order: i, is_hidden: false, notify_muted_user_ids: [],
                    created_at: now, parent_id: null, is_archived: false
                });
            }
        });

        return boardId;
    };

    makeBoard(ws1.id, 'Campaign Calendar', 0, 'Plan and track marketing campaigns across channels.');
    makeBoard(ws1.id, 'Content Pipeline', 1, 'Blog posts, videos and social content in flight.');
    makeBoard(ws2.id, 'Launch Roadmap', 0, 'Milestones for the upcoming product launch.');
    makeBoard(ws2.id, 'Bug Tracker', 1, 'Known issues and fixes before release.');

    const workspaceMembers: Row[] = [
        { id: uid(), workspace_id: ws1.id, user_id: SA, role: 'owner' },
        { id: uid(), workspace_id: ws1.id, user_id: IT, role: 'member' },
        { id: uid(), workspace_id: ws2.id, user_id: SA, role: 'owner' },
        { id: uid(), workspace_id: ws2.id, user_id: U1, role: 'member' }
    ];

    const notifications: Row[] = [
        {
            id: uid(), type: 'mention', title: 'Jordan Lee mentioned you', message: 'Can you review the campaign brief?',
            data: {}, is_read: false, created_at: now, actor_id: IT, user_id: SA
        },
        {
            id: uid(), type: 'access_granted', title: 'You were added to Product Launch', message: null,
            data: { workspace_id: ws2.id }, is_read: true, created_at: now, actor_id: SA, user_id: SA
        }
    ];

    const activityLogs: Row[] = [
        { id: uid(), created_at: now, actor_id: SA, action_type: 'workspace_created', target_type: 'workspace', target_id: ws1.id, metadata: { workspace_title: ws1.title } },
        { id: uid(), created_at: now, actor_id: SA, action_type: 'board_created', target_type: 'board', target_id: boards[0].id, metadata: { board_title: boards[0].title } }
    ];

    return {
        profiles,
        workspaces,
        boards,
        columns,
        groups,
        items,
        board_members: boardMembers,
        workspace_members: workspaceMembers,
        user_favorites: [],
        notifications,
        activity_logs: activityLogs,
        pending_invites: [],
        group_links: [],
        item_dependencies: [],
        system_settings: []
    };
}

function load(): Tables {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.__seedVersion === SEED_VERSION && parsed.tables) return parsed.tables;
        }
    } catch {
        /* fall through to a fresh seed */
    }
    const seed = buildSeed();
    persist(seed);
    return seed;
}

function persist(t: Tables) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ __seedVersion: SEED_VERSION, tables: t }));
    } catch {
        /* storage full/unavailable — state just won't survive a reload */
    }
}

let tables: Tables = load();

export const mockDb = {
    get(table: string): Row[] {
        if (!tables[table]) tables[table] = [];
        return tables[table];
    },
    set(table: string, rows: Row[]) {
        tables[table] = rows;
        persist(tables);
    },
    reset() {
        tables = buildSeed();
        persist(tables);
    }
};

if (typeof window !== 'undefined') {
    (window as any).__resetMockDb = () => {
        mockDb.reset();
        window.location.reload();
    };
}
