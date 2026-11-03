// Local-only auth stand-in. There is no real identity provider: signing in
// with the email form always succeeds (any email/password) and logs you in
// as the seeded demo super-admin profile, so the app is usable immediately.

import { mockDb, type Row } from './mockDb';

const SESSION_KEY = 'saturday_mock_session_v1';

type AuthListener = (event: string, session: any) => void;

function buildUser(profile: Row) {
    return {
        id: profile.id,
        email: profile.email,
        user_metadata: { full_name: profile.full_name, avatar_url: profile.avatar_url },
        app_metadata: { provider: 'email' },
        aud: 'authenticated',
        created_at: profile.created_at
    };
}

function buildSession(profile: Row) {
    return {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: buildUser(profile)
    };
}

function loadSession(): any | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveSession(session: any | null) {
    try {
        if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        else localStorage.removeItem(SESSION_KEY);
    } catch {
        /* ignore */
    }
}

function defaultProfile(): Row {
    const profiles = mockDb.get('profiles');
    return profiles.find(p => p.system_role === 'super_admin') || profiles[0];
}

// A session saved before the demo data was reseeded points at a profile that
// no longer exists; the app then creates a fresh, unapproved profile for it and
// shows "Account Pending Approval". Only keep a session whose profile is an
// approved one, and otherwise re-attach it to the demo admin.
function restoreSession(): any | null {
    const saved = loadSession();
    if (!saved) return null;
    const profile = mockDb.get('profiles').find(p => p.id === saved.user?.id && p.is_approved === true);
    // Rebuilt from the profile either way, so name/avatar changes show after a reload
    const healed = buildSession(profile || defaultProfile());
    saveSession(healed);
    return healed;
}

let currentSession: any | null = restoreSession();
const listeners: { id: number; cb: AuthListener }[] = [];
let nextListenerId = 0;

function notify(event: string) {
    listeners.forEach(l => l.cb(event, currentSession));
}

export const mockAuth = {
    async getSession() {
        return { data: { session: currentSession }, error: null };
    },
    async getUser() {
        return { data: { user: currentSession?.user ?? null }, error: null };
    },
    onAuthStateChange(cb: AuthListener) {
        const id = ++nextListenerId;
        listeners.push({ id, cb });
        setTimeout(() => cb(currentSession ? 'INITIAL_SESSION' : 'SIGNED_OUT', currentSession), 0);
        return {
            data: {
                subscription: {
                    unsubscribe: () => {
                        const idx = listeners.findIndex(l => l.id === id);
                        if (idx >= 0) listeners.splice(idx, 1);
                    }
                }
            }
        };
    },
    async signInWithPassword(_credentials: { email: string; password: string }) {
        const profile = defaultProfile();
        currentSession = buildSession(profile);
        saveSession(currentSession);
        notify('SIGNED_IN');
        return { data: { session: currentSession, user: currentSession.user }, error: null };
    },
    async signInWithOAuth(_opts: any) {
        return {
            data: null,
            error: { message: 'OAuth sign-in is not available in this local demo. Use the email form instead — any email and password will work.' }
        };
    },
    async signOut() {
        currentSession = null;
        saveSession(null);
        notify('SIGNED_OUT');
        return { error: null };
    },
    async updateUser(update: { data?: Record<string, any>; email?: string; password?: string }) {
        if (!currentSession) return { data: { user: null }, error: { message: 'Not authenticated' } };
        if (update.data) currentSession.user.user_metadata = { ...currentSession.user.user_metadata, ...update.data };
        if (update.email) currentSession.user.email = update.email;
        saveSession(currentSession);
        notify('USER_UPDATED');
        return { data: { user: currentSession.user }, error: null };
    }
};
