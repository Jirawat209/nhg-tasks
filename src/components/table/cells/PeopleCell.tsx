
import React, { useRef, useState, useCallback, memo } from 'react';
import type { Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { PersonPicker } from '../PersonPicker';

interface PeopleCellProps {
    itemId: string;
    boardId: string;
    column: Column;
    value: any;
}

export const PeopleCell: React.FC<PeopleCellProps> = memo(({ itemId, boardId, column, value }) => {
    const activeBoardMembers = useBoardStore(state => state.activeBoardMembers);
    const assignMemberToItem = useBoardStore(state => state.assignMemberToItem);
    const inviteNewEmailToItem = useBoardStore(state => state.inviteNewEmailToItem);
    const activeBoardId = useBoardStore(state => state.activeBoardId);

    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [pickerPos, setPickerPos] = useState<{ top: number, bottom: number, left: number, width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);

    // Assignments are stored as bare user ids. Anyone who no longer resolves to a
    // visible board member — deactivated, or removed from the board — is dropped
    // rather than drawn as an "Unknown" avatar. The stored value is untouched, so
    // reactivating the person brings their assignments straight back.
    const selectedIds = React.useMemo(() => {
        const ids: string[] = Array.isArray(value) ? value : (value ? [value] : []);
        return ids.filter(id => activeBoardMembers.some(m => m.user_id === id));
    }, [value, activeBoardMembers]);

    const startEditing = useCallback(() => {
        if (!can('edit_items')) return;
        setIsEditing(true);
        if (cellRef.current) {
            const rect = cellRef.current.getBoundingClientRect();
            setPickerPos({
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width
            });
        }
    }, [can]);

    const handleSelect = useCallback((userId: string) => {
        assignMemberToItem(
            boardId || activeBoardId || '', 
            userId, 
            itemId, 
            column.id
        );
    }, [assignMemberToItem, boardId, activeBoardId, itemId, column.id]);

    const handleSelectNewEmail = useCallback((email: string) => {
        inviteNewEmailToItem(
            boardId || activeBoardId || '',
            email,
            'viewer', 
            itemId,
            column.id
        );
    }, [inviteNewEmailToItem, boardId, activeBoardId, itemId, column.id]);

    const handleClose = useCallback(() => {
        setIsEditing(false);
        setPickerPos(null);
    }, []);

    return (
        <>
            <div
                ref={cellRef}
                className="table-cell"
                onClick={() => !isEditing && startEditing()}
                style={{
                    width: '100%',
                    height: '100%',
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    justifyContent: 'center'
                }}
            >
                {selectedIds.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {selectedIds.slice(0, 2).map((userId: string, idx: number) => {
                            const member = activeBoardMembers.find(m => m.user_id === userId);
                            const profileData = Array.isArray(member?.profiles) ? member.profiles[0] : member?.profiles;
                            const profile = profileData || {};
                            const name = profile.full_name || profile.email || 'Unknown';
                            const initial = name[0].toUpperCase();

                            const avatarBg = idx % 2 === 0 ? 'hsl(var(--color-brand-primary))' : '#A76400';

                            return (
                                <div key={idx} style={{
                                    width: '26px',
                                    height: '26px',
                                    borderRadius: '50%',
                                    backgroundColor: profile?.avatar_url ? 'transparent' : avatarBg,
                                    color: '#FFEFD2',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '10.5px',
                                    fontWeight: 600,
                                    border: '2px solid hsl(var(--paper, var(--color-bg-surface)))',
                                    marginLeft: idx > 0 ? '-8px' : '0',
                                    zIndex: idx + 1,
                                    overflow: 'hidden',
                                    position: 'relative',
                                    boxShadow: '0 1px 2px rgba(21, 42, 0, 0.14)'
                                }} title={name}>
                                    {profile?.avatar_url ? (
                                        <img 
                                            src={profile.avatar_url} 
                                            alt="" 
                                            referrerPolicy="no-referrer"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        />
                                    ) : (
                                        initial
                                    )}
                                </div>
                            );
                        })}
                        {selectedIds.length > 2 && (
                            <div style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                backgroundColor: 'hsl(var(--color-text-primary) / 0.1)',
                                color: 'hsl(var(--color-text-secondary))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10.5px',
                                fontWeight: 600,
                                border: '2px solid hsl(var(--paper, var(--color-bg-surface)))',
                                marginLeft: '-8px',
                                zIndex: 10,
                                position: 'relative'
                            }}>
                                +{selectedIds.length - 2}
                            </div>
                        )}
                    </div>
                ) : (
                    <span style={{ color: 'hsl(var(--color-text-tertiary))', fontSize: '18px', opacity: 0.5 }}>+</span>
                )}
            </div>

            {isEditing && pickerPos && (
                <PersonPicker
                    currentValue={selectedIds}
                    position={pickerPos}
                    onSelect={handleSelect}
                    onSelectNewEmail={handleSelectNewEmail}
                    onClose={handleClose}
                    boardId={boardId || activeBoardId || ''}
                    itemId={itemId}
                    columnId={column.id}
                />
            )}
        </>
    );
});
