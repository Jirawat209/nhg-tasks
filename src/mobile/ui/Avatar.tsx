import { useState, type CSSProperties } from 'react';
import { colorFor, initialsOf } from './format';

interface AvatarProps {
    name: string | null | undefined;
    src?: string | null;
    size?: number;
    /** A ring in the card colour, for avatars that overlap. */
    ring?: boolean;
    style?: CSSProperties;
}

/** A person's photo, or their initials on a colour picked from their name. */
export const Avatar = ({ name, src, size = 32, ring = false, style }: AvatarProps) => {
    const [failed, setFailed] = useState(false);
    const base: CSSProperties = {
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        boxShadow: ring ? '0 0 0 2px hsl(var(--m-card))' : undefined,
        ...style
    };

    if (src && /^https?:\/\//.test(src) && !failed) {
        return (
            <img
                src={src}
                alt=""
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={() => setFailed(true)}
                style={{ ...base, objectFit: 'cover', display: 'block' }}
            />
        );
    }

    return (
        <span
            aria-hidden="true"
            style={{
                ...base,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colorFor(name),
                color: '#fff',
                fontSize: Math.max(10, Math.round(size * 0.4)),
                fontWeight: 600,
                letterSpacing: '0.02em'
            }}
        >
            {initialsOf(name)}
        </span>
    );
};

/** Overlapping avatars, with "+N" for the rest. */
export const AvatarStack = ({ people, max = 2, size = 32 }: {
    people: { id: string; name: string; avatarUrl?: string | null }[];
    max?: number;
    size?: number;
}) => {
    const shown = people.slice(0, max);
    const extra = people.length - shown.length;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {shown.map((person, index) => (
                <Avatar
                    key={person.id}
                    name={person.name}
                    src={person.avatarUrl}
                    size={size}
                    ring
                    style={{ marginLeft: index === 0 ? 0 : -Math.round(size * 0.28), zIndex: shown.length - index }}
                />
            ))}
            {extra > 0 && (
                <span
                    style={{
                        marginLeft: -Math.round(size * 0.28),
                        width: size,
                        height: size,
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'hsl(var(--m-chip-strong))',
                        color: 'hsl(var(--m-text))',
                        fontSize: Math.max(10, Math.round(size * 0.36)),
                        fontWeight: 600,
                        boxShadow: '0 0 0 2px hsl(var(--m-card))'
                    }}
                >
                    +{extra}
                </span>
            )}
        </span>
    );
};
