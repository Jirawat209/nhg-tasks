import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useUserStore } from '../../store/useUserStore';
import { X, UserCog, Save, Camera } from 'lucide-react';
import { AvatarCropModal } from './AvatarCropModal';
import { useThemeStore } from '../../store/useThemeStore';
import { PALETTES } from '../../lib/palettes';
import { chooseAccountPalette } from '../../lib/uiTheme';
import { ThemeChoiceCard } from '../common/ThemeChoice';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const formatRole = (role?: string) => {
    if (!role) return 'User';
    return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

interface ProfileSettingsModalProps {
    onClose: () => void;
}

export const ProfileSettingsModal = ({ onClose }: ProfileSettingsModalProps) => {
    const { user } = useAuth();
    const { currentUser, setUser } = useUserStore();
    const palette = useThemeStore(state => state.palette);
    const density = useThemeStore(state => state.density);
    const setDensity = useThemeStore(state => state.setDensity);

    const [name, setName] = useState(currentUser.name);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [avatarUrl, setAvatarUrl] = useState(
        currentUser.avatar?.startsWith('http') ? currentUser.avatar : user?.user_metadata?.avatar_url
    );
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    // Holds the picked file while the user frames it in the crop modal; the
    // upload only happens once they confirm the crop.
    const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const userAvatar = avatarUrl;
    const userInitials = (currentUser.name || user?.email?.split('@')[0] || 'U').charAt(0).toUpperCase();
    const trimmedName = name.trim();

    const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-selecting the same file later
        if (!file || !user?.id) return;

        if (!file.type.startsWith('image/')) {
            setMessage({ type: 'error', text: 'Please choose an image file.' });
            return;
        }
        if (file.size > MAX_AVATAR_BYTES) {
            setMessage({ type: 'error', text: 'Image must be under 5MB.' });
            return;
        }

        setMessage({ type: '', text: '' });
        setPendingAvatarFile(file);
    };

    const handleCroppedAvatar = async (blob: Blob) => {
        if (!user?.id) return;

        setUploadingAvatar(true);
        setMessage({ type: '', text: '' });

        // The cropper always outputs JPEG, so the extension is fixed rather
        // than derived from the original filename.
        // Unique filename per upload (rather than a fixed name) so the public
        // URL changes too — otherwise the browser/CDN would keep showing the
        // old cached image at the same URL after a re-upload.
        const path = `${user.id}/${Date.now()}.jpg`;

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(path, blob, { contentType: 'image/jpeg' });
        if (uploadError) {
            setUploadingAvatar(false);
            setMessage({ type: 'error', text: 'Upload failed: ' + uploadError.message });
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

        const [{ error: dbError }, authResult] = await Promise.all([
            supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id),
            supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
        ]);

        setUploadingAvatar(false);

        if (dbError) {
            setMessage({ type: 'error', text: 'Failed to save avatar: ' + dbError.message });
            return;
        }
        if (authResult.error) {
            console.error('Failed to sync auth avatar metadata:', authResult.error);
        }

        setAvatarUrl(publicUrl);
        setUser({ ...currentUser, avatar: publicUrl });
        setPendingAvatarFile(null);
        setMessage({ type: 'success', text: 'Profile photo updated' });
    };

    const handleSave = async () => {
        if (!user?.id || !trimmedName) return;
        setSaving(true);
        setMessage({ type: '', text: '' });

        // .select() matters: a Supabase UPDATE blocked by RLS returns no
        // error, just zero affected rows — reading the row back is what
        // actually proves the write happened.
        //
        // profiles.full_name is the source of truth everything server-side
        // reads (notification text, admin user table, board member lists),
        // but the header/dropdown/greeting all display
        // user.user_metadata.full_name straight from the auth session — so
        // both need updating, or the name only "changes" in places no one
        // is looking at.
        const [{ data, error }, authResult] = await Promise.all([
            supabase.from('profiles').update({ full_name: trimmedName }).eq('id', user.id).select('full_name').maybeSingle(),
            supabase.auth.updateUser({ data: { full_name: trimmedName } })
        ]);

        setSaving(false);

        if (error) {
            setMessage({ type: 'error', text: 'Failed to save: ' + error.message });
            return;
        }
        if (!data) {
            setMessage({ type: 'error', text: "Couldn't save — your account doesn't have permission to update this." });
            return;
        }
        if (authResult.error) {
            console.error('Failed to sync auth display name:', authResult.error);
        }

        setUser({ ...currentUser, name: trimmedName });
        setMessage({ type: 'success', text: 'Profile updated' });
        setTimeout(onClose, 700);
    };

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{
                backgroundColor: 'hsl(var(--color-bg-surface))',
                borderRadius: '8px',
                width: '480px',
                maxWidth: '90vw',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                border: '1px solid hsl(var(--color-border))',
                overflow: 'hidden'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid hsl(var(--color-border))' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <UserCog size={18} />
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>Profile Settings</h3>
                    </div>
                    <button onClick={onClose} className="icon-btn"><X size={20} /></button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                        <div
                            onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
                            style={{
                                position: 'relative', width: '56px', height: '56px', borderRadius: '50%', flexShrink: 0,
                                cursor: uploadingAvatar ? 'default' : 'pointer'
                            }}
                        >
                            <div style={{
                                width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
                                border: '1px solid hsl(var(--color-border))',
                                backgroundColor: userAvatar ? 'transparent' : 'hsl(var(--color-brand-primary))',
                                color: 'white', fontSize: '20px', fontWeight: 600,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                opacity: uploadingAvatar ? 0.5 : 1
                            }}>
                                {userAvatar ? (
                                    <img src={userAvatar} alt="Profile" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : userInitials}
                            </div>
                            <div style={{
                                position: 'absolute', bottom: -2, right: -2, width: '22px', height: '22px', borderRadius: '50%',
                                backgroundColor: 'hsl(var(--color-brand-primary))', border: '2px solid hsl(var(--color-bg-surface))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <Camera size={11} color="white" />
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleAvatarSelect}
                                style={{ display: 'none' }}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: '15px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>{currentUser.name}</div>
                            <div style={{
                                display: 'inline-flex', marginTop: '4px', padding: '2px 8px', borderRadius: '10px',
                                fontSize: '11px', fontWeight: 600, backgroundColor: 'hsl(var(--color-bg-subtle))',
                                border: '1px solid hsl(var(--color-border))', color: 'hsl(var(--color-text-secondary))'
                            }}>
                                {formatRole(currentUser.system_role)}
                            </div>
                        </div>
                    </div>

                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'hsl(var(--color-text-primary))' }}>Display name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Your name"
                        style={{
                            width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid hsl(var(--color-border))',
                            fontSize: '14px', outline: 'none', backgroundColor: 'hsl(var(--color-bg-canvas))',
                            color: 'hsl(var(--color-text-primary))', boxSizing: 'border-box', marginBottom: '16px'
                        }}
                    />

                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'hsl(var(--color-text-primary))' }}>Email</label>
                    <div style={{
                        padding: '9px 12px', borderRadius: '6px', border: '1px solid hsl(var(--color-border))',
                        fontSize: '14px', backgroundColor: 'hsl(var(--color-bg-subtle))', color: 'hsl(var(--color-text-tertiary))'
                    }}>
                        {user?.email}
                    </div>

                    {/* Theme: applies at once, independent of Save (which is for the name) */}
                    <div style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px solid hsl(var(--color-border))' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>Theme</div>
                        <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', margin: '2px 0 10px' }}>
                            Colours for your account only. Dark mode still switches with the moon button.
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            {PALETTES.map(p => (
                                <ThemeChoiceCard key={p.id} palette={p} selected={palette === p.id} onSelect={() => chooseAccountPalette(user?.id, p.id)} />
                            ))}
                        </div>
                    </div>

                    {/* Layout Density */}
                    <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid hsl(var(--color-border))' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>Layout density</div>
                        <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', margin: '2px 0 10px' }}>
                            Choose between normal spacing and a tighter compact view.
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {(['normal', 'compact'] as const).map(opt => {
                                const active = density === opt;
                                return (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => setDensity(opt)}
                                        style={{
                                            padding: '9px 12px',
                                            borderRadius: '8px',
                                            border: active ? '2px solid hsl(var(--color-brand-primary))' : '1px solid hsl(var(--color-border))',
                                            backgroundColor: active ? 'hsl(var(--color-brand-primary) / 0.08)' : 'hsl(var(--color-bg-canvas))',
                                            color: 'hsl(var(--color-text-primary))',
                                            fontSize: '13px',
                                            fontWeight: active ? 600 : 500,
                                            cursor: 'pointer',
                                            textTransform: 'capitalize'
                                        }}
                                    >
                                        {opt}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {message.text && (
                        <div style={{
                            marginTop: '14px', padding: '8px 12px', borderRadius: '6px', fontSize: '12px',
                            backgroundColor: message.type === 'success' ? 'hsl(var(--color-status-green-bg) / 0.12)' : 'hsl(var(--color-status-red-bg) / 0.12)',
                            color: message.type === 'success' ? 'hsl(var(--color-status-green-bg))' : 'hsl(var(--color-status-red-bg))',
                            border: `1px solid ${message.type === 'success' ? 'hsl(var(--color-status-green-bg) / 0.3)' : 'hsl(var(--color-status-red-bg) / 0.3)'}`
                        }}>
                            {message.text}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 20px', borderTop: '1px solid hsl(var(--color-border))' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid hsl(var(--color-border))', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'hsl(var(--color-text-primary))' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !trimmedName}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 16px', borderRadius: '4px', border: 'none',
                            backgroundColor: 'hsl(var(--color-brand-primary))', color: 'white',
                            fontSize: '13px', fontWeight: 600,
                            cursor: (saving || !trimmedName) ? 'not-allowed' : 'pointer',
                            opacity: (saving || !trimmedName) ? 0.7 : 1
                        }}
                    >
                        <Save size={14} />
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>

            {pendingAvatarFile && (
                <AvatarCropModal
                    file={pendingAvatarFile}
                    saving={uploadingAvatar}
                    onCancel={() => setPendingAvatarFile(null)}
                    onConfirm={handleCroppedAvatar}
                />
            )}
        </div>,
        document.body
    );
};
