import { Menu, Home, Star } from 'lucide-react';
import { useBoardStore } from '../../../store/useBoardStore';
import { useAccessibleWorkspaces } from '../../../hooks/useAccessibleWorkspaces';
import { WorkspaceIcon } from './SidebarIcons';
import { SidebarProfile } from './SidebarProfile';

/**
 * The collapsed state of the sidebar: an icon-only rail (Mews' left nav,
 * collapsed) rather than the sliver-with-a-floating-chevron this used to be.
 * Home and Favorites navigate immediately, same as their expanded buttons —
 * a rail exists so you can keep working without expanding back out.
 *
 * A workspace icon is different: there's no room here to show its boards, so
 * clicking one expands the sidebar and opens that workspace's dashboard —
 * the one rail action that can't just happen in place.
 */
export const CollapsedSidebar = ({ onExpand }: { onExpand: () => void }) => {
    const navigateTo = useBoardStore(state => state.navigateTo);
    const activePage = useBoardStore(state => state.activePage);
    const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
    const setActiveWorkspace = useBoardStore(state => state.setActiveWorkspace);

    const accessibleWorkspaces = useAccessibleWorkspaces();
    // Sub-workspaces stay inside their parent's expanded tree — showing them
    // here too would make the rail as long as the full sidebar it's meant to
    // save space over.
    const topLevelWorkspaces = accessibleWorkspaces.filter(w => !w.parentId);

    const openWorkspace = (workspaceId: string) => {
        onExpand();
        setActiveWorkspace(workspaceId);
        navigateTo('dashboard');
    };

    return (
        <aside className="rail" aria-label="Sidebar, collapsed">
            <button className="rail-icon-btn" onClick={onExpand}>
                <Menu size={20} />
                <span className="rail-tooltip">Expand sidebar</span>
            </button>

            <div className="rail-divider" />

            <button
                className={`rail-icon-btn${activePage === 'home' ? ' active' : ''}`}
                onClick={() => navigateTo('home')}
            >
                <Home size={20} />
                <span className="rail-tooltip">Home</span>
            </button>

            <button
                className={`rail-icon-btn${activePage === 'favorites' ? ' active' : ''}`}
                onClick={() => navigateTo('favorites')}
            >
                <Star size={20} color="#E5A93C" fill={activePage === 'favorites' ? '#E5A93C' : 'none'} />
                <span className="rail-tooltip">Favorites</span>
            </button>

            {topLevelWorkspaces.length > 0 && <div className="rail-divider" />}

            {topLevelWorkspaces.map(ws => (
                <button
                    key={ws.id}
                    className="rail-icon-btn"
                    onClick={() => openWorkspace(ws.id)}
                >
                    <WorkspaceIcon title={ws.title} isActive={activeWorkspaceId === ws.id} size={26} />
                    <span className="rail-tooltip">{ws.title}</span>
                </button>
            ))}

            <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                <SidebarProfile collapsed />
            </div>
        </aside>
    );
};
