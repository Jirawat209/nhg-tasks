// Local-only build: there is no real Supabase project here. Everything the
// app does — auth, queries, edge functions, storage, realtime — runs against
// an in-memory mock backed by localStorage. See src/lib/mock/.
import { mockSupabaseClient } from './mock/mockClient';

export const supabase: any = mockSupabaseClient;
