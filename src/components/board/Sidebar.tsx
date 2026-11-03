import { useState, useEffect } from 'react';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { WorkspaceList } from './sidebar/WorkspaceList';
import { CollapsedSidebar } from './sidebar/CollapsedSidebar';
import { SidebarProfile } from './sidebar/SidebarProfile';
import '../../styles/sidebar_tree.css';

// Width of the collapsed icon rail — fits a 40px button with 12px of
// breathing room on either side.
const RAIL_WIDTH = 64;

export const Sidebar = () => {
    const [searchQuery, setSearchQuery] = useState('');
    
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('sidebarWidth');
        return saved ? parseInt(saved, 10) : 260;
    });
    
    const [isCollapsed, setIsCollapsed] = useState(() => {
        return localStorage.getItem('sidebarCollapsed') === 'true';
    });

    const [isResizing, setIsResizing] = useState(false);
    const [isHoveringResizer, setIsHoveringResizer] = useState(false);

    useEffect(() => {
        localStorage.setItem('sidebarWidth', sidebarWidth.toString());
    }, [sidebarWidth]);

    useEffect(() => {
        localStorage.setItem('sidebarCollapsed', isCollapsed.toString());
    }, [isCollapsed]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            // Limit width between 200 and 600
            const newWidth = Math.max(200, Math.min(e.clientX, 600));
            setSidebarWidth(newWidth);
        };
        const handleMouseUp = () => {
            if (isResizing) {
                setIsResizing(false);
            }
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            // Prevent text selection while dragging
            document.body.style.userSelect = 'none';
        } else {
            document.body.style.userSelect = '';
        }
        
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    if (isCollapsed) {
        return (
            <aside
                className="sidebar"
                style={{
                    width: `${RAIL_WIDTH}px`,
                    minWidth: `${RAIL_WIDTH}px`,
                    padding: 0,
                    transition: 'width 0.2s, min-width 0.2s'
                }}
            >
                <CollapsedSidebar onExpand={() => setIsCollapsed(false)} />
            </aside>
        );
    }

    return (
        <aside 
            className="sidebar" 
            style={{ 
                width: `${sidebarWidth}px`, 
                minWidth: `${sidebarWidth}px`,
                transition: isResizing ? 'none' : 'width 0.2s, min-width 0.2s'
            }}
        >
            <div style={{ paddingRight: '8px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <SidebarHeader
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    onToggleCollapse={() => setIsCollapsed(true)}
                />

                <WorkspaceList
                    searchQuery={searchQuery}
                />

                <div className="sidebar-footer">
                    <SidebarProfile />
                </div>
            </div>

            {/* Resizer Handle */}
            <div 
                style={{
                    position: 'absolute',
                    top: 0,
                    right: -3,
                    width: '6px',
                    height: '100%',
                    cursor: 'col-resize',
                    backgroundColor: isResizing || isHoveringResizer ? 'rgba(145, 89, 255, 0.5)' : 'transparent',
                    transition: 'background-color 0.2s',
                    zIndex: 10
                }}
                onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizing(true);
                }}
                onMouseEnter={() => setIsHoveringResizer(true)}
                onMouseLeave={() => setIsHoveringResizer(false)}
            />
        </aside>
    );
};
