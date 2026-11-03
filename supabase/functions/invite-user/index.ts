import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Values typed into an item reach the email body, so they are escaped first.
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const {
      email,
      userId,       // For mention: look up email from userId
      redirectTo,
      workspaceName = 'NHG Tasks',
      inviterName = 'A Team Member',
      action = 'invite', // 'invite' | 'assign_item' | 'test_email' | 'mention' | 'status_update' | 'due_date_reminder' | 'comment' | 'like' | 'item_change' | 'forgot_password' | 'access_granted'
      itemName = '',
      boardName = '',
      groupName = '',
      mentionedBy = '',
      updatePreview = '',
      oldStatus = '',
      newStatus = '',
      dueLabel = '',
      commenterName = '',
      likerName = '',
      changeSummary = '',   // item_change: one line saying which field changed, from what, to what
      itemLink = 'https://saturdaycom.vercel.app',
      // access_granted covers both boards and workspaces, so the subject of the
      // grant is passed generically rather than as boardName/workspaceName.
      targetType = 'board',
      targetName = '',
      role = '',
      accessLink = 'https://saturdaycom.vercel.app'
    } = await req.json();

    // For mention action, resolve email from userId first (email field is not sent)
    let resolvedEmail = email;
    if (action === 'mention' && !resolvedEmail && userId) {
      const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userErr || !userData?.user?.email) throw new Error('Could not resolve user email for mention notification');
      resolvedEmail = userData.user.email;
    }

    if (!resolvedEmail) {
      throw new Error('Email is required');
    }

    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from('system_settings')
      .select('key, value')
      .in('key', ['smtp_config', 'invite_email_template', 'invite_existing_user_template', 'assign_item_template', 'mention_email_template', 'status_update_email_template', 'due_date_reminder_email_template', 'comment_email_template', 'like_email_template', 'reset_password_email_template', 'access_granted_email_template']);

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      throw new Error('Failed to fetch email settings from DB');
    }

    const smtpConfig = settingsData?.find(s => s.key === 'smtp_config')?.value;
    const templateNew = settingsData?.find(s => s.key === 'invite_email_template')?.value;
    const templateExisting = settingsData?.find(s => s.key === 'invite_existing_user_template')?.value;
    const templateAssign = settingsData?.find(s => s.key === 'assign_item_template')?.value;
    const templateMention = settingsData?.find(s => s.key === 'mention_email_template')?.value;
    const templateStatusUpdate = settingsData?.find(s => s.key === 'status_update_email_template')?.value;
    const templateDueDateReminder = settingsData?.find(s => s.key === 'due_date_reminder_email_template')?.value;
    const templateComment = settingsData?.find(s => s.key === 'comment_email_template')?.value;
    const templateLike = settingsData?.find(s => s.key === 'like_email_template')?.value;
    const templateAccessGranted = settingsData?.find(s => s.key === 'access_granted_email_template')?.value;
    const templateResetPassword = settingsData?.find(s => s.key === 'reset_password_email_template')?.value || {
      subject: 'Reset your NHG Tasks password',
      bodyHtml: `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="https://guideline.lubd.com/wp-content/uploads/2025/11/NHG128-1.png" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 24px;">We received a request to reset the password for your NHG Tasks account. Click below to choose a new password. If you didn't request this, you can safely ignore this email.</p><a href="{{resetLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">Reset Password</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`
    };

    if (!smtpConfig || !smtpConfig.host) {
      throw new Error('SMTP Configuration is missing or incomplete in system_settings');
    }

    let actionLink = redirectTo || 'https://saturdaycom.vercel.app';
    let isNewUser = false;
    let finalTemplate;
    let returnedUserId = null;

    if (action === 'test_email') {
      finalTemplate = {
        subject: 'SMTP Connection Test Success',
        bodyHtml: `<p>Hello!</p><p>If you see this email, it means your SMTP configuration in <b>{{workspaceName}}</b> is working correctly.</p><p>Sent to: ${resolvedEmail}</p>`
      };
    } else if (action === 'mention') {
      finalTemplate = templateMention || {
        subject: '{{mentionedBy}} mentioned you in {{itemName}}',
        bodyHtml: `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="https://guideline.lubd.com/wp-content/uploads/2025/11/NHG128-1.png" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 16px;"><strong>{{mentionedBy}}</strong> mentioned you in <strong>{{itemName}}</strong> on board <strong>{{boardName}}</strong>.</p><div style="background-color: #f8fafc; border-left: 3px solid #a86315; padding: 12px 16px; margin: 0 0 20px; text-align: left; border-radius: 0 4px 4px 0;"><p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.6; font-style: italic;">"{{updatePreview}}"</p></div><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Update</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`
      };
    } else if (action === 'status_update') {
      finalTemplate = templateStatusUpdate || {
        subject: '{{inviterName}} changed the status of {{itemName}}',
        bodyHtml: `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="https://guideline.lubd.com/wp-content/uploads/2025/11/NHG128-1.png" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 16px;"><strong>{{inviterName}}</strong> changed the status of <strong>{{itemName}}</strong> on board <strong>{{boardName}}</strong>.</p><div style="background-color: #f8fafc; padding: 12px 16px; margin: 0 0 20px; text-align: center; border-radius: 4px;"><span style="font-size: 13px; color: #94a3b8; text-decoration: line-through;">{{oldStatus}}</span><span style="font-size: 15px; color: #1e293b; font-weight: bold; margin-left: 8px;">→ {{newStatus}}</span></div><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Item</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`
      };
    } else if (action === 'due_date_reminder') {
      finalTemplate = templateDueDateReminder || {
        subject: '{{itemName}} is {{dueLabel}}',
        bodyHtml: `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="https://guideline.lubd.com/wp-content/uploads/2025/11/NHG128-1.png" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 16px;"><strong>{{itemName}}</strong> on board <strong>{{boardName}}</strong> is <strong>{{dueLabel}}</strong>.</p><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Item</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`
      };
    } else if (action === 'comment') {
      finalTemplate = templateComment || {
        subject: '{{commenterName}} commented on {{itemName}}',
        bodyHtml: `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="https://guideline.lubd.com/wp-content/uploads/2025/11/NHG128-1.png" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 16px;"><strong>{{commenterName}}</strong> commented on <strong>{{itemName}}</strong> on board <strong>{{boardName}}</strong>.</p><div style="background-color: #f8fafc; border-left: 3px solid #a86315; padding: 12px 16px; margin: 0 0 20px; text-align: left; border-radius: 0 4px 4px 0;"><p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.6; font-style: italic;">"{{updatePreview}}"</p></div><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Update</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`
      };
    } else if (action === 'item_change') {
      finalTemplate = {
        subject: '{{inviterName}} updated {{itemName}}',
        bodyHtml: `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="https://guideline.lubd.com/wp-content/uploads/2025/11/NHG128-1.png" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 16px;"><strong>{{inviterName}}</strong> updated <strong>{{itemName}}</strong> on board <strong>{{boardName}}</strong>.</p><div style="background-color: #f8fafc; border-left: 3px solid #a86315; padding: 12px 16px; margin: 0 0 20px; text-align: left; border-radius: 0 4px 4px 0;"><p style="font-size: 14px; color: #334155; margin: 0; line-height: 1.6;">{{changeSummary}}</p></div><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Task</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`
      };
    } else if (action === 'like') {
      finalTemplate = templateLike || {
        subject: '{{likerName}} liked your update on {{itemName}}',
        bodyHtml: `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="https://guideline.lubd.com/wp-content/uploads/2025/11/NHG128-1.png" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 24px;"><strong>{{likerName}}</strong> liked your update on <strong>{{itemName}}</strong> on board <strong>{{boardName}}</strong>.</p><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Update</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`
      };
    } else if (action === 'access_granted') {
      finalTemplate = templateAccessGranted || {
        subject: '{{inviterName}} added you to {{targetName}}',
        bodyHtml: `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="https://guideline.lubd.com/wp-content/uploads/2025/11/NHG128-1.png" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 16px;"><strong>{{inviterName}}</strong> gave you access to the {{targetType}} <strong>{{targetName}}</strong> in <strong>{{workspaceName}}</strong>.</p><div style="background-color: #f8fafc; padding: 12px 16px; margin: 0 0 20px; text-align: center; border-radius: 4px;"><span style="font-size: 13px; color: #94a3b8;">Your role</span><span style="font-size: 15px; color: #1e293b; font-weight: bold; margin-left: 8px;">{{role}}</span></div><a href="{{accessLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">Open {{targetType}}</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`
      };
    } else if (action === 'forgot_password') {
      // Only Internal-type accounts have a password to reset — Google
      // accounts authenticate via OAuth and never see this flow client-side,
      // but the check has to happen server-side too since this function has
      // no caller-auth gate and is reachable by anyone from the login page.
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, auth_type')
        .eq('email', resolvedEmail)
        .maybeSingle();

      if (!targetProfile) {
        // Don't reveal whether the email exists — same generic response as a
        // real send, just skip actually sending anything.
        return new Response(
          JSON.stringify({ message: 'If this email is registered, a reset link has been sent.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
      if (targetProfile.auth_type !== 'internal') {
        return new Response(
          JSON.stringify({ error: 'GOOGLE_ACCOUNT' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: resolvedEmail,
        options: { redirectTo: actionLink }
      });
      if (linkError) throw linkError;
      if (!linkData?.properties?.action_link) throw new Error('Failed to generate reset link');

      actionLink = linkData.properties.action_link;
      finalTemplate = templateResetPassword;
    } else if (action === 'assign_item') {
      finalTemplate = templateAssign;
      // Get the existing user's ID
      const { data: userRecord } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = userRecord?.users?.find(u => u.email === email);
      if (existingUser) returnedUserId = existingUser.id;
    } else {
      // Standard Workspace/Board Invite
      finalTemplate = templateNew;
      
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: { redirectTo: actionLink }
      });

      if (linkError) {
        const errorMsg = linkError.message?.toLowerCase() || '';
        if (errorMsg.includes('user already registered') || errorMsg.includes('already exists')) {
          actionLink = redirectTo || 'https://saturdaycom.vercel.app';
          finalTemplate = templateExisting || templateNew; 
          
          const { data: userRecord } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = userRecord?.users?.find(u => u.email === email);
          if (existingUser) returnedUserId = existingUser.id;
        } else {
          throw linkError;
        }
      } else if (linkData?.properties?.action_link) {
        actionLink = linkData.properties.action_link;
        isNewUser = true;
        returnedUserId = linkData.user?.id || null;
      }
    }

    let subject = finalTemplate?.subject || `Notification from ${workspaceName}`;
    let htmlBody = finalTemplate?.bodyHtml || `<p>Please visit: <a href="{{inviteLink}}">Link</a></p>`;

    // Replace Variables with correct regex (matching exactly `{{varName}}`)
    subject = subject.replace(/\{\{workspaceName\}\}/g, workspaceName)
                     .replace(/\{\{inviterName\}\}/g, inviterName)
                     .replace(/\{\{itemName\}\}/g, itemName)
                     .replace(/\{\{boardName\}\}/g, boardName)
                     .replace(/\{\{groupName\}\}/g, groupName)
                     .replace(/\{\{mentionedBy\}\}/g, mentionedBy)
                     .replace(/\{\{oldStatus\}\}/g, oldStatus)
                     .replace(/\{\{newStatus\}\}/g, newStatus)
                     .replace(/\{\{dueLabel\}\}/g, dueLabel)
                     .replace(/\{\{commenterName\}\}/g, commenterName)
                     .replace(/\{\{likerName\}\}/g, likerName)
                     .replace(/\{\{changeSummary\}\}/g, () => changeSummary)
                     .replace(/\{\{targetType\}\}/g, targetType)
                     .replace(/\{\{targetName\}\}/g, targetName)
                     .replace(/\{\{role\}\}/g, role);

    htmlBody = htmlBody.replace(/\{\{workspaceName\}\}/g, workspaceName)
                       .replace(/\{\{inviterName\}\}/g, inviterName)
                       .replace(/\{\{inviteLink\}\}/g, actionLink)
                       .replace(/\{\{resetLink\}\}/g, actionLink)
                       .replace(/\{\{itemLink\}\}/g, itemLink)
                       .replace(/\{\{itemName\}\}/g, itemName)
                       .replace(/\{\{boardName\}\}/g, boardName)
                       .replace(/\{\{groupName\}\}/g, groupName)
                       .replace(/\{\{mentionedBy\}\}/g, mentionedBy)
                       .replace(/\{\{updatePreview\}\}/g, updatePreview)
                       .replace(/\{\{oldStatus\}\}/g, oldStatus)
                       .replace(/\{\{newStatus\}\}/g, newStatus)
                       .replace(/\{\{dueLabel\}\}/g, dueLabel)
                       .replace(/\{\{commenterName\}\}/g, commenterName)
                       .replace(/\{\{likerName\}\}/g, likerName)
                       .replace(/\{\{changeSummary\}\}/g, () => escapeHtml(changeSummary))
                       .replace(/\{\{targetType\}\}/g, targetType)
                       .replace(/\{\{targetName\}\}/g, targetName)
                       .replace(/\{\{role\}\}/g, role)
                       .replace(/\{\{accessLink\}\}/g, accessLink);

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.password,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const mailOptions = {
      from: `"${smtpConfig.fromName || 'NHG Tasks'}" <${smtpConfig.fromEmail || smtpConfig.user}>`,
      to: resolvedEmail,
      subject: subject,
      html: htmlBody,
    };

    console.log(`Sending email to ${resolvedEmail} with subject: ${subject}`);
    console.log(`Final HTML Body Preview: ${htmlBody.substring(0, 500)}...`);
    const info = await transporter.sendMail(mailOptions);
    console.log('Message sent: %s', info.messageId);

    return new Response(
      JSON.stringify({ 
        message: action === 'test_email' ? 'Test email sent successfully!' : 'Email sent successfully', 
        isNewUser,
        userId: returnedUserId,
        messageId: info.messageId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Edge Function Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
