import { GlobalTopActions } from './GlobalTopActions';
import { useBoardStore } from '../../store/useBoardStore';

export const TopBar = () => {
    const activePage = useBoardStore(state => state.activePage);
    const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
    const workspaces = useBoardStore(state => state.workspaces);
    
    // Find active workspace or fallback to the first one available
    const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

    const getTopBarEyebrow = () => {
        if (activePage === 'home') return 'NHG TASKS · HOME';
        if (activePage === 'favorites') return 'NHG TASKS · FAVORITES';
        if (activePage === 'notifications') return 'NHG TASKS · NOTIFICATIONS';
        if (activePage === 'dashboard') return `${(activeWorkspace?.title || 'WORKSPACE').toUpperCase()} · DASHBOARD`;
        return 'NHG TASKS';
    };

    return (
        <div
            className="app-topbar"
            style={{
                height: '52px',
                width: '100%',
                backgroundColor: 'transparent',
                borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                gap: '12px',
                flexShrink: 0,
                zIndex: 50
            }}
        >
            {/* Left side: Context Eyebrow / Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="bh-eyebrow" style={{ margin: 0 }}>
                    {getTopBarEyebrow()}
                </span>
            </div>

            {/* Right side: Global Actions */}
            <GlobalTopActions />
        </div>
    );
};
