/**
 * The app's colour palettes. Each person picks one (Profile Settings › Theme,
 * or More › Theme on the phone); light/dark is a separate switch on top.
 *
 * The colours themselves are CSS variables: Saturday is :root in
 * src/styles/variables.css (and the .m-app block in src/mobile/mobile.css),
 * every other palette overrides the same variables under
 * html[data-palette='<id>'], set by useThemeStore.setPalette. `swatch` is only
 * for drawing the little preview in the picker, in that palette's own colours
 * whatever palette is active.
 */
export type PaletteId = 'saturday' | 'narai';

export interface Palette {
    id: PaletteId;
    name: string;
    blurb: string;
    swatch: { canvas: string; sidebar: string; line: string; brand: string; brandSoft: string; accent: string; text: string };
}

export const PALETTES: Palette[] = [
    {
        id: 'narai',
        name: 'Narai',
        blurb: 'Narai Green on warm paper — the real brand',
        swatch: { canvas: '#fffaf0', sidebar: '#FFEFD2', line: '#f6e3c1', brand: '#152A00', brandSoft: '#f6e3c1', accent: '#A76400', text: '#152A00' },
    },
    {
        id: 'saturday',
        name: 'Classic',
        blurb: 'Violet on white — the legacy look',
        swatch: { canvas: '#ffffff', sidebar: '#f0eef8', line: '#e4e1f0', brand: '#7c3fe4', brandSoft: '#f0eeff', accent: '#c03fe4', text: '#1a1728' },
    },
];

export const isPaletteId = (value: unknown): value is PaletteId =>
    PALETTES.some(p => p.id === value);
