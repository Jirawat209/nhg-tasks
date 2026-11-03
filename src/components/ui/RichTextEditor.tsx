import { useEffect, useRef, useState } from 'react';
import {
    Bold, Italic, Underline, Strikethrough,
    List, ListOrdered, Link,
    Minus, Palette, Table2, CheckSquare,
    AlignLeft, AlignCenter, AlignRight,
    Type, ChevronDown, Plus, Trash2,
    ArrowUp, ArrowDown
} from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import { autolinkBeforeCaret, findUrls, linkifyNode } from '../../lib/linkify';

interface RichTextEditorProps {
    value: string; // HTML string
    onChange: (html: string) => void;
    footer?: React.ReactNode;
    // The editable area's id, so a caller can focus it (e.g. "Reply" opening its box).
    id?: string;
    // Shown while the editor is empty.
    placeholder?: string;
    // Editable area's minimum height; the comment composer's 120px is a lot for a reply.
    minHeight?: number;
    // Ctrl/Cmd+Enter. Plain Enter stays a new line — lists and checklists need it.
    onSubmit?: () => void;
}

const TEXT_COLORS = [
    { label: 'Black', value: '#000000' },
    { label: 'Gray 1', value: '#323338' },
    { label: 'Gray 2', value: '#676879' },
    { label: 'Gray 3', value: '#abb4be' },
    { label: 'Gray 4', value: '#d0d4d9' },
    { label: 'White', value: '#ffffff' },

    { label: 'Blue', value: '#0073ea' },
    { label: 'Soft Blue', value: '#00a9ff' },
    { label: 'Indigo', value: '#579bfc' },
    { label: 'Purple', value: '#a25ddc' },
    { label: 'Deep Purple', value: '#784bd1' },
    { label: 'Pink', value: '#ff5ac4' },

    { label: 'Red', value: '#e2445c' },
    { label: 'Soft Red', value: '#ff642e' },
    { label: 'Orange', value: '#fdab3d' },
    { label: 'Yellow', value: '#ffcb00' },
    { label: 'Lime', value: '#9cd326' },
    { label: 'Green', value: '#00c875' },

    { label: 'Teal', value: '#00d1d1' },
    { label: 'Dark Blue', value: '#0086c0' },
    { label: 'Dark Indigo', value: '#225091' },
    { label: 'Dark Purple', value: '#401694' },
    { label: 'Dark Green', value: '#007f36' },
    { label: 'Brown', value: '#7f5347' },

    { label: 'Sky', value: '#66ccff' },
    { label: 'Cyan', value: '#0fc6c2' },
    { label: 'Magenta', value: '#d6259c' },
    { label: 'Rose', value: '#ff90c2' },
    { label: 'Mustard', value: '#c4a000' },
    { label: 'Olive', value: '#808000' },
];

const FONTS = [
    { label: 'Default', value: 'inherit' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
    { label: 'Courier New', value: '"Courier New", Courier, monospace' },
    { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
    { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
    { label: 'Ubuntu', value: 'Ubuntu, sans-serif' },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 15, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

export const RichTextEditor = ({ value, onChange, footer, id, placeholder, minHeight = 120, onSubmit }: RichTextEditorProps) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    // Mention State
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionPosition, setMentionPosition] = useState<{ top: number, left: number } | null>(null);
    const [mentionRange, setMentionRange] = useState<Range | null>(null);
    const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]);
    const searchUsers = useBoardStore(state => state.searchUsers);

    // Hyperlink State
    const [isLinkUIOpen, setIsLinkUIOpen] = useState(false);
    const [linkData, setLinkData] = useState({ text: '', url: '' });
    const [savedSelection, setSavedSelection] = useState<Range | null>(null);

    // Color State
    const [isColorUIOpen, setIsColorUIOpen] = useState(false);
    const [colorMode, setColorMode] = useState<'text' | 'highlight'>('text');
    const [activeColorSource, setActiveColorSource] = useState<'color' | 'highlight' | null>(null);

    // Typography State
    const [isTypeUIOpen, setIsTypeUIOpen] = useState(false);

    // Font State
    const [isFontUIOpen, setIsFontUIOpen] = useState(false);

    // Font Size State
    const [isFontSizeUIOpen, setIsFontSizeUIOpen] = useState(false);

    // Table State - tracks the table cell the cursor is currently in,
    // so a contextual toolbar for adding/removing rows & columns can be shown.
    const [tableContext, setTableContext] = useState<{ table: HTMLTableElement; rowIndex: number; cellIndex: number; top: number; left: number } | null>(null);

    // Helper to get display name for mention chip (prefer full_name)
    const getDisplayName = (user: any) => user.full_name || user.email?.split('@')[0] || 'Unknown';

    // Debounced search across all system users when mention is active
    useEffect(() => {
        if (mentionQuery === null) { setMentionSuggestions([]); return; }
        const timer = setTimeout(async () => {
            const results = await searchUsers(mentionQuery);
            setMentionSuggestions(results);
        }, 200);
        return () => clearTimeout(timer);
    }, [mentionQuery]);

    const isInternalUpdate = useRef(false);

    // Sync external value to editor ONLY if different and not focused
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (isColorUIOpen || isTypeUIOpen || isFontUIOpen || isFontSizeUIOpen) {
                // If the click is not inside a popover or a toolbar button
                const isInsidePopover = target.closest('.editor-popover');
                const isToolbarButton = target.closest('button[title]');
                if (!isInsidePopover && !isToolbarButton) {
                    setIsColorUIOpen(false);
                    setIsTypeUIOpen(false);
                    setIsFontUIOpen(false);
                    setIsFontSizeUIOpen(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isColorUIOpen, isTypeUIOpen, isFontUIOpen, isFontSizeUIOpen]);

    // Hide the table row/column toolbar when clicking outside the table or the toolbar itself
    useEffect(() => {
        if (!tableContext) return;
        const handleClickOutsideTable = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.table-toolbar') && !target.closest('table')) {
                setTableContext(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutsideTable);
        return () => document.removeEventListener('mousedown', handleClickOutsideTable);
    }, [tableContext]);

    useEffect(() => {
        // Skip sync if UI is open
        if (isLinkUIOpen || isColorUIOpen || isFontUIOpen || isFontSizeUIOpen) return;

        // Skip sync if we just performed an internal update (to avoid race with stale props)
        if (isInternalUpdate.current) {
            isInternalUpdate.current = false;
            return;
        }

        // The stored HTML is whatever any member posted; scrub it before it
        // becomes live DOM inside the editor, where an <img onerror> would run.
        if (editorRef.current && !isFocused && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = sanitizeHtml(value);
        }
        // Handle empty initial case
        if (editorRef.current && !value && !isFocused) {
            editorRef.current.innerHTML = '';
        }
    }, [value, isFocused, isLinkUIOpen, isColorUIOpen]);

    const exec = (command: string, value: string | undefined = undefined) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
        handleChange();
    };

    const handleChange = () => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
            checkMention();
        }
    };

    const checkMention = () => {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const text = range.startContainer.textContent || '';
        const cursorOffset = range.startOffset;

        // Find last @ before cursor
        const lastAt = text.lastIndexOf('@', cursorOffset - 1);

        if (lastAt !== -1) {
            const query = text.substring(lastAt + 1, cursorOffset);

            // Simple validation: Ensure @ is preceded by space or is start of line
            const charBefore = lastAt > 0 ? text[lastAt - 1] : ' ';
            if (charBefore === ' ' || charBefore === '\n' || charBefore === '\u00A0') { // 00A0 is nbsp
                setMentionQuery(query);
                setMentionRange(range.cloneRange()); // Save the range!

                // Get coordinates
                const rect = range.getBoundingClientRect();
                setMentionPosition({
                    top: rect.bottom, // Relative to viewport
                    left: rect.left
                });
                return;
            }
        }

        setMentionQuery(null);
        setMentionPosition(null);
        setMentionRange(null);
    };

    const insertMention = (name: string, userId: string) => {
        if (!mentionRange) return; // Use the saved range

        const range = mentionRange;
        const node = range.startContainer;
        const text = node.textContent || '';
        const cursorOffset = range.startOffset;

        const lastAt = text.lastIndexOf('@', cursorOffset - 1);

        if (lastAt !== -1) {
            // Remove the @query
            range.setStart(node, lastAt);
            range.setEnd(node, cursorOffset);
            range.deleteContents();

            // Insert the name chip
            const span = document.createElement('span');
            span.textContent = `@${name}`;
            span.setAttribute('data-id', userId); // CRITICAL: Add data-id for parsing
            span.style.color = '#1d4ed8'; // darker blue
            span.style.backgroundColor = '#dbeafe'; // light blue bg
            span.style.padding = '2px 6px';
            span.style.borderRadius = '12px';
            span.style.fontWeight = '500';
            span.style.display = 'inline-block';
            span.contentEditable = 'false';

            range.insertNode(span);

            // Add space after
            const space = document.createTextNode('\u00A0');
            range.setStartAfter(span);
            range.insertNode(space);

            // Move cursor to end
            range.setStartAfter(space);
            range.collapse(true);

            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }

            setMentionQuery(null);
            setMentionPosition(null);
            setMentionRange(null);
            handleChange();
        }
    };

    // --- Hyperlink Handlers ---

    const openLinkUI = () => {
        setIsColorUIOpen(false);
        setIsTypeUIOpen(false);
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) {
            // If no selection, just open empty
            setLinkData({ text: '', url: '' });
            setIsLinkUIOpen(true);
            return;
        }

        const range = selection.getRangeAt(0);
        setSavedSelection(range.cloneRange()); // Save range

        const selectedText = range.toString();
        // If it looks like a URL, pre-fill URL, otherwise Text
        const isUrl = /^(http|https):\/\//.test(selectedText);
        setLinkData({
            text: isUrl ? '' : selectedText,
            url: isUrl ? selectedText : ''
        });

        setIsLinkUIOpen(true);
    };

    const insertLink = () => {
        const selection = window.getSelection();
        if (savedSelection && selection) {
            selection.removeAllRanges();
            selection.addRange(savedSelection);
        }

        const { text, url } = linkData;
        if (!url) {
            closeLinkUI();
            return;
        }

        const finalUrl = url.startsWith('http') ? url : `https://${url}`;
        const displayText = text || url;

        // Flag internal update to skip next sync
        isInternalUpdate.current = true;

        const html = `<a href="${finalUrl}" target="_blank" rel="noopener noreferrer" style="color: #0073ea; text-decoration: underline;">${displayText}</a>`;

        exec('insertHTML', html);

        closeLinkUI();
    };

    const closeLinkUI = () => {
        setIsLinkUIOpen(false);
        setSavedSelection(null);
        setLinkData({ text: '', url: '' });
        // Return focus to editor
        editorRef.current?.focus();
    };

    // Use the savedSelection specifically when applying changes
    const applyColor = (color: string) => {
        const selection = window.getSelection();
        if (savedSelection && selection) {
            selection.removeAllRanges();
            selection.addRange(savedSelection);
        }
        if (colorMode === 'text') {
            exec('foreColor', color);
        } else {
            // Need to handle hiliteColor carefully for contentEditable
            // Note: document.execCommand('hiliteColor') uses <span style="background-color: ...">
            exec('hiliteColor', color);
        }
        setIsColorUIOpen(false);
        setActiveColorSource(null);
        setSavedSelection(null);
    };

    const applyTypography = (tag: string) => {
        const selection = window.getSelection();
        if (savedSelection && selection) {
            selection.removeAllRanges();
            selection.addRange(savedSelection);
        }
        // Angle-bracket form (e.g. "<h1>") is required for formatBlock in Firefox
        // and is also accepted by Chromium/Safari.
        exec('formatBlock', `<${tag}>`);
        setIsTypeUIOpen(false);
        setSavedSelection(null);
    };

    const applyFont = (fontFamily: string) => {
        if (fontFamily === 'inherit') {
            const MARKER = '--font-reset--';
            document.execCommand('fontName', false, MARKER);
            if (editorRef.current) {
                editorRef.current.querySelectorAll(`font[face="${MARKER}"]`).forEach(el => {
                    const parent = el.parentNode;
                    if (!parent) return;
                    while (el.firstChild) parent.insertBefore(el.firstChild, el);
                    parent.removeChild(el);
                });
                onChange(editorRef.current.innerHTML);
            }
        } else {
            exec('fontName', fontFamily);
        }
        setIsFontUIOpen(false);
        editorRef.current?.focus();
    };

    const applyFontSize = (sizePx: number) => {
        // Restore selection that was saved when the dropdown was opened
        const selection = window.getSelection();
        if (savedSelection && selection) {
            selection.removeAllRanges();
            selection.addRange(savedSelection);
        }

        const MARKER = '--fsize--';
        document.execCommand('fontName', false, MARKER);
        if (editorRef.current) {
            editorRef.current.querySelectorAll(`font[face="${MARKER}"]`).forEach(el => {
                const span = document.createElement('span');
                span.style.fontSize = `${sizePx}px`;
                while (el.firstChild) span.appendChild(el.firstChild);
                el.parentNode?.replaceChild(span, el);
            });
            onChange(editorRef.current.innerHTML);
        }
        setIsFontSizeUIOpen(false);
        setSavedSelection(null);
        editorRef.current?.focus();
    };

    const insertTable = () => {
        const tableHtml = `
            <table style="border-collapse: collapse; width: 100%; border: 1px solid hsl(var(--color-border)); margin: 12px 0;">
                <thead>
                    <tr style="background-color: hsl(var(--color-bg-subtle));">
                        <th style="border: 1px solid hsl(var(--color-border)); padding: 8px; text-align: left; font-weight: 600;">Header 1</th>
                        <th style="border: 1px solid hsl(var(--color-border)); padding: 8px; text-align: left; font-weight: 600;">Header 2</th>
                        <th style="border: 1px solid hsl(var(--color-border)); padding: 8px; text-align: left; font-weight: 600;">Header 3</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="border: 1px solid hsl(var(--color-border)); padding: 8px;">Cell 1</td>
                        <td style="border: 1px solid hsl(var(--color-border)); padding: 8px;">Cell 2</td>
                        <td style="border: 1px solid hsl(var(--color-border)); padding: 8px;">Cell 3</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid hsl(var(--color-border)); padding: 8px;">Cell 4</td>
                        <td style="border: 1px solid hsl(var(--color-border)); padding: 8px;">Cell 5</td>
                        <td style="border: 1px solid hsl(var(--color-border)); padding: 8px;">Cell 6</td>
                    </tr>
                </tbody>
            </table>
            <p><br></p>
        `;
        exec('insertHTML', tableHtml);
    };

    // Looks at the current cursor position and, if it's inside a table cell
    // belonging to this editor, returns the table plus the row/column index
    // of that cell so the floating row/column toolbar can be shown.
    const detectTableContext = () => {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount || !editorRef.current) return null;

        let node: Node | null = selection.anchorNode;
        let cell: HTMLTableCellElement | null = null;
        let table: HTMLTableElement | null = null;
        while (node && node !== editorRef.current) {
            if (node instanceof HTMLElement) {
                if (!cell && (node.tagName === 'TD' || node.tagName === 'TH')) cell = node as HTMLTableCellElement;
                if (node.tagName === 'TABLE') { table = node as HTMLTableElement; break; }
            }
            node = node.parentNode;
        }
        if (!table || !cell || !editorRef.current.contains(table) || !editorRef.current.parentElement) return null;

        const row = cell.parentElement as HTMLTableRowElement;
        const rowIndex = Array.from(table.rows).indexOf(row);
        const cellIndex = Array.from(row.cells).indexOf(cell);

        const tableRect = table.getBoundingClientRect();
        const wrapperRect = editorRef.current.parentElement.getBoundingClientRect();

        return {
            table,
            rowIndex,
            cellIndex,
            top: tableRect.top - wrapperRect.top,
            left: tableRect.left - wrapperRect.left
        };
    };

    const updateTableContext = () => {
        setTableContext(detectTableContext());
    };

    const insertTableRow = (position: 'above' | 'below') => {
        if (!tableContext) return;
        const { table, rowIndex } = tableContext;
        const row = table.rows[Math.min(rowIndex, table.rows.length - 1)];
        if (!row) return;

        const newRow = document.createElement('tr');
        Array.from(row.cells).forEach(refCell => {
            const newCell = document.createElement('td');
            const style = (refCell.getAttribute('style') || '')
                .replace(/font-weight:\s*[^;]+;?/i, '')
                .replace(/text-align:\s*[^;]+;?/i, '')
                .trim();
            newCell.setAttribute('style', style || 'border: 1px solid hsl(var(--color-border)); padding: 8px;');
            newCell.innerHTML = '<br>';
            newRow.appendChild(newCell);
        });

        if (position === 'above') {
            row.parentElement?.insertBefore(newRow, row);
        } else if (row.parentElement?.tagName === 'THEAD') {
            // Header rows always stay on top - new rows go to the start of the body
            const tbody = table.tBodies[0] ?? table.appendChild(document.createElement('tbody'));
            tbody.insertBefore(newRow, tbody.firstChild);
        } else {
            row.parentElement?.insertBefore(newRow, row.nextSibling);
        }

        handleChange();
    };

    const insertTableColumn = (position: 'left' | 'right') => {
        if (!tableContext) return;
        const { table, cellIndex } = tableContext;
        const insertIndex = position === 'right' ? cellIndex + 1 : cellIndex;

        Array.from(table.rows).forEach(tr => {
            const isHeader = tr.parentElement?.tagName === 'THEAD';
            const refCell = tr.cells[Math.min(cellIndex, tr.cells.length - 1)];
            const newCell = document.createElement(isHeader ? 'th' : 'td');
            newCell.setAttribute('style', refCell?.getAttribute('style') || 'border: 1px solid hsl(var(--color-border)); padding: 8px;');
            newCell.innerHTML = '<br>';

            if (insertIndex >= tr.cells.length) {
                tr.appendChild(newCell);
            } else {
                tr.insertBefore(newCell, tr.cells[insertIndex]);
            }
        });

        handleChange();
    };

    const deleteTableRow = () => {
        if (!tableContext) return;
        const { table, rowIndex } = tableContext;
        const row = table.rows[Math.min(rowIndex, table.rows.length - 1)];
        if (!row) return;

        if (table.rows.length <= 1) {
            table.parentElement?.removeChild(table);
            setTableContext(null);
        } else {
            row.remove();
        }

        handleChange();
    };

    const deleteTableColumn = () => {
        if (!tableContext) return;
        const { table, cellIndex } = tableContext;
        const firstRow = table.rows[0];
        if (!firstRow) return;

        if (firstRow.cells.length <= 1) {
            table.parentElement?.removeChild(table);
            setTableContext(null);
        } else {
            Array.from(table.rows).forEach(tr => {
                tr.cells[Math.min(cellIndex, tr.cells.length - 1)]?.remove();
            });
        }

        handleChange();
    };

    // One definition of a checklist row, shared by the toolbar button and by
    // Enter inside an existing row, so the two can't drift apart.
    // `markNew` tags the text cell so the caret can be put in it once inserted.
    const checklistItemHtml = (text: string, markNew = false) => `
            <div class="editor-checklist-item" style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
                <div contenteditable="false" style="margin-top: 4px;">
                    <input type="checkbox" style="width: 16px; height: 16px; cursor: pointer;" />
                </div>
                <div style="flex: 1;"${markNew ? ' data-checklist-new="1"' : ''}>${text}</div>
            </div>
        `;

    // An empty row with the caret already in it, ready to type. It used to come
    // with "Checklist item" written in it and the caret on the line below, so
    // every new checklist started with selecting and deleting that text.
    const insertChecklist = () => {
        // The <br> gives an empty cell somewhere for the caret to land.
        exec('insertHTML', `${checklistItemHtml('<br>', true)}<p><br></p>`);
        const cell = editorRef.current?.querySelector<HTMLElement>('[data-checklist-new]');
        if (!cell) return;
        cell.removeAttribute('data-checklist-new');
        placeCaretAtStart(cell);
        handleChange();
    };

    const placeCaretAtStart = (el: HTMLElement) => {
        const range = document.createRange();
        range.setStart(el, 0);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
    };

    // Enter inside a checklist row continues the list instead of dropping a
    // bare line break into the row's text cell — which is what contenteditable
    // does by default, and why a new line came out as plain text with no
    // checkbox. Returns true when it handled the key.
    const handleChecklistEnter = (): boolean => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return false;

        const anchor = selection.anchorNode;
        if (!anchor) return false;

        const startEl = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as HTMLElement);
        const item = startEl?.closest('.editor-checklist-item') as HTMLElement | null;
        if (!item || !editorRef.current?.contains(item)) return false;

        const textCell = item.lastElementChild as HTMLElement | null;

        // Enter on a row with no text ends the list, the way it does in every
        // other editor, rather than stacking up empty checkboxes.
        if (!(textCell?.textContent ?? '').trim()) {
            const paragraph = document.createElement('p');
            paragraph.innerHTML = '<br>';
            item.replaceWith(paragraph);
            placeCaretAtStart(paragraph);
        } else {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = checklistItemHtml('');
            const newItem = wrapper.firstElementChild as HTMLElement | null;
            if (!newItem) return false;

            item.after(newItem);
            const newTextCell = newItem.lastElementChild as HTMLElement;
            // An empty cell gives the caret nowhere to land, so seed a <br>.
            newTextCell.innerHTML = '<br>';
            placeCaretAtStart(newTextCell);
        }

        handleChange();
        return true;
    };


    const tools = [
        { id: 'type', icon: Type, label: 'Typography', action: () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                setSavedSelection(selection.getRangeAt(0).cloneRange());
            }
            setIsTypeUIOpen(!isTypeUIOpen); setIsFontUIOpen(false); setIsColorUIOpen(false); setIsLinkUIOpen(false);
        } },
        { id: 'font', text: 'Font', label: 'Font', action: () => { setIsFontUIOpen(!isFontUIOpen); setIsFontSizeUIOpen(false); setIsTypeUIOpen(false); setIsColorUIOpen(false); setIsLinkUIOpen(false); } },
        { id: 'fontSize', text: '15', label: 'Font Size', action: () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                setSavedSelection(selection.getRangeAt(0).cloneRange());
            }
            setIsFontSizeUIOpen(!isFontSizeUIOpen); setIsFontUIOpen(false); setIsTypeUIOpen(false); setIsColorUIOpen(false); setIsLinkUIOpen(false);
        } },
        { type: 'separator' },
        { id: 'bold', icon: Bold, label: 'Bold', action: () => exec('bold') },
        { id: 'italic', icon: Italic, label: 'Italic', action: () => exec('italic') },
        { id: 'underline', icon: Underline, label: 'Underline', action: () => exec('underline') },
        { id: 'strike', icon: Strikethrough, label: 'Strikethrough', action: () => exec('strikeThrough') },
        { id: 'color', icon: Palette, label: 'Color', action: () => { 
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                setSavedSelection(selection.getRangeAt(0).cloneRange());
            }
            // Keep current colorMode or default to text
            setActiveColorSource('color');
            setIsColorUIOpen(!isColorUIOpen || activeColorSource !== 'color'); 
            setIsTypeUIOpen(false); 
            setIsLinkUIOpen(false); 
        } },
        { type: 'separator' },
        { id: 'ul', icon: List, label: 'Bullet List', action: () => exec('insertUnorderedList') },
        { id: 'ol', icon: ListOrdered, label: 'Ordered List', action: () => exec('insertOrderedList') },
        { id: 'checklist', icon: CheckSquare, label: 'Checklist', action: () => insertChecklist() },
        { type: 'separator' },
        { id: 'align-left', icon: AlignLeft, label: 'Align Left', action: () => exec('justifyLeft') },
        { id: 'align-center', icon: AlignCenter, label: 'Align Center', action: () => exec('justifyCenter') },
        { id: 'align-right', icon: AlignRight, label: 'Align Right', action: () => exec('justifyRight') },
        { type: 'separator' },
        { id: 'table', icon: Table2, label: 'Table', action: () => insertTable() },
        { id: 'link', icon: Link, label: 'Link', action: () => openLinkUI() },
        { id: 'hr', icon: Minus, label: 'Horizontal Rule', action: () => exec('insertHorizontalRule') }
    ];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
            borderRadius: '16px',
            overflow: 'visible', // Changed to visible for popup
            backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
            boxShadow: isFocused
                ? '0 0 0 3px hsl(var(--color-brand-primary) / 0.12), var(--paper-shadow, 0 8px 24px -12px rgba(21, 42, 0, 0.25))'
                : 'var(--paper-shadow, 0 8px 24px -12px rgba(21, 42, 0, 0.22))',
            transition: 'box-shadow 0.2s, border-color 0.2s',
            position: 'relative'
        }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                padding: '7px 12px',
                borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)) / 0.65)',
                flexWrap: 'wrap',
                borderTopLeftRadius: '16px',
                borderTopRightRadius: '16px'
            }}>
                {tools.map((tool, index) => {
                    if (tool.type === 'separator') {
                        return (
                            <div key={index} style={{
                                width: '1px',
                                height: '18px',
                                backgroundColor: 'var(--paper-row-line, hsl(var(--color-border)))',
                                margin: '0 4px'
                            }} />
                        );
                    }

                    const Icon = tool.icon as any;
                    const isDropdown = tool.id === 'type' || tool.id === 'color' || tool.id === 'font' || tool.id === 'fontSize';
                    const isActive = (tool.id === 'color' && isColorUIOpen) || (tool.id === 'type' && isTypeUIOpen) || (tool.id === 'font' && isFontUIOpen) || (tool.id === 'fontSize' && isFontSizeUIOpen);
                    const isWide = tool.id === 'type' || tool.id === 'font' || tool.id === 'fontSize';
                    return (
                        <div key={tool.id} style={{ position: 'relative' }}>
                            <button
                                onClick={(e) => {
                                    e.preventDefault(); // Prevent losing focus
                                    tool.action?.();
                                }}
                                title={tool.label}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: isWide ? 'auto' : '28px',
                                    height: '28px',
                                    padding: isWide ? '0 8px' : '0',
                                    border: 'none',
                                    background: isActive ? 'rgba(0,0,0,0.1)' : 'transparent',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    color: 'hsl(var(--color-text-secondary))',
                                    gap: '4px'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isActive ? 'rgba(0,0,0,0.1)' : 'transparent'}
                            >
                                {(tool as any).text ? (
                                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{(tool as any).text}</span>
                                ) : (
                                    <Icon size={16} strokeWidth={2.5} />
                                )}
                                {isDropdown && <ChevronDown size={12} />}
                            </button>

                            {/* Typography Popover */}
                            {tool.id === 'type' && isTypeUIOpen && (
                                <div className="editor-popover" style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '8px',
                                    backgroundColor: 'hsl(var(--color-bg-surface))',
                                    border: '1px solid hsl(var(--color-border))',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    zIndex: 10002,
                                    padding: '4px',
                                    width: '180px',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    {[
                                        { label: 'Normal Text', tag: 'p' },
                                        { label: 'Heading 1', tag: 'h1', style: { fontSize: '24px', fontWeight: 700 } },
                                        { label: 'Heading 2', tag: 'h2', style: { fontSize: '20px', fontWeight: 600 } },
                                        { label: 'Heading 3', tag: 'h3', style: { fontSize: '18px', fontWeight: 600 } },
                                    ].map(item => (
                                        <button
                                            key={item.tag}
                                            onClick={(e) => { e.preventDefault(); applyTypography(item.tag); }}
                                            style={{
                                                padding: '8px 12px',
                                                textAlign: 'left',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: 'hsl(var(--color-text-primary))',
                                                borderRadius: '4px',
                                                ...(item.style || {})
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Font Picker Popover */}
                            {tool.id === 'font' && isFontUIOpen && (
                                <div className="editor-popover" style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '8px',
                                    backgroundColor: 'hsl(var(--color-bg-surface))',
                                    border: '1px solid hsl(var(--color-border))',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    zIndex: 10002,
                                    padding: '4px',
                                    width: '210px',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    {FONTS.map(font => (
                                        <button
                                            key={font.value}
                                            onClick={(e) => { e.preventDefault(); applyFont(font.value); }}
                                            style={{
                                                padding: '8px 12px',
                                                textAlign: 'left',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: 'hsl(var(--color-text-primary))',
                                                borderRadius: '4px',
                                                fontFamily: font.value === 'inherit' ? 'inherit' : font.value,
                                                fontSize: '14px'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            {font.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Font Size Picker Popover */}
                            {tool.id === 'fontSize' && isFontSizeUIOpen && (
                                <div className="editor-popover" style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '8px',
                                    backgroundColor: 'hsl(var(--color-bg-surface))',
                                    border: '1px solid hsl(var(--color-border))',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    zIndex: 10002,
                                    padding: '4px',
                                    width: '72px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    maxHeight: '260px',
                                    overflowY: 'auto'
                                }}>
                                    {FONT_SIZES.map(size => (
                                        <button
                                            key={size}
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={(e) => { e.preventDefault(); applyFontSize(size); }}
                                            style={{
                                                padding: '5px 12px',
                                                textAlign: 'left',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: 'hsl(var(--color-text-primary))',
                                                borderRadius: '4px',
                                                fontSize: '13px',
                                                fontWeight: size === 15 ? 700 : 400
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            {size}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Color Picker Popover */}
                            {tool.id === activeColorSource && isColorUIOpen && (
                                <div className="editor-popover" style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '8px',
                                    backgroundColor: 'hsl(var(--color-bg-surface))', // Dark mode fix
                                    border: '1px solid hsl(var(--color-border))',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    zIndex: 10001,
                                    padding: '12px',
                                    width: '240px'
                                }}>
                                    {/* Tabs */}
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', borderBottom: '1px solid hsl(var(--color-border))', paddingBottom: '8px' }}>
                                        <button 
                                            onClick={(e) => { e.preventDefault(); setColorMode('text'); }}
                                            style={{
                                                flex: 1,
                                                padding: '4px',
                                                fontSize: '12px',
                                                background: colorMode === 'text' ? 'hsl(var(--color-bg-subtle))' : 'none',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                color: colorMode === 'text' ? 'hsl(var(--color-text-primary))' : 'hsl(var(--color-text-secondary))',
                                                fontWeight: colorMode === 'text' ? 600 : 400
                                            }}
                                        >
                                            Text
                                        </button>
                                        <button 
                                            onClick={(e) => { e.preventDefault(); setColorMode('highlight'); }}
                                            style={{
                                                flex: 1,
                                                padding: '4px',
                                                fontSize: '12px',
                                                background: colorMode === 'highlight' ? 'hsl(var(--color-bg-subtle))' : 'none',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                color: colorMode === 'highlight' ? 'hsl(var(--color-text-primary))' : 'hsl(var(--color-text-secondary))',
                                                fontWeight: colorMode === 'highlight' ? 600 : 400
                                            }}
                                        >
                                            Highlight
                                        </button>
                                    </div>

                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(6, 1fr)',
                                        gap: '6px'
                                    }}>
                                    {TEXT_COLORS.map(color => (
                                        <button
                                            key={color.value}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                applyColor(color.value);
                                            }}
                                            title={color.label}
                                            style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '4px',
                                                backgroundColor: color.value,
                                                border: '1px solid rgba(0,0,0,0.1)',
                                                cursor: 'pointer',
                                                padding: 0
                                            }}
                                        />
                                    ))}
                                    {/* Reset Color */}
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            applyColor(colorMode === 'text' ? 'inherit' : 'transparent');
                                        }}
                                        title="Reset Color"
                                        style={{
                                            gridColumn: '1 / -1',
                                            marginTop: '8px',
                                            padding: '6px',
                                            fontSize: '12px',
                                            background: 'none',
                                            border: '1px solid hsl(var(--color-border))',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            color: 'hsl(var(--color-text-secondary))',
                                            fontWeight: 500,
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-subtle))';
                                            e.currentTarget.style.borderColor = 'hsl(var(--color-text-secondary))';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                            e.currentTarget.style.borderColor = 'hsl(var(--color-border))';
                                        }}
                                    >
                                        Auto (Reset)
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

            {/* Editor Area */}
            <div
                ref={editorRef}
                id={id}
                contentEditable
                data-placeholder={placeholder}
                onInput={(e) => {
                    // A web address followed by a space becomes a link as you type.
                    const input = e.nativeEvent as InputEvent;
                    if (input.inputType === 'insertText' && input.data && /\s/.test(input.data) && editorRef.current) {
                        autolinkBeforeCaret(editorRef.current);
                    }
                    handleChange();
                }}
                onPaste={(e) => {
                    // A pasted web address becomes a link straight away, without
                    // the link button: the browser pastes as usual, then any plain
                    // address in the box is wrapped (the caret stays put).
                    if (!findUrls(e.clipboardData?.getData('text/plain') || '').length) return;
                    window.setTimeout(() => {
                        if (editorRef.current && linkifyNode(editorRef.current, true)) handleChange();
                    }, 0);
                }}
                onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                        e.preventDefault();
                        openLinkUI();
                    }
                    if (onSubmit && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        onSubmit();
                        return;
                    }
                    // Shift+Enter is left alone: that's a soft break within the
                    // current row, same as everywhere else.
                    if (e.key === 'Enter' && !e.shiftKey && handleChecklistEnter()) {
                        e.preventDefault();
                    }
                }}
                onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
                        // Clicking a checkbox flips its `checked` DOM property, but
                        // that never touches the `checked` content attribute — and
                        // saving reads innerHTML, which only serializes attributes.
                        // Without this, every checked box reverts to unchecked the
                        // moment the saved HTML is rendered back.
                        if (target.checked) {
                            target.setAttribute('checked', 'checked');
                        } else {
                            target.removeAttribute('checked');
                        }
                        handleChange();
                    }
                }}
                onKeyUp={(e) => {
                    // Navigate mention list TODO
                    if (e.key === 'Escape') {
                        setMentionQuery(null);
                        closeLinkUI();
                        setIsColorUIOpen(false);
                    }
                    updateTableContext();
                }}
                onMouseUp={updateTableContext}
                onFocus={() => setIsFocused(true)}
                onBlur={() => {
                    setIsFocused(false);
                    // Delay to allow click
                    setTimeout(() => setMentionQuery(null), 200);
                }}
                style={{
                    minHeight: `${minHeight}px`,
                    padding: '16px',
                    fontSize: '15px',
                    outline: 'none',
                    lineHeight: '1.5',
                    color: 'hsl(var(--color-text-primary))' // Dark mode fix
                }}
                className="rich-text-content"
            />

            {/* Table Row/Column Toolbar */}
            {tableContext && (
                <div
                    className="table-toolbar"
                    style={{
                        position: 'absolute',
                        top: tableContext.top - 36,
                        left: tableContext.left,
                        display: 'flex',
                        gap: '2px',
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '6px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        padding: '4px',
                        zIndex: 10003
                    }}
                >
                    {[
                        { title: 'Insert row above', icon: ArrowUp, label: 'Row', action: () => insertTableRow('above') },
                        { title: 'Insert row below', icon: ArrowDown, label: 'Row', action: () => insertTableRow('below') },
                        { title: 'Insert column left', icon: Plus, label: '← Col', action: () => insertTableColumn('left') },
                        { title: 'Insert column right', icon: Plus, label: 'Col →', action: () => insertTableColumn('right') },
                        { title: 'Delete row', icon: Trash2, label: 'Row', action: deleteTableRow },
                        { title: 'Delete column', icon: Trash2, label: 'Col', action: deleteTableColumn },
                    ].map(({ title, icon: Icon, label, action }) => (
                        <button
                            key={title}
                            title={title}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => { e.preventDefault(); action(); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                border: 'none',
                                background: 'transparent',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                color: 'hsl(var(--color-text-secondary))',
                                fontSize: '11px',
                                fontWeight: 600
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <Icon size={12} strokeWidth={2.5} />
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {/* Footer slot */}
            {footer && (
                <div style={{
                    borderTop: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                    backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)) / 0.5)',
                    borderBottomLeftRadius: '16px',
                    borderBottomRightRadius: '16px',
                    overflow: 'visible'
                }}>
                    {footer}
                </div>
            )}

            {/* Mention Suggestions Popup */}
            {mentionQuery !== null && mentionSuggestions.length > 0 && (
                <div style={{
                    position: 'fixed',
                    top: mentionPosition?.top,
                    left: mentionPosition?.left,
                    backgroundColor: 'hsl(var(--color-bg-surface))',
                    border: '1px solid hsl(var(--color-border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 9999,
                    minWidth: '220px',
                    maxHeight: '240px',
                    overflowY: 'auto'
                }}>
                    {mentionSuggestions.map((user, i) => (
                        <div
                            key={user.id}
                            onClick={() => insertMention(getDisplayName(user), user.id)}
                            style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                borderBottom: i < mentionSuggestions.length - 1 ? '1px solid hsl(var(--color-border))' : 'none',
                                backgroundColor: 'hsl(var(--color-bg-surface))'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-surface))'}
                        >
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                backgroundColor: '#e0e7ff', overflow: 'hidden', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '11px', color: '#3730a3', fontWeight: 'bold'
                            }}>
                                {user.avatar_url ? (
                                    <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    (user.full_name?.[0] || user.email?.[0] || '?').toUpperCase()
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <span style={{ fontSize: '13px', color: 'hsl(var(--color-text-primary))', fontWeight: 500 }}>
                                    {user.full_name || user.email?.split('@')[0]}
                                </span>
                                <span style={{ fontSize: '11px', color: 'hsl(var(--color-text-secondary))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {user.email}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Hyperlink Popover */}
            {
                isLinkUIOpen && (
                    <div style={{
                        position: 'absolute',
                        top: '40px', // Below toolbar
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: 'hsl(var(--color-bg-surface))', // Dark mode fix
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                        zIndex: 10000,
                        padding: '16px',
                        width: '320px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Add Link</span>
                            <button onClick={closeLinkUI} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))' }}>✕</button>
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Text to display</label>
                            <input
                                type="text"
                                value={linkData.text}
                                onChange={(e) => setLinkData({ ...linkData, text: e.target.value })}
                                placeholder="Text to display"
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    border: '1px solid hsl(var(--color-border))',
                                    backgroundColor: 'hsl(var(--color-bg-canvas))', // Dark mode fix
                                    fontSize: '14px',
                                    outline: 'none',
                                    color: 'hsl(var(--color-text-primary))'
                                }}
                                autoFocus
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Link address</label>
                            <input
                                type="text"
                                value={linkData.url}
                                onChange={(e) => setLinkData({ ...linkData, url: e.target.value })}
                                placeholder="www.example.com"
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    border: '1px solid hsl(var(--color-border))',
                                    backgroundColor: 'hsl(var(--color-bg-canvas))', // Dark mode fix
                                    fontSize: '14px',
                                    outline: 'none',
                                    color: 'hsl(var(--color-text-primary))'
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && insertLink()}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                            <button
                                onClick={closeLinkUI}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '4px',
                                    border: '1px solid hsl(var(--color-border))',
                                    background: 'transparent',
                                    color: 'hsl(var(--color-text-primary))',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={insertLink}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    backgroundColor: 'hsl(var(--color-brand-primary))',
                                    color: 'white',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                Save Link
                            </button>
                        </div>
                    </div>
                )
            }

            <style>{`
                .rich-text-content ul {
                    list-style-type: disc;
                    padding-left: 24px;
                    margin-top: 8px;
                    margin-bottom: 8px;
                }
                .rich-text-content ol {
                    list-style-type: decimal;
                    padding-left: 24px;
                    margin-top: 8px;
                    margin-bottom: 8px;
                }
                .rich-text-content li {
                    margin-bottom: 4px;
                }
                .rich-text-content h1 {
                    font-size: 24px;
                    font-weight: 700;
                    margin: 12px 0 8px;
                }
                .rich-text-content h2 {
                    font-size: 20px;
                    font-weight: 600;
                    margin: 10px 0 6px;
                }
                .rich-text-content h3 {
                    font-size: 18px;
                    font-weight: 600;
                    margin: 8px 0 4px;
                }
                .rich-text-content a {
                    color: hsl(var(--color-brand-primary));
                    text-decoration: underline;
                }
                .rich-text-content table {
                    border-collapse: collapse;
                    width: 100%;
                    border: 1px solid hsl(var(--color-border));
                    margin: 12px 0;
                }
                .rich-text-content th, .rich-text-content td {
                    border: 1px solid hsl(var(--color-border));
                    padding: 8px;
                    min-width: 50px;
                }
                .rich-text-content th {
                    background-color: hsl(var(--color-bg-subtle));
                    font-weight: 600;
                }
                .editor-checklist-item input[type="checkbox"] {
                    accent-color: hsl(var(--color-brand-primary));
                }
            `}</style>
        </div >
    );
};
