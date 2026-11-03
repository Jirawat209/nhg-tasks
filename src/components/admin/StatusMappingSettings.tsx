import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, Plus, Trash2, Palette } from 'lucide-react';

interface StatusMapping {
    label: string;
    color: string;
}

export const StatusMappingSettings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [mappings, setMappings] = useState<StatusMapping[]>([]);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Standard preset colors for NHG
    const presetColors = [
        '#00c875', // Done (Green)
        '#fdab3d', // Working on it (Orange)
        '#e2445c', // Stuck / At Risk (Red)
        '#ffd533', // Ready for review / Waiting (Yellow)
        '#a1a1a1', // On Hold (Grey)
        '#ff158a', // RFP (Pink)
        '#333333', // Not start / N/A (Black)
        '#579bfc', // Info (Blue)
        '#a25ddc', // Purple
        '#c4c4c4', // Default
    ];

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'status_color_mapping')
                .single();
            
            if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows found"

            if (data?.value) {
                // value is stored as an object { [label: string]: color }
                const formatted = Object.entries(data.value as Record<string, string>).map(([label, color]) => ({
                    label,
                    color
                }));
                setMappings(formatted);
            } else {
                // Load defaults if nothing in DB
                setMappings([
                    { label: 'Done', color: '#00c875' },
                    { label: 'Completed', color: '#00c875' },
                    { label: 'Working on it', color: '#fdab3d' },
                    { label: 'In Progress', color: '#fdab3d' },
                    { label: 'Stuck', color: '#e2445c' },
                    { label: 'At risk', color: '#e2445c' },
                    { label: 'Ready for review', color: '#ffd533' },
                    { label: 'Waiting', color: '#ffd533' },
                    { label: 'Not start', color: '#333333' }
                ]);
            }
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

            // The mapping is stored as a { label: color } object, so a blank label or a
            // second row reusing an existing label silently disappears on save — the row
            // stays on screen (local state) while never reaching the database, which then
            // shows up later as a Status column that's missing labels the admin thinks
            // they added. Refuse the save and name the offending rows instead.
            const blankCount = mappings.filter(m => !m.label.trim()).length;
            const seen = new Set<string>();
            const duplicates = new Set<string>();
            mappings.forEach(m => {
                const key = m.label.trim().toLowerCase();
                if (!key) return;
                if (seen.has(key)) duplicates.add(m.label.trim());
                seen.add(key);
            });

            if (blankCount > 0 || duplicates.size > 0) {
                const problems: string[] = [];
                if (duplicates.size > 0) {
                    problems.push(`duplicate label${duplicates.size > 1 ? 's' : ''}: ${Array.from(duplicates).join(', ')}`);
                }
                if (blankCount > 0) {
                    problems.push(`${blankCount} empty label${blankCount > 1 ? 's' : ''}`);
                }
                setMessage({
                    type: 'error',
                    text: `Can't save — every status needs its own unique name. Found ${problems.join(' and ')}.`
                });
                setSaving(false);
                return;
            }

            // Convert array back to lookup object
            const valueObject: Record<string, string> = {};
            mappings.forEach(m => {
                if (m.label.trim()) {
                    valueObject[m.label.trim()] = m.color;
                }
            });

            const { error } = await supabase
                .from('system_settings')
                .upsert({
                    key: 'status_color_mapping',
                    value: valueObject,
                    description: 'Global status to color mapping for Excel imports'
                }, { onConflict: 'key' });

            if (error) throw error;

            // Mirror exactly what was written, so the list on screen can never drift from
            // what new Status columns will be built out of. (fetchSettings() would blank
            // the whole panel behind its loading state, so rebuild from valueObject —
            // the upsert succeeded, so that is what the row now holds.)
            setMappings(Object.entries(valueObject).map(([label, color]) => ({ label, color })));

            setMessage({ type: 'success', text: `Saved ${Object.keys(valueObject).length} status mappings` });
            setTimeout(() => setMessage({ type: '', text: '' }), 3000);

        } catch (error: any) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: 'Failed to save settings: ' + error.message });
        } finally {
            setSaving(false);
        }
    };

    const addMapping = () => {
        setMappings([...mappings, { label: '', color: '#333333' }]);
    };

    const removeMapping = (index: number) => {
        const newMappings = [...mappings];
        newMappings.splice(index, 1);
        setMappings(newMappings);
    };

    const updateMapping = (index: number, field: keyof StatusMapping, value: string) => {
        const newMappings = [...mappings];
        newMappings[index] = { ...newMappings[index], [field]: value };
        setMappings(newMappings);
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
                        <div className="admin-tile" style={{ width: '38px', height: '38px', background: 'rgba(46, 125, 140, 0.12)', color: '#2E7D8C' }}>
                            <Palette size={18} />
                        </div>
                        <h2 className="narai-heading" style={{ fontSize: '20px', fontWeight: 700, color: 'hsl(var(--ink))', margin: 0 }}>
                            Status to Color Mapping
                        </h2>
                    </div>
                    <button 
                        onClick={addMapping}
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
                        <Plus size={15} /> Add New
                    </button>
                </div>
                
                <p style={{ fontSize: '13.5px', color: 'hsl(var(--ink-dim))', marginBottom: '20px', lineHeight: '1.5' }}>
                    Define how Excel status labels map to colors in the system. 
                    Labels are case-insensitive. If a label isn't found here, the system will try to read the color from Excel or default to black.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {mappings.map((m, idx) => {
                        const key = m.label.trim().toLowerCase();
                        const isDuplicate = !!key && mappings.some((other, i) => i < idx && other.label.trim().toLowerCase() === key);
                        const hasProblem = !key || isDuplicate;
                        return (
                        <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                                <input
                                    type="text"
                                    value={m.label}
                                    onChange={e => updateMapping(idx, 'label', e.target.value)}
                                    placeholder="Status Label (e.g. Done)"
                                    style={hasProblem ? { ...inputStyle, borderColor: '#C83E2B', backgroundColor: 'rgba(200, 62, 43, 0.06)' } : inputStyle}
                                    title={isDuplicate ? 'Another row already uses this name' : (!key ? 'This status needs a name' : undefined)}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '6px', backgroundColor: 'hsl(var(--paper-muted))', padding: '6px 8px', borderRadius: '10px', border: '1px solid hsl(var(--paper-edge))' }}>
                                {presetColors.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => updateMapping(idx, 'color', color)}
                                        style={{
                                            width: '22px',
                                            height: '22px',
                                            borderRadius: '50%',
                                            backgroundColor: color,
                                            border: m.color === color ? '2px solid hsl(var(--ink))' : '1px solid rgba(0,0,0,0.12)',
                                            padding: 0,
                                            cursor: 'pointer'
                                        }}
                                        title={color}
                                    />
                                ))}
                                <div style={{ width: '1px', backgroundColor: 'hsl(var(--paper-edge))', margin: '0 4px' }} />
                                <input 
                                    type="color" 
                                    value={m.color}
                                    onChange={e => updateMapping(idx, 'color', e.target.value)}
                                    style={{ width: '22px', height: '22px', padding: 0, border: 'none', backgroundColor: 'transparent', cursor: 'pointer' }}
                                />
                            </div>
                            <button 
                                onClick={() => removeMapping(idx)}
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
                        );
                    })}

                    {mappings.length === 0 && (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--ink-soft))', border: '1px dashed hsl(var(--paper-edge))', borderRadius: '14px' }}>
                            No mappings defined. Click "Add New" to start.
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
                    {saving ? 'Saving...' : 'Save Mappings'}
                </button>
            </div>
        </div>
    );
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '10px',
    border: '1px solid hsl(var(--paper-edge))',
    backgroundColor: 'hsl(var(--paper-muted))',
    color: 'hsl(var(--ink))',
    fontSize: '13.5px',
    outline: 'none',
    boxSizing: 'border-box'
};
