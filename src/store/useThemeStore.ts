import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PaletteId } from '../lib/palettes';

type Theme = 'light' | 'dark';
export type Density = 'normal' | 'compact';

interface ThemeState {
    theme: Theme;
    /** The colour palette (src/lib/palettes.ts), independent of light/dark. */
    palette: PaletteId;
    /** UI spacing density: normal or compact. */
    density: Density;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
    setPalette: (palette: PaletteId) => void;
    toggleDensity: () => void;
    setDensity: (density: Density) => void;
}

const applyTheme = (theme: Theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
};

// Narai is the stylesheet's own :root, so it needs no attribute at all — it's
// the app's default brand. Saturday (the legacy violet look) is the opt-in,
// reached via data-palette='saturday'.
const applyPalette = (palette: PaletteId) => {
    if (palette === 'narai') document.documentElement.removeAttribute('data-palette');
    else document.documentElement.setAttribute('data-palette', palette);
};

const applyDensity = (density: Density) => {
    if (density === 'compact') document.documentElement.setAttribute('data-density', 'compact');
    else document.documentElement.removeAttribute('data-density');
};

export const useThemeStore = create<ThemeState>()(
    persist(
        (set) => ({
            theme: 'light',
            palette: 'narai',
            density: 'normal',
            toggleTheme: () => set((state) => {
                const newTheme = state.theme === 'light' ? 'dark' : 'light';
                applyTheme(newTheme);
                return { theme: newTheme };
            }),
            setTheme: (theme) => {
                applyTheme(theme);
                set({ theme });
            },
            setPalette: (palette) => {
                applyPalette(palette);
                set({ palette });
            },
            toggleDensity: () => set((state) => {
                const next: Density = state.density === 'compact' ? 'normal' : 'compact';
                applyDensity(next);
                return { density: next };
            }),
            setDensity: (density) => {
                applyDensity(density);
                set({ density });
            },
        }),
        {
            name: 'theme-storage',
            onRehydrateStorage: () => (state) => {
                if (state) {
                    applyTheme(state.theme);
                    applyPalette(state.palette || 'narai');
                    applyDensity(state.density || 'normal');
                }
            }
        }
    )
);
