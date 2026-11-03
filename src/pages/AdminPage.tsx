import { useState, useEffect } from 'react';
import { useUserStore } from '../store/useUserStore';
import { useBoardStore } from '../store/useBoardStore';
import { supabase } from '../lib/supabase';
import {
    LayoutDashboard, Users, Settings,
    ShieldCheck, Activity, ArrowLeft, Building2, Trello, Download, Upload, Mail, Palette, Sparkles, CalendarClock, Trash2
} from 'lucide-react';
import { GlobalTopActions } from '../components/layout/GlobalTopActions';
import { UserTable } from '../components/admin/UserTable';
import { WorkspaceTable } from '../components/admin/WorkspaceTable';
import { BoardTable } from '../components/admin/BoardTable';
import { ActivityLogs } from '../components/admin/ActivityLogs';
import { DailyActiveUsersChart } from '../components/admin/DailyActiveUsersChart';
import { BasicStatsCards } from '../components/admin/BasicStatsCards';
import { ActivityLeaderboards } from '../components/admin/ActivityLeaderboards';
import { EmailSettings } from '../components/admin/EmailSettings';
import { StatusMappingSettings } from '../components/admin/StatusMappingSettings';
import { DueDateReminderSettings } from '../components/admin/DueDateReminderSettings';
import { AISettings } from '../components/admin/AISettings';
import { TrashManagement } from '../components/admin/TrashManagement';

type AdminTab =
    | 'dashboard'
    | 'users'
    | 'workspaces'
    | 'boards'
    | 'trash'
    | 'email_templates'
    | 'status_mapping'
    | 'due_date_reminders'
    | 'settings'
    | 'ai_settings';

const NAV_ITEMS: { id: AdminTab; label: string; icon: typeof LayoutDashboard; subtitle: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, subtitle: 'System overview, active user trends, leaderboards, and recent audit activity.' },
    { id: 'users', label: 'User Management', icon: Users, subtitle: 'Approve accounts, manage roles, and transfer workspace/board ownership.' },
    { id: 'workspaces', label: 'Workspaces', icon: Building2, subtitle: 'Inspect all workspaces across the organization and manage workspace members.' },
    { id: 'boards', label: 'Boards', icon: Trello, subtitle: 'Browse active and archived boards, inspect members, and open boards directly.' },
    { id: 'trash', label: 'Trash', icon: Trash2, subtitle: 'Review and restore archived boards and groups.' },
    { id: 'email_templates', label: 'Email & SMTP', icon: Mail, subtitle: 'Configure SMTP delivery and customize transactional notification templates.' },
    { id: 'status_mapping', label: 'Status Mapping', icon: Palette, subtitle: 'Define default status labels and brand color mappings across boards.' },
    { id: 'due_date_reminders', label: 'Due Date Reminders', icon: CalendarClock, subtitle: 'Schedule automated reminder notifications before task due dates.' },
    { id: 'settings', label: 'System Settings', icon: Settings, subtitle: 'Export full system backups and manage platform-level maintenance.' },
    { id: 'ai_settings', label: 'AI Settings', icon: Sparkles, subtitle: 'Configure Gemini API credentials and toggle AI board summaries.' },
];

export const AdminPage = () => {
    const { currentUser } = useUserStore();
    const { navigateTo } = useBoardStore();
    const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

    const [stats, setStats] = useState([
        { label: 'Total Users', value: '–', icon: Users, color: '#2A4A12' },
        { label: 'Active Workspaces', value: '–', icon: LayoutDashboard, color: '#A76400' },
        { label: 'System Health', value: '100%', icon: Activity, color: '#2E7D8C' },
    ]);

    useEffect(() => {
        const fetchStats = async () => {
            const [{ count: userCount }, { count: workspaceCount }] = await Promise.all([
                supabase.from('profiles').select('*', { count: 'exact', head: true }),
                supabase.from('workspaces').select('*', { count: 'exact', head: true })
            ]);

            setStats([
                { label: 'Total Users', value: userCount?.toString() || '0', icon: Users, color: '#2A4A12' },
                { label: 'Active Workspaces', value: workspaceCount?.toString() || '0', icon: LayoutDashboard, color: '#A76400' },
                { label: 'System Health', value: '100%', icon: Activity, color: '#2E7D8C' },
            ]);
        };

        if (activeTab === 'dashboard') {
            fetchStats();
        }
    }, [activeTab]);

    if (currentUser.system_role !== 'super_admin' && currentUser.system_role !== 'it_admin') {
        return (
            <div className="admin-console" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                <div className="card-surface" style={{ padding: '40px 32px', maxWidth: '420px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div className="admin-tile" style={{ width: '52px', height: '52px', '--tile-color': '#C83E2B' } as React.CSSProperties}>
                        <ShieldCheck size={24} />
                    </div>
                    <h2 className="narai-heading" style={{ margin: 0, fontFamily: 'var(--font-family-display)', fontSize: '22px' }}>Access Denied</h2>
                    <p style={{ margin: 0, fontSize: '13.5px', color: 'hsl(var(--color-text-secondary))' }}>
                        You do not have permission to access the System Administration Console.
                    </p>
                    <button
                        type="button"
                        className="btn-solid"
                        onClick={() => navigateTo('home')}
                        style={{ marginTop: '8px', height: '34px', padding: '0 18px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Return Home
                    </button>
                </div>
            </div>
        );
    }

    const activeNavItem = NAV_ITEMS.find(item => item.id === activeTab) || NAV_ITEMS[0];
    const roleLabel = currentUser.system_role === 'super_admin' ? 'Super Admin' : 'IT Admin';

    return (
        <div className="admin-console" style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
            {/* Floating Dark Narai Green Glass Sidebar */}
            <aside className="admin-sidebar">
                <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(255, 239, 210, 0.10)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                        <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '10px',
                            backgroundColor: '#FFEFD2',
                            color: '#152A00',
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.28), inset 0 1px 0 #ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <ShieldCheck size={19} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{
                                fontFamily: 'var(--font-family-display)',
                                fontSize: '18px',
                                fontWeight: 600,
                                letterSpacing: '-0.01em',
                                color: '#FFEFD2',
                                lineHeight: 1.15
                            }}>
                                Admin Console
                            </div>
                            <div style={{
                                marginTop: '2px',
                                fontSize: '10px',
                                fontWeight: 700,
                                color: 'rgba(255, 239, 210, 0.62)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em'
                            }}>
                                {roleLabel} Access
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{
                    padding: '14px 20px 6px',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'rgba(255, 239, 210, 0.50)'
                }}>
                    System Modules
                </div>

                <nav style={{ flex: 1, overflowY: 'auto', paddingBottom: '12px' }}>
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <div
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                className={`admin-nav-item${isActive ? ' is-active' : ''}`}
                            >
                                <Icon size={17} style={{ color: isActive ? '#E1FFB3' : 'rgba(255, 239, 210, 0.72)', flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                            </div>
                        );
                    })}
                </nav>

                <div style={{
                    padding: '14px 16px',
                    borderTop: '1px solid rgba(255, 239, 210, 0.10)',
                    background: 'linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.14))'
                }}>
                    <button
                        type="button"
                        onClick={() => navigateTo('home')}
                        style={{
                            width: '100%',
                            height: '36px',
                            padding: '0 14px',
                            borderRadius: '10px',
                            border: '1px solid rgba(255, 239, 210, 0.16)',
                            backgroundColor: 'rgba(255, 239, 210, 0.08)',
                            color: '#FFEFD2',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '9px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                            transition: 'background-color 0.16s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 239, 210, 0.14)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 239, 210, 0.08)'; }}
                    >
                        <ArrowLeft size={15} />
                        <span>Back to NHG Tasks</span>
                    </button>
                </div>
            </aside>

            {/* Floating Frosted Galangal Main Panel */}
            <div className="admin-main">
                {/* Unified Top Bar matching Home, Dashboard & Board */}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="bh-eyebrow" style={{ margin: 0 }}>
                            NHG TASKS · ADMIN CONSOLE · {activeNavItem.label.toUpperCase()}
                        </span>
                    </div>
                    <GlobalTopActions />
                </div>

                {/* Scrollable Content Area */}
                <main style={{ flex: 1, overflow: 'auto', padding: '0 28px 96px' }}>
                    <div style={{ maxWidth: '1240px', margin: '0 auto', width: '100%' }}>
                        <header style={{ paddingTop: '22px', marginBottom: '22px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                            <div>
                                <div className="bh-eyebrow" style={{ marginBottom: '4px' }}>
                                    SYSTEM ADMINISTRATION · {roleLabel.toUpperCase()}
                                </div>
                                <h1 className="narai-heading" style={{
                                    margin: '0 0 4px 0',
                                    fontFamily: 'var(--font-family-display)',
                                    fontSize: '28px',
                                    fontWeight: 500,
                                    letterSpacing: '-0.02em',
                                    lineHeight: 1.15,
                                    color: 'hsl(var(--color-text-primary))'
                                }}>
                                    {activeTab === 'dashboard' ? 'System Overview' : activeNavItem.label}
                                </h1>
                                <p style={{ color: 'hsl(var(--color-text-secondary))', margin: 0, fontSize: '13.5px' }}>
                                    {activeNavItem.subtitle}
                                </p>
                            </div>

                            <div className="glass-chip" style={{
                                height: '30px',
                                padding: '0 12px',
                                borderRadius: '999px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '7px',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: 'hsl(var(--color-text-secondary))'
                            }}>
                                <span style={{
                                    width: '7px',
                                    height: '7px',
                                    borderRadius: '50%',
                                    backgroundColor: '#2A4A12'
                                }} />
                                <span>Signed in as {currentUser.name} ({roleLabel})</span>
                            </div>
                        </header>

                        {activeTab === 'dashboard' && (
                            <div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px', marginBottom: '24px' }}>
                                    {stats.map((stat, i) => (
                                        <div key={i} className="card-surface" style={{
                                            padding: '18px 20px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '16px'
                                        }}>
                                            <div className="admin-tile" style={{ width: '44px', height: '44px', '--tile-color': stat.color } as React.CSSProperties}>
                                                <stat.icon size={20} />
                                            </div>
                                            <div>
                                                <div style={{
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    letterSpacing: '0.07em',
                                                    textTransform: 'uppercase',
                                                    color: 'hsl(var(--color-text-tertiary))'
                                                }}>
                                                    {stat.label}
                                                </div>
                                                <div style={{
                                                    fontFamily: 'var(--font-family-display)',
                                                    fontSize: '30px',
                                                    fontWeight: 600,
                                                    lineHeight: 1.1,
                                                    color: 'hsl(var(--color-text-primary))',
                                                    marginTop: '3px',
                                                    fontVariantNumeric: 'tabular-nums'
                                                }}>
                                                    {stat.value}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <BasicStatsCards />
                                <DailyActiveUsersChart />
                                <ActivityLeaderboards />
                                <ActivityLogs />
                            </div>
                        )}

                        {activeTab === 'users' && <UserTable />}

                        {activeTab === 'workspaces' && <WorkspaceTable />}

                        {activeTab === 'boards' && <BoardTable />}

                        {activeTab === 'trash' && <TrashManagement />}

                        {activeTab === 'email_templates' && <EmailSettings />}

                        {activeTab === 'status_mapping' && <StatusMappingSettings />}

                        {activeTab === 'due_date_reminders' && <DueDateReminderSettings />}

                        {activeTab === 'ai_settings' && <AISettings />}

                        {activeTab === 'settings' && (
                            <div style={{ maxWidth: '760px' }}>
                                <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                        <div className="admin-tile" style={{ width: '38px', height: '38px', '--tile-color': '#2A4A12' } as React.CSSProperties}>
                                            <Settings size={18} />
                                        </div>
                                        <div>
                                            <h2 className="narai-heading" style={{
                                                margin: 0,
                                                fontFamily: 'var(--font-family-display)',
                                                fontSize: '19px',
                                                fontWeight: 600,
                                                color: 'hsl(var(--color-text-primary))'
                                            }}>
                                                System Backup & Restore
                                            </h2>
                                            <p style={{ color: 'hsl(var(--color-text-secondary))', margin: '2px 0 0', fontSize: '13px' }}>
                                                Manage full system backups. Regular backups are recommended before major updates.
                                            </p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '18px' }}>
                                        <button
                                            type="button"
                                            className="btn-solid"
                                            onClick={() => {
                                                import('../services/backupService').then(({ backupService }) => {
                                                    backupService.exportSystem();
                                                });
                                            }}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                height: '36px',
                                                padding: '0 16px',
                                                borderRadius: '999px',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                fontSize: '13px'
                                            }}
                                        >
                                            <Download size={15} />
                                            <span>Export All Data (JSON)</span>
                                        </button>

                                        <button
                                            type="button"
                                            className="glass-chip"
                                            onClick={() => alert('System Restore is not yet fully implemented for safety reasons.')}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                height: '36px',
                                                padding: '0 16px',
                                                borderRadius: '999px',
                                                color: 'hsl(var(--color-text-tertiary))',
                                                fontWeight: 600,
                                                cursor: 'not-allowed',
                                                fontSize: '13px'
                                            }}
                                            title="Coming Soon"
                                        >
                                            <Upload size={15} />
                                            <span>Import System Data</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};
