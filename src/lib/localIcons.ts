// Local stand-ins for the Google-branded file-type icons (and one monday.com
// empty-state illustration) this app normally pulls from gstatic.com /
// googleusercontent.com / cdn.monday.com. This is a local-only build — no
// request may ever leave the browser, so every one of those is replaced with
// an inline SVG data URI instead.

function squareIcon(label: string, bg: string): string {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><rect width='48' height='48' rx='8' fill='${bg}'/><text x='50%' y='56%' font-family='Arial, sans-serif' font-size='18' font-weight='700' fill='#fff' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const LOCAL_ICONS = {
    drive: squareIcon('D', '#4caf50'),
    docs: squareIcon('D', '#4285f4'),
    sheets: squareIcon('S', '#0f9d58'),
    slides: squareIcon('S', '#f4b400'),
    forms: squareIcon('F', '#7248b9'),
    pdf: squareIcon('P', '#db4437'),
    photos: squareIcon('P', '#ea4335')
};

// Stand-in for the remote NHG/Narai brand mark used inside email-template
// HTML strings (rendered live in Admin > Email Settings' preview panes).
export const LOGO_DATA_URI = squareIcon('N', '#1f291e');

export const EMPTY_UPDATES_ILLUSTRATION = (() => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='90' viewBox='0 0 120 90'><rect x='10' y='10' width='100' height='70' rx='8' fill='none' stroke='#cbd5e1' stroke-width='3'/><line x1='26' y1='30' x2='94' y2='30' stroke='#e2e8f0' stroke-width='4' stroke-linecap='round'/><line x1='26' y1='46' x2='74' y2='46' stroke='#e2e8f0' stroke-width='4' stroke-linecap='round'/><line x1='26' y1='62' x2='84' y2='62' stroke='#e2e8f0' stroke-width='4' stroke-linecap='round'/></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
})();
