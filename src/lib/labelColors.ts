/**
 * The one palette every labelled column picks from — Status and Dropdown alike.
 *
 * Both used to choose colours their own way: Status offered this curated grid,
 * Dropdown handed the user a raw <input type="color">, i.e. all 16 million of
 * them. That made two boards built by two people look nothing alike and gave
 * the Dashboard's status charts an unbounded set of colours to render. Sharing
 * one list keeps the vocabulary finite and the two column types consistent.
 *
 * Ordered by hue family (10 steps each) so the grid reads as a spectrum.
 */
export const LABEL_COLORS = [
    // Narai Brand Primary Palette
    '#152A00', '#1F3A08', '#2A4A12', '#3F7D32', '#AAA024',
    '#250719', '#6B3B52', '#A76400', '#C98A1F', '#6E6655',
    // Reds
    '#FF1744', '#E53935', '#C62828', '#B71C1C', '#FF5252',
    '#FF6B6B', '#FF8A80', '#FFCDD2', '#D32F2F', '#FC3F82',
    // Pinks / Magentas
    '#E91E63', '#C2185B', '#AD1457', '#880E4F', '#F06292',
    '#FF4081', '#FF80AB', '#F48FB1', '#F8BBD9', '#FF6CE8',
    // Oranges
    '#FF5722', '#F4511E', '#BF360C', '#E64A19', '#FF7043',
    '#FF6D00', '#FF9800', '#F57C00', '#FFAB40', '#FFCCBC',
    // Yellows / Ambers
    '#FFC107', '#FFB300', '#FF8F00', '#FF6F00', '#FFCA28',
    '#FFD740', '#F9A825', '#F57F17', '#FFF176', '#FFF9C4',
    // Lime / Yellow-Greens
    '#CDDC39', '#C0CA33', '#AFB42B', '#9E9D24', '#D4E157',
    '#92BF0A', '#8BC34A', '#7CB342', '#689F38', '#C5E1A5',
    // Greens
    '#4CAF50', '#43A047', '#388E3C', '#2E7D32', '#1B5E20',
    '#00C853', '#69F0AE', '#00E676', '#A5D6A7', '#C8E6C9',
    // Teals / Cyans
    '#009688', '#00897B', '#00796B', '#00695C', '#006064',
    '#00BCD4', '#00ACC1', '#0097A7', '#26C6DA', '#B2EBF2',
    // Blues
    '#2196F3', '#1E88E5', '#1976D2', '#1565C0', '#0D47A1',
    '#448AFF', '#82B1FF', '#0288D1', '#0277BD', '#BBDEFB',
    // Purples / Violets
    '#9C27B0', '#8E24AA', '#7B1FA2', '#6A1B9A', '#4A148C',
    '#7C3FE4', '#673AB7', '#7E57C2', '#B39DDB', '#EDE7F6',
    // Neutrals / Grays
    '#607D8B', '#546E7A', '#455A64', '#37474F', '#263238',
    '#9E9E9E', '#757575', '#616161', '#424242', '#1A1728',
];

/**
 * Colour to hand a newly created option. Walks one colour per hue family so
 * the first several options in a column are told apart at a glance instead of
 * arriving as neighbouring shades of the same red.
 */
const NEW_LABEL_CYCLE = [
    '#152A00', // Narai green
    '#250719', // Narai deep plum
    '#A76400', // Narai amber/ochre
    '#3F7D32', // forest green
    '#2E7D8C', // teal
    '#6B3B52', // plum
    '#AAA024', // olive gold
    '#B33F2E', // terracotta
    '#6E6655', // warm stone
    '#607D8B', // slate
];

export const nextLabelColor = (existingCount: number): string =>
    NEW_LABEL_CYCLE[existingCount % NEW_LABEL_CYCLE.length];

/**
 * Snaps an arbitrary colour — in practice a fill read out of an imported
 * spreadsheet — onto the nearest colour the system itself uses: the picker grid
 * plus the defaults handed to new options. Without this an import brings in
 * whatever hex its source file used (a Monday "Testing" arrives as #66CCFF),
 * which is exactly the unbounded vocabulary this palette exists to prevent.
 *
 * Distance is measured in CIELAB, where equal distances look about equally
 * different, rather than in RGB, where they don't. Near-greys match only greys:
 * the palette has no light grey, and without that rule a pale grey would land on
 * a faint pastel tint rather than reading as grey.
 */
const SYSTEM_COLORS = Array.from(new Set([...LABEL_COLORS, ...NEW_LABEL_CYCLE].map(c => c.toUpperCase())));
const NEUTRAL_CHROMA = 8;

type Lab = [number, number, number];

const hexToLab = (hex: string): Lab | null => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const linear = (c: number) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const r = linear((n >> 16) & 255);
    const g = linear((n >> 8) & 255);
    const b = linear(n & 255);
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    const fy = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
    const fz = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const chroma = (lab: Lab) => Math.hypot(lab[1], lab[2]);

const SYSTEM_LABS = SYSTEM_COLORS.map(hex => ({ hex, lab: hexToLab(hex) as Lab }));

export const nearestSystemColor = (hex: string): string => {
    const source = hexToLab(hex);
    if (!source) return hex;

    let candidates = SYSTEM_LABS;
    if (chroma(source) < NEUTRAL_CHROMA) {
        const neutrals = SYSTEM_LABS.filter(c => chroma(c.lab) < NEUTRAL_CHROMA);
        if (neutrals.length) candidates = neutrals;
    }

    let best = candidates[0];
    let bestDistance = Infinity;
    for (const c of candidates) {
        const d = Math.hypot(source[0] - c.lab[0], source[1] - c.lab[1], source[2] - c.lab[2]);
        if (d < bestDistance) {
            bestDistance = d;
            best = c;
        }
    }
    return best.hex;
};

/**
 * Both Status and Dropdown pickers offer a one-click "+ New label" button
 * that used to always name the result "New Label" verbatim. Clicked twice
 * without renaming in between, that created two options sharing one label —
 * harmless for Status (selection is by option id), but for Dropdown the
 * selection state itself is a set of label strings, so two same-named
 * options become indistinguishable: picking either one lit up both rows'
 * checkmarks and there was no way to select just one of them. Suffixing a
 * counter keeps every option's label unique from the moment it's created.
 */
export const nextUniqueLabel = (existingLabels: string[], base = 'New Label'): string => {
    const taken = new Set(existingLabels);
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
};

/**
 * Group header colours. Kept apart from LABEL_COLORS because a group colour is
 * chrome — it tints a whole band of the board — rather than a value someone
 * reads off a cell, so it wants fewer, calmer steps per hue.
 *
 * Laid out as 10 hue families of 5. Every colour from the original 15 is still
 * here, and in the same order within its family, so a group coloured before
 * this list grew still shows as selected rather than silently falling off the
 * end of the palette.
 */
export const GROUP_COLORS = [
    // Reds
    '#E03333', '#FF1744', '#C62828', '#FF6B6B', '#FFCDD2',
    // Pinks / Magentas
    '#F472B6', '#C03FE4', '#E91E63', '#FF4081', '#F8BBD9',
    // Oranges
    '#F0960A', '#FF5722', '#E64A19', '#FF7043', '#FFCCBC',
    // Ambers / Yellows
    '#FBBF24', '#FFC107', '#F57F17', '#FFD740', '#FFF176',
    // Limes
    '#92BF0A', '#84CC16', '#CDDC39', '#9E9D24', '#D4E157',
    // Greens
    '#279966', '#4CAF50', '#2E7D32', '#00C853', '#A5D6A7',
    // Teals / Cyans
    '#14B8A6', '#06B6D4', '#009688', '#00695C', '#B2EBF2',
    // Blues
    '#3F6FE4', '#2196F3', '#1565C0', '#82B1FF', '#BBDEFB',
    // Purples / Violets
    '#7C3FE4', '#B89BFF', '#9C27B0', '#6A1B9A', '#EDE7F6',
    // Neutrals
    '#8B85A8', '#1A1728', '#607D8B', '#9E9E9E', '#424242'
];

export const PALETTE_WIDTH = 252;
export const PALETTE_HEIGHT = 220;

/**
 * Places the palette popover next to the swatch that opened it, flipping above
 * when there's no room below and pulling left of the viewport edge.
 */
export const palettePosition = (swatch: HTMLElement) => {
    const rect = swatch.getBoundingClientRect();
    const top = rect.bottom + PALETTE_HEIGHT > window.innerHeight
        ? Math.max(8, rect.top - PALETTE_HEIGHT - 4)
        : rect.bottom + 4;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PALETTE_WIDTH - 8));
    return { top, left };
};
