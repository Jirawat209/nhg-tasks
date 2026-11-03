import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../store/useUserStore';
import { useBoardStore } from '../../store/useBoardStore';
import { Search, RefreshCw, MoreHorizontal, Trash2, Edit3, ArrowUp, ArrowDown, ArrowUpDown, Filter, ShieldCheck, UserPlus, Lock, FileSpreadsheet, Globe, Users, ArrowRightLeft, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { CreateUserModal } from './CreateUserModal';
import { pageButtons, pageContaining, pageOf } from '../../lib/pagination';

interface Profile {
    id: string;
    email: string;
    full_name: string;
    system_role: 'user' | 'it_admin' | 'super_admin';
    is_approved: boolean;
    created_at: string;
    last_login_at: string | null;
    auth_type?: AuthType;
    avatar_url?: string | null;
    is_active?: boolean;
}

const initialsFrom = (name?: string, email?: string) =>
    (name || email || '?').trim().charAt(0).toUpperCase();

// A single Status column instead of two overlapping signals: is_approved gates a
// brand new account, is_active is the reversible offboarding switch — but a person
// only cares about one thing, "can this account use the app right now." Pending
// beats Inactive (an account can't be both at once in practice, but if it somehow
// were, still-unapproved is the more actionable state to show).
type UserStatus = 'pending' | 'active' | 'inactive';
const getUserStatus = (p: Profile): UserStatus =>
    !p.is_approved ? 'pending' : p.is_active === false ? 'inactive' : 'active';
const STATUS_LABELS: Record<UserStatus, string> = { pending: 'Pending', active: 'Active', inactive: 'Inactive' };

/** How an account signs in (profiles.auth_type). */
type AuthType = 'google' | 'internal' | 'microsoft';
const AUTH_LABELS: Record<AuthType, string> = { google: 'Google', microsoft: 'Microsoft', internal: 'Internal' };

/** The four-square Microsoft mark, in the brand's own colours. */
const MicrosoftMark = ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden="true" style={{ flexShrink: 0 }}>
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
);
const STATUS_COLORS: Record<UserStatus, string> = { pending: '#A76400', active: '#2A4A12', inactive: '#C83E2B' };

const HEADER_ROW_HEIGHT = 44;

const thStyle: React.CSSProperties = {
    cursor: 'pointer',
    padding: '0 20px',
    height: `${HEADER_ROW_HEIGHT}px`,
    boxSizing: 'border-box',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 700,
    color: 'hsl(var(--ink-soft))',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    backgroundColor: 'hsl(var(--paper-head))',
    zIndex: 2,
    borderBottom: '1px solid hsl(var(--paper-edge))'
};

const thFilterStyle: React.CSSProperties = {
    padding: '8px 20px',
    boxSizing: 'border-box',
    position: 'sticky',
    top: `${HEADER_ROW_HEIGHT}px`,
    backgroundColor: 'hsl(var(--paper-muted))',
    zIndex: 2,
    borderBottom: '1px solid hsl(var(--paper-edge))'
};

const ROLE_HIERARCHY = {
    'user': 1,
    'it_admin': 2,
    'super_admin': 3
};

const ROLE_LABELS = {
    'user': 'User',
    'it_admin': 'IT Admin',
    'super_admin': 'Super Admin'
};

// How many users a page can show; the choice is remembered in this browser
const PAGE_SIZES = [25, 50, 100, 200];
const PAGE_SIZE_KEY = 'adminUsersPageSize';

export const UserTable = () => {
    const { currentUser } = useUserStore();
    const adminGetOwnedContentCount = useBoardStore(state => state.adminGetOwnedContentCount);
    const adminTransferAllOwnership = useBoardStore(state => state.adminTransferAllOwnership);
    const searchUsers = useBoardStore(state => state.searchUsers);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    const [showCreateUserModal, setShowCreateUserModal] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ 
        key: keyof Profile | 'status' | null; 
        direction: 'asc' | 'desc' | null 
    }>({ key: 'created_at', direction: 'desc' });
    const [columnFilters, setColumnFilters] = useState({
        full_name: '',
        email: '',
        system_role: '',
        status: ''
    });

    // Popover State
    const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
    const [popoverOpenUpward, setPopoverOpenUpward] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Delete Confirmation State
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [checkingOwnershipFor, setCheckingOwnershipFor] = useState<string | null>(null);

    // Transfer Ownership State — the required first step when the account being
    // deleted still owns workspaces or boards.
    const [transferModal, setTransferModal] = useState<{
        userId: string;
        userName: string;
        workspaces: number;
        boards: number;
    } | null>(null);
    const [transferQuery, setTransferQuery] = useState('');
    const [transferResults, setTransferResults] = useState<any[]>([]);
    const [transferTarget, setTransferTarget] = useState<{ id: string; name: string; email: string } | null>(null);
    const [isTransferring, setIsTransferring] = useState(false);
    const transferSearchTimeout = useRef<any>(null);

    // Edit Profile State
    const [editProfileModal, setEditProfileModal] = useState<{
        userId: string;
        fullName: string;
        email: string;
        role: string;
        authType: AuthType;
        isActive: boolean;
    } | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const fetchProfiles = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setProfiles(data || []);
        } catch (err: any) {
            alert('Failed to fetch users: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProfiles();
    }, []);

    // Close popover when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setOpenPopoverId(null);
            }
        };

        if (openPopoverId) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [openPopoverId]);

    const handleProfileUpdate = async () => {
        if (!editProfileModal) return;
        
        setIsSaving(true);
        try {
            const targetUser = profiles.find(p => p.id === editProfileModal.userId);
            const oldRole = targetUser?.system_role;
            const oldActive = targetUser?.is_active !== false;

            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: editProfileModal.fullName,
                    email: editProfileModal.email,
                    system_role: editProfileModal.role,
                    auth_type: editProfileModal.authType,
                    is_active: editProfileModal.isActive
                })
                .eq('id', editProfileModal.userId);

            if (error) throw error;

            // Deactivating someone revokes their access, so it belongs in the audit
            // trail next to role changes rather than passing silently.
            if (oldActive !== editProfileModal.isActive) {
                await supabase.rpc('log_activity', {
                    p_action_type: editProfileModal.isActive ? 'user_reactivated' : 'user_deactivated',
                    p_target_type: 'user',
                    p_target_id: editProfileModal.userId,
                    p_metadata: { target_email: editProfileModal.email }
                });
            }

            // Log the activity if role changed
            if (oldRole !== editProfileModal.role) {
                await supabase.rpc('log_activity', {
                    p_action_type: 'role_updated',
                    p_target_type: 'user',
                    p_target_id: editProfileModal.userId,
                    p_metadata: {
                        old_role: oldRole,
                        new_role: editProfileModal.role,
                        target_email: editProfileModal.email
                    }
                });
            }

            setProfiles(prev => prev.map(p =>
                p.id === editProfileModal.userId ? {
                    ...p,
                    full_name: editProfileModal.fullName,
                    email: editProfileModal.email,
                    system_role: editProfileModal.role as any,
                    auth_type: editProfileModal.authType,
                    is_active: editProfileModal.isActive
                } : p
            ));
            setEditProfileModal(null);
            setOpenPopoverId(null);
        } catch (err: any) {
            alert('Failed to update profile: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleApproveUser = async (userId: string) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ is_approved: true })
                .eq('id', userId);

            if (error) throw error;

            setProfiles(prev => prev.map(p => 
                p.id === userId ? { ...p, is_approved: true } : p
            ));
            setOpenPopoverId(null);
            
            // Log activity
            const user = profiles.find(p => p.id === userId);
            await supabase.rpc('log_activity', {
                p_action_type: 'user_approved',
                p_target_type: 'user',
                p_target_id: userId,
                p_metadata: { email: user?.email }
            });

        } catch (err: any) {
            alert('Failed to approve user: ' + err.message);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        try {
            const { error } = await supabase.rpc('delete_user', { user_id: userId });

            if (error) throw error;

            setProfiles(prev => prev.filter(p => p.id !== userId));
            setDeleteConfirmId(null);
            setOpenPopoverId(null);
            alert('User deleted successfully');
        } catch (err: any) {
            // The DB now refuses to delete an account that still owns a workspace or
            // board — surfaces here if content changed hands between the check below
            // and the click (e.g. two admins working at once).
            alert('Failed to delete user: ' + err.message);
        }
    };

    // Delete now goes through an ownership check first: content must never disappear
    // as a side effect of removing a person, so anything they own has to move to
    // someone else before the account itself can go.
    const handleDeleteClick = async (profile: Profile) => {
        setOpenPopoverId(null);
        setCheckingOwnershipFor(profile.id);
        try {
            const { workspaces, boards } = await adminGetOwnedContentCount(profile.id);
            if (workspaces > 0 || boards > 0) {
                setTransferModal({
                    userId: profile.id,
                    userName: profile.full_name || profile.email || 'this user',
                    workspaces,
                    boards
                });
            } else {
                setDeleteConfirmId(profile.id);
            }
        } catch (err: any) {
            alert('Failed to check what this user owns: ' + err.message);
        } finally {
            setCheckingOwnershipFor(null);
        }
    };

    const handleTransferSearch = (value: string) => {
        setTransferQuery(value);
        setTransferTarget(null);
        if (transferSearchTimeout.current) clearTimeout(transferSearchTimeout.current);
        transferSearchTimeout.current = setTimeout(async () => {
            const results = await searchUsers(value);
            setTransferResults(results.filter((u: any) => u.id !== transferModal?.userId));
        }, 250);
    };

    const handleConfirmTransfer = async () => {
        if (!transferModal || !transferTarget) return;
        setIsTransferring(true);
        try {
            await adminTransferAllOwnership(transferModal.userId, transferTarget.id);
            const deletingUserId = transferModal.userId;
            setTransferModal(null);
            setTransferQuery('');
            setTransferResults([]);
            setTransferTarget(null);
            setDeleteConfirmId(deletingUserId);
        } catch (err: any) {
            alert('Failed to transfer ownership: ' + err.message);
        } finally {
            setIsTransferring(false);
        }
    };

    const canModifyUser = (targetRole: string) => {
        const currentRoleLevel = ROLE_HIERARCHY[currentUser.system_role as keyof typeof ROLE_HIERARCHY] || 0;
        const targetRoleLevel = ROLE_HIERARCHY[targetRole as keyof typeof ROLE_HIERARCHY] || 0;
        return currentRoleLevel > targetRoleLevel;
    };

    const requestSort = (key: keyof Profile | 'status') => {
        let direction: 'asc' | 'desc' | null = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = null;
        }
        setSortConfig({ key: direction ? key : null, direction });
    };

    const getSortIcon = (key: keyof Profile | 'status') => {
        if (sortConfig.key !== key) return <ArrowUpDown size={14} style={{ opacity: 0.3 }} />;
        if (sortConfig.direction === 'asc') return <ArrowUp size={14} />;
        if (sortConfig.direction === 'desc') return <ArrowDown size={14} />;
        return <ArrowUpDown size={14} style={{ opacity: 0.3 }} />;
    };

    const filteredAndSortedProfiles = [...profiles]
        .filter(p => {
            // Global search
            const globalSearchMatch = searchQuery === '' ||
                p.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.full_name?.toLowerCase().includes(searchQuery.toLowerCase());

            // Column filters
            const nameMatch = columnFilters.full_name === '' || 
                p.full_name?.toLowerCase().includes(columnFilters.full_name.toLowerCase());
            const emailMatch = columnFilters.email === '' || 
                p.email?.toLowerCase().includes(columnFilters.email.toLowerCase());
            const roleMatch = columnFilters.system_role === '' || 
                p.system_role === columnFilters.system_role;
            const statusMatch = columnFilters.status === '' ||
                getUserStatus(p) === columnFilters.status;

            return globalSearchMatch && nameMatch && emailMatch && roleMatch && statusMatch;
        })
        .sort((a, b) => {
            if (!sortConfig.key || !sortConfig.direction) return 0;

            let valA: any = a[sortConfig.key as keyof Profile];
            let valB: any = b[sortConfig.key as keyof Profile];

            if (sortConfig.key === 'system_role') {
                valA = ROLE_HIERARCHY[a.system_role] || 0;
                valB = ROLE_HIERARCHY[b.system_role] || 0;
            }

            if (sortConfig.key === 'status') {
                valA = getUserStatus(a);
                valB = getUserStatus(b);
            }

            // An empty value (an account that has never signed in has no last_login_at)
            // always goes last, whichever way the column is sorted. Comparing null with
            // `<` and `>` is false both ways, which made it "equal" to every date and
            // broke the order of the whole column: recent sign-ins were pushed far down.
            const emptyA = valA === null || valA === undefined || valA === '';
            const emptyB = valB === null || valB === undefined || valB === '';
            if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    // 25, 50 (the default), 100 or 200 users a page. The page belongs to the
    // search, filters and sort it was chosen under: change any of them and the
    // list starts again at page 1. Export still takes every user that matches,
    // not just this page.
    const [pageSize, setPageSize] = useState(() => {
        try {
            const saved = Number(localStorage.getItem(PAGE_SIZE_KEY));
            return PAGE_SIZES.includes(saved) ? saved : 50;
        } catch {
            return 50;
        }
    });
    const listKey = JSON.stringify([searchQuery, columnFilters, sortConfig]);
    const [pageState, setPageState] = useState({ key: listKey, page: 1 });
    const shown = pageOf(filteredAndSortedProfiles, pageState.key === listKey ? pageState.page : 1, pageSize);
    // The table grows with its page (25 to 200 rows) and the console page
    // scrolls, so a new page brings the top of the table back into view if it
    // has gone above it.
    const tableCardRef = useRef<HTMLDivElement>(null);
    const goToPage = (page: number) => {
        setPageState({ key: listKey, page });
        const card = tableCardRef.current;
        let scroller = card?.parentElement;
        while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) {
            scroller = scroller.parentElement;
        }
        if (!card || !scroller) return;
        const top = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16;
        if (scroller.scrollTop > top) scroller.scrollTo({ top });
    };
    // A new page size keeps the users you were looking at: it opens the page
    // that holds the first one on screen.
    const changePageSize = (size: number) => {
        setPageSize(size);
        try { localStorage.setItem(PAGE_SIZE_KEY, String(size)); } catch { /* private mode: just not remembered */ }
        goToPage(pageContaining(shown.first, size));
    };

    const exportToExcel = () => {
        const exportData = filteredAndSortedProfiles.map((p) => ({
            Name: p.full_name || 'Unknown',
            Email: p.email || '',
            Role: ROLE_LABELS[p.system_role] || p.system_role,
            Authentication: AUTH_LABELS[p.auth_type || 'google'] || 'Google',
            Status: STATUS_LABELS[getUserStatus(p)],
            'Last Login': p.last_login_at
                ? new Date(p.last_login_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true
                })
                : '-',
            'Created At': p.created_at
                ? new Date(p.created_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true
                })
                : '-',
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);

        // Set column widths
        ws['!cols'] = [
            { wch: 30 }, // Name
            { wch: 35 }, // Email
            { wch: 15 }, // Role
            { wch: 16 }, // Authentication
            { wch: 12 }, // Status
            { wch: 24 }, // Last Login
            { wch: 24 }, // Created At
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Users');

        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        XLSX.writeFile(wb, `user-list-${dateStr}.xlsx`);
    };

    return (
        <div ref={tableCardRef} className="card-surface" style={{ minWidth: 'fit-content' }}>
            {/* Header */}
            <div style={{ padding: '14px 20px', background: 'hsl(var(--paper-head))', borderBottom: '1px solid hsl(var(--paper-edge))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px', maxWidth: '420px', padding: '7px 14px', borderRadius: '999px', background: 'hsl(var(--paper))', border: '1px solid hsl(var(--paper-edge))' }}>
                    <Search size={15} color="hsl(var(--ink-soft))" style={{ flexShrink: 0 }} />
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '13.5px',
                            flex: 1,
                            background: 'transparent',
                            color: 'hsl(var(--ink))'
                        }}
                    />
                    {!isLoading && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0,
                            padding: '2px 9px', borderRadius: '999px', backgroundColor: 'hsl(var(--paper-muted))',
                            border: '1px solid hsl(var(--paper-edge))',
                            fontSize: '11.5px', fontWeight: 700, color: 'hsl(var(--ink-dim))'
                        }}>
                            <Users size={11} />
                            {filteredAndSortedProfiles.length}{filteredAndSortedProfiles.length !== profiles.length ? ` / ${profiles.length}` : ''}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setShowCreateUserModal(true)}
                        className="btn-solid"
                        style={{
                            padding: '7px 15px',
                            borderRadius: '999px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            fontWeight: 600,
                        }}
                    >
                        <UserPlus size={14} />
                        Create User
                    </button>
                    <button
                        onClick={exportToExcel}
                        title={`Export ${filteredAndSortedProfiles.length} user(s) to Excel`}
                        className="glass-chip"
                        style={{
                            padding: '7px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#2A4A12',
                        }}
                    >
                        <FileSpreadsheet size={14} />
                        Export Excel
                    </button>
                    <button
                        onClick={fetchProfiles}
                        className="glass-chip"
                        style={{
                            padding: '7px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'hsl(var(--ink))',
                        }}
                    >
                        <RefreshCw size={14} />
                        Refresh
                    </button>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`glass-chip ${showFilters ? 'active' : ''}`}
                        style={{
                            padding: '7px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: showFilters ? 'hsl(var(--accent-fg))' : 'hsl(var(--ink))',
                        }}
                    >
                        <Filter size={14} />
                        {showFilters ? 'Hide Filters' : 'Filter'}
                    </button>
                </div>
            </div>

            {/* Table */}
            <div>
                {isLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--ink-dim))' }}>Loading...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: 'hsl(var(--paper-head))' }}>
                                <th onClick={() => requestSort('full_name')} style={thStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Name {getSortIcon('full_name')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('email')} style={thStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Email {getSortIcon('email')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('system_role')} style={thStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Role {getSortIcon('system_role')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('status')} style={thStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Status {getSortIcon('status')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('last_login_at')} style={thStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Last Login {getSortIcon('last_login_at')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('auth_type')} style={thStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Authentication {getSortIcon('auth_type')}
                                    </div>
                                </th>
                                <th style={{ ...thStyle, cursor: 'default', textAlign: 'center' }}>Actions</th>
                            </tr>
                            {showFilters && (
                                <tr style={{ backgroundColor: 'hsl(var(--paper-muted))' }}>
                                    <th style={thFilterStyle}>
                                        <input
                                            placeholder="Filter name..."
                                            value={columnFilters.full_name}
                                            onChange={(e) => setColumnFilters({ ...columnFilters, full_name: e.target.value })}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid hsl(var(--paper-edge))', backgroundColor: 'hsl(var(--paper))', color: 'hsl(var(--ink))', fontSize: '12px', boxSizing: 'border-box' }}
                                        />
                                    </th>
                                    <th style={thFilterStyle}>
                                        <input
                                            placeholder="Filter email..."
                                            value={columnFilters.email}
                                            onChange={(e) => setColumnFilters({ ...columnFilters, email: e.target.value })}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid hsl(var(--paper-edge))', backgroundColor: 'hsl(var(--paper))', color: 'hsl(var(--ink))', fontSize: '12px', boxSizing: 'border-box' }}
                                        />
                                    </th>
                                    <th style={thFilterStyle}>
                                        <select
                                            value={columnFilters.system_role}
                                            onChange={(e) => setColumnFilters({ ...columnFilters, system_role: e.target.value })}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid hsl(var(--paper-edge))', fontSize: '12px', backgroundColor: 'hsl(var(--paper))', color: 'hsl(var(--ink))', boxSizing: 'border-box' }}
                                        >
                                            <option value="">All Roles</option>
                                            <option value="user">User</option>
                                            <option value="it_admin">IT Admin</option>
                                            <option value="super_admin">Super Admin</option>
                                        </select>
                                    </th>
                                    <th style={thFilterStyle}>
                                        <select
                                            value={columnFilters.status}
                                            onChange={(e) => setColumnFilters({ ...columnFilters, status: e.target.value })}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid hsl(var(--paper-edge))', fontSize: '12px', backgroundColor: 'hsl(var(--paper))', color: 'hsl(var(--ink))', boxSizing: 'border-box' }}
                                        >
                                            <option value="">All Status</option>
                                            <option value="active">Active</option>
                                            <option value="pending">Pending</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </th>
                                    <th style={thFilterStyle}></th>
                                    <th style={thFilterStyle}></th>
                                    <th style={thFilterStyle}></th>
                                </tr>
                            )}
                        </thead>
                        <tbody>
                            {filteredAndSortedProfiles.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center', fontSize: '14px', color: 'hsl(var(--ink-soft))' }}>
                                        {profiles.length ? 'No users match your search or filters.' : 'No users yet.'}
                                    </td>
                                </tr>
                            )}
                            {shown.rows.map((profile) => (
                                <tr
                                    key={profile.id}
                                    className="user-table-row"
                                    style={{ borderBottom: '1px solid hsl(var(--paper-row-line))' }}
                                >
                                    <td style={{ padding: '11px 20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{
                                                width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                                                backgroundColor: '#2A4A12', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '12px', fontWeight: 700, color: '#FFEFD2'
                                            }}>
                                                {profile.avatar_url ? (
                                                    <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : initialsFrom(profile.full_name, profile.email)}
                                            </div>
                                            <div style={{ fontWeight: 600, color: 'hsl(var(--ink))', fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }} title={profile.full_name || 'Unknown'}>
                                                {profile.full_name || 'Unknown'}
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '11px 20px' }}>
                                        <div style={{ fontSize: '13.5px', color: 'hsl(var(--ink-dim))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px' }} title={profile.email}>{profile.email}</div>
                                    </td>
                                    <td style={{ padding: '11px 20px' }}>
                                        <span style={{
                                            display: 'inline-block',
                                            padding: '3px 10px',
                                            borderRadius: '999px',
                                            fontSize: '11.5px',
                                            fontWeight: 700,
                                            whiteSpace: 'nowrap',
                                            backgroundColor: profile.system_role === 'super_admin' ? 'rgba(42, 74, 18, 0.14)' : profile.system_role === 'it_admin' ? 'rgba(167, 100, 0, 0.14)' : 'hsl(var(--paper-muted))',
                                            color: profile.system_role === 'super_admin' ? '#2A4A12' : profile.system_role === 'it_admin' ? '#A76400' : 'hsl(var(--ink-dim))',
                                            border: `1px solid ${profile.system_role === 'super_admin' ? 'rgba(42, 74, 18, 0.25)' : profile.system_role === 'it_admin' ? 'rgba(167, 100, 0, 0.25)' : 'hsl(var(--paper-edge))'}`
                                        }}>
                                            {ROLE_LABELS[profile.system_role] || profile.system_role}
                                        </span>
                                    </td>
                                    <td style={{ padding: '11px 20px' }}>
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            fontSize: '13px',
                                            whiteSpace: 'nowrap',
                                            color: STATUS_COLORS[getUserStatus(profile)],
                                            fontWeight: 600
                                        }}>
                                            <div style={{
                                                width: '6px',
                                                height: '6px',
                                                borderRadius: '50%',
                                                flexShrink: 0,
                                                backgroundColor: STATUS_COLORS[getUserStatus(profile)]
                                            }} />
                                            {STATUS_LABELS[getUserStatus(profile)]}
                                        </span>
                                    </td>
                                    <td style={{ padding: '11px 20px', fontSize: '13px', color: 'hsl(var(--ink-dim))', whiteSpace: 'nowrap' }}>
                                        {profile.last_login_at ? new Date(profile.last_login_at).toLocaleString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            hour12: true
                                        }) : '-'}
                                    </td>
                                    <td style={{ padding: '11px 20px' }}>
                                        {profile.auth_type === 'internal' ? (
                                            <span title="Internal (email + password)" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 600, whiteSpace: 'nowrap', backgroundColor: 'hsl(var(--paper-muted))', border: '1px solid hsl(var(--paper-edge))', color: 'hsl(var(--ink-dim))' }}>
                                                <Lock size={11} /> Internal
                                            </span>
                                        ) : profile.auth_type === 'microsoft' ? (
                                            <span title="Microsoft" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 600, whiteSpace: 'nowrap', backgroundColor: 'rgba(42, 74, 18, 0.1)', border: '1px solid rgba(42, 74, 18, 0.22)', color: '#2A4A12' }}>
                                                <MicrosoftMark size={11} /> Microsoft
                                            </span>
                                        ) : (
                                            <span title="Google" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 600, whiteSpace: 'nowrap', backgroundColor: 'rgba(46, 125, 140, 0.1)', border: '1px solid rgba(46, 125, 140, 0.22)', color: '#2E7D8C' }}>
                                                <Globe size={11} /> Google
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '10px 20px', position: 'relative', textAlign: 'center' }}>
                                        {(() => {
                                            // Don't show button for current user's own account
                                            if (profile.id === currentUser.id) {
                                                return <span style={{ fontSize: '12px', color: '#cbd5e1' }}>—</span>;
                                            }

                                            const currentRoleLevel = ROLE_HIERARCHY[currentUser.system_role as keyof typeof ROLE_HIERARCHY] || 0;
                                            const targetRoleLevel = ROLE_HIERARCHY[profile.system_role as keyof typeof ROLE_HIERARCHY] || 0;
                                            const canModify = currentRoleLevel > targetRoleLevel;
                                            const isDisabled = currentRoleLevel < targetRoleLevel;

                                            return (
                                                <>
                                                    <button
                                                        onClick={(e) => {
                                                            if (isDisabled) return;

                                                            if (openPopoverId === profile.id) {
                                                                setOpenPopoverId(null);
                                                            } else {
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const spaceBelow = window.innerHeight - rect.bottom;
                                                                const spaceAbove = rect.top;

                                                                // If less than 250px space below, open upward
                                                                setPopoverOpenUpward(spaceBelow < 250 && spaceAbove > spaceBelow);
                                                                setOpenPopoverId(profile.id);
                                                            }
                                                        }}
                                                        disabled={isDisabled}
                                                        style={{
                                                            border: 'none',
                                                            background: 'transparent',
                                                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                            padding: '4px',
                                                            borderRadius: '4px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            opacity: isDisabled ? 0.4 : 1
                                                        }}
                                                    >
                                                        <MoreHorizontal size={16} color={isDisabled ? '#cbd5e1' : '#94a3b8'} />
                                                    </button>

                                                    {/* Popover Menu */}
                                                    {openPopoverId === profile.id && canModify && (
                                                        <div
                                                            ref={popoverRef}
                                                            style={{
                                                                position: 'absolute',
                                                                ...(popoverOpenUpward ? { bottom: '100%', marginBottom: '4px' } : { top: '100%', marginTop: '4px' }),
                                                                right: '0',
                                                                backgroundColor: 'white',
                                                                border: '1px solid #e2e8f0',
                                                                borderRadius: '8px',
                                                                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
                                                                zIndex: 9999,
                                                                minWidth: '200px',
                                                                overflow: 'hidden'
                                                            }}
                                                        >
                                                            {/* Edit Profile */}
                                                            {canModifyUser(profile.system_role) && (
                                                                <button
                                                                    onClick={() => {
                                                                        setEditProfileModal({ 
                                                                            userId: profile.id, 
                                                                            fullName: profile.full_name || '', 
                                                                            email: profile.email || '', 
                                                                            role: profile.system_role,
                                                                            authType: profile.auth_type || 'google',
                                                                            isActive: profile.is_active !== false
                                                                        });
                                                                        setOpenPopoverId(null);
                                                                    }}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '10px 16px',
                                                                        border: 'none',
                                                                        background: 'transparent',
                                                                        textAlign: 'left',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '10px',
                                                                        fontSize: '14px',
                                                                        color: '#0f172a',
                                                                        transition: 'background-color 0.15s'
                                                                    }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                >
                                                                    <Edit3 size={16} color="#64748b" />
                                                                    Edit Profile
                                                                </button>
                                                            )}

                                                            {!profile.is_approved && (
                                                                <button
                                                                    onClick={() => handleApproveUser(profile.id)}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '10px 16px',
                                                                        border: 'none',
                                                                        background: 'transparent',
                                                                        textAlign: 'left',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '10px',
                                                                        fontSize: '14px',
                                                                        color: '#10b981',
                                                                        transition: 'background-color 0.15s'
                                                                    }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ecfdf5'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                >
                                                                    <ShieldCheck size={16} />
                                                                    Approve User
                                                                </button>
                                                            )}



                                                            {/* Delete */}
                                                            {canModifyUser(profile.system_role) && (
                                                                <>
                                                                    <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }} />
                                                                    <button
                                                                        onClick={() => handleDeleteClick(profile)}
                                                                        disabled={checkingOwnershipFor === profile.id}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '10px 16px',
                                                                            border: 'none',
                                                                            background: 'transparent',
                                                                            textAlign: 'left',
                                                                            cursor: checkingOwnershipFor === profile.id ? 'wait' : 'pointer',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '10px',
                                                                            fontSize: '14px',
                                                                            color: '#dc2626',
                                                                            transition: 'background-color 0.15s'
                                                                        }}
                                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                    >
                                                                        <Trash2 size={16} />
                                                                        {checkingOwnershipFor === profile.id ? 'Checking…' : 'Delete User'}
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {!isLoading && filteredAndSortedProfiles.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '12px 20px', borderTop: '1px solid hsl(var(--paper-edge))', background: 'hsl(var(--paper-head))' }}>
                    <span style={{ fontSize: '13px', color: 'hsl(var(--ink-dim))' }}>
                        Showing <strong style={{ color: 'hsl(var(--ink))', fontWeight: 600 }}>{shown.first}–{shown.last}</strong> of {filteredAndSortedProfiles.length} users
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        <label className="admin-page-size">
                            Rows per page
                            <select value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
                            </select>
                        </label>
                        {shown.pageCount > 1 && (
                            <nav aria-label="User pages" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button type="button" className="admin-page-btn" onClick={() => goToPage(shown.page - 1)} disabled={shown.page === 1} aria-label="Previous page">
                                    <ChevronLeft size={16} /> Prev
                                </button>
                                {pageButtons(shown.page, shown.pageCount).map((p, i) => p === 'gap'
                                    ? <span key={`gap-${i}`} className="admin-page-gap">…</span>
                                    : (
                                        <button
                                            key={p}
                                            type="button"
                                            className="admin-page-btn"
                                            aria-current={p === shown.page ? 'page' : undefined}
                                            aria-label={`Page ${p}`}
                                            onClick={() => goToPage(p)}
                                        >
                                            {p}
                                        </button>
                                    )
                                )}
                                <button type="button" className="admin-page-btn" onClick={() => goToPage(shown.page + 1)} disabled={shown.page === shown.pageCount} aria-label="Next page">
                                    Next <ChevronRight size={16} />
                                </button>
                            </nav>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                .user-table-row:hover {
                    background-color: hsl(var(--paper-muted)) !important;
                }
            `}</style>

            {/* Edit Profile Modal */}
            {editProfileModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '450px',
                        width: '90%',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>
                                Edit Profile
                            </h3>
                            <button 
                                onClick={() => setEditProfileModal(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                            >
                                <MoreHorizontal size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                            {/* Full Name */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>Full Name</label>
                                <input 
                                    type="text"
                                    value={editProfileModal.fullName}
                                    onChange={(e) => setEditProfileModal({ ...editProfileModal, fullName: e.target.value })}
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '14px',
                                        outline: 'none',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                />
                            </div>

                            {/* Email */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>Email</label>
                                <input 
                                    type="email"
                                    value={editProfileModal.email}
                                    onChange={(e) => setEditProfileModal({ ...editProfileModal, email: e.target.value })}
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '14px',
                                        outline: 'none',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                />
                            </div>

                            {/* Role Selection */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>System Role</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                    {(['user', 'it_admin', 'super_admin'] as const).map((role) => (
                                        <button
                                            key={role}
                                            onClick={() => setEditProfileModal({ ...editProfileModal, role })}
                                            style={{
                                                padding: '10px 8px',
                                                border: editProfileModal.role === role ? '2px solid #6366f1' : '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                backgroundColor: editProfileModal.role === role ? '#eef2ff' : 'white',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 500,
                                                color: editProfileModal.role === role ? '#4338ca' : '#64748b',
                                                transition: 'all 0.2s',
                                                textAlign: 'center'
                                            }}
                                        >
                                            {ROLE_LABELS[role]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Authentication */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>Authentication</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                    {(['google', 'microsoft', 'internal'] as const).map((authType) => (
                                        <button
                                            key={authType}
                                            onClick={() => setEditProfileModal({ ...editProfileModal, authType })}
                                            style={{
                                                padding: '10px 8px',
                                                border: editProfileModal.authType === authType ? '2px solid #6366f1' : '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                backgroundColor: editProfileModal.authType === authType ? '#eef2ff' : 'white',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 500,
                                                color: editProfileModal.authType === authType ? '#4338ca' : '#64748b',
                                                transition: 'all 0.2s',
                                                textAlign: 'center'
                                            }}
                                        >
                                            {AUTH_LABELS[authType]}
                                        </button>
                                    ))}
                                </div>
                                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                                    {editProfileModal.authType === 'google'
                                        ? 'Signs in with Continue with Google.'
                                        : editProfileModal.authType === 'microsoft'
                                            ? 'Signs in with their Microsoft account.'
                                            : 'Signs in with email + a password. Switching this label alone does not send a setup email or change their existing credentials.'}
                                </p>
                            </div>

                            {/* Status */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>Status</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                    {([true, false] as const).map((active) => {
                                        const selected = editProfileModal.isActive === active;
                                        // Deactivating yourself would lock you out of the console on the
                                        // next load, with no way back in from inside the app.
                                        const isSelf = editProfileModal.userId === currentUser.id;
                                        const disabled = !active && isSelf;
                                        return (
                                            <button
                                                key={String(active)}
                                                onClick={() => !disabled && setEditProfileModal({ ...editProfileModal, isActive: active })}
                                                disabled={disabled}
                                                title={disabled ? "You can't deactivate your own account" : undefined}
                                                style={{
                                                    padding: '10px 8px',
                                                    border: selected ? `2px solid ${active ? '#10b981' : '#ef4444'}` : '1px solid #e2e8f0',
                                                    borderRadius: '8px',
                                                    backgroundColor: selected ? (active ? '#ecfdf5' : '#fef2f2') : 'white',
                                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                                    fontSize: '12px',
                                                    fontWeight: 500,
                                                    color: disabled ? '#cbd5e1' : selected ? (active ? '#047857' : '#b91c1c') : '#64748b',
                                                    transition: 'all 0.2s',
                                                    textAlign: 'center'
                                                }}
                                            >
                                                {active ? 'Active' : 'Inactive'}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                                    {editProfileModal.isActive
                                        ? 'Can sign in and appears in member lists, person columns and @mentions.'
                                        : 'Blocked from signing in and hidden from every workspace, board and person column. Nothing is deleted — switching back to Active restores them.'}
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '30px' }}>
                            <button
                                onClick={() => setEditProfileModal(null)}
                                style={{
                                    flex: 1,
                                    padding: '10px 16px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    backgroundColor: 'white',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#475569',
                                    textAlign: 'center'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleProfileUpdate}
                                disabled={isSaving}
                                style={{
                                    flex: 1,
                                    padding: '10px 16px',
                                    border: 'none',
                                    borderRadius: '8px',
                                    backgroundColor: '#6366f1',
                                    color: 'white',
                                    cursor: isSaving ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    transition: 'background-color 0.2s',
                                    opacity: isSaving ? 0.7 : 1,
                                    textAlign: 'center'
                                }}
                            >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Transfer Ownership Modal — required first step before deleting an
                account that still owns content. */}
            {transferModal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '440px',
                        width: '90%'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '4px' }}>
                            <AlertTriangle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>
                                Transfer ownership before deleting
                            </h3>
                        </div>
                        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>
                            <strong>{transferModal.userName}</strong> still owns{' '}
                            {transferModal.workspaces > 0 && (
                                <strong>{transferModal.workspaces} workspace{transferModal.workspaces === 1 ? '' : 's'}</strong>
                            )}
                            {transferModal.workspaces > 0 && transferModal.boards > 0 && ' and '}
                            {transferModal.boards > 0 && (
                                <strong>{transferModal.boards} board{transferModal.boards === 1 ? '' : 's'}</strong>
                            )}
                            . Pick someone active to receive all of it — everything moves to them at once, then
                            the account can be deleted.
                        </p>

                        <div style={{ position: 'relative', marginBottom: '16px' }}>
                            <input
                                type="text"
                                value={transferTarget ? `${transferTarget.name} (${transferTarget.email})` : transferQuery}
                                onChange={(e) => handleTransferSearch(e.target.value)}
                                placeholder="Search by name or email…"
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    boxSizing: 'border-box',
                                    color: '#0f172a'
                                }}
                            />
                            {!transferTarget && transferResults.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 4px)',
                                    left: 0,
                                    right: 0,
                                    backgroundColor: 'white',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
                                    maxHeight: '220px',
                                    overflowY: 'auto',
                                    zIndex: 1
                                }}>
                                    {transferResults.map((u: any) => (
                                        <button
                                            key={u.id}
                                            onClick={() => {
                                                setTransferTarget({ id: u.id, name: u.full_name || u.email, email: u.email });
                                                setTransferResults([]);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '10px 12px',
                                                border: 'none',
                                                background: 'transparent',
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                fontSize: '13px',
                                                display: 'block'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <div style={{ fontWeight: 500, color: '#0f172a' }}>{u.full_name || 'Unknown'}</div>
                                            <div style={{ color: '#94a3b8' }}>{u.email}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => {
                                    setTransferModal(null);
                                    setTransferQuery('');
                                    setTransferResults([]);
                                    setTransferTarget(null);
                                }}
                                disabled={isTransferring}
                                style={{
                                    padding: '8px 16px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    backgroundColor: 'white',
                                    cursor: isTransferring ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#475569'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmTransfer}
                                disabled={!transferTarget || isTransferring}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 16px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    backgroundColor: (!transferTarget || isTransferring) ? '#a5b4fc' : '#4f46e5',
                                    color: 'white',
                                    cursor: (!transferTarget || isTransferring) ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500
                                }}
                            >
                                <ArrowRightLeft size={14} />
                                {isTransferring ? 'Transferring…' : 'Transfer & Continue'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '400px',
                        width: '90%'
                    }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>
                            Confirm Delete User
                        </h3>
                        <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#64748b' }}>
                            Are you sure you want to delete this account? This cannot be undone. They own no
                            workspaces or boards, so nothing else is affected — only their sign-in and profile
                            are removed.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setDeleteConfirmId(null)}
                                style={{
                                    padding: '8px 16px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    backgroundColor: 'white',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#475569'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteUser(deleteConfirmId)}
                                style={{
                                    padding: '8px 16px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    backgroundColor: '#dc2626',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500
                                }}
                            >
                                Delete User
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCreateUserModal && (
                <CreateUserModal
                    onClose={() => setShowCreateUserModal(false)}
                    onCreated={fetchProfiles}
                />
            )}
        </div>
    );
};
