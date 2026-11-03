import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, UserPlus, X } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useAuth } from '../../contexts/AuthContext';

interface PersonPickerProps {
    currentValue: string[]; // Array of user_ids
    position: { top: number; bottom: number; left: number; width: number };
    onSelect: (userId: string) => void;
    onSelectNewEmail?: (email: string) => void;
    onClose: () => void;
    boardId: string;
    itemId: string;
    columnId: string;
}

export const PersonPicker = ({ currentValue = [], position, onSelect, onSelectNewEmail, onClose, boardId, itemId, columnId }: PersonPickerProps) => {
    const activeBoardMembers = useBoardStore(state => state.activeBoardMembers);
    const searchUsers = useBoardStore(state => state.searchUsers);
    const inviteAndAssignUser = useBoardStore(state => state.inviteAndAssignUser);
    const { } = useAuth();

    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Invite Flow State
    const [inviteCandidate, setInviteCandidate] = useState<any | null>(null);
    const [inviteRole, setInviteRole] = useState('viewer');

    const menuRef = useRef<HTMLDivElement>(null);

    // Filter MEMBERS
    const filteredMembers = activeBoardMembers.filter(m => {
        const profileData = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        const profile = profileData || {};
        const name = profile.full_name || '';
        const email = profile.email || '';
        const search = searchTerm.toLowerCase();
        return name.toLowerCase().includes(search) || email.toLowerCase().includes(search);
    });

    // SEARCH (Debounced)
    useEffect(() => {
        if (!searchTerm) {
            setSearchResults([]);
            return;
        }

        const timeoutId = setTimeout(async () => {
            setIsSearching(true);
            const users = await searchUsers(searchTerm);

            // Filter out users who are ALREADY members (so we don't duplicate them in the "Other Users" list)
            const memberIds = new Set(activeBoardMembers.map(m => m.user_id));
            const nonMembers = users.filter(u => !memberIds.has(u.id));

            setSearchResults(nonMembers);
            setIsSearching(false);
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [searchTerm, activeBoardMembers]);

    // Click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleSelectUser = async (targetUser: any, isMember: boolean) => {
        const userId = isMember ? targetUser.user_id : targetUser.id;

        if (isMember) {
            // Direct Assignment
            onSelect(userId);
        } else {
            // Trigger Invite Flow
            setInviteCandidate(targetUser);
        }
    };

    const confirmInvite = async () => {
        if (!inviteCandidate) return;

        await inviteAndAssignUser(boardId, inviteCandidate.id, inviteRole, itemId, columnId);

        // Close picker after invite
        setInviteCandidate(null);
        onClose();
    };


    // Position logic
    const canFitBelow = window.innerHeight - position.bottom > 450;
    const listTop = canFitBelow ? position.bottom + 4 : Math.max(10, position.top - 454);

    // --- RENDER INVITE CONFIRMATION ---
    if (inviteCandidate) {
        return createPortal(
            <div
                ref={menuRef}
                className="glass-pop"
                style={{
                    position: 'fixed',
                    top: listTop, // Keep same position as simple picker
                    left: position.left,
                    width: 320,
                    zIndex: 9999,
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '16px'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h3 style={{ fontFamily: 'var(--font-family-display)', fontSize: '16px', fontWeight: 600, margin: 0, color: 'hsl(var(--color-text-primary))' }}>Share Board?</h3>
                    <button onClick={() => setInviteCandidate(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))' }}>
                        <X size={16} />
                    </button>
                </div>

                <p style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', marginBottom: '16px', lineHeight: 1.4 }}>
                    <strong style={{ color: 'hsl(var(--color-text-primary))' }}>{inviteCandidate.full_name || inviteCandidate.email}</strong> is not a member of this board.
                    <br />
                    Share this board with them to assign this item?
                </p>

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'hsl(var(--color-text-tertiary))', display: 'block', marginBottom: '4px' }}>Role</label>
                    <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '8px',
                            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                            backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                            color: 'hsl(var(--color-text-primary))',
                            fontSize: '13px'
                        }}
                    >
                        <option value="viewer">Viewer (Read Only)</option>
                        <option value="member">Editor</option>
                    </select>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                        onClick={() => setInviteCandidate(null)}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '999px',
                            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                            background: 'hsl(var(--paper, var(--color-bg-surface)))',
                            color: 'hsl(var(--color-text-primary))',
                            cursor: 'pointer',
                            fontSize: '12.5px',
                            fontWeight: 500
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={confirmInvite}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '999px',
                            border: 'none',
                            background: 'hsl(var(--color-brand-primary))',
                            color: '#FFEFD2',
                            cursor: 'pointer',
                            fontSize: '12.5px',
                            fontWeight: 600
                        }}
                    >
                        Invite & Assign
                    </button>
                </div>
            </div>,
            document.body
        );
    }

    return createPortal(
        <div
            ref={menuRef}
            className="glass-pop"
            style={{
                position: 'fixed',
                top: listTop,
                left: position.left,
                width: Math.max(position.width, 280),
                zIndex: 9999,
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '450px',
                overflow: 'hidden'
            }}
        >
            {/* Search */}
            <div style={{ padding: '10px', borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))' }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 10px',
                    backgroundColor: 'hsl(var(--paper, var(--color-bg-base)))',
                    borderRadius: '999px',
                    border: '1px solid var(--paper-edge, hsl(var(--color-border)))'
                }}>
                    <Search size={14} style={{ color: 'hsl(var(--color-text-tertiary))', marginRight: '8px' }} />
                    <input
                        autoFocus
                        type="text"
                        placeholder="Search by name or email..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{
                            border: 'none',
                            outline: 'none',
                            backgroundColor: 'transparent',
                            width: '100%',
                            fontSize: '13px',
                            color: 'hsl(var(--color-text-primary))'
                        }}
                    />
                </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>

                {/* SECTION: Board Members */}
                <div style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 600, color: 'hsl(var(--color-text-tertiary))', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                    Board Members
                </div>
                {filteredMembers.map((member, idx) => {
                    const isSelected = currentValue.includes(member.user_id);
                    const profileData = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
                    const profile = profileData || {};
                    const initial = (profile.full_name || profile.email || '?')[0]?.toUpperCase();
                    const avatarBg = idx % 2 === 0 ? 'hsl(var(--color-brand-primary))' : '#A76400';

                    return (
                        <div
                            key={member.user_id}
                            onClick={() => handleSelectUser(member, true)}
                            style={{
                                padding: '6px 8px',
                                cursor: 'pointer',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                marginBottom: '2px',
                                backgroundColor: isSelected ? 'hsl(var(--color-text-primary) / 0.06)' : 'transparent',
                            }}
                            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'hsl(var(--color-text-primary) / 0.04)'; }}
                            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                            <div style={{
                                width: '24px', height: '24px', borderRadius: '50%',
                                backgroundColor: profile.avatar_url ? 'transparent' : avatarBg,
                                color: '#FFEFD2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '11px', fontWeight: 600, overflow: 'hidden', flexShrink: 0
                            }}>
                                {profile.avatar_url ? (
                                    <img 
                                        src={profile.avatar_url} 
                                        alt="" 
                                        referrerPolicy="no-referrer"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                    />
                                ) : initial}
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ fontSize: '13px', fontWeight: 500, color: 'hsl(var(--color-text-primary))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {profile.full_name || profile.email}
                                </div>
                            </div>
                            {isSelected && <Check size={14} style={{ color: 'hsl(var(--color-brand-primary))' }} />}
                        </div>
                    );
                })}

                {/* SECTION: Search Results (Non-Members) */}
                {searchTerm && searchResults.length > 0 && (
                    <>
                        <div style={{ padding: '8px 8px 4px', fontSize: '10px', fontWeight: 600, color: 'hsl(var(--color-text-tertiary))', textTransform: 'uppercase', letterSpacing: '0.12em', borderTop: '1px solid var(--paper-row-line, hsl(var(--color-border)))', marginTop: '4px' }}>
                            Other People
                        </div>
                        {searchResults.map(user => {
                            const initial = (user.full_name || user.email || '?')[0]?.toUpperCase();
                            return (
                                <div
                                    key={user.id}
                                    onClick={() => handleSelectUser(user, false)}
                                    style={{
                                        padding: '6px 8px',
                                        cursor: 'pointer',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        marginBottom: '2px',
                                        backgroundColor: 'transparent',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-text-primary) / 0.04)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <div style={{
                                        width: '24px', height: '24px', borderRadius: '50%',
                                        backgroundColor: user.avatar_url ? 'transparent' : 'hsl(var(--color-brand-primary))',
                                        color: '#FFEFD2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '11px', fontWeight: 600, overflow: 'hidden', flexShrink: 0
                                    }}>
                                        {user.avatar_url ? (
                                            <img 
                                                src={user.avatar_url} 
                                                alt="" 
                                                referrerPolicy="no-referrer"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                            />
                                        ) : initial}
                                    </div>
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'hsl(var(--color-text-primary))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {user.full_name || user.email}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'hsl(var(--color-text-tertiary))' }}>Invite to Board</div>
                                    </div>
                                    <UserPlus size={14} color="hsl(var(--color-text-tertiary))" />
                                </div>
                            );
                        })}
                    </>
                )}

                {/* No results or Invite New Email */}
                {filteredMembers.length === 0 && (!searchTerm || searchResults.length === 0) && (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))', fontSize: '13px' }}>
                        {isSearching ? 'Searching...' : 
                            (searchTerm && searchTerm.includes('@') && onSelectNewEmail) ? (
                                <div
                                    onClick={() => {
                                        onSelectNewEmail(searchTerm);
                                        onClose();
                                    }}
                                    style={{
                                        cursor: 'pointer',
                                        padding: '7px 14px',
                                        backgroundColor: 'hsl(var(--color-brand-primary))',
                                        color: '#FFEFD2',
                                        borderRadius: '999px',
                                        fontWeight: 600,
                                        display: 'inline-block'
                                    }}
                                >
                                    Invite {searchTerm} to Board
                                </div>
                            ) : 'No users found.'}
                    </div>
                )}
            </div>

            {/* OK Button */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--paper-row-line, hsl(var(--color-border)))', display: 'flex', justifyContent: 'center' }}>
                <button
                    onClick={onClose}
                    style={{
                        padding: '7px 28px',
                        backgroundColor: 'hsl(var(--color-brand-primary))',
                        color: '#FFEFD2',
                        border: 'none',
                        borderRadius: '999px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                    OK
                </button>
            </div>
        </div>,
        document.body
    );
};
