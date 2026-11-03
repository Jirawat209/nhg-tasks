import { useEffect, lazy, Suspense, useRef } from 'react';
import { slugify, boardPathSegment, parseBoardSlugSuffix, shortId } from './lib/utils';
import { Sidebar } from './components/board/Sidebar'
// BoardHeader, Table, BatchActionsBar moved to BoardPage lazy chunk
import { useBoardStore } from './store/useBoardStore'
import { useUserStore } from './store/useUserStore';


import { LoadingScreen } from './components/common/LoadingScreen';
import { SidePanel } from './components/ui/SidePanel';
import { ContactSupportButton } from './components/ui/ContactSupportButton';
import { UndoToastHost } from './components/ui/UndoToastHost';
import { TaskDetail } from './components/task/TaskDetail';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { supabase } from './lib/supabase';
import { LOGO_DATA_URI } from './lib/localIcons';
import { takePendingDeepLink, clearPendingDeepLink } from './lib/pendingDeepLink';
import { clearBoardUnlock } from './lib/boardPinUnlock';
import { useIsMobile } from './hooks/useIsMobile';
import './lib/initialPath';
import { MobileLayoutPill } from './components/layout/MobileLayoutPill';

// HomePage moved to lazy
import { TopBar } from './components/layout/TopBar';

// Accounts at these domains never wait for an admin. The database approves them
// when the account is created (public.is_auto_approved_email, used by
// handle_new_user — migration 20261011), so an invited user who hasn't signed in
// yet no longer shows as "Pending"; this copy lets the session sync and the
// approval gate below treat them as approved without a round trip. Keep the two
// lists the same.
const ALLOWED_DOMAINS = [
  'naraihospitality.com',
  'marasca.live',
  'lubd.com',
  'visitamanta.com',
  'riverineplace.com',
  'naraihotel.co.th'
];

export const isAllowedDomain = (email?: string | null) => {
  const domain = email?.split('@')[1]?.toLowerCase();
  return !!domain && ALLOWED_DOMAINS.includes(domain);
};

// An account whose first sign-in was Microsoft (Supabase's Azure provider)
// waits for an admin's approval whatever its domain — for now, while Microsoft
// sign-in is new. Same rule as handle_new_user
// (20261019_microsoft_signins_need_approval.sql). Someone with an account who
// signs in with Microsoft later keeps their approval: app_metadata.provider
// stays the first method.
const createdViaMicrosoft = (user?: { app_metadata?: { provider?: string } } | null) =>
  user?.app_metadata?.provider === 'azure';

const DEFAULT_ASSIGN_TEMPLATE = `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="${LOGO_DATA_URI}" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 24px;"><strong>{{inviterName}}</strong> assigned you to item <strong>{{itemName}}</strong> under <strong>{{groupName}}</strong> in <strong>{{boardName}}</strong>.</p><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Item</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`;

const NotificationPage = lazy(() => import('./pages/NotificationPage').then(m => ({ default: m.NotificationPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const BoardPage = lazy(() => import('./pages/BoardPage').then(m => ({ default: m.BoardPage })));
const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage').then(m => ({ default: m.FavoritesPage })));
const WorkspaceDashboardPage = lazy(() => import('./pages/WorkspaceDashboardPage').then(m => ({ default: m.WorkspaceDashboardPage })));
// The phone layout: its own chunk, only fetched on a phone-sized screen.
const MobileApp = lazy(() => import('./mobile/MobileApp').then(m => ({ default: m.MobileApp })));

// Loading fallback component
function PageLoader() {
  return <LoadingScreen />;
}

function PendingApprovalPage({ onSignOut }: { onSignOut: () => void }) {
  const setUser = useUserStore(state => state.setUser);
  const currentUser = useUserStore(state => state.currentUser);

  // Poll DB every 10 seconds so the page auto-unblocks once admin approves
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('is_approved, system_role').eq('id', user.id).single();
      if (profile?.is_approved && currentUser) {
        setUser({ ...currentUser, is_approved: true, system_role: (profile.system_role as any) || currentUser.system_role });
      }
    };
    check();
    const timer = setInterval(check, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8fafc',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{
        maxWidth: '400px',
        backgroundColor: 'white',
        padding: '32px',
        borderRadius: '12px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <div style={{ 
          width: '64px', 
          height: '64px', 
          backgroundColor: '#fef3c7', 
          borderRadius: '50%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          marginBottom: '20px'
        }}>
          <span style={{ fontSize: '32px' }}>⏳</span>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>Account Pending Approval</h2>
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', lineHeight: '1.5' }}>
          Your account has been created successfully. <br/>
          Please wait for <strong>Super Admin</strong> to approve your access.
        </p>
        <button 
          onClick={onSignOut}
          style={{
            padding: '10px 20px',
            backgroundColor: 'hsl(var(--color-brand-primary))',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-brand-primary) / 0.8)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-brand-primary))'}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

// Shown instead of the app to someone an admin has switched to Inactive. Unlike the
// pending-approval screen there is nothing to poll for — reactivation is a deliberate
// admin action, and signing in again picks it up.
function DeactivatedAccountPage({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8fafc',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{
        maxWidth: '400px',
        backgroundColor: 'white',
        padding: '32px',
        borderRadius: '12px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          backgroundColor: '#fee2e2',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px'
        }}>
          <span style={{ fontSize: '32px' }}>🔒</span>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>Account Deactivated</h2>
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', lineHeight: '1.5' }}>
          This account is no longer active. <br />
          Please contact a <strong>Super Admin</strong> if you think this is a mistake.
        </p>
        <button
          onClick={onSignOut}
          style={{
            padding: '10px 20px',
            backgroundColor: 'hsl(var(--color-brand-primary))',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

function MainApp() {
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const activePage = useBoardStore(state => state.activePage);
  const navigateTo = useBoardStore(state => state.navigateTo);

  const boards = useBoardStore(state => state.boards);
  const activeItemId = useBoardStore(state => state.activeItemId);
  const setActiveItem = useBoardStore(state => state.setActiveItem);
  const loadUserData = useBoardStore(state => state.loadUserData);
  const isLoading = useBoardStore(state => state.isLoading);
  const subscribeToRealtime = useBoardStore(state => state.subscribeToRealtime);
  const unsubscribeFromRealtime = useBoardStore(state => state.unsubscribeFromRealtime);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoard = boards.find(b => b.id === activeBoardId);
  const { session } = useAuth();
  const setUser = useUserStore(state => state.setUser); // Import setter
  const isMobile = useIsMobile();

  const lastUserIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    console.log('MainApp: session changed', session?.user?.id);
    
    if (session?.user?.id) {
      // Only re-initialize if the user ID actually changed
      if (lastUserIdRef.current === session.user.id) {
        console.log('MainApp: session refreshed but user ID same, skipping init');
        return;
      }
      
      lastUserIdRef.current = session.user.id;
      
      const initUser = async () => {
        // Fetch full profile to get system_role, is_approved and a possible custom avatar
        const { data: profile } = await supabase.from('profiles').select('system_role, is_approved, is_active, avatar_url').eq('id', session.user.id).single();

        const userEmail = session.user.email || '';
        const shouldBeApproved = profile?.is_approved ||
                                (isAllowedDomain(userEmail) && !createdViaMicrosoft(session.user)) ||
                                userEmail === 'khemmarin.k@naraihospitality.com';

        // Auto-update database if they should be approved but aren't yet (fire and forget)
        if (shouldBeApproved && !profile?.is_approved) {
          supabase.from('profiles').update({ is_approved: true }).eq('id', session.user.id).then(() => {});
        }

        // Sync UserStore with Supabase Session
        setUser({
          id: session.user.id,
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email,
          avatar: profile?.avatar_url || session.user.user_metadata?.avatar_url,
          role: 'owner',
          system_role: (profile?.system_role as any) || 'user',
          is_approved: shouldBeApproved,
          is_active: profile?.is_active !== false
        });

        // 🚀 Start loading workspace data immediately — don't wait for template seeding below
        console.log('MainApp: calling loadUserData');
        loadUserData();

        // Deep linking logic: 
        // Only go to home if the current path is '/' and we don't have an active page set.
        // Otherwise, let the existing routing logic handle things.
        if (window.location.pathname === '/' && activePage === 'home') {
           console.log('MainApp: Already at home, staying there');
        }

        // Seed default email templates to DB if not yet saved — fire and forget, never blocks startup
        if (profile?.system_role === 'super_admin' || profile?.system_role === 'it_admin') {
          (async () => {
            try {
              const { data: existing } = await supabase.from('system_settings').select('key').eq('key', 'mention_email_template').maybeSingle();
              if (!existing) {
                await supabase.from('system_settings').upsert({
                  key: 'mention_email_template',
                  value: {
                    subject: '{{mentionedBy}} mentioned you in {{itemName}}',
                    bodyHtml: `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="${LOGO_DATA_URI}" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 16px;"><strong>{{mentionedBy}}</strong> mentioned you in <strong>{{itemName}}</strong> on board <strong>{{boardName}}</strong>.</p><div style="background-color: #f8fafc; border-left: 3px solid #a86315; padding: 12px 16px; margin: 0 0 20px; text-align: left; border-radius: 0 4px 4px 0;"><p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.6; font-style: italic;">"{{updatePreview}}"</p></div><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Update</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`
                  },
                  description: 'Template for @mention notifications'
                }, { onConflict: 'key' });
              }

              // Seed/upgrade the assign-item template (adds group name + direct item link)
              const { data: existingAssign } = await supabase.from('system_settings').select('value').eq('key', 'assign_item_template').maybeSingle();
              if (!existingAssign?.value?.bodyHtml?.includes('{{groupName}}')) {
                await supabase.from('system_settings').upsert({
                  key: 'assign_item_template',
                  value: {
                    subject: "[You're assigned] {{itemName}}",
                    bodyHtml: DEFAULT_ASSIGN_TEMPLATE
                  },
                  description: 'Template for item assignments'
                }, { onConflict: 'key' });
              }
            } catch (err) {
              console.warn('[App] Template seeding failed (non-critical):', err);
            }
          })();
        }
      };

      initUser().catch((err) => {
        console.error('[App] initUser failed, releasing loading state:', err);
        useBoardStore.setState({ isLoading: false, isInitializing: false } as any);
      });
    } else if (!session) {
      // Handle logout - clear all state
      console.log('MainApp: session cleared (logged out)');
      lastUserIdRef.current = null;
      // Don't let a link stashed before sign-in fire for whoever logs in next.
      clearPendingDeepLink();
      window.history.replaceState(null, '', '/');

      // Clear board store state
      useBoardStore.setState({
        activeBoardId: null,
        activeWorkspaceId: '',
        boards: [],
        workspaces: [],
        activePage: 'home',
        activeBoardMembers: [], 
        notifications: [],
        selectedItemIds: [],
        activeItemId: null
      });
    }
  }, [session?.user?.id]);

  // Target of an emailed "View Item" link (/?boardId=…&itemId=…), held until the
  // board's items actually exist in the store. Read on mount and kept in a ref
  // because the State→URL sync effect below pushes a clean /user/workspace/board
  // path as soon as the board resolves, which drops the query string long before
  // the item is loadable.
  const pendingItemLink = useRef<{ boardId: string; itemId: string; updateId?: string } | null>(null);

  // URL Sync and Popstate Handler
  useEffect(() => {
    // 1. Handle Popstate (Browser Back/Forward)
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/notifications') {
        navigateTo('notifications');
      } else if (path === '/' || path === '') {
        navigateTo('home');
      }
      // Note: We don't implement full deep link parsing on popstate here for simplicity in MVP, 
      // relying on the user to reload if they paste a URL or standard navigation. 
      // But we could add it. For now, we prefer the Store state to drive the URL.
      // Exception: If back button takes us to a board URL, we should probably switch.
      // Ideally, the Store updates should push state, so back button works.
    };

    window.addEventListener('popstate', handlePopState);

    // 2. Initial Deep Link Parsing (On Mount)
    const initPath = window.location.pathname;

    // If it's a Board URL: /:username/:workspace/:board


    if (initPath === '/notifications') {
      navigateTo('notifications');
    } else if (initPath === '/admin') {
      navigateTo('admin');
    }

    // Check for query parameters as fallback deep links. When the user had to
    // sign in first the query string is already gone, so fall back to whatever
    // LoginPage stashed before it reset the URL.
    const params = new URLSearchParams(window.location.search);
    const stashed = takePendingDeepLink() || {};
    const qBoardId = params.get('boardId') || stashed.boardId || null;
    const qWorkspaceId = params.get('workspaceId') || stashed.workspaceId || null;
    const qItemId = params.get('itemId') || stashed.itemId || null;
    const qUpdateId = params.get('updateId') || stashed.updateId || null;

    // Sent by the Admin console's "Access" button. The cached unlock is dropped
    // here, at mount, rather than trusted to survive in the URL: the canonical
    // path is pushed back over the query string once the board resolves. Both
    // ways into the board — this query param and the /user/workspace/board deep
    // link resolved later — then meet the same lock screen.
    const qRequirePin = params.get('requirePin');
    if (qRequirePin) clearBoardUnlock(qRequirePin);

    if (qBoardId) {
      useBoardStore.getState().setActiveBoard(qBoardId);
      if (qItemId) {
        // Open the panel straight away — TaskDetail renders its own spinner
        // while the item is still loading — but the group/scroll work has to
        // wait for the board's items, so hand the rest to the resolver below.
        pendingItemLink.current = { boardId: qBoardId, itemId: qItemId, updateId: qUpdateId || undefined };
        useBoardStore.getState().setActiveItem(qItemId);
      }
    } else if (qWorkspaceId) {
      useBoardStore.getState().setActiveWorkspace(qWorkspaceId);
      useBoardStore.getState().navigateTo('home');
    }


    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Finish the emailed item link once the board's items are in the store: reveal
  // the item where it actually lives rather than just opening the panel over
  // whatever the grid happens to be showing. The group is read from the item
  // itself, not the URL, so a link still lands correctly on an item that was
  // moved to another group after the email went out.
  useEffect(() => {
    const target = pendingItemLink.current;
    if (!target) return;

    const board = boards.find(b => b.id === target.boardId);
    if (!board?.isDataLoaded) return;

    const item = board.items.find(i => i.id === target.itemId);
    if (!item) {
      // Items are loaded and it isn't among them — deleted or archived since the
      // email was sent. Stop retrying and leave the board open on its own.
      pendingItemLink.current = null;
      return;
    }

    pendingItemLink.current = null;
    const store = useBoardStore.getState();

    // A collapsed group (or a collapsed parent, for a sub-item) means the row
    // isn't in the virtualized list at all, so there'd be nothing to scroll to.
    if (item.groupId && (board.collapsedGroups || []).includes(item.groupId)) {
      store.toggleGroup(board.id, item.groupId);
    }
    if (item.parentId && !(board.expandedItemIds || []).includes(item.parentId)) {
      store.toggleItemExpansion(board.id, item.parentId);
    }

    // Table.tsx watches highlightedItemId and scrolls that row into view.
    store.setActiveItem(target.itemId);
    store.setHighlightedItem(target.itemId);
    // A link to one update inside the item: the panel scrolls to it and flashes it
    if (target.updateId) store.setHighlightedUpdate(target.updateId);
  }, [boards]);

  // 3. Deep Link Resolution (On Initial Data Load ONLY)
  const hasResolvedDeepLink = useRef(false);
  useEffect(() => {
    if (isLoading || boards.length === 0 || hasResolvedDeepLink.current) return;

    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);

    if (parts.length >= 3) {
      const targetWorkspaceSlug = parts[1];
      const targetBoardSlug = parts[2];
      // A deleted board must never be a deep-link target — it stays in local
      // state (is_archived, not removed) so Trash can restore it, but a stale
      // bookmark or a fresh board reusing its old title has no business
      // resurrecting it.
      const liveBoards = boards.filter(b => !b.is_archived);

      const inWorkspace = (b: typeof liveBoards[number]) =>
        slugify(useBoardStore.getState().workspaces.find(w => w.id === b.workspaceId)?.title || '') === targetWorkspaceSlug;

      // New-style slugs end in an 8-hex-char board id — unambiguous even if
      // two boards share a title. Only when the URL has no such suffix
      // (a link shared before this existed) do we fall back to matching by
      // title alone, which is exactly the ambiguous behavior being replaced.
      const targetSuffix = parseBoardSlugSuffix(targetBoardSlug);
      const matchedBoard = targetSuffix
        ? liveBoards.find(b => inWorkspace(b) && shortId(b.id) === targetSuffix)
        : liveBoards.find(b => inWorkspace(b) && slugify(b.title) === targetBoardSlug);

      if (matchedBoard && matchedBoard.id !== activeBoardId) {
        console.log('Deep Link: Found board', matchedBoard.title);
        useBoardStore.getState().setActiveBoard(matchedBoard.id);
      }
    } else if (parts.length === 2) {
      // Handle Workspace direct link: /[username]/[workspace-slug]
      const targetWorkspaceSlug = parts[1];
      const matchedWs = useBoardStore.getState().workspaces.find(w => slugify(w.title) === targetWorkspaceSlug);
      
      if (matchedWs) {
        console.log('Deep Link: Found workspace', matchedWs.title);
        useBoardStore.getState().setActiveWorkspace(matchedWs.id);
        useBoardStore.getState().navigateTo('home');
      }
    }
    hasResolvedDeepLink.current = true;
  }, [isLoading, boards.length]);

  // 4. State -> URL Sync
  useEffect(() => {
    if (isLoading) return;

    if (activePage === 'home') {
      if (window.location.pathname !== '/') {
        window.history.pushState(null, '', '/');
      }
    } else if (activePage === 'notifications') {
      if (window.location.pathname !== '/notifications') {
        window.history.pushState(null, '', '/notifications');
      }
    } else if (activePage === 'admin') {
      if (window.location.pathname !== '/admin') {
        window.history.pushState(null, '', '/admin');
      }
    } else if (activePage === 'dashboard') {
      const workspace = useBoardStore.getState().workspaces.find(w => w.id === activeWorkspaceId);
      const workspaceName = workspace ? slugify(workspace.title) : 'workspace';
      const currentUser = useUserStore.getState().currentUser;
      const username = currentUser ? slugify(currentUser.name) : 'u';
      const newPath = `/${username}/${workspaceName}/dashboard`;
      if (window.location.pathname !== newPath) {
        window.history.pushState(null, '', newPath);
      }
    } else if (activePage === 'board' && activeBoard) {
      const workspace = useBoardStore.getState().workspaces.find(w => w.id === activeBoard.workspaceId);
      const workspaceName = workspace ? slugify(workspace.title) : 'workspace';

      const currentUser = useUserStore.getState().currentUser;
      const username = currentUser ? slugify(currentUser.name) : 'u';

      // Bare title unless another live board in this workspace has the same one.
      const boardName = boardPathSegment(
        activeBoard,
        boards.filter(b => !b.is_archived && b.workspaceId === activeBoard.workspaceId)
      );

      const newPath = `/${username}/${workspaceName}/${boardName}`;

      if (window.location.pathname !== newPath) {
        // The same board under an older, longer link (`name--id`): tidy the
        // address in place rather than adding a history entry for it.
        const currentSegment = window.location.pathname.split('/').filter(Boolean)[2] || '';
        const sameBoard = parseBoardSlugSuffix(currentSegment) === shortId(activeBoard.id);
        window.history[sameBoard ? 'replaceState' : 'pushState'](null, '', newPath);
      }
    }
  }, [activePage, activeBoardId, activeBoard, isLoading, boards]);

  useEffect(() => {
    if (activeWorkspaceId) {
      subscribeToRealtime();

      // Polling Fallback to ensure consistency (5m) - running silently
      const intervalId = setInterval(() => {
        if (!document.hidden) {
          loadUserData(true);
        }
      }, 300000);

      // A tab left in the background (or a laptop closed overnight) can come back
      // to a board other people have changed in the meantime, and the realtime
      // events for those changes may never have arrived. Coming back after a
      // minute or more re-reads the open board, so nobody edits on top of a stale
      // copy — the way a group someone had just renamed got renamed over again
      // from a screen still showing its old name.
      let hiddenAt: number | null = document.hidden ? Date.now() : null;
      const onVisibilityChange = () => {
        if (document.hidden) { hiddenAt = Date.now(); return; }
        const away = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = null;
        if (away < 60000) return;
        loadUserData(true);
        const { activeBoardId: openBoardId, loadBoardData } = useBoardStore.getState();
        if (openBoardId) void loadBoardData(openBoardId, false, true);
      };
      document.addEventListener('visibilitychange', onVisibilityChange);

      return () => {
        unsubscribeFromRealtime();
        clearInterval(intervalId);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    }
    return () => unsubscribeFromRealtime();
  }, [activeWorkspaceId]);

  if (isLoading) {
    return <LoadingScreen message="Loading your workspace..." />;
  }

  // Phones get their own layout over the same store; everything above (data
  // loading, realtime, deep links, the URL) is shared with the desktop one.
  if (isMobile) {
    return (
      <>
        <Suspense fallback={<PageLoader />}>
          <MobileApp />
        </Suspense>
        <UndoToastHost />
      </>
    );
  }

  return (
    <div className="app-container" style={{ height: '100vh', display: 'flex', backgroundColor: 'hsl(var(--color-bg))', borderRadius: '8px', overflow: 'hidden' }}>
      <Sidebar />
      <main className="app-main" style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: 'hsl(var(--color-bg-surface))',
          // A rounded corner alone can't read as "floating" when the panel is
          // flush to the browser edge on every other side — there's nothing
          // behind it for a shadow to fall onto. A small gap on top/right/
          // bottom exposes app-container's own background there, so all four
          // corners are genuinely rounded and the shadow below has a surface
          // to actually cast onto. The left edge has no gap (it meets the
          // sidebar directly), but both left corners still round off into the
          // backdrop, the same way the top-left always has.
          margin: '10px 10px 10px 0',
          borderRadius: '20px',
          // Two shadows: one resting below (the usual "raised card" cue) and
          // one bleeding left onto the sidebar, since that edge has no gap of
          // its own to carry a shadow. The previous 0.03-opacity version was
          // essentially invisible.
          boxShadow: '0 6px 24px rgba(0,0,0,0.10), -6px 0 20px rgba(0,0,0,0.05)'
      }}>
        {activePage !== 'board' && <TopBar />}

        {activePage === 'admin' ? (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
            <Suspense fallback={<PageLoader />}>
              <AdminPage />
            </Suspense>
          </div>
        ) : activePage === 'notifications' ? (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Suspense fallback={<PageLoader />}>
              <NotificationPage />
            </Suspense>
          </div>
        ) : activePage === 'favorites' ? (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Suspense fallback={<PageLoader />}>
              <FavoritesPage />
            </Suspense>
          </div>
        ) : activePage === 'dashboard' ? (
          <Suspense fallback={<PageLoader />}>
            <WorkspaceDashboardPage />
          </Suspense>
        ) : activePage === 'board' && activeBoard ? (

          <Suspense fallback={<PageLoader />}>
            <BoardPage />
          </Suspense>
        ) : (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Suspense fallback={<PageLoader />}>
              <HomePage />
            </Suspense>
          </div>
        )}

        {/* Task Detail Side Panel */}
        <SidePanel isOpen={!!activeItemId} onClose={() => setActiveItem(null)}>
          {activeItemId && <TaskDetail itemId={activeItemId} onClose={() => setActiveItem(null)} />}
        </SidePanel>

        {/* BatchActionsBar moved to BoardPage */}

      </main>
      <ContactSupportButton />
      <MobileLayoutPill />
      <UndoToastHost />
    </div>
  )
}

function AppContent() {
  const { session, loading } = useAuth();
  const currentUser = useUserStore(state => state.currentUser);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <LoginPage />;
  }

  if (window.location.pathname === '/set-password') {
    return <SetPasswordPage />;
  }

  if (window.location.pathname === '/reset-password') {
    return <ResetPasswordPage />;
  }

  const isAutoApproved = isAllowedDomain(currentUser?.email) && !createdViaMicrosoft(session?.user);

  // Deactivation outranks the approval check and the auto-approved domains alike:
  // it is how someone who has left is shut out, so no domain gets them back in.
  if (currentUser && currentUser.is_active === false) {
    return <DeactivatedAccountPage onSignOut={() => supabase.auth.signOut()} />;
  }

  // Only check approval if the user isn't the super admin and not from an auto-approved domain
  if (currentUser && currentUser.is_approved === false && currentUser.email !== 'khemmarin.k@naraihospitality.com' && !isAutoApproved) {
    return <PendingApprovalPage onSignOut={() => supabase.auth.signOut()} />;
  }

  return <MainApp />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
