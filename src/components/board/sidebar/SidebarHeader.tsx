import { useState, useRef, useEffect } from 'react';
import { Plus, Search, MoreHorizontal, Archive, Home, Star, Menu } from 'lucide-react';
import { useBoardStore } from '../../../store/useBoardStore';
import { ArchiveTrashModal } from '../../workspace/ArchiveTrashModal';

interface SidebarHeaderProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    onToggleCollapse: () => void;
}

export const SidebarHeader = ({ searchQuery, setSearchQuery, onToggleCollapse }: SidebarHeaderProps) => {
    const addWorkspace = useBoardStore(state => state.addWorkspace);
    const navigateTo = useBoardStore(state => state.navigateTo);
    const activePage = useBoardStore(state => state.activePage);

    const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newWorkspaceTitle, setNewWorkspaceTitle] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        if (isMenuOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen]);

    const handleCreateWorkspace = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newWorkspaceTitle.trim() && !isSubmitting) {
            setIsSubmitting(true);
            try {
                await addWorkspace(newWorkspaceTitle);
                setNewWorkspaceTitle('');
                setIsCreatingWorkspace(false);
            } catch (error: any) {
                console.error('[SidebarHeader] Workspace creation error:', error);
                alert(`Failed to create workspace: ${error.message || 'Unknown error'}. Please check your internet connection or database permissions.`);
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    return (
        <div className="sidebar-header" style={{ padding: '12px 16px 0 16px', marginBottom: '0px', width: '100%', flexDirection: 'column', alignItems: 'flex-start' }}>
            {/* Hamburger and logo share one row — the hamburger is a persistent
                toggle (matching Mews: one clearly-discoverable control instead
                of the old collapse button that only appeared on hovering the
                resize handle), placed right beside the logo rather than on its
                own line above it. */}
            <div
                style={{
                    marginBottom: '4px',
                    marginTop: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    userSelect: 'none'
                }}
            >
                <button
                    className="rail-icon-btn"
                    onClick={onToggleCollapse}
                    title="Collapse sidebar"
                    style={{ marginLeft: '-8px', flexShrink: 0 }}
                >
                    <Menu size={20} />
                </button>

                <div
                    onClick={() => navigateTo('home')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        overflow: 'hidden'
                    }}
                >
                    <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '28%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        boxShadow: '0 2px 5px rgba(21,42,0,0.12)',
                        // A fixed Galangal tile: the sidebar is dark glass in every theme
                        backgroundColor: '#FFEFD2',
                        flexShrink: 0,
                        padding: '3px'
                    }}>
                        <img
                            src="/narai-logo-icon-dark.png"
                            alt="Narai"
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: 'hsl(var(--color-text-primary))', letterSpacing: '0.03em' }}>NHG</span>
                        <span className="narai-heading" style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-family-display)', color: 'hsl(var(--color-text-secondary))', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Tasks</span>
                    </div>
                </div>
            </div>

            {/* Main Navigation */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2px', padding: '0', marginBottom: '12px', marginTop: '6px' }}>
                <button
                    onClick={() => navigateTo('home')}
                    className={`tree-sidebar-item ${activePage === 'home' ? 'active' : ''}`}
                    style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '10px',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left'
                    }}
                >
                    <Home size={16} />
                    <span style={{ fontSize: '13px', fontWeight: activePage === 'home' ? 600 : 400 }}>Home</span>
                </button>

                <button
                    onClick={() => navigateTo('favorites')}
                    className={`tree-sidebar-item ${activePage === 'favorites' ? 'active' : ''}`}
                    style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '10px',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left'
                    }}
                >
                    <Star size={16} color="#E5A93C" fill={activePage === 'favorites' ? "#E5A93C" : "none"} />
                    <span style={{ fontSize: '13px', fontWeight: activePage === 'favorites' ? 600 : 400 }}>Favorites</span>
                </button>
            </div>


            {/* Workspaces Eyebrow & Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', width: '100%', marginBottom: '8px' }}>
                <span style={{
                    fontSize: '10.5px',
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'hsl(var(--color-text-tertiary))'
                }}>Workspaces</span>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {/* More Menu (...) */}
                    <div style={{ position: 'relative' }} ref={menuRef}>
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            style={{
                                background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px',
                                borderRadius: '6px', color: 'hsl(var(--color-text-tertiary))', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background-color 0.15s, color 0.15s'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))';
                                e.currentTarget.style.color = 'hsl(var(--color-text-primary))';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = 'hsl(var(--color-text-tertiary))';
                            }}
                        >
                            <MoreHorizontal size={15} />
                        </button>
                        
                        {isMenuOpen && (
                            <div className="glass-pop" style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: '6px', backgroundColor: 'hsl(var(--color-bg-surface))',
                                borderRadius: '14px', boxShadow: 'var(--shadow-lg)', border: '1px solid hsl(var(--color-border))', width: '200px', zIndex: 100, overflow: 'hidden', padding: '6px'
                            }}>
                                <button
                                    onClick={() => { setIsMenuOpen(false); setIsCreatingWorkspace(true); }}
                                    className="menu-item"
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', border: 'none', background: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', color: 'hsl(var(--color-text-primary))' }}
                                >
                                    <Plus size={15} />
                                    <span style={{ fontSize: '13.5px' }}>Create Workspace</span>
                                </button>
                                <button
                                    onClick={() => { setIsMenuOpen(false); setIsArchiveModalOpen(true); }}
                                    className="menu-item"
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', border: 'none', background: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', color: 'hsl(var(--color-text-primary))' }}
                                >
                                    <Archive size={15} />
                                    <span style={{ fontSize: '13.5px' }}>Archive/Trash</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Search Input Pill */}
            <div className="sidebar-search-box" style={{
                width: '100%',
                padding: '0 10px',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '34px',
                backgroundColor: 'hsl(var(--color-bg-hover))',
                borderRadius: '999px',
                border: '1px solid hsl(var(--color-border))'
            }}>
                <Search size={14} style={{ color: 'hsl(var(--color-text-tertiary))', flexShrink: 0 }} />
                <input
                    type="text"
                    className="sidebar-search-input"
                    placeholder="Search workspaces..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '0 2px',
                        border: 'none',
                        background: 'transparent',
                        fontSize: '12.5px',
                        outline: 'none',
                        color: 'hsl(var(--color-text-primary))'
                    }}
                />
            </div>

            {/* Modals */}
            {isArchiveModalOpen && (
                <ArchiveTrashModal onClose={() => setIsArchiveModalOpen(false)} />
            )}

            {isCreatingWorkspace && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '32px', width: '400px', boxShadow: 'var(--shadow-xl)' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px' }}>Create new workspace</h2>
                        <form onSubmit={handleCreateWorkspace}>
                            <input
                                autoFocus
                                type="text"
                                placeholder="Workspace title"
                                value={newWorkspaceTitle}
                                onChange={(e) => setNewWorkspaceTitle(e.target.value)}
                                style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '15px', marginBottom: '24px', outline: 'none' }}
                            />
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsCreatingWorkspace(false)}
                                    style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!newWorkspaceTitle.trim() || isSubmitting}
                                    style={{
                                        padding: '10px 20px', borderRadius: '6px', border: 'none',
                                        backgroundColor: !newWorkspaceTitle.trim() || isSubmitting ? '#ddd' : 'hsl(var(--color-brand-primary))',
                                        color: 'white', cursor: !newWorkspaceTitle.trim() || isSubmitting ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 500
                                    }}
                                >
                                    {isSubmitting ? 'Creating...' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
