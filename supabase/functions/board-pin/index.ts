import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PIN_REGEX = /^\d{6}$/;
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;
const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

const DEFAULT_PIN_RESET_TEMPLATE = `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="https://guideline.lubd.com/wp-content/uploads/2025/11/NHG128-1.png" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 20px;">You requested to reset the PIN for the private board <strong>{{boardName}}</strong>.</p><div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1e293b; background-color: #f8fafc; padding: 16px; border-radius: 6px; margin-bottom: 20px;">{{otpCode}}</div><p style="font-size: 13px; color: #94a3b8;">This code expires in {{expiryMinutes}} minutes. If you didn't request this, you can ignore this email.</p></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomDigits(length: number): string {
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values).map(n => (n % 10).toString()).join('');
}

async function hashWithSalt(value: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${value}`);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(jwt);
    if (!user) throw new Error('Not authenticated');

    const { action, boardId, pin, otp, newPin, enable } = await req.json();
    if (!boardId) throw new Error('boardId is required');

    const { data: board } = await supabaseAdmin
      .from('boards')
      .select('id, title, workspace_id')
      .eq('id', boardId)
      .single();
    if (!board) throw new Error('Board not found');

    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('owner_id')
      .eq('id', board.workspace_id)
      .single();

    let callerRole = 'viewer';
    if (workspace?.owner_id === user.id) {
      callerRole = 'owner';
    } else {
      const { data: member } = await supabaseAdmin
        .from('board_members')
        .select('role')
        .eq('board_id', boardId)
        .eq('user_id', user.id)
        .single();
      if (member?.role) callerRole = member.role;
    }
    const isOwner = callerRole === 'owner';

    if (action === 'set_pin') {
      if (!isOwner) throw new Error('Only the board owner can manage the PIN');

      if (enable === false) {
        await supabaseAdmin.from('board_pins').delete().eq('board_id', boardId);
        await supabaseAdmin.from('boards').update({ is_private: false }).eq('id', boardId);
        return jsonResponse({ success: true });
      }

      if (!PIN_REGEX.test(pin ?? '')) throw new Error('PIN must be exactly 6 digits');

      const salt = randomHex(16);
      const pinHash = await hashWithSalt(pin, salt);
      await supabaseAdmin.from('board_pins').upsert({
        board_id: boardId,
        pin_hash: pinHash,
        pin_salt: salt,
        failed_attempts: 0,
        locked_until: null,
        set_by: user.id,
        updated_at: new Date().toISOString()
      });
      await supabaseAdmin.from('boards').update({ is_private: true }).eq('id', boardId);
      return jsonResponse({ success: true });
    }

    if (action === 'verify_pin') {
      const { data: row } = await supabaseAdmin
        .from('board_pins')
        .select('*')
        .eq('board_id', boardId)
        .single();
      if (!row) throw new Error('This board is not private');

      // Break-glass access. A master PIN opens any private board without the
      // board's own PIN. It lives in the BOARD_MASTER_PIN secret and is compared
      // here, server-side: it is never sent to the browser and never appears in
      // the client bundle, so it cannot be read out of the shipped JavaScript.
      //
      // Deliberately ahead of the lockout check below — a board that someone
      // else has locked with wrong guesses must still be reachable.
      const masterPin = Deno.env.get('BOARD_MASTER_PIN') ?? '';
      if (masterPin && pin === masterPin) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('system_role')
          .eq('id', user.id)
          .single();

        // Restricted to super admins on purpose. Ungated, the master PIN would
        // open every private board for any account that ever learned it — a
        // weaker position than the per-board PINs it is meant to override. To
        // anyone else it has to look like an ordinary wrong PIN, so this returns
        // the same shape as a failure rather than admitting a master PIN exists.
        if (profile?.system_role !== 'super_admin') {
          return jsonResponse({ success: false, error: 'Incorrect PIN.' });
        }

        // Break-glass use leaves a trail. The result is checked rather than
        // thrown on: a rejected audit row must never be the reason an admin
        // cannot get into a board.
        const { error: auditError } = await supabaseAdmin.from('activity_logs').insert({
          actor_id: user.id,
          action_type: 'board_master_pin_used',
          target_type: 'board',
          target_id: boardId,
          metadata: { board_title: board.title }
        });
        if (auditError) console.error('Master PIN audit log failed', auditError);

        return jsonResponse({ success: true });
      }

      if (row.locked_until && new Date(row.locked_until) > new Date()) {
        const remainingSeconds = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1000);
        return jsonResponse({ success: false, locked: true, remainingSeconds });
      }

      if (!PIN_REGEX.test(pin ?? '')) {
        return jsonResponse({ success: false, error: 'Invalid PIN format' }, 400);
      }

      const candidateHash = await hashWithSalt(pin, row.pin_salt);
      if (candidateHash === row.pin_hash) {
        await supabaseAdmin.from('board_pins').update({ failed_attempts: 0, locked_until: null }).eq('board_id', boardId);
        return jsonResponse({ success: true });
      }

      const attempts = row.failed_attempts + 1;
      if (attempts >= MAX_PIN_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
        await supabaseAdmin.from('board_pins').update({ failed_attempts: 0, locked_until: lockedUntil }).eq('board_id', boardId);
        return jsonResponse({ success: false, locked: true, remainingSeconds: LOCKOUT_MINUTES * 60 });
      }

      await supabaseAdmin.from('board_pins').update({ failed_attempts: attempts }).eq('board_id', boardId);
      return jsonResponse({ success: false, remainingAttempts: MAX_PIN_ATTEMPTS - attempts });
    }

    if (action === 'request_pin_reset_otp') {
      if (!isOwner) throw new Error('Only the board owner can reset the PIN');
      if (!user.email) throw new Error('Owner has no email on file');

      const otpCode = randomDigits(6);
      const salt = randomHex(16);
      const otpHash = `${salt}:${await hashWithSalt(otpCode, salt)}`;
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000).toISOString();

      await supabaseAdmin.from('board_pin_reset_otps').delete().eq('board_id', boardId);
      await supabaseAdmin.from('board_pin_reset_otps').insert({
        board_id: boardId,
        otp_hash: otpHash,
        expires_at: expiresAt,
        attempts: 0
      });

      const { data: settingsData } = await supabaseAdmin
        .from('system_settings')
        .select('key, value')
        .in('key', ['smtp_config', 'pin_reset_otp_template']);

      const smtpConfig = settingsData?.find(s => s.key === 'smtp_config')?.value;
      if (!smtpConfig?.host) throw new Error('SMTP configuration is missing or incomplete in system_settings');

      const template = settingsData?.find(s => s.key === 'pin_reset_otp_template')?.value || {
        subject: 'Your PIN reset code for {{boardName}}',
        bodyHtml: DEFAULT_PIN_RESET_TEMPLATE
      };

      const vars: Record<string, string> = {
        otpCode,
        boardName: board.title,
        expiryMinutes: String(OTP_EXPIRY_MINUTES)
      };
      const fill = (text: string) =>
        Object.entries(vars).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v), text);

      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: { user: smtpConfig.user, pass: smtpConfig.password },
        tls: { rejectUnauthorized: false }
      });

      await transporter.sendMail({
        from: `"${smtpConfig.fromName || 'NHG Tasks'}" <${smtpConfig.fromEmail || smtpConfig.user}>`,
        to: user.email,
        subject: fill(template.subject),
        html: fill(template.bodyHtml)
      });

      return jsonResponse({ success: true, maskedEmail: maskEmail(user.email) });
    }

    if (action === 'confirm_pin_reset') {
      if (!isOwner) throw new Error('Only the board owner can reset the PIN');

      const { data: row } = await supabaseAdmin
        .from('board_pin_reset_otps')
        .select('*')
        .eq('board_id', boardId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!row) throw new Error('No pending PIN reset request. Please request a new code.');

      if (new Date(row.expires_at) < new Date()) {
        await supabaseAdmin.from('board_pin_reset_otps').delete().eq('id', row.id);
        throw new Error('This code has expired. Please request a new one.');
      }

      if (row.attempts >= MAX_OTP_ATTEMPTS) {
        await supabaseAdmin.from('board_pin_reset_otps').delete().eq('id', row.id);
        throw new Error('Too many incorrect attempts. Please request a new code.');
      }

      const [storedSalt, storedHash] = String(row.otp_hash).split(':');
      const candidateHash = await hashWithSalt(otp ?? '', storedSalt);
      if (candidateHash !== storedHash) {
        await supabaseAdmin.from('board_pin_reset_otps').update({ attempts: row.attempts + 1 }).eq('id', row.id);
        throw new Error('Incorrect code. Please try again.');
      }

      if (!PIN_REGEX.test(newPin ?? '')) throw new Error('PIN must be exactly 6 digits');

      const salt = randomHex(16);
      const pinHash = await hashWithSalt(newPin, salt);
      await supabaseAdmin.from('board_pins').upsert({
        board_id: boardId,
        pin_hash: pinHash,
        pin_salt: salt,
        failed_attempts: 0,
        locked_until: null,
        set_by: user.id,
        updated_at: new Date().toISOString()
      });
      await supabaseAdmin.from('boards').update({ is_private: true }).eq('id', boardId);
      await supabaseAdmin.from('board_pin_reset_otps').delete().eq('id', row.id);

      return jsonResponse({ success: true });
    }

    throw new Error('Unknown action');

  } catch (error) {
    console.error('board-pin Edge Function Error:', error);
    return jsonResponse({ error: error.message || 'An unexpected error occurred' }, 400);
  }
});
