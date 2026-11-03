import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, ShieldCheck, UserCog, ChevronUp } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useBoardStore } from '../../../store/useBoardStore';
import { useUserStore } from '../../../store/useUserStore';
import { ProfileSettingsModal } from '../../layout/ProfileSettingsModal';

export const SidebarProfile = ({ collapsed = false }: { collapsed?: boolean }) => {
    const { user, signOut } = useAuth();
    const navigateTo = useBoardStore(state => state.navigateTo);
    const { currentUser } = useUserStore();

    const [showMenu, setShowMenu] = useState(false);
    const [showProfileSettings, setShowProfileSettings] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showMenu) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                btnRef.current && !btnRef.current.contains(target) &&
                menuRef.current && !menuRef.current.contains(target)
            ) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMenu]);

    const handleSignOut = async () => {
        await signOut();
        setShowMenu(false);
    };

    const userAvatar = currentUser.avatar?.startsWith('http') ? currentUser.avatar : user?.user_metadata?.avatar_url;
    const displayName = currentUser.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
    const userInitials = displayName
        .split(' ')
        .map((part: string) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'U';

    const rect = btnRef.current?.getBoundingClientRect();

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={`sidebar-profile-btn${collapsed ? ' is-collapsed' : ''}`}
                onClick={() => setShowMenu(v => !v)}
                title={collapsed ? `${displayName} (${user?.email || ''})` : undefined}
            >
                <div className="sidebar-profile-avatar">
                    {userAvatar ? (
                        <img
                            src={userAvatar}
                            alt={displayName}
                            referrerPolicy="no-referrer"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        userInitials
                    )}
                </div>

                {!collapsed && (
                    <>
                        <div className="sidebar-profile-info">
                            <span className="sidebar-profile-name">{displayName}</span>
                            {user?.email && <span className="sidebar-profile-email">{user.email}</span>}
                        </div>
                        <ChevronUp
                            size={15}
                            className="sidebar-profile-chevron"
                            style={{ transform: showMenu ? 'rotate(180deg)' : 'none' }}
                        />
                    </>
                )}
            </button>

            {showMenu && rect && createPortal(
                <div
                    ref={menuRef}
                    className="glass-pop"
                    style={{
                        position: 'fixed',
                        bottom: `${window.innerHeight - rect.top + 8}px`,
                        left: `${rect.left}px`,
                        minWidth: '240px',
                        zIndex: 9999,
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        borderRadius: '12px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                        border: '1px solid hsl(var(--color-border))',
                        overflow: 'hidden'
                    }}
                >
                    <div style={{
                        padding: '14px 16px',
                        borderBottom: '1px solid hsl(var(--color-border))'
                    }}>
                        <div style={{
                            fontWeight: 600,
                            fontSize: '14px',
                            marginBottom: '2px',
                            color: 'hsl(var(--color-text-primary))'
                        }}>
                            {displayName}
                        </div>
                        <div style={{
                            fontSize: '12.5px',
                            color: 'hsl(var(--color-text-tertiary))'
                        }}>
                            {user?.email}
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            setShowMenu(false);
                            setShowProfileSettings(true);
                        }}
                        style={{
                            width: '100%',
                            padding: '11px 16px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            fontSize: '13.5px',
                            color: 'hsl(var(--color-text-primary))',
                            transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <UserCog size={16} style={{ color: 'var(--color-icon-accent, #6366f1)' }} />
                        <span style={{ fontWeight: 500 }}>Profile Settings</span>
                    </button>

                    {(currentUser?.system_role === 'super_admin' || currentUser?.system_role === 'it_admin') && (
                        <button
                            onClick={() => {
                                setShowMenu(false);
                                navigateTo('admin');
                            }}
                            style={{
                                width: '100%',
                                padding: '11px 16px',
                                border: 'none',
                                backgroundColor: 'transparent',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                fontSize: '13.5px',
                                color: 'hsl(var(--color-text-primary))',
                                transition: 'background-color 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <ShieldCheck size={16} style={{ color: 'var(--color-icon-accent, #6366f1)' }} />
                            <span style={{ fontWeight: 500 }}>Admin Console</span>
                        </button>
                    )}

                    <div style={{ height: '1px', backgroundColor: 'hsl(var(--color-border))', margin: '4px 0' }} />

                    <button
                        onClick={handleSignOut}
                        style={{
                            width: '100%',
                            padding: '11px 16px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            fontSize: '13.5px',
                            color: 'hsl(var(--color-text-primary))',
                            transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <LogOut size={16} />
                        <span>Log out</span>
                    </button>
                </div>,
                document.body
            )}

            {showProfileSettings && (
                <ProfileSettingsModal onClose={() => setShowProfileSettings(false)} />
            )}
        </>
    );
};

