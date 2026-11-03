import { useState, useEffect, useCallback, useRef } from 'react';
import { Search } from 'lucide-react';

const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY || 'dc6zaTOxFJmzC';
const PICKER_HEIGHT = 442; // search + chips + grid + tabs
const PICKER_WIDTH = 360;

const MOOD_TAGS = ['#good luck', '#high five', '#nervous', '#excited', '#thank you', '#love', '#LOL', '#wow', '#sad', '#angry'];

interface GifItem {
    id: string;
    previewUrl: string;
    originalUrl: string;
    title: string;
}

interface Props {
    onSelect: (url: string) => void;
    onClose: () => void;
    anchorBottom: number;
    anchorLeft: number;
}

export const GifStickerPicker = ({ onSelect, onClose, anchorBottom, anchorLeft }: Props) => {
    const [tab, setTab] = useState<'gifs' | 'stickers'>('gifs');
    const [query, setQuery] = useState('');
    const [activeTag, setActiveTag] = useState('trending');
    const [items, setItems] = useState<GifItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    // Disabled in the local demo build: this app must never make outbound
    // network calls, and Giphy's API is the one real external dependency
    // this picker had. Left wired up (incl. GIPHY_KEY) in case a real key is
    // ever configured for a non-local deployment.
    const fetchItems = useCallback(async (_searchQuery: string, _type: 'gifs' | 'stickers') => {
        void GIPHY_KEY;
        setLoading(false);
        setError(true);
        setItems([]);
    }, []);

    useEffect(() => {
        fetchItems(activeTag === 'trending' ? '' : activeTag, tab);
    }, [tab, activeTag, fetchItems]);

    useEffect(() => {
        if (!query) return;
        const t = setTimeout(() => {
            setActiveTag('');
            fetchItems(query, tab);
        }, 400);
        return () => clearTimeout(t);
    }, [query, tab, fetchItems]);

    useEffect(() => {
        setTimeout(() => searchRef.current?.focus(), 50);
    }, []);

    // Clamp left so picker doesn't overflow right edge
    const safeLeft = Math.min(Math.max(8, anchorLeft), window.innerWidth - PICKER_WIDTH - 8);
    // Clamp bottom so picker doesn't overflow top of viewport
    const safeBottom = Math.min(anchorBottom, window.innerHeight - PICKER_HEIGHT - 8);

    return (
        <>
            {/* Backdrop */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 499 }} onMouseDown={onClose} />

            {/* Picker */}
            <div
                style={{
                    position: 'fixed',
                    bottom: Math.max(8, safeBottom),
                    left: safeLeft,
                    width: PICKER_WIDTH,
                    backgroundColor: 'hsl(var(--color-bg-surface))',
                    borderRadius: '14px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 0 0 1px hsl(var(--color-border))',
                    overflow: 'hidden',
                    zIndex: 500,
                    display: 'flex',
                    flexDirection: 'column',
                    userSelect: 'none',
                }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* Search */}
                <div style={{ padding: '12px 12px 6px' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Search size={15} style={{ position: 'absolute', left: 12, color: 'hsl(var(--color-text-tertiary))', pointerEvents: 'none' }} />
                        <input
                            ref={searchRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={`Search ${tab === 'gifs' ? 'GIFs' : 'Stickers'}`}
                            style={{
                                width: '100%',
                                padding: '8px 12px 8px 36px',
                                borderRadius: '24px',
                                border: '1px solid hsl(var(--color-border))',
                                backgroundColor: 'hsl(var(--color-bg-canvas))',
                                color: 'hsl(var(--color-text-primary))',
                                fontSize: '14px',
                                outline: 'none',
                            }}
                        />
                    </div>
                </div>

                {/* Category chips */}
                <div style={{
                    display: 'flex',
                    gap: '6px',
                    padding: '4px 12px 8px',
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                }}>
                    <button onClick={() => { setActiveTag('trending'); setQuery(''); }} style={chipStyle(activeTag === 'trending')}>Trending</button>
                    {MOOD_TAGS.map(tag => (
                        <button key={tag} onClick={() => { setActiveTag(tag); setQuery(''); }} style={chipStyle(activeTag === tag)}>{tag}</button>
                    ))}
                </div>

                {/* Grid */}
                <div style={{
                    height: '280px',
                    overflowY: 'auto',
                    padding: '0 8px 4px',
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'hsl(var(--color-border)) transparent',
                    backgroundColor: 'hsl(var(--color-bg-canvas))',
                }}>
                    {loading && (
                        <div style={centerStyle}>
                            <div style={{ width: 28, height: 28, border: '3px solid hsl(var(--color-border))', borderTop: '3px solid hsl(var(--color-brand-primary))', borderRadius: '50%', animation: 'gif-spin 0.8s linear infinite' }} />
                        </div>
                    )}
                    {!loading && error && (
                        <div style={centerStyle}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 28, marginBottom: 8 }}>😕</div>
                                <div style={{ color: 'hsl(var(--color-text-secondary))', fontSize: 13 }}>Could not load. Check your API key.</div>
                            </div>
                        </div>
                    )}
                    {!loading && !error && items.length === 0 && (
                        <div style={centerStyle}>
                            <div style={{ color: 'hsl(var(--color-text-secondary))', fontSize: 13 }}>No results found</div>
                        </div>
                    )}
                    {!loading && !error && items.length > 0 && (
                        <div style={{ columns: 3, columnGap: 4, paddingTop: 4 }}>
                            {items.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => { onSelect(item.originalUrl); onClose(); }}
                                    style={{
                                        breakInside: 'avoid',
                                        marginBottom: 4,
                                        borderRadius: 6,
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        display: 'block',
                                        backgroundColor: 'hsl(var(--color-bg-subtle))',
                                        transition: 'opacity 0.12s',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                                >
                                    <img src={item.previewUrl} alt={item.title} loading="lazy" style={{ width: '100%', display: 'block' }} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderTop: '1px solid hsl(var(--color-border))', backgroundColor: 'hsl(var(--color-bg-surface))' }}>
                    <button
                        onClick={() => setTab('gifs')}
                        style={{
                            flex: 1, padding: '11px 8px', border: 'none', cursor: 'pointer',
                            backgroundColor: tab === 'gifs' ? 'hsl(var(--color-brand-primary))' : 'transparent',
                            color: tab === 'gifs' ? 'white' : 'hsl(var(--color-text-secondary))',
                            fontSize: '13px', fontWeight: 600,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            borderBottomLeftRadius: 14, transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { if (tab !== 'gifs') e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'; }}
                        onMouseLeave={(e) => { if (tab !== 'gifs') e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                        <span style={{ fontSize: 10, border: '1.5px solid currentColor', borderRadius: 3, padding: '1px 3px', fontWeight: 800 }}>GIF</span>
                        GIFs
                    </button>
                    <button
                        onClick={() => setTab('stickers')}
                        style={{
                            flex: 1, padding: '11px 8px', border: 'none', cursor: 'pointer',
                            backgroundColor: tab === 'stickers' ? 'hsl(var(--color-brand-primary))' : 'transparent',
                            color: tab === 'stickers' ? 'white' : 'hsl(var(--color-text-secondary))',
                            fontSize: '13px', fontWeight: 600,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            borderBottomRightRadius: 14, transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { if (tab !== 'stickers') e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'; }}
                        onMouseLeave={(e) => { if (tab !== 'stickers') e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                        🎭 Stickers
                    </button>
                </div>
            </div>

            <style>{`@keyframes gif-spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );
};

const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 14px',
    borderRadius: 20,
    border: active ? 'none' : '1px solid hsl(var(--color-border))',
    cursor: 'pointer',
    backgroundColor: active ? 'hsl(var(--color-brand-primary))' : 'transparent',
    color: active ? 'white' : 'hsl(var(--color-text-primary))',
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'background 0.15s',
});

const centerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: 200,
};
