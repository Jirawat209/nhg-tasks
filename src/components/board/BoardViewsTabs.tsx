import { Rows3, GanttChart, Columns3, CalendarDays, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { shownViewId, useAiSummaryEnabled } from '../../hooks/useAiSummaryEnabled';

const BASE_VIEWS: { id: string; label: string; icon: LucideIcon }[] = [
    { id: 'main_table', label: 'Table', icon: Rows3 },
    { id: 'timeline', label: 'Timeline', icon: GanttChart },
    { id: 'kanban', label: 'Kanban', icon: Columns3 },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
];

const AI_SUMMARY_VIEW = { id: 'ai_summary', label: 'AI Summary', icon: Sparkles };

export const BoardViewsTabs = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    const setActiveView = useBoardStore(state => state.setActiveView);
    // Offered only when switched on in Admin › AI Settings (the backend needs its key).
    const aiEnabled = useAiSummaryEnabled();

    const views = aiEnabled ? [...BASE_VIEWS, AI_SUMMARY_VIEW] : BASE_VIEWS;
    const activeViewId = shownViewId(activeBoard?.activeViewId, aiEnabled);

    if (!activeBoardId) return null;

    return (
        <div className="seg glass-chip" role="tablist" aria-label="Board views">
            {views.map(view => {
                const isActive = activeViewId === view.id;
                const Icon = view.icon;
                return (
                    <button
                        key={view.id}
                        role="tab"
                        aria-selected={isActive}
                        className={`seg-btn${isActive ? ' is-active' : ''}`}
                        onClick={() => setActiveView(activeBoardId, view.id)}
                    >
                        <Icon size={15} />
                        {view.label}
                    </button>
                );
            })}
        </div>
    );
};
