import { useSyncExternalStore } from 'react';

// Phones get the mobile layout (src/mobile); everything wider keeps the desktop
// one exactly as it is. A phone held sideways is wider than 767px but only
// ~430px tall, which the desktop layout can't use either, so a touch screen that
// short counts as mobile too. Tablets stay on desktop.
const MOBILE_QUERY = '(max-width: 767px), (pointer: coarse) and (max-height: 500px)';

// "desktop" / "mobile" pins the layout regardless of screen size — More > Desktop
// site on a phone, and the pill that brings the phone layout back. Absent = auto.
const LAYOUT_KEY = 'saturday:layout';
const LAYOUT_EVENT = 'nhg-tasks:layout-change';

export type LayoutOverride = 'desktop' | 'mobile' | null;

/**
 * Whether phones get the phone layout automatically. Turning it off sends every
 * phone back to the desktop layout in one change (the override above still
 * shows the phone layout to whoever sets it).
 */
export const MOBILE_LAYOUT_ENABLED = true;

export const getLayoutOverride = (): LayoutOverride => {
    try {
        const value = localStorage.getItem(LAYOUT_KEY);
        return value === 'desktop' || value === 'mobile' ? value : null;
    } catch {
        return null;
    }
};

export const setLayoutOverride = (value: LayoutOverride) => {
    try {
        if (value) localStorage.setItem(LAYOUT_KEY, value);
        else localStorage.removeItem(LAYOUT_KEY);
    } catch { /* private mode — the choice just won't stick */ }
    window.dispatchEvent(new Event(LAYOUT_EVENT));
};

/** Whether the screen itself is phone-sized, ignoring any override. */
export const isSmallScreen = () =>
    typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;

const subscribe = (onChange: () => void) => {
    const mql = window.matchMedia?.(MOBILE_QUERY);
    mql?.addEventListener?.('change', onChange);
    window.addEventListener(LAYOUT_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
        mql?.removeEventListener?.('change', onChange);
        window.removeEventListener(LAYOUT_EVENT, onChange);
        window.removeEventListener('storage', onChange);
    };
};

/** Whether the app renders its phone layout right now — for code outside React (the store). */
export const isMobileLayout = (): boolean => {
    const override = getLayoutOverride();
    if (override) return override === 'mobile';
    return MOBILE_LAYOUT_ENABLED && isSmallScreen();
};

/** True when the app should render its mobile layout. */
export const useIsMobile = () => useSyncExternalStore(subscribe, isMobileLayout, () => false);

/** True when a phone has been switched to the desktop layout (More > Desktop site). */
export const useForcedDesktopOnPhone = () =>
    useSyncExternalStore(subscribe, () => getLayoutOverride() === 'desktop' && isSmallScreen(), () => false);
