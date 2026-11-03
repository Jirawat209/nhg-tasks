// Stands in for supabase.functions.invoke(...) against the five edge
// functions this app calls (supabase/functions/*). No network calls, no real
// email/AI providers — just enough behavior for each UI flow to visibly work.

import { mockDb } from './mockDb';

function fnError(message: string) {
    return { message, context: { json: async () => ({ error: message }) } };
}

function genId() {
    return crypto.randomUUID();
}

function handleBoardPin(body: any) {
    const boards = mockDb.get('boards');
    const board = boards.find((b: any) => b.id === body.boardId);
    if (!board) return { data: null, error: fnError('Board not found') };

    switch (body.action) {
        case 'set_pin': {
            if (body.enable) {
                board.pin = body.pin;
                board.is_private = true;
            } else {
                board.pin = null;
                board.is_private = false;
            }
            mockDb.set('boards', boards);
            return { data: { success: true }, error: null };
        }
        case 'verify_pin': {
            if (!board.pin || board.pin === body.pin) {
                return { data: { success: true }, error: null };
            }
            return { data: { success: false, remainingAttempts: 4, error: 'Incorrect PIN.' }, error: null };
        }
        case 'request_pin_reset_otp': {
            console.log('[mock board-pin] "Sent" a reset OTP for board', body.boardId, '(any 6-digit code will be accepted).');
            return { data: { success: true, maskedEmail: 'o***@demo.local' }, error: null };
        }
        case 'confirm_pin_reset': {
            board.pin = body.newPin;
            board.is_private = true;
            mockDb.set('boards', boards);
            return { data: { success: true }, error: null };
        }
        default:
            return { data: { success: true }, error: null };
    }
}

export const mockFunctions = {
    async invoke(name: string, opts?: { body?: any }) {
        const body = opts?.body || {};
        try {
            switch (name) {
                case 'admin-create-user': {
                    const profiles = mockDb.get('profiles');
                    if (profiles.some((p: any) => p.email === body.email)) {
                        return { data: null, error: fnError('A user with this email already exists') };
                    }
                    const id = genId();
                    profiles.push({
                        id, email: body.email, full_name: body.fullName,
                        system_role: body.role || 'user', auth_type: body.authType || 'internal',
                        is_active: true, is_approved: true, avatar_url: null,
                        created_at: new Date().toISOString()
                    });
                    mockDb.set('profiles', profiles);
                    return { data: { userId: id, success: true }, error: null };
                }

                case 'invite-user': {
                    if (body.action === 'forgot_password') {
                        console.log('[mock invite-user] Password reset "sent" to', body.email);
                        return { data: { success: true }, error: null };
                    }
                    if (body.action === 'access_granted') {
                        return { data: { success: true }, error: null };
                    }
                    const profiles = mockDb.get('profiles');
                    const existing = profiles.find((p: any) => p.email === body.email);
                    if (existing) return { data: { success: true, userId: existing.id }, error: null };

                    const id = genId();
                    profiles.push({
                        id, email: body.email, full_name: body.email.split('@')[0],
                        system_role: 'user', auth_type: 'internal', is_active: true,
                        is_approved: true, avatar_url: null, created_at: new Date().toISOString()
                    });
                    mockDb.set('profiles', profiles);
                    console.log('[mock invite-user] Invite "sent" to', body.email);
                    return { data: { success: true, userId: id }, error: null };
                }

                case 'test-smtp': {
                    console.log('[mock test-smtp] No real email sent in local demo mode:', body);
                    return { data: { success: true, message: 'Mock SMTP: no real email sent in local demo.' }, error: null };
                }

                case 'ai-summary': {
                    const title = body?.boardTitle || body?.title || 'this board';
                    const itemCount = Array.isArray(body?.items) ? body.items.length : undefined;
                    const summary = typeof itemCount === 'number'
                        ? `Local demo summary for ${title}: ${itemCount} item(s) reviewed for the selected period. This is a canned response — no real AI model was called.`
                        : `Local demo summary for ${title}: activity looks steady with a mix of in-progress and completed tasks. This is a canned response — no real AI model was called.`;
                    return { data: { summary }, error: null };
                }

                case 'board-pin':
                    return handleBoardPin(body);

                default:
                    return { data: { success: true }, error: null };
            }
        } catch (e: any) {
            return { data: null, error: fnError(e?.message || String(e)) };
        }
    }
};
