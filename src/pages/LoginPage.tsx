import { useEffect, useLayoutEffect, useState } from 'react';
import { useThemeStore } from '../store/useThemeStore';
import { supabase } from '../lib/supabase';
import { savePendingDeepLink } from '../lib/pendingDeepLink';
import { takeMicrosoftEntry } from '../lib/initialPath';

// A sign-in the provider or Supabase turned down comes back to the page with
// error_description in the query or the hash. Read it once, and tidy the URL.
const readReturnedAuthError = (): string | null => {
    const fromQuery = new URLSearchParams(window.location.search);
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const message = fromQuery.get('error_description') || fromHash.get('error_description');
    if (!message) return null;
    ['error', 'error_code', 'error_description'].forEach(k => fromQuery.delete(k));
    const rest = fromQuery.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    return message.replace(/\+/g, ' ');
};

export const LoginPage = () => {
    // The sign-in page is always Narai's look (the app's default brand). A
    // person's own chosen palette is theirs once they are signed in; on this
    // page, where nobody has been identified yet, whatever palette the last
    // person left in the browser is set aside before paint and put back when
    // the page goes away.
    useLayoutEffect(() => {
        const root = document.documentElement;
        const had = root.getAttribute('data-palette');
        root.removeAttribute('data-palette');
        return () => {
            const palette = useThemeStore.getState().palette;
            if (palette === 'narai') root.removeAttribute('data-palette');
            else root.setAttribute('data-palette', had || palette);
        };
    }, []);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showEmailLogin, setShowEmailLogin] = useState(false);

    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotResult, setForgotResult] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) throw error;
            // Keep any emailed item link before the URL is reset, so signing in
            // from the link still lands on that item.
            savePendingDeepLink(window.location.search);
            window.history.replaceState(null, '', '/');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setForgotLoading(true);
        setForgotResult(null);

        try {
            const { data, error: fnError } = await supabase.functions.invoke('invite-user', {
                body: {
                    action: 'forgot_password',
                    email: forgotEmail,
                    redirectTo: `${window.location.origin}/reset-password`
                }
            });

            // On a non-2xx response the SDK throws before parsing the body, so
            // `data` is null and the real error payload only lives on
            // fnError.context (the raw Response) — read it back explicitly to
            // tell a Google-account rejection apart from any other failure.
            let errorBody: any = data;
            if (fnError && (fnError as any).context?.json) {
                try { errorBody = await (fnError as any).context.json(); } catch { /* body already consumed or not JSON */ }
            }

            if (errorBody?.error === 'GOOGLE_ACCOUNT') {
                setForgotResult({ type: 'error', text: 'This account signs in with Google or Microsoft. Please use that sign-in button instead.' });
            } else if (fnError || errorBody?.error) {
                setForgotResult({ type: 'error', text: errorBody?.error || fnError?.message || 'Something went wrong. Please try again.' });
            } else {
                setForgotResult({ type: 'success', text: 'If this email belongs to an internal account, a reset link has been sent.' });
            }
        } catch (err: any) {
            setForgotResult({ type: 'error', text: err.message || 'Something went wrong. Please try again.' });
        } finally {
            setForgotLoading(false);
        }
    };

    const handleMicrosoftLogin = async () => {
        try {
            // As for Google: stash the deep link, come back to the bare origin
            // (it is on the redirect allow-list). Azure must return an email.
            savePendingDeepLink(window.location.search);
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'azure',
                options: {
                    scopes: 'email',
                    redirectTo: `${window.location.origin}`
                }
            });
            if (error) throw error;
        } catch (err: any) {
            setError(err.message);
        }
    };

    // Opened at /auth/microsoft: go straight to Microsoft. A failed attempt
    // comes back to "/" with an error instead, so this can't loop.
    useEffect(() => {
        const returned = readReturnedAuthError();
        if (returned) {
            setError(returned);
            return;
        }
        if (takeMicrosoftEntry()) void handleMicrosoftLogin();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleGoogleLogin = async () => {
        try {
            // The OAuth round trip returns to the bare origin, so the link has to
            // be stashed before leaving the page. sessionStorage survives it
            // (same tab, same origin); redirectTo is left alone so it keeps
            // matching the allowed-redirect list configured in Supabase.
            savePendingDeepLink(window.location.search);
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}`
                }
            });
            if (error) throw error;
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            overflow: 'hidden',
            // Local-only build: no remote video banner (it previously streamed
            // live from naraihospitalitygroup.com, the one network dependency
            // this page had). A flat Narai Green field stands in for it.
            backgroundColor: '#152A00',
            backgroundImage: 'radial-gradient(120% 90% at 15% 10%, rgba(63,125,50,0.35) 0%, transparent 55%), radial-gradient(100% 80% at 85% 100%, rgba(167,100,0,0.2) 0%, transparent 60%)',
            fontFamily: 'var(--font-family)'
        }}>

            <div style={{
                position: 'relative',
                zIndex: 2,
                backgroundColor: 'white',
                padding: '48px 40px',
                borderRadius: '16px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                width: '100%',
                maxWidth: '420px',
                textAlign: 'center'
            }}>
                {/* Logo Section */}
                <div style={{ marginBottom: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '28%',
                        overflow: 'hidden',
                        marginBottom: '16px',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
                        backgroundColor: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <img
                            src="/narai-logo-icon-dark.png"
                            alt="Narai Hospitality Group"
                            style={{ width: '80%', height: '80%', objectFit: 'contain' }}
                        />
                    </div>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.025em' }}>
                        NHG Tasks
                    </h1>
                    <p style={{ marginTop: '8px', fontSize: '14px', color: '#64748b' }}>
                        Log in to your workspace
                    </p>
                </div>

                {error && (
                    <div style={{
                        backgroundColor: '#fef2f2',
                        color: '#b91c1c',
                        padding: '12px',
                        borderRadius: '8px',
                        marginBottom: '20px',
                        fontSize: '13px',
                        border: '1px solid #fee2e2'
                    }}>
                        {error}
                    </div>
                )}

                {/* Google Login (Now First) */}
                <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
                    <button
                        onClick={handleGoogleLogin}
                        type="button"
                        style={{
                            width: '100%',
                            padding: '12px',
                            backgroundColor: 'white',
                            color: '#0f172a',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            fontSize: '15px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px',
                            transition: 'background-color 0.2s',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                        <svg width="20" height="20" viewBox="0 0 48 48">
                            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                        </svg>
                        Continue with Google
                    </button>
                </div>

                <div style={{ position: 'relative', marginBottom: '24px' }}>
                    <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: '1px solid #e2e8f0' }}></div>
                    <span 
                        onClick={() => setShowEmailLogin(!showEmailLogin)}
                        style={{ 
                            position: 'relative', 
                            backgroundColor: 'white', 
                            padding: '0 12px', 
                            color: '#6366f1', 
                            fontSize: '12px', 
                            fontWeight: 600, 
                            textTransform: 'uppercase',
                            cursor: 'pointer',
                            userSelect: 'none'
                        }}
                    >
                        {showEmailLogin ? 'HIDE EMAIL OPTION' : 'OR SIGN IN WITH EMAIL'}
                    </span>
                </div>

                {showEmailLogin && !showForgotPassword && (
                    <>
                        {/* Microsoft (Entra ID): under the email option for now, until it is rolled out */}
                        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
                            <button
                                onClick={handleMicrosoftLogin}
                                type="button"
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    backgroundColor: 'white',
                                    color: '#0f172a',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    fontSize: '15px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '12px',
                                    transition: 'background-color 0.2s',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                            >
                                <svg width="20" height="20" viewBox="0 0 23 23" aria-hidden="true">
                                    <path fill="#f35325" d="M1 1h10v10H1z" />
                                    <path fill="#81bc06" d="M12 1h10v10H12z" />
                                    <path fill="#05a6f0" d="M1 12h10v10H1z" />
                                    <path fill="#ffba08" d="M12 12h10v10H12z" />
                                </svg>
                                Continue with Microsoft
                            </button>
                        </div>
                        <form onSubmit={handleEmailLogin} style={{ textAlign: 'left' }}>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Your Alias Email</label>
                                <input
                                    type="email"
                                    placeholder="name@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '12px 14px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '15px',
                                        outline: 'none',
                                        transition: 'border-color 0.2s',
                                        backgroundColor: '#f8fafc'
                                    }}
                                />
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Password</label>
                                <input
                                    type="password"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '12px 14px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '15px',
                                        outline: 'none',
                                        backgroundColor: '#f8fafc'
                                    }}
                                />
                            </div>

                            <div style={{ textAlign: 'right', marginBottom: '20px' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setForgotEmail(email);
                                        setForgotResult(null);
                                        setShowForgotPassword(true);
                                    }}
                                    style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '13px', fontWeight: 500, padding: 0 }}
                                >
                                    Forgot your password?
                                </button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        backgroundColor: '#6366f1',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '15px',
                                        fontWeight: 600,
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    {loading ? 'Processing...' : 'Log In'}
                                </button>
                            </div>
                        </form>

                        <div style={{ textAlign: 'center' }}>
                            <button
                                onClick={() => window.open('https://rebrand.ly/nhgcts', '_blank')}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#6366f1',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500
                                }}
                            >
                                Need an account? Sign Up
                            </button>
                        </div>
                    </>
                )}

                {showEmailLogin && showForgotPassword && (
                    <>
                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px', textAlign: 'left' }}>
                            Enter your alias email and we'll send a password reset link. This only works for Internal accounts — Google accounts should sign in with "Continue with Google".
                        </p>
                        <form onSubmit={handleForgotPassword} style={{ textAlign: 'left' }}>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Your Alias Email</label>
                                <input
                                    type="email"
                                    placeholder="name@company.com"
                                    value={forgotEmail}
                                    onChange={(e) => setForgotEmail(e.target.value)}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '12px 14px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '15px',
                                        outline: 'none',
                                        backgroundColor: '#f8fafc'
                                    }}
                                />
                            </div>

                            {forgotResult && (
                                <div style={{
                                    backgroundColor: forgotResult.type === 'success' ? '#f0fdf4' : '#fef2f2',
                                    color: forgotResult.type === 'success' ? '#15803d' : '#b91c1c',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    marginBottom: '20px',
                                    fontSize: '13px',
                                    border: `1px solid ${forgotResult.type === 'success' ? '#dcfce7' : '#fee2e2'}`
                                }}>
                                    {forgotResult.text}
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                                <button
                                    type="submit"
                                    disabled={forgotLoading}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        backgroundColor: '#6366f1',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '15px',
                                        fontWeight: 600,
                                        cursor: forgotLoading ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.2)'
                                    }}
                                >
                                    {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                                </button>
                            </div>
                        </form>

                        <div style={{ textAlign: 'center' }}>
                            <button
                                onClick={() => setShowForgotPassword(false)}
                                style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}
                            >
                                Back to login
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
