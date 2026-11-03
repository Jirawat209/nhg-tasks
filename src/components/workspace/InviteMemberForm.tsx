import { useState, useRef } from 'react';
import { RoleSelector } from './RoleSelector';
import { useBoardStore } from '../../store/useBoardStore';

interface InviteMemberFormProps {
    onInvite: (email: string, role: string) => Promise<void>;
    defaultRole?: string;
    type?: 'workspace' | 'board';
}

export const InviteMemberForm = ({ onInvite, defaultRole = 'member', type = 'board' }: InviteMemberFormProps) => {
    const searchUsers = useBoardStore(state => state.searchUsers);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState(defaultRole);
    const [isLoading, setIsLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeoutRef = useRef<any>(null);

    const handleSearch = (value: string) => {
        setEmail(value);

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        if (!value.trim() || value.includes('@')) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        searchTimeoutRef.current = setTimeout(async () => {
            const results = await searchUsers(value);
            // Filter out if exact match already entered (optional, but good UX)
            setSuggestions(results);
            setShowSuggestions(results.length > 0);
        }, 300);
    };

    const handleSelectUser = (user: any) => {
        setEmail(user.email);
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;

        setIsLoading(true);
        try {
            await onInvite(email, role);
            setEmail('');
            setRole(defaultRole);
            setSuggestions([]);
        } catch (error) {
            console.error('Error inviting member:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Close suggestions on click outside (simplified for now via blur delay or overlay)
    // For simplicity in this modal, we can just close when clicking away from input if not clicking suggestion

    return (
        <div style={{ position: 'relative' }}>
            <form onSubmit={handleSubmit} style={{
                display: 'flex',
                gap: '8px',
                padding: '12px 20px',
                borderBottom: '1px solid hsl(var(--color-border))'
            }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <input
                        type="email" // Use text if we want to allow non-email searching freely, but email is better for validation
                        value={email}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Enter email or name"
                        disabled={isLoading}
                        autoComplete="off"
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '4px',
                            fontSize: '14px',
                            outline: 'none'
                        }}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        onFocus={() => email && suggestions.length > 0 && setShowSuggestions(true)}
                    />

                    {showSuggestions && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            backgroundColor: 'white',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '4px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            zIndex: 10,
                            marginTop: '4px',
                            maxHeight: '200px',
                            overflowY: 'auto'
                        }}>
                            {suggestions.map(user => (
                                <div
                                    key={user.id}
                                    onClick={() => handleSelectUser(user)}
                                    style={{
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        borderBottom: '1px solid #f0f0f0'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f7fa'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                >
                                    {user.avatar_url ? (
                                        <img src={user.avatar_url} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                                    ) : (
                                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
                                            {(user.full_name?.[0] || user.email?.[0] || '?').toUpperCase()}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 500 }}>{user.full_name}</span>
                                        <span style={{ fontSize: '12px', color: '#666' }}>{user.email}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <RoleSelector
                    value={role}
                    onChange={setRole}
                    disabled={isLoading}
                    type={type}
                />

                <button
                    type="submit"
                    disabled={isLoading || !email.trim()}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: isLoading || !email.trim() ? '#ccc' : 'hsl(var(--color-brand-primary))',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: isLoading || !email.trim() ? 'not-allowed' : 'pointer'
                    }}
                >
                    {isLoading ? 'Inviting...' : 'Invite'}
                </button>
            </form>
        </div>
    );
};
