
import {
    Bold, Italic, Underline, Strikethrough,
    List, ListOrdered, Link,
    Minus, CheckSquare, Table2, 
    AlignLeft, AlignCenter, AlignRight,
    Palette, Highlighter
} from 'lucide-react';

interface EditorToolbarProps {
    onFormat: (format: string) => void;
}

export const EditorToolbar = ({ onFormat }: EditorToolbarProps) => {
    const tools = [
        { id: 'bold', icon: Bold, label: 'Bold' },
        { id: 'italic', icon: Italic, label: 'Italic' },
        { id: 'underline', icon: Underline, label: 'Underline' },
        { id: 'strikethrough', icon: Strikethrough, label: 'Strikethrough' },
        { id: 'color', icon: Palette, label: 'Text Color' },
        { id: 'highlight', icon: Highlighter, label: 'Highlight' },
        { type: 'separator' },
        { id: 'list-bullet', icon: List, label: 'Bullet List' },
        { id: 'list-ordered', icon: ListOrdered, label: 'Ordered List' },
        { id: 'check', icon: CheckSquare, label: 'Checklist' },
        { type: 'separator' },
        { id: 'align-left', icon: AlignLeft, label: 'Align Left' },
        { id: 'align-center', icon: AlignCenter, label: 'Align Center' },
        { id: 'align-right', icon: AlignRight, label: 'Align Right' },
        { type: 'separator' },
        { id: 'table', icon: Table2, label: 'Table' },
        { id: 'link', icon: Link, label: 'Link' },
        { id: 'hr', icon: Minus, label: 'Horizontal Rule' }
    ];

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '8px 12px',
            borderBottom: '1px solid hsl(var(--color-border))',
            backgroundColor: 'hsl(var(--color-bg-subtle))',
            flexWrap: 'wrap'
        }}>
            {tools.map((tool, index) => {
                if (tool.type === 'separator') {
                    return (
                        <div key={index} style={{
                            width: '1px',
                            height: '20px',
                            backgroundColor: 'hsl(var(--color-border))',
                            margin: '0 8px'
                        }} />
                    );
                }

                const Icon = tool.icon as any; // Type workaround
                return (
                    <button
                        key={tool.id}
                        onClick={() => onFormat(tool.id!)}
                        title={tool.label}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '28px',
                            height: '28px',
                            border: 'none',
                            background: 'transparent',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            color: 'hsl(var(--color-text-secondary))',
                            transition: 'background-color 0.1s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <Icon size={16} strokeWidth={2.5} />
                    </button>
                );
            })}
        </div>
    );
};
