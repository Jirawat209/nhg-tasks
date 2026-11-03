import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const STORAGE_KEY = 'saturday-side-panel-width';
const MIN_WIDTH = 520;
const CLOSE_MS = 180;
const maxAllowedWidth = () => Math.round(window.innerWidth * 0.92);

interface SidePanelProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    width?: string;
}

export const SidePanel = ({ isOpen, onClose, children, width = '860px' }: SidePanelProps) => {
    const defaultWidth = parseInt(width, 10) || 860;

    const [panelWidth, setPanelWidth] = useState<number>(() => {
        const stored = Number(localStorage.getItem(STORAGE_KEY));
        return Number.isFinite(stored) && stored >= MIN_WIDTH ? stored : defaultWidth;
    });
    const [isResizing, setIsResizing] = useState(false);

    // Releasing the drag over the dimmed area fires a click on the overlay,
    // which would otherwise be read as "clicked outside" and close the panel
    // the moment the user finishes resizing.
    const justResizedRef = useRef(false);

    // The panel stays mounted for the length of the exit animation. Closing
    // used to unmount it on the spot, so it vanished instead of sliding away.
    // The last children are held too: the parent usually passes nothing once
    // closed (App renders TaskDetail only while an item is active), and the
    // panel would otherwise slide out empty.
    const [isMounted, setIsMounted] = useState(isOpen);
    const [isClosing, setIsClosing] = useState(false);
    const lastChildrenRef = useRef<React.ReactNode>(children);
    if (isOpen) lastChildrenRef.current = children;

    useEffect(() => {
        if (isOpen) {
            setIsMounted(true);
            setIsClosing(false);
            return;
        }
        if (!isMounted) return;
        setIsClosing(true);
        const timer = setTimeout(() => {
            setIsMounted(false);
            setIsClosing(false);
        }, CLOSE_MS);
        return () => clearTimeout(timer);
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // Close on Escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    const handleResizeStart = (side: 'left' | 'right') => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startWidth = panelWidth;
        let latest = startWidth;
        setIsResizing(true);

        // The modal is centered, so dragging either edge scales width symmetrically.
        const onMouseMove = (moveEvent: MouseEvent) => {
            const delta = side === 'right'
                ? (moveEvent.clientX - startX) * 2
                : (startX - moveEvent.clientX) * 2;
            const next = startWidth + delta;
            latest = Math.min(maxAllowedWidth(), Math.max(MIN_WIDTH, next));
            setPanelWidth(latest);
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            setIsResizing(false);
            localStorage.setItem(STORAGE_KEY, String(latest));

            justResizedRef.current = true;
            // Cleared after the click event that follows this mouseup.
            setTimeout(() => { justResizedRef.current = false; }, 0);
        };

        // Without these the drag selects text across the page and the cursor
        // flickers back to default whenever it leaves the 6px handle.
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const resetWidth = () => {
        setPanelWidth(defaultWidth);
        localStorage.setItem(STORAGE_KEY, String(defaultWidth));
    };

    if (!isMounted) return null;

    return createPortal(
        <div className="side-panel-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: 'radial-gradient(60% 50% at 50% 45%, rgba(21, 42, 0, 0.28), rgba(15, 22, 10, 0.54))',
            backdropFilter: 'blur(8px) saturate(125%)',
            WebkitBackdropFilter: 'blur(8px) saturate(125%)',
            animation: isClosing
                ? `sidePanelFadeOut ${CLOSE_MS}ms ease forwards`
                : 'sidePanelFadeIn 0.22s ease',
            // Clicks fall through to the board while it's on its way out.
            pointerEvents: isClosing ? 'none' : 'auto'
        }} onClick={(e) => {
            if (justResizedRef.current || isClosing) return;
            if (e.target === e.currentTarget) onClose();
        }}>
            <div className="side-panel-content" style={{
                width: `${panelWidth}px`,
                maxWidth: 'calc(100vw - 48px)',
                height: 'min(820px, calc(100vh - 56px))',
                background: 'transparent',
                borderRadius: '24px',
                border: '1px solid var(--glass-panel-edge, hsl(var(--color-border)))',
                boxShadow: '0 36px 84px -24px rgba(21, 42, 0, 0.50), 0 6px 20px rgba(21, 42, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.78)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                isolation: 'isolate',
                // Suppressed mid-drag: the entry animation uses a transform and
                // would fight the width changes on every mousemove frame.
                animation: isClosing
                    ? `windowPopOut ${CLOSE_MS}ms cubic-bezier(0.4, 0, 1, 1) forwards`
                    : isResizing ? 'none' : 'windowPopIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
                <div
                    onMouseDown={handleResizeStart('left')}
                    onDoubleClick={resetWidth}
                    className="side-panel-resize-handle side-panel-resize-handle-left"
                    title="Drag to resize · double-click to reset"
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: '6px',
                        cursor: 'col-resize',
                        zIndex: 5
                    }}
                />
                <div
                    onMouseDown={handleResizeStart('right')}
                    onDoubleClick={resetWidth}
                    className="side-panel-resize-handle side-panel-resize-handle-right"
                    title="Drag to resize · double-click to reset"
                    style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '6px',
                        cursor: 'col-resize',
                        zIndex: 5
                    }}
                />
                {isOpen ? children : lastChildrenRef.current}
            </div>

            <style>{`
                .side-panel-content::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    z-index: -1;
                    border-radius: inherit;
                    background:
                        radial-gradient(52% 40% at 6% 0%, rgba(170, 160, 36, 0.20), transparent 70%),
                        radial-gradient(44% 36% at 96% 4%, rgba(167, 100, 0, 0.16), transparent 70%),
                        radial-gradient(50% 42% at 80% 100%, rgba(225, 255, 179, 0.35), transparent 70%),
                        var(--glass-pop, rgba(255, 250, 240, 0.84));
                    -webkit-backdrop-filter: blur(32px) saturate(160%);
                    backdrop-filter: blur(32px) saturate(160%);
                    pointer-events: none;
                }
                .dark .side-panel-content::before {
                    background:
                        radial-gradient(52% 40% at 6% 0%, rgba(37, 7, 25, 0.45), transparent 70%),
                        radial-gradient(44% 36% at 96% 4%, rgba(167, 100, 0, 0.16), transparent 70%),
                        var(--glass-pop, rgba(20, 31, 13, 0.88));
                }
                @keyframes windowPopIn {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes windowPopOut {
                    from { opacity: 1; transform: scale(1) translateY(0); }
                    to { opacity: 0; transform: scale(0.96) translateY(8px); }
                }
                @keyframes sidePanelFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes sidePanelFadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                .side-panel-resize-handle::after {
                    content: '';
                    position: absolute;
                    top: 16px;
                    bottom: 16px;
                    width: 2px;
                    background-color: transparent;
                    transition: background-color 0.15s;
                }
                .side-panel-resize-handle-left::after {
                    left: 0;
                }
                .side-panel-resize-handle-right::after {
                    right: 0;
                }
                .side-panel-resize-handle:hover::after {
                    background-color: hsl(var(--color-brand-primary));
                }
            `}</style>
        </div>,
        document.body
    );
};
