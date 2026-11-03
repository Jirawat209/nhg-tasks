import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';
import type { ColumnOption } from '../types';

const FALLBACK_STATUS_OPTIONS: Omit<ColumnOption, 'id'>[] = [
    { label: 'Default', color: '#6E6655' },
    { label: 'Done', color: '#152A00' },
    { label: 'Stuck', color: '#250719' },
    { label: 'Working on it', color: '#A76400' }
];

// Builds a new board's default Status options from the admin-configured
// Status-to-Color Mapping (Admin Console > Status Mapping, system_settings
// row keyed 'status_color_mapping') so every new board/workspace starts out
// speaking the same status vocabulary the org already uses for Excel-import
// color coding, instead of a separate hardcoded 4-option list. Falls back to
// that old list if the mapping is empty or unreachable so board creation
// never breaks on it.
export async function getDefaultStatusOptions(): Promise<ColumnOption[]> {
    try {
        const { data } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'status_color_mapping')
            .single();

        const mapping = data?.value as Record<string, string> | undefined;
        const entries = mapping ? Object.entries(mapping) : [];

        if (entries.length === 0) {
            return FALLBACK_STATUS_OPTIONS.map(o => ({ id: uuidv4(), ...o }));
        }

        return entries.map(([label, color]) => ({ id: uuidv4(), label, color }));
    } catch {
        return FALLBACK_STATUS_OPTIONS.map(o => ({ id: uuidv4(), ...o }));
    }
}
