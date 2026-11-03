import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, Mail, Server, ChevronRight, Info, Eye, EyeOff, Lock, CalendarClock, MessageSquare, ThumbsUp, KeyRound, UserPlus } from 'lucide-react';
import { LOGO_DATA_URI } from '../../lib/localIcons';

const DEFAULT_MENTION_TEMPLATE = `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="${LOGO_DATA_URI}" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 16px;"><strong>{{mentionedBy}}</strong> mentioned you in <strong>{{itemName}}</strong> on board <strong>{{boardName}}</strong>.</p><div style="background-color: #f8fafc; border-left: 3px solid #a86315; padding: 12px 16px; margin: 0 0 20px; text-align: left; border-radius: 0 4px 4px 0;"><p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.6; font-style: italic;">"{{updatePreview}}"</p></div><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Update</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`;

const DEFAULT_ASSIGN_TEMPLATE = `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="${LOGO_DATA_URI}" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 24px;"><strong>{{inviterName}}</strong> assigned you to item <strong>{{itemName}}</strong> under <strong>{{groupName}}</strong> in <strong>{{boardName}}</strong>.</p><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Item</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`;

const DEFAULT_PIN_RESET_TEMPLATE = `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="${LOGO_DATA_URI}" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 20px;">You requested to reset the PIN for the private board <strong>{{boardName}}</strong>.</p><div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1e293b; background-color: #f8fafc; padding: 16px; border-radius: 6px; margin-bottom: 20px;">{{otpCode}}</div><p style="font-size: 13px; color: #94a3b8;">This code expires in {{expiryMinutes}} minutes. If you didn't request this, you can ignore this email.</p></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`;

const DEFAULT_STATUS_UPDATE_TEMPLATE = `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="${LOGO_DATA_URI}" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 16px;"><strong>{{inviterName}}</strong> changed the status of <strong>{{itemName}}</strong> on board <strong>{{boardName}}</strong>.</p><div style="background-color: #f8fafc; padding: 12px 16px; margin: 0 0 20px; text-align: center; border-radius: 4px;"><span style="font-size: 13px; color: #94a3b8; text-decoration: line-through;">{{oldStatus}}</span><span style="font-size: 15px; color: #1e293b; font-weight: bold; margin-left: 8px;">→ {{newStatus}}</span></div><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Item</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`;

const DEFAULT_COMMENT_TEMPLATE = `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="${LOGO_DATA_URI}" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 16px;"><strong>{{commenterName}}</strong> commented on <strong>{{itemName}}</strong> on board <strong>{{boardName}}</strong>.</p><div style="background-color: #f8fafc; border-left: 3px solid #a86315; padding: 12px 16px; margin: 0 0 20px; text-align: left; border-radius: 0 4px 4px 0;"><p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.6; font-style: italic;">"{{updatePreview}}"</p></div><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Update</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`;

const DEFAULT_LIKE_TEMPLATE = `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="${LOGO_DATA_URI}" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 24px;"><strong>{{likerName}}</strong> liked your update on <strong>{{itemName}}</strong> on board <strong>{{boardName}}</strong>.</p><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Update</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`;

const DEFAULT_DUE_DATE_REMINDER_TEMPLATE = `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="${LOGO_DATA_URI}" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 16px;"><strong>{{itemName}}</strong> on board <strong>{{boardName}}</strong> is <strong>{{dueLabel}}</strong>.</p><a href="{{itemLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">View Item</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`;

const DEFAULT_ACCESS_GRANTED_TEMPLATE = `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="${LOGO_DATA_URI}" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 16px;"><strong>{{inviterName}}</strong> gave you access to the {{targetType}} <strong>{{targetName}}</strong> in <strong>{{workspaceName}}</strong>.</p><div style="background-color: #f8fafc; padding: 12px 16px; margin: 0 0 20px; text-align: center; border-radius: 4px;"><span style="font-size: 13px; color: #94a3b8;">Your role</span><span style="font-size: 15px; color: #1e293b; font-weight: bold; margin-left: 8px;">{{role}}</span></div><a href="{{accessLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">Open {{targetType}}</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`;

const DEFAULT_RESET_PASSWORD_TEMPLATE = `<div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;"><div style="text-align: center; margin-bottom: 20px;"><img src="${LOGO_DATA_URI}" alt="NARAI" style="width: 80px; height: 80px; background-color: #1f291e; object-fit: contain; margin: 0 auto; display: block;" /></div><div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><div style="text-align: center; padding: 20px 20px 10px;"><a href="https://saturday.naraihospitalitygroup.com" style="color: #2563eb; text-decoration: underline; font-weight: bold; font-size: 16px;">NHG Tasks</a></div><div style="border-bottom: 2px solid #1e293b; margin: 0 20px;"></div><div style="padding: 30px 40px; text-align: center;"><p style="font-size: 15px; color: #475569; line-height: 1.5; margin-bottom: 24px;">We received a request to reset the password for your NHG Tasks account. Click below to choose a new password. If you didn't request this, you can safely ignore this email.</p><a href="{{resetLink}}" style="background-color: #a86315; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 15px; display: inline-block;">Reset Password</a></div></div><div style="text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8;">Powered by <strong>NHG BusinessTech Team</strong></div></div>`;

export const EmailSettings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [smtpConfig, setSmtpConfig] = useState({
        host: '',
        port: 587,
        secure: false,
        user: '',
        password: '',
        fromEmail: '',
        fromName: ''
    });
    
    const [inviteTemplate, setInviteTemplate] = useState({
        subject: '',
        bodyHtml: ''
    });

    const [inviteExistingTemplate, setInviteExistingTemplate] = useState({
        subject: '',
        bodyHtml: ''
    });

    const [assignItemTemplate, setAssignItemTemplate] = useState({
        subject: "[You're assigned] {{itemName}}",
        bodyHtml: DEFAULT_ASSIGN_TEMPLATE
    });

    const [mentionTemplate, setMentionTemplate] = useState({
        subject: '{{mentionedBy}} mentioned you in {{itemName}}',
        bodyHtml: DEFAULT_MENTION_TEMPLATE
    });

    const [pinResetOtpTemplate, setPinResetOtpTemplate] = useState({
        subject: 'Your PIN reset code for {{boardName}}',
        bodyHtml: DEFAULT_PIN_RESET_TEMPLATE
    });

    const [statusUpdateTemplate, setStatusUpdateTemplate] = useState({
        subject: '{{inviterName}} changed the status of {{itemName}}',
        bodyHtml: DEFAULT_STATUS_UPDATE_TEMPLATE
    });

    const [dueDateReminderTemplate, setDueDateReminderTemplate] = useState({
        subject: '{{itemName}} is {{dueLabel}}',
        bodyHtml: DEFAULT_DUE_DATE_REMINDER_TEMPLATE
    });

    const [commentTemplate, setCommentTemplate] = useState({
        subject: '{{commenterName}} commented on {{itemName}}',
        bodyHtml: DEFAULT_COMMENT_TEMPLATE
    });

    const [likeTemplate, setLikeTemplate] = useState({
        subject: '{{likerName}} liked your update on {{itemName}}',
        bodyHtml: DEFAULT_LIKE_TEMPLATE
    });

    const [resetPasswordTemplate, setResetPasswordTemplate] = useState({
        subject: 'Reset your NHG Tasks password',
        bodyHtml: DEFAULT_RESET_PASSWORD_TEMPLATE
    });

    const [accessGrantedTemplate, setAccessGrantedTemplate] = useState({
        subject: '{{inviterName}} added you to {{targetName}}',
        bodyHtml: DEFAULT_ACCESS_GRANTED_TEMPLATE
    });

    const [message, setMessage] = useState({ type: '', text: '' });
    
    // Test SMTP state
    const [testEmail, setTestEmail] = useState('');
    const [testingSmtp, setTestingSmtp] = useState(false);
    const [testResult, setTestResult] = useState<{ type: 'success' | 'error' | '', text: string }>({ type: '', text: '' });
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('system_settings')
                .select('key, value')
                .in('key', ['smtp_config', 'invite_email_template', 'invite_existing_user_template', 'assign_item_template', 'mention_email_template', 'pin_reset_otp_template', 'status_update_email_template', 'due_date_reminder_email_template', 'comment_email_template', 'like_email_template', 'reset_password_email_template', 'access_granted_email_template']);

            if (error) throw error;

            if (data) {
                const smtp = data.find(item => item.key === 'smtp_config');
                const template = data.find(item => item.key === 'invite_email_template');
                const existingTemplate = data.find(item => item.key === 'invite_existing_user_template');
                const assignTemplate = data.find(item => item.key === 'assign_item_template');
                const mentionTmpl = data.find(item => item.key === 'mention_email_template');
                const pinResetTmpl = data.find(item => item.key === 'pin_reset_otp_template');
                const statusUpdateTmpl = data.find(item => item.key === 'status_update_email_template');
                const dueDateReminderTmpl = data.find(item => item.key === 'due_date_reminder_email_template');
                const commentTmpl = data.find(item => item.key === 'comment_email_template');
                const likeTmpl = data.find(item => item.key === 'like_email_template');
                const resetPasswordTmpl = data.find(item => item.key === 'reset_password_email_template');
                const accessGrantedTmpl = data.find(item => item.key === 'access_granted_email_template');

                if (smtp?.value) setSmtpConfig(smtp.value);
                if (template?.value) setInviteTemplate(template.value);
                if (existingTemplate?.value) setInviteExistingTemplate(existingTemplate.value);
                if (assignTemplate?.value) setAssignItemTemplate(assignTemplate.value);
                if (mentionTmpl?.value) {
                    setMentionTemplate(mentionTmpl.value);
                } else {
                    // Auto-seed the default NHG mention template so Edge Function picks it up
                    const defaultVal = { subject: '{{mentionedBy}} mentioned you in {{itemName}}', bodyHtml: DEFAULT_MENTION_TEMPLATE };
                    await supabase.from('system_settings').upsert({ key: 'mention_email_template', value: defaultVal, description: 'Template for @mention notifications' }, { onConflict: 'key' });
                }
                if (pinResetTmpl?.value) {
                    setPinResetOtpTemplate(pinResetTmpl.value);
                } else {
                    // Auto-seed the default PIN reset template so the board-pin Edge Function picks it up
                    const defaultVal = { subject: 'Your PIN reset code for {{boardName}}', bodyHtml: DEFAULT_PIN_RESET_TEMPLATE };
                    await supabase.from('system_settings').upsert({ key: 'pin_reset_otp_template', value: defaultVal, description: 'Template for Private Board PIN reset OTP' }, { onConflict: 'key' });
                }
                if (statusUpdateTmpl?.value) {
                    setStatusUpdateTemplate(statusUpdateTmpl.value);
                } else {
                    // Auto-seed the default status-update template so the Edge Function picks it up
                    const defaultVal = { subject: '{{inviterName}} changed the status of {{itemName}}', bodyHtml: DEFAULT_STATUS_UPDATE_TEMPLATE };
                    await supabase.from('system_settings').upsert({ key: 'status_update_email_template', value: defaultVal, description: 'Template for item status-change notifications' }, { onConflict: 'key' });
                }
                if (dueDateReminderTmpl?.value) {
                    setDueDateReminderTemplate(dueDateReminderTmpl.value);
                } else {
                    // Auto-seed the default due-date reminder template so the Edge Function picks it up
                    const defaultVal = { subject: '{{itemName}} is {{dueLabel}}', bodyHtml: DEFAULT_DUE_DATE_REMINDER_TEMPLATE };
                    await supabase.from('system_settings').upsert({ key: 'due_date_reminder_email_template', value: defaultVal, description: 'Template for due-date reminder emails' }, { onConflict: 'key' });
                }
                if (commentTmpl?.value) {
                    setCommentTemplate(commentTmpl.value);
                } else {
                    const defaultVal = { subject: '{{commenterName}} commented on {{itemName}}', bodyHtml: DEFAULT_COMMENT_TEMPLATE };
                    await supabase.from('system_settings').upsert({ key: 'comment_email_template', value: defaultVal, description: 'Template for comment notifications to assignees' }, { onConflict: 'key' });
                }
                if (likeTmpl?.value) {
                    setLikeTemplate(likeTmpl.value);
                } else {
                    const defaultVal = { subject: '{{likerName}} liked your update on {{itemName}}', bodyHtml: DEFAULT_LIKE_TEMPLATE };
                    await supabase.from('system_settings').upsert({ key: 'like_email_template', value: defaultVal, description: 'Template for update-like notifications' }, { onConflict: 'key' });
                }
                if (resetPasswordTmpl?.value) {
                    setResetPasswordTemplate(resetPasswordTmpl.value);
                } else {
                    const defaultVal = { subject: 'Reset your NHG Tasks password', bodyHtml: DEFAULT_RESET_PASSWORD_TEMPLATE };
                    await supabase.from('system_settings').upsert({ key: 'reset_password_email_template', value: defaultVal, description: 'Template for forgot-password reset emails (Internal accounts only)' }, { onConflict: 'key' });
                }
                if (accessGrantedTmpl?.value) {
                    setAccessGrantedTemplate(accessGrantedTmpl.value);
                } else {
                    const defaultVal = { subject: '{{inviterName}} added you to {{targetName}}', bodyHtml: DEFAULT_ACCESS_GRANTED_TEMPLATE };
                    await supabase.from('system_settings').upsert({ key: 'access_granted_email_template', value: defaultVal, description: 'Template for direct board/workspace access grants' }, { onConflict: 'key' });
                }
            }
        } catch (error: any) {
            console.error('Error fetching settings:', error);
            setMessage({ type: 'error', text: 'Failed to load settings: ' + error.message });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setMessage({ type: '', text: '' });
            
            const updates = [
                {
                    key: 'smtp_config',
                    value: smtpConfig,
                    description: 'SMTP connection settings'
                },
                {
                    key: 'invite_email_template',
                    value: inviteTemplate,
                    description: 'Template for workspace/board invitations'
                },
                {
                    key: 'invite_existing_user_template',
                    value: inviteExistingTemplate,
                    description: 'Template for inviting existing users to a workspace/board'
                },
                {
                    key: 'assign_item_template',
                    value: assignItemTemplate,
                    description: 'Template for item assignments'
                },
                {
                    key: 'mention_email_template',
                    value: mentionTemplate,
                    description: 'Template for @mention notifications'
                },
                {
                    key: 'pin_reset_otp_template',
                    value: pinResetOtpTemplate,
                    description: 'Template for Private Board PIN reset OTP'
                },
                {
                    key: 'status_update_email_template',
                    value: statusUpdateTemplate,
                    description: 'Template for item status-change notifications'
                },
                {
                    key: 'due_date_reminder_email_template',
                    value: dueDateReminderTemplate,
                    description: 'Template for due-date reminder emails'
                },
                {
                    key: 'comment_email_template',
                    value: commentTemplate,
                    description: 'Template for comment notifications to assignees'
                },
                {
                    key: 'like_email_template',
                    value: likeTemplate,
                    description: 'Template for update-like notifications'
                },
                {
                    key: 'reset_password_email_template',
                    value: resetPasswordTemplate,
                    description: 'Template for forgot-password reset emails (Internal accounts only)'
                },
                {
                    key: 'access_granted_email_template',
                    value: accessGrantedTemplate,
                    description: 'Template for direct board/workspace access grants'
                }
            ];

            const { error } = await supabase
                .from('system_settings')
                .upsert(updates, { onConflict: 'key' });

            if (error) throw error;

            setMessage({ type: 'success', text: 'Settings saved successfully' });
            
            // Clear success message after 3 seconds
            setTimeout(() => setMessage({ type: '', text: '' }), 3000);
            
        } catch (error: any) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: 'Failed to save settings: ' + error.message });
        } finally {
            setSaving(false);
        }
    };

    const handleTestEmail = async () => {
        if (!testEmail) {
            setTestResult({ type: 'error', text: 'Please enter a recipient email' });
            return;
        }

        try {
            setTestingSmtp(true);
            setTestResult({ type: '', text: '' });

            const { data, error } = await supabase.functions.invoke('test-smtp', {
                body: { 
                    smtp_config: smtpConfig,
                    test_email: testEmail
                }
            });

            if (error) {
                // Try to get more details from the error response
                let errorMessage = error.message || 'Unknown error';
                
                // If the error has a response property (standard for FunctionsHttpError)
                if (error instanceof Error && 'context' in error) {
                     // Some versions of supabase-js return details in context
                }

                try {
                    // Check if it's a JSON error response from our function
                    if (data && data.error) {
                        errorMessage = data.error;
                    }
                } catch (e) {}

                throw new Error(errorMessage);
            }

            setTestResult({ type: 'success', text: 'Test email sent successfully! Please check your inbox.' });
        } catch (error: any) {
            console.error('Error testing SMTP:', error);
            setTestResult({ type: 'error', text: 'Failed to send test email: ' + (error.message || 'Unknown error') });
        } finally {
            setTestingSmtp(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '24px', color: 'hsl(var(--ink-dim))' }}>Loading settings...</div>;
    }

    return (
        <div style={{ maxWidth: '800px' }}>
            {message.text && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    marginBottom: '24px',
                    backgroundColor: message.type === 'success' ? 'rgba(42, 74, 18, 0.1)' : 'rgba(200, 62, 43, 0.1)',
                    color: message.type === 'success' ? '#2A4A12' : '#C83E2B',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    border: `1px solid ${message.type === 'success' ? 'rgba(42, 74, 18, 0.25)' : 'rgba(200, 62, 43, 0.25)'}`
                }}>
                    {message.text}
                </div>
            )}

            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <div className="admin-tile" style={{ width: '38px', height: '38px', background: 'rgba(42, 74, 18, 0.1)', color: '#2A4A12' }}>
                        <Server size={18} />
                    </div>
                    <h2 className="narai-heading" style={{ fontSize: '20px', fontWeight: 700, color: 'hsl(var(--ink))', margin: 0 }}>
                        SMTP Configuration
                    </h2>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                        <label style={labelStyle}>SMTP Host</label>
                        <input 
                            type="text" 
                            value={smtpConfig.host}
                            onChange={e => setSmtpConfig({...smtpConfig, host: e.target.value})}
                            style={inputStyle}
                            placeholder="e.g. smtp.gmail.com"
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Port</label>
                            <input 
                                type="number" 
                                value={smtpConfig.port}
                                onChange={e => setSmtpConfig({...smtpConfig, port: parseInt(e.target.value) || 587})}
                                style={inputStyle}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', marginTop: '24px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: 'hsl(var(--ink))', cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    checked={smtpConfig.secure}
                                    onChange={e => setSmtpConfig({...smtpConfig, secure: e.target.checked})}
                                    style={{ accentColor: '#2A4A12' }}
                                />
                                Secure (SSL/TLS)
                            </label>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                        <label style={labelStyle}>Username</label>
                        <input 
                            type="text" 
                            value={smtpConfig.user}
                            onChange={e => setSmtpConfig({...smtpConfig, user: e.target.value})}
                            style={inputStyle}
                            autoComplete="off"
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Password / App Password</label>
                        <div style={{ position: 'relative' }}>
                            <input 
                                type={showPassword ? "text" : "password"} 
                                value={smtpConfig.password}
                                onChange={e => setSmtpConfig({...smtpConfig, password: e.target.value})}
                                style={{ ...inputStyle, paddingRight: '40px' }}
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute',
                                    right: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: 'hsl(var(--ink-soft))',
                                    padding: '0'
                                }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={labelStyle}>From Email</label>
                        <input 
                            type="email" 
                            value={smtpConfig.fromEmail}
                            onChange={e => setSmtpConfig({...smtpConfig, fromEmail: e.target.value})}
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>From Name</label>
                        <input 
                            type="text" 
                            value={smtpConfig.fromName}
                            onChange={e => setSmtpConfig({...smtpConfig, fromName: e.target.value})}
                            style={inputStyle}
                        />
                    </div>
                </div>
            </div>

            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <div className="admin-tile" style={{ width: '38px', height: '38px', background: 'rgba(167, 100, 0, 0.12)', color: '#A76400' }}>
                        <Mail size={18} />
                    </div>
                    <h2 className="narai-heading" style={{ fontSize: '20px', fontWeight: 700, color: 'hsl(var(--ink))', margin: 0 }}>
                        Test SMTP Configuration
                    </h2>
                </div>
                <p style={{ fontSize: '13.5px', color: 'hsl(var(--ink-dim))', marginBottom: '20px' }}>
                    Enter an email address below to send a test message using the current SMTP settings. 
                    <span style={{ color: '#A76400', marginLeft: '6px', fontWeight: 600 }}>
                        (You don't need to save settings before testing)
                    </span>
                </p>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Recipient Email Address</label>
                        <input 
                            type="email" 
                            value={testEmail}
                            onChange={e => setTestEmail(e.target.value)}
                            placeholder="e.g. your-email@example.com"
                            style={inputStyle}
                        />
                    </div>
                    <button
                        onClick={handleTestEmail}
                        disabled={testingSmtp || !testEmail}
                        className="btn-solid"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 20px',
                            borderRadius: '999px',
                            fontWeight: 600,
                            cursor: (testingSmtp || !testEmail) ? 'not-allowed' : 'pointer',
                            fontSize: '13.5px',
                            opacity: (testingSmtp || !testEmail) ? 0.6 : 1,
                        }}
                    >
                        <Mail size={16} />
                        {testingSmtp ? 'Sending...' : 'Test Send Email'}
                    </button>
                </div>

                {testResult.text && (
                    <div style={{
                        marginTop: '16px',
                        padding: '12px',
                        borderRadius: '10px',
                        fontSize: '13.5px',
                        fontWeight: 600,
                        backgroundColor: testResult.type === 'success' ? 'rgba(42, 74, 18, 0.1)' : 'rgba(200, 62, 43, 0.1)',
                        color: testResult.type === 'success' ? '#2A4A12' : '#C83E2B',
                        border: `1px solid ${testResult.type === 'success' ? 'rgba(42, 74, 18, 0.25)' : 'rgba(200, 62, 43, 0.25)'}`
                    }}>
                        {testResult.text}
                    </div>
                )}
            </div>

            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Mail size={20} color="#10b981" />
                    Invitation Email Template (New Users)
                    <span title="สถานการณ์ที่ส่ง: เมื่อเชิญอีเมลที่ 'ไม่เคยมีบัญชีในระบบ' (ไม่ว่าเข้า Workspace, Board หรือคอลัมน์ Person)&#10;จุดประสงค์: ลิงก์จะพาสร้างบัญชีครั้งแรกและเข้าสู่กระดาน" style={{ display: 'flex' }}>
                        <Info size={16} color="#94a3b8" style={{ cursor: 'help', marginLeft: '4px' }} />
                    </span>
                </h2>
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <strong>Available Variables:</strong> <code style={codeStyle}>{"{{workspaceName}}"}</code>, <code style={codeStyle}>{"{{inviterName}}"}</code>, <code style={codeStyle}>{"{{inviteLink}}"}</code>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Email Subject</label>
                    <input 
                        type="text" 
                        value={inviteTemplate.subject}
                        onChange={e => setInviteTemplate({...inviteTemplate, subject: e.target.value})}
                        style={inputStyle}
                    />
                </div>
                
                <CollapsibleHtmlBody 
                    label="Email HTML Body" 
                    value={inviteTemplate.bodyHtml} 
                    onChange={val => setInviteTemplate({...inviteTemplate, bodyHtml: val})} 
                />

                {/* Live Preview for New User Template */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    <label style={{...labelStyle, color: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <Mail size={16} /> Live Email Preview
                    </label>
                    <div style={{
                        marginTop: '8px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        backgroundColor: '#f8fafc'
                    }}>
                        <div style={{ padding: '12px 16px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Subject:</span> <strong>{inviteTemplate.subject.replace(/\{\{workspaceName\}\}/g, 'Design System').replace(/\{\{inviterName\}\}/g, 'Alex')}</strong>
                        </div>
                        <div 
                            style={{ padding: '0', backgroundColor: 'white' }}
                            dangerouslySetInnerHTML={{ 
                                __html: inviteTemplate.bodyHtml
                                    .replace(/\{\{workspaceName\}\}/g, 'Design System')
                                    .replace(/\{\{inviterName\}\}/g, 'Alex')
                                    .replace(/\{\{inviteLink\}\}/g, '#')
                            }} 
                        />
                    </div>
                </div>
            </div>

            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Mail size={20} color="#f59e0b" />
                    Invitation Email Template (Existing Users)
                    <span title="สถานการณ์ที่ส่ง: เมื่อพนักงาน 'มีบัญชีอยู่แล้ว' แต่เพิ่งถูกเชิญเข้า Board/Workspace ใหม่ที่ไม่เคยมีสิทธิ์มาก่อน&#10;จุดประสงค์: ลิงก์ข้อความจะพาไปใช้บอร์ดทันที ไม่ต้องยืนยันตัวตนซ้ำ" style={{ display: 'flex' }}>
                        <Info size={16} color="#94a3b8" style={{ cursor: 'help', marginLeft: '4px' }} />
                    </span>
                </h2>
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <strong>Available Variables:</strong> <code style={codeStyle}>{"{{workspaceName}}"}</code>, <code style={codeStyle}>{"{{inviterName}}"}</code>, <code style={codeStyle}>{"{{inviteLink}}"}</code>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Email Subject</label>
                    <input 
                        type="text" 
                        value={inviteExistingTemplate.subject}
                        onChange={e => setInviteExistingTemplate({...inviteExistingTemplate, subject: e.target.value})}
                        style={inputStyle}
                    />
                </div>
                
                <CollapsibleHtmlBody 
                    label="Email HTML Body" 
                    value={inviteExistingTemplate.bodyHtml} 
                    onChange={val => setInviteExistingTemplate({...inviteExistingTemplate, bodyHtml: val})} 
                />

                {/* Live Preview for Existing User Template */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    <label style={{...labelStyle, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <Mail size={16} /> Live Email Preview
                    </label>
                    <div style={{
                        marginTop: '8px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        backgroundColor: '#f8fafc'
                    }}>
                        <div style={{ padding: '12px 16px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Subject:</span> <strong>{inviteExistingTemplate.subject.replace(/\{\{workspaceName\}\}/g, 'Design System').replace(/\{\{inviterName\}\}/g, 'Alex')}</strong>
                        </div>
                        <div 
                            style={{ padding: '0', backgroundColor: 'white' }}
                            dangerouslySetInnerHTML={{ 
                                __html: inviteExistingTemplate.bodyHtml
                                    .replace(/\{\{workspaceName\}\}/g, 'Design System')
                                    .replace(/\{\{inviterName\}\}/g, 'Alex')
                                    .replace(/\{\{inviteLink\}\}/g, '#')
                            }} 
                        />
                    </div>
                </div>
            </div>

            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Mail size={20} color="#3b82f6" />
                    Item Assignment Template (Person Column)
                    <span title="สถานการณ์ที่ส่ง: เมื่อมอบหมายงาน (คอลัมน์ Person) ให้พนักงานที่ 'มีสิทธิ์ใน Board นี้อยู่แล้ว'&#10;จุดประสงค์: แจ้งเตือนระดับงาน (Task) พร้อมลิงก์ไปยัง Item นั้นรวดเร็ว" style={{ display: 'flex' }}>
                        <Info size={16} color="#94a3b8" style={{ cursor: 'help', marginLeft: '4px' }} />
                    </span>
                </h2>
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <strong>Available Variables:</strong> <code style={codeStyle}>{"{{itemName}}"}</code>, <code style={codeStyle}>{"{{groupName}}"}</code>, <code style={codeStyle}>{"{{boardName}}"}</code>, <code style={codeStyle}>{"{{inviterName}}"}</code>, <code style={codeStyle}>{"{{itemLink}}"}</code>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Email Subject</label>
                    <input 
                        type="text" 
                        value={assignItemTemplate.subject}
                        onChange={e => setAssignItemTemplate({...assignItemTemplate, subject: e.target.value})}
                        style={inputStyle}
                    />
                </div>
                
                <CollapsibleHtmlBody 
                    label="Email HTML Body" 
                    value={assignItemTemplate.bodyHtml} 
                    onChange={val => setAssignItemTemplate({...assignItemTemplate, bodyHtml: val})} 
                />

                {/* Live Preview for Assign Item Template */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    <label style={{...labelStyle, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <Mail size={16} /> Live Email Preview
                    </label>
                    <div style={{
                        marginTop: '8px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        backgroundColor: '#f8fafc'
                    }}>
                        <div style={{ padding: '12px 16px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Subject:</span> <strong>{assignItemTemplate.subject.replace(/\{\{itemName\}\}/g, 'Set up 53 Tasks').replace(/\{\{groupName\}\}/g, 'Aum').replace(/\{\{boardName\}\}/g, 'Q3 Roadmap')}</strong>
                        </div>
                        <div
                            style={{ padding: '0', backgroundColor: 'white' }}
                            dangerouslySetInnerHTML={{
                                __html: assignItemTemplate.bodyHtml
                                    .replace(/\{\{itemName\}\}/g, 'Set up 53 Tasks')
                                    .replace(/\{\{groupName\}\}/g, 'Aum')
                                    .replace(/\{\{boardName\}\}/g, 'Q3 Roadmap')
                                    .replace(/\{\{inviterName\}\}/g, 'Pattaravadee N.')
                                    .replace(/\{\{inviteLink\}\}/g, '#')
                                    .replace(/\{\{itemLink\}\}/g, '#')
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ── Mention Email Template ── */}
            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Mail size={20} color="#f97316" />
                    Mention Email Template
                    <span title="สถานการณ์ที่ส่ง: เมื่อมีการ @mention ผู้ใช้ใน Updates&#10;จุดประสงค์: แจ้งเตือนทางอีเมล์พร้อมลิงก์กลับไปยัง Item นั้น" style={{ display: 'flex' }}>
                        <Info size={16} color="#94a3b8" style={{ cursor: 'help', marginLeft: '4px' }} />
                    </span>
                </h2>
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <strong>Available Variables:</strong>{' '}
                    <code style={codeStyle}>{'{{mentionedBy}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{itemName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{boardName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{updatePreview}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{itemLink}}'}</code>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Email Subject</label>
                    <input
                        type="text"
                        value={mentionTemplate.subject}
                        onChange={e => setMentionTemplate({ ...mentionTemplate, subject: e.target.value })}
                        style={inputStyle}
                    />
                </div>

                <CollapsibleHtmlBody
                    label="Email HTML Body"
                    value={mentionTemplate.bodyHtml}
                    onChange={val => setMentionTemplate({ ...mentionTemplate, bodyHtml: val })}
                />

                {/* Live Preview */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    <label style={{ ...labelStyle, color: '#f97316', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Mail size={16} /> Live Email Preview
                    </label>
                    <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
                        <div style={{ padding: '12px 16px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Subject:</span>{' '}
                            <strong>
                                {mentionTemplate.subject
                                    .replace(/\{\{mentionedBy\}\}/g, 'Alex Johnson')
                                    .replace(/\{\{itemName\}\}/g, 'NHG Tasks Launch')
                                    .replace(/\{\{boardName\}\}/g, 'Business Tech')}
                            </strong>
                        </div>
                        <div
                            style={{ padding: '0', backgroundColor: 'white' }}
                            dangerouslySetInnerHTML={{
                                __html: mentionTemplate.bodyHtml
                                    .replace(/\{\{mentionedBy\}\}/g, 'Alex Johnson')
                                    .replace(/\{\{itemName\}\}/g, 'NHG Tasks Launch')
                                    .replace(/\{\{boardName\}\}/g, 'Business Tech')
                                    .replace(/\{\{updatePreview\}\}/g, 'Hey, can you take a look at the latest design mockups and share your feedback by Friday?')
                                    .replace(/\{\{itemLink\}\}/g, '#')
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ── Status Update Email Template ── */}
            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Mail size={20} color="#6366f1" />
                    Status Update Email Template
                    <span title="สถานการณ์ที่ส่ง: เมื่อมีการเปลี่ยน Status ของ Item&#10;จุดประสงค์: แจ้งเตือนทุกคนใน Person column ของ Item นั้นทางอีเมล์" style={{ display: 'flex' }}>
                        <Info size={16} color="#94a3b8" style={{ cursor: 'help', marginLeft: '4px' }} />
                    </span>
                </h2>
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <strong>Available Variables:</strong>{' '}
                    <code style={codeStyle}>{'{{inviterName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{itemName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{boardName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{oldStatus}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{newStatus}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{itemLink}}'}</code>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Email Subject</label>
                    <input
                        type="text"
                        value={statusUpdateTemplate.subject}
                        onChange={e => setStatusUpdateTemplate({ ...statusUpdateTemplate, subject: e.target.value })}
                        style={inputStyle}
                    />
                </div>

                <CollapsibleHtmlBody
                    label="Email HTML Body"
                    value={statusUpdateTemplate.bodyHtml}
                    onChange={val => setStatusUpdateTemplate({ ...statusUpdateTemplate, bodyHtml: val })}
                />

                {/* Live Preview */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    <label style={{ ...labelStyle, color: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Mail size={16} /> Live Email Preview
                    </label>
                    <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
                        <div style={{ padding: '12px 16px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Subject:</span>{' '}
                            <strong>
                                {statusUpdateTemplate.subject
                                    .replace(/\{\{inviterName\}\}/g, 'Alex Johnson')
                                    .replace(/\{\{itemName\}\}/g, 'NHG Tasks Launch')
                                    .replace(/\{\{boardName\}\}/g, 'Business Tech')}
                            </strong>
                        </div>
                        <div
                            style={{ padding: '0', backgroundColor: 'white' }}
                            dangerouslySetInnerHTML={{
                                __html: statusUpdateTemplate.bodyHtml
                                    .replace(/\{\{inviterName\}\}/g, 'Alex Johnson')
                                    .replace(/\{\{itemName\}\}/g, 'NHG Tasks Launch')
                                    .replace(/\{\{boardName\}\}/g, 'Business Tech')
                                    .replace(/\{\{oldStatus\}\}/g, 'Working on it')
                                    .replace(/\{\{newStatus\}\}/g, 'Done')
                                    .replace(/\{\{itemLink\}\}/g, '#')
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ── Comment Email Template ── */}
            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MessageSquare size={20} color="#64748b" />
                    Comment Email Template
                    <span title="สถานการณ์ที่ส่ง: เมื่อมีคน comment ใน Item (ที่ไม่ได้ @mention)&#10;จุดประสงค์: แจ้งเตือนทุกคนใน Person column ของ Item นั้นทางอีเมล์" style={{ display: 'flex' }}>
                        <Info size={16} color="#94a3b8" style={{ cursor: 'help', marginLeft: '4px' }} />
                    </span>
                </h2>
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <strong>Available Variables:</strong>{' '}
                    <code style={codeStyle}>{'{{commenterName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{itemName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{boardName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{updatePreview}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{itemLink}}'}</code>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Email Subject</label>
                    <input
                        type="text"
                        value={commentTemplate.subject}
                        onChange={e => setCommentTemplate({ ...commentTemplate, subject: e.target.value })}
                        style={inputStyle}
                    />
                </div>

                <CollapsibleHtmlBody
                    label="Email HTML Body"
                    value={commentTemplate.bodyHtml}
                    onChange={val => setCommentTemplate({ ...commentTemplate, bodyHtml: val })}
                />

                {/* Live Preview */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    <label style={{ ...labelStyle, color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Mail size={16} /> Live Email Preview
                    </label>
                    <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
                        <div style={{ padding: '12px 16px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Subject:</span>{' '}
                            <strong>
                                {commentTemplate.subject
                                    .replace(/\{\{commenterName\}\}/g, 'Alex Johnson')
                                    .replace(/\{\{itemName\}\}/g, 'NHG Tasks Launch')
                                    .replace(/\{\{boardName\}\}/g, 'Business Tech')}
                            </strong>
                        </div>
                        <div
                            style={{ padding: '0', backgroundColor: 'white' }}
                            dangerouslySetInnerHTML={{
                                __html: commentTemplate.bodyHtml
                                    .replace(/\{\{commenterName\}\}/g, 'Alex Johnson')
                                    .replace(/\{\{itemName\}\}/g, 'NHG Tasks Launch')
                                    .replace(/\{\{boardName\}\}/g, 'Business Tech')
                                    .replace(/\{\{updatePreview\}\}/g, 'Just pushed the latest changes — can you review before Friday?')
                                    .replace(/\{\{itemLink\}\}/g, '#')
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ── Like Email Template ── */}
            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ThumbsUp size={20} color="#D4A000" />
                    Like Email Template
                    <span title="สถานการณ์ที่ส่ง: เมื่อมีคนกด Like บน Update ของผู้ใช้&#10;จุดประสงค์: แจ้งเตือนเจ้าของ Update นั้นทางอีเมล์" style={{ display: 'flex' }}>
                        <Info size={16} color="#94a3b8" style={{ cursor: 'help', marginLeft: '4px' }} />
                    </span>
                </h2>
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <strong>Available Variables:</strong>{' '}
                    <code style={codeStyle}>{'{{likerName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{itemName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{boardName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{itemLink}}'}</code>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Email Subject</label>
                    <input
                        type="text"
                        value={likeTemplate.subject}
                        onChange={e => setLikeTemplate({ ...likeTemplate, subject: e.target.value })}
                        style={inputStyle}
                    />
                </div>

                <CollapsibleHtmlBody
                    label="Email HTML Body"
                    value={likeTemplate.bodyHtml}
                    onChange={val => setLikeTemplate({ ...likeTemplate, bodyHtml: val })}
                />

                {/* Live Preview */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    <label style={{ ...labelStyle, color: '#D4A000', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Mail size={16} /> Live Email Preview
                    </label>
                    <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
                        <div style={{ padding: '12px 16px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Subject:</span>{' '}
                            <strong>
                                {likeTemplate.subject
                                    .replace(/\{\{likerName\}\}/g, 'Alex Johnson')
                                    .replace(/\{\{itemName\}\}/g, 'NHG Tasks Launch')
                                    .replace(/\{\{boardName\}\}/g, 'Business Tech')}
                            </strong>
                        </div>
                        <div
                            style={{ padding: '0', backgroundColor: 'white' }}
                            dangerouslySetInnerHTML={{
                                __html: likeTemplate.bodyHtml
                                    .replace(/\{\{likerName\}\}/g, 'Alex Johnson')
                                    .replace(/\{\{itemName\}\}/g, 'NHG Tasks Launch')
                                    .replace(/\{\{boardName\}\}/g, 'Business Tech')
                                    .replace(/\{\{itemLink\}\}/g, '#')
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ── Due Date Reminder Email Template ── */}
            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CalendarClock size={20} color="#e2445c" />
                    Due Date Reminder Email Template
                    <span title="สถานการณ์ที่ส่ง: ทุกวันตอน 08:00 UTC เมื่อ Due Date ของ Item ตรงกับรอบแจ้งเตือนที่ตั้งไว้&#10;จุดประสงค์: แจ้งเตือนทุกคนใน Person column ของ Item นั้นทางอีเมล์" style={{ display: 'flex' }}>
                        <Info size={16} color="#94a3b8" style={{ cursor: 'help', marginLeft: '4px' }} />
                    </span>
                </h2>
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <strong>Available Variables:</strong>{' '}
                    <code style={codeStyle}>{'{{itemName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{boardName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{dueLabel}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{itemLink}}'}</code>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Email Subject</label>
                    <input
                        type="text"
                        value={dueDateReminderTemplate.subject}
                        onChange={e => setDueDateReminderTemplate({ ...dueDateReminderTemplate, subject: e.target.value })}
                        style={inputStyle}
                    />
                </div>

                <CollapsibleHtmlBody
                    label="Email HTML Body"
                    value={dueDateReminderTemplate.bodyHtml}
                    onChange={val => setDueDateReminderTemplate({ ...dueDateReminderTemplate, bodyHtml: val })}
                />

                {/* Live Preview */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    <label style={{ ...labelStyle, color: '#e2445c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Mail size={16} /> Live Email Preview
                    </label>
                    <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
                        <div style={{ padding: '12px 16px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Subject:</span>{' '}
                            <strong>
                                {dueDateReminderTemplate.subject
                                    .replace(/\{\{itemName\}\}/g, 'NHG Tasks Launch')
                                    .replace(/\{\{dueLabel\}\}/g, 'due today')}
                            </strong>
                        </div>
                        <div
                            style={{ padding: '0', backgroundColor: 'white' }}
                            dangerouslySetInnerHTML={{
                                __html: dueDateReminderTemplate.bodyHtml
                                    .replace(/\{\{itemName\}\}/g, 'NHG Tasks Launch')
                                    .replace(/\{\{boardName\}\}/g, 'Business Tech')
                                    .replace(/\{\{dueLabel\}\}/g, 'due today')
                                    .replace(/\{\{itemLink\}\}/g, '#')
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ── PIN Reset OTP Email Template ── */}
            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Lock size={20} color="#6366f1" />
                    PIN Reset OTP Template
                    <span title="สถานการณ์ที่ส่ง: เมื่อ Board Owner กด 'Forgot PIN?' บน Private Board&#10;จุดประสงค์: ส่งโค้ด OTP 6 หลักไปยังอีเมลของ Owner เพื่อตั้ง PIN ใหม่" style={{ display: 'flex' }}>
                        <Info size={16} color="#94a3b8" style={{ cursor: 'help', marginLeft: '4px' }} />
                    </span>
                </h2>
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <strong>Available Variables:</strong>{' '}
                    <code style={codeStyle}>{'{{otpCode}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{boardName}}'}</code>,{' '}
                    <code style={codeStyle}>{'{{expiryMinutes}}'}</code>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Email Subject</label>
                    <input
                        type="text"
                        value={pinResetOtpTemplate.subject}
                        onChange={e => setPinResetOtpTemplate({ ...pinResetOtpTemplate, subject: e.target.value })}
                        style={inputStyle}
                    />
                </div>

                <CollapsibleHtmlBody
                    label="Email HTML Body"
                    value={pinResetOtpTemplate.bodyHtml}
                    onChange={val => setPinResetOtpTemplate({ ...pinResetOtpTemplate, bodyHtml: val })}
                />

                {/* Live Preview */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    <label style={{ ...labelStyle, color: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Mail size={16} /> Live Email Preview
                    </label>
                    <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
                        <div style={{ padding: '12px 16px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Subject:</span>{' '}
                            <strong>
                                {pinResetOtpTemplate.subject
                                    .replace(/\{\{boardName\}\}/g, 'Marasca Samui')}
                            </strong>
                        </div>
                        <div
                            style={{ padding: '0', backgroundColor: 'white' }}
                            dangerouslySetInnerHTML={{
                                __html: pinResetOtpTemplate.bodyHtml
                                    .replace(/\{\{otpCode\}\}/g, '482915')
                                    .replace(/\{\{boardName\}\}/g, 'Marasca Samui')
                                    .replace(/\{\{expiryMinutes\}\}/g, '10')
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ── Reset Password Email Template ── */}
            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <KeyRound size={20} color="#6366f1" />
                    Reset Password Email Template
                    <span title="สถานการณ์ที่ส่ง: เมื่อผู้ใช้กด 'Forgot your password?' ในหน้า Login (เฉพาะบัญชี Internal เท่านั้น)&#10;จุดประสงค์: ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปยังอีเมลของผู้ใช้" style={{ display: 'flex' }}>
                        <Info size={16} color="#94a3b8" style={{ cursor: 'help', marginLeft: '4px' }} />
                    </span>
                </h2>
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <strong>Available Variables:</strong>{' '}
                    <code style={codeStyle}>{'{{resetLink}}'}</code>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Email Subject</label>
                    <input
                        type="text"
                        value={resetPasswordTemplate.subject}
                        onChange={e => setResetPasswordTemplate({ ...resetPasswordTemplate, subject: e.target.value })}
                        style={inputStyle}
                    />
                </div>

                <CollapsibleHtmlBody
                    label="Email HTML Body"
                    value={resetPasswordTemplate.bodyHtml}
                    onChange={val => setResetPasswordTemplate({ ...resetPasswordTemplate, bodyHtml: val })}
                />

                {/* Live Preview */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    <label style={{ ...labelStyle, color: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Mail size={16} /> Live Email Preview
                    </label>
                    <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
                        <div style={{ padding: '12px 16px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Subject:</span>{' '}
                            <strong>{resetPasswordTemplate.subject}</strong>
                        </div>
                        <div
                            style={{ padding: '0', backgroundColor: 'white' }}
                            dangerouslySetInnerHTML={{
                                __html: resetPasswordTemplate.bodyHtml
                                    .replace(/\{\{resetLink\}\}/g, '#')
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ── Access Granted Email Template ── */}
            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <UserPlus size={20} color="#6366f1" />
                    Access Granted Email Template
                    <span title="สถานการณ์ที่ส่ง: เมื่อผู้ใช้ที่มีบัญชีอยู่แล้ว ถูกเพิ่มเข้า Board หรือ Workspace โดยตรง (ไม่ต้องกดตอบรับ)&#10;จุดประสงค์: แจ้งให้ทราบว่าได้สิทธิ์เข้าถึงอะไร พร้อมลิงก์เปิดเข้าได้ทันที" style={{ display: 'flex' }}>
                        <Info size={16} color="#94a3b8" style={{ cursor: 'help', marginLeft: '4px' }} />
                    </span>
                </h2>
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <strong>Available Variables:</strong>{' '}
                    <code style={codeStyle}>{'{{inviterName}}'}</code>{' '}
                    <code style={codeStyle}>{'{{targetType}}'}</code>{' '}
                    <code style={codeStyle}>{'{{targetName}}'}</code>{' '}
                    <code style={codeStyle}>{'{{workspaceName}}'}</code>{' '}
                    <code style={codeStyle}>{'{{role}}'}</code>{' '}
                    <code style={codeStyle}>{'{{accessLink}}'}</code>
                    <div style={{ marginTop: '8px', fontSize: '12px' }}>
                        <code style={codeStyle}>{'{{targetType}}'}</code> จะเป็น <strong>board</strong> หรือ <strong>workspace</strong> — template เดียวนี้ใช้กับทั้งสองกรณี
                    </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Email Subject</label>
                    <input
                        type="text"
                        value={accessGrantedTemplate.subject}
                        onChange={e => setAccessGrantedTemplate({ ...accessGrantedTemplate, subject: e.target.value })}
                        style={inputStyle}
                    />
                </div>

                <CollapsibleHtmlBody
                    label="Email HTML Body"
                    value={accessGrantedTemplate.bodyHtml}
                    onChange={val => setAccessGrantedTemplate({ ...accessGrantedTemplate, bodyHtml: val })}
                />

                {/* Live Preview */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                    <label style={{ ...labelStyle, color: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Mail size={16} /> Live Email Preview
                    </label>
                    <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
                        <div style={{ padding: '12px 16px', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Subject:</span>{' '}
                            <strong>
                                {accessGrantedTemplate.subject
                                    .replace(/\{\{inviterName\}\}/g, 'Somchai')
                                    .replace(/\{\{targetName\}\}/g, 'IT Brand Office')}
                            </strong>
                        </div>
                        <div
                            style={{ padding: '0', backgroundColor: 'white' }}
                            dangerouslySetInnerHTML={{
                                __html: accessGrantedTemplate.bodyHtml
                                    .replace(/\{\{inviterName\}\}/g, 'Somchai')
                                    .replace(/\{\{targetType\}\}/g, 'board')
                                    .replace(/\{\{targetName\}\}/g, 'IT Brand Office')
                                    .replace(/\{\{workspaceName\}\}/g, 'BusinessTech')
                                    .replace(/\{\{role\}\}/g, 'editor')
                                    .replace(/\{\{accessLink\}\}/g, '#')
                            }}
                        />
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-solid"
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 24px',
                        borderRadius: '999px',
                        fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: '13.5px',
                        opacity: saving ? 0.7 : 1,
                    }}
                >
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12.5px',
    fontWeight: 600,
    color: 'hsl(var(--ink))',
    marginBottom: '6px'
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '10px',
    border: '1px solid hsl(var(--paper-edge))',
    backgroundColor: 'hsl(var(--paper-muted))',
    color: 'hsl(var(--ink))',
    fontSize: '13.5px',
    outline: 'none',
    boxSizing: 'border-box'
};

const codeStyle: React.CSSProperties = {
    backgroundColor: 'hsl(var(--paper-muted))',
    border: '1px solid hsl(var(--paper-edge))',
    padding: '2px 6px',
    borderRadius: '6px',
    color: 'hsl(var(--ink))',
    fontSize: '12px'
};

const CollapsibleHtmlBody = ({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div style={{ marginBottom: '24px', border: '1px solid hsl(var(--paper-edge))', borderRadius: '12px', overflow: 'hidden' }}>
            <div 
                onClick={() => setIsOpen(!isOpen)}
                style={{ 
                    padding: '12px 16px', 
                    backgroundColor: 'hsl(var(--paper-head))', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    borderBottom: isOpen ? '1px solid hsl(var(--paper-edge))' : 'none'
                }}
            >
                <div style={{ 
                    transition: 'transform 0.2s', 
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    color: 'hsl(var(--ink-soft))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <ChevronRight size={18} />
                </div>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'hsl(var(--ink))' }}>{label}</span>
            </div>
            {isOpen && (
                <div style={{ padding: '16px', backgroundColor: 'hsl(var(--paper))' }}>
                    <textarea 
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        style={{ ...inputStyle, minHeight: '400px', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px' }}
                    />
                </div>
            )}
        </div>
    );
};
