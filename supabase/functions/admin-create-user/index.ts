import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROLE_HIERARCHY: Record<string, number> = {
  user: 1,
  it_admin: 2,
  super_admin: 3
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status
  });
}

function wrapEmail(bodyContent: string) {
  return `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="https://guideline.lubd.com/wp-content/uploads/2025/11/NHG128-1.png" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;">${bodyContent}</div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`;
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

    // Re-verify the caller's own permissions server-side — never trust that
    // the client-side Admin Console gate was actually respected, since this
    // function is reachable by anyone holding a valid session.
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(jwt);
    if (!caller) throw new Error('Not authenticated');

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('system_role')
      .eq('id', caller.id)
      .single();

    const callerRole = callerProfile?.system_role ?? 'user';
    if (callerRole !== 'it_admin' && callerRole !== 'super_admin') {
      throw new Error('Only admins can create users');
    }

    const { email, fullName, role, authType, redirectOrigin } = await req.json();

    if (!email || !EMAIL_RE.test(email)) throw new Error('A valid email is required');
    if (!fullName?.trim()) throw new Error('Full name is required');
    if (!ROLE_HIERARCHY[role]) throw new Error('Invalid role');
    if (authType !== 'google' && authType !== 'internal') throw new Error('Invalid authentication type');

    // An it_admin may not hand out a role equal to or above their own.
    if (ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[callerRole] && callerRole !== 'super_admin') {
      throw new Error("You don't have permission to assign this role");
    }

    const origin = redirectOrigin || 'https://saturdaycom.vercel.app';
    let newUserId: string;
    let subject: string;
    let bodyHtml: string;

    if (authType === 'google') {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });
      if (error) {
        if (error.message?.toLowerCase().includes('already')) {
          throw new Error('A user with this email already exists');
        }
        throw error;
      }
      newUserId = data.user.id;

      subject = "Your NHG Tasks account is ready";
      bodyHtml = wrapEmail(`<p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 24px;">An account has been created for you on <strong>NHG Tasks</strong>. Sign in with <strong>Continue with Google</strong> using this email address (<strong>${email}</strong>).</p><a href="${origin}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">Go to NHG Tasks</a>`);
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo: `${origin}/set-password`,
          data: { full_name: fullName }
        }
      });
      if (error) {
        if (error.message?.toLowerCase().includes('already')) {
          throw new Error('A user with this email already exists');
        }
        throw error;
      }
      if (!data?.properties?.action_link || !data.user?.id) {
        throw new Error('Failed to generate setup link');
      }
      newUserId = data.user.id;

      subject = "Set up your NHG Tasks account";
      bodyHtml = wrapEmail(`<p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 24px;">An account has been created for you on <strong>NHG Tasks</strong>. Click below to set your password and get started.</p><a href="${data.properties.action_link}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">Set up your password</a>`);
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUserId,
        email,
        full_name: fullName,
        system_role: role,
        is_approved: true,
        auth_type: authType
      }, { onConflict: 'id' });
    if (profileError) throw profileError;

    // Best-effort welcome email — the account is already fully provisioned
    // either way, so a missing/broken SMTP config shouldn't fail creation.
    try {
      const { data: settingsData } = await supabaseAdmin
        .from('system_settings')
        .select('value')
        .eq('key', 'smtp_config')
        .maybeSingle();

      const smtpConfig = settingsData?.value;
      if (smtpConfig?.host) {
        const transporter = nodemailer.createTransport({
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          auth: { user: smtpConfig.user, pass: smtpConfig.password },
          tls: { rejectUnauthorized: false }
        });
        await transporter.sendMail({
          from: `"${smtpConfig.fromName || 'NHG Tasks'}" <${smtpConfig.fromEmail || smtpConfig.user}>`,
          to: email,
          subject,
          html: bodyHtml
        });
      } else {
        console.warn('admin-create-user: SMTP not configured, skipping welcome email');
      }
    } catch (emailError) {
      console.error('admin-create-user: failed to send welcome email:', emailError);
    }

    return jsonResponse({ userId: newUserId, authType });

  } catch (error) {
    console.error('admin-create-user error:', error);
    return jsonResponse({ error: error.message || 'An unexpected error occurred' }, 400);
  }
});
