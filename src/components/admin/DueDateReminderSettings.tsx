import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, Plus, Trash2, CalendarClock, Clock } from 'lucide-react';

const DEFAULT_OFFSETS = [7, 0];

// Matches the pg_cron schedule '0 1 * * *' in
// supabase/migrations/20260821_reminder_morning_bangkok.sql — chosen so it
// lands at 08:00 in Bangkok.
const REMINDER_UTC_HOUR = 1;

export const DueDateReminderSettings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [offsets, setOffsets] = useState<number[]>([]);
    const [message, setMessage] = useState({ type: '', text: '' });

    // 08:00 UTC is mid-afternoon in Thailand — spell out the local equivalent
    // so the schedule isn't misread as 8am local time.
    const { deliveryLocal, deliveryZone } = useMemo(() => {
        const d = new Date();
        d.setUTCHours(REMINDER_UTC_HOUR, 0, 0, 0);
        return {
            deliveryLocal: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
            deliveryZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }, []);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'due_date_reminder_offsets')
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows found"

            setOffsets(Array.isArray(data?.value) ? data.value : DEFAULT_OFFSETS);
        } catch (error: any) {
            console.error('Error fetching settings:', error);
            setMessage({ type: 'error', text: 'Failed to load settings: ' + error.message });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setMessage({ type: '', text: '' });

            // Whole non-negative days only, de-duplicated, largest first.
            const cleaned = Array.from(new Set(
                offsets.map(o => Math.max(0, Math.round(o)))
            )).sort((a, b) => b - a);

            if (cleaned.length === 0) {
                setMessage({ type: 'error', text: 'Add at least one reminder point.' });
                setSaving(false);
                return;
            }

            const { error } = await supabase
                .from('system_settings')
                .upsert({
                    key: 'due_date_reminder_offsets',
                    value: cleaned,
                    description: 'Days before a Due Date column value to send a reminder notification (0 = due today)'
                }, { onConflict: 'key' });

            if (error) throw error;

            setOffsets(cleaned);
            setMessage({ type: 'success', text: 'Reminder schedule saved successfully' });
            setTimeout(() => setMessage({ type: '', text: '' }), 3000);

        } catch (error: any) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: 'Failed to save settings: ' + error.message });
        } finally {
            setSaving(false);
        }
    };

    const addOffset = () => {
        setOffsets([...offsets, 1]);
    };

    const removeOffset = (index: number) => {
        const next = [...offsets];
        next.splice(index, 1);
        setOffsets(next);
    };

    const updateOffset = (index: number, value: string) => {
        const next = [...offsets];
        next[index] = Number(value);
        setOffsets(next);
    };

    if (loading) {
        return <div style={{ padding: '24px', color: 'hsl(var(--ink-dim))' }}>Loading settings...</div>;
    }

    return (
        <div style={{ maxWidth: '800px' }}>
            {message.text && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    marginBottom: '24px',
                    backgroundColor: message.type === 'success' ? 'rgba(42, 74, 18, 0.1)' : 'rgba(200, 62, 43, 0.1)',
                    color: message.type === 'success' ? '#2A4A12' : '#C83E2B',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    border: `1px solid ${message.type === 'success' ? 'rgba(42, 74, 18, 0.25)' : 'rgba(200, 62, 43, 0.25)'}`
                }}>
                    {message.text}
                </div>
            )}

            <div className="card-surface" style={{ padding: '24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="admin-tile" style={{ width: '38px', height: '38px', background: 'rgba(167, 100, 0, 0.12)', color: '#A76400' }}>
                            <CalendarClock size={18} />
                        </div>
                        <h2 className="narai-heading" style={{ fontSize: '20px', fontWeight: 700, color: 'hsl(var(--ink))', margin: 0 }}>
                            Due Date Reminders
                        </h2>
                    </div>
                    <button
                        onClick={addOffset}
                        className="glass-chip"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '7px 14px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'hsl(var(--ink))',
                            cursor: 'pointer'
                        }}
                    >
                        <Plus size={15} /> Add Reminder Point
                    </button>
                </div>

                <p style={{ fontSize: '13.5px', color: 'hsl(var(--ink-dim))', marginBottom: '14px', lineHeight: '1.5' }}>
                    Everyone assigned to an item gets notified when its "Due Date" column value lands on one of
                    these day counts before the deadline. Use 0 for "due today". Applies to every board.
                    Each reminder sends both an in-app notification and an email.
                </p>

                <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                    padding: '12px 14px', borderRadius: '12px', marginBottom: '20px',
                    backgroundColor: 'rgba(42, 74, 18, 0.08)', border: '1px solid rgba(42, 74, 18, 0.22)',
                    fontSize: '13px', color: 'hsl(var(--ink))', lineHeight: '1.5'
                }}>
                    <Clock size={15} style={{ flexShrink: 0, marginTop: '2px', color: '#2A4A12' }} />
                    <span>
                        Reminders are sent once a day at <strong>{String(REMINDER_UTC_HOUR).padStart(2, '0')}:00 UTC</strong>
                        {' — '}that's <strong>{deliveryLocal}</strong> in {deliveryZone}.
                        Individual users can override these day counts for themselves.
                    </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {offsets.map((offset, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px 14px', borderRadius: '12px', background: 'hsl(var(--paper-muted))', border: '1px solid hsl(var(--paper-edge))' }}>
                            <input
                                type="number"
                                min={0}
                                value={offset}
                                onChange={e => updateOffset(idx, e.target.value)}
                                style={{ ...inputStyle, width: '100px', flex: 'none' }}
                            />
                            <span style={{ fontSize: '13.5px', fontWeight: 500, color: 'hsl(var(--ink))', flex: 1 }}>
                                {offset === 0 ? 'Due today' : `${offset} day${offset === 1 ? '' : 's'} before due date`}
                            </span>
                            <button
                                onClick={() => removeOffset(idx)}
                                style={{
                                    padding: '6px',
                                    color: 'hsl(var(--ink-soft))',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = '#C83E2B'}
                                onMouseLeave={e => e.currentTarget.style.color = 'hsl(var(--ink-soft))'}
                            >
                                <Trash2 size={17} />
                            </button>
                        </div>
                    ))}

                    {offsets.length === 0 && (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--ink-soft))', border: '1px dashed hsl(var(--paper-edge))', borderRadius: '14px' }}>
                            No reminder points defined. Click "Add Reminder Point" to start.
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-solid"
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 24px',
                        borderRadius: '999px',
                        fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: '13.5px',
                        opacity: saving ? 0.7 : 1,
                    }}
                >
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save Reminder Schedule'}
                </button>
            </div>
        </div>
    );
};

const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: '10px',
    border: '1px solid hsl(var(--paper-edge))',
    backgroundColor: 'hsl(var(--paper))',
    color: 'hsl(var(--ink))',
    fontSize: '13.5px',
    outline: 'none',
    boxSizing: 'border-box'
};
