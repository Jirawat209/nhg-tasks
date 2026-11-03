import { supabase } from './supabase';
import { useThemeStore } from '../store/useThemeStore';
import { isPaletteId, type PaletteId } from './palettes';

/**
 * The palette follows the account (profiles.ui_theme, 20261020_profile_ui_theme.sql);
 * the localStorage copy in useThemeStore is only the instant value before the
 * profile has loaded.
 */

let adopted = false;

/**
 * Applies the palette stored on the account. Only the first load of a page
 * session counts: loadUserData runs again every few minutes, and an older
 * value coming back must not undo a choice made a moment ago.
 */
export const adoptAccountPalette = (value: unknown) => {
    if (adopted) return;
    adopted = true;
    useThemeStore.getState().setPalette(isPaletteId(value) ? value : 'narai');
};

/** Signing out: the next account's own palette is adopted when it loads. */
export const forgetAccountPalette = () => {
    adopted = false;
};

/** A choice made in Profile Settings / More: applies at once and is saved to the account. */
export const chooseAccountPalette = (userId: string | undefined, palette: PaletteId) => {
    useThemeStore.getState().setPalette(palette);
    adopted = true;
    if (!userId) return;
    supabase.from('profiles').update({ ui_theme: palette }).eq('id', userId).then(({ error }) => {
        if (error) console.error('Failed to save theme:', error);
    });
};
