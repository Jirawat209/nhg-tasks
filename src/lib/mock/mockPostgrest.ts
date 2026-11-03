// A small subset of the supabase-js / PostgREST fluent query API, implemented
// against the in-memory mockDb instead of a network call. It supports exactly
// the chain methods and embed shapes this codebase actually uses — it is not
// a general-purpose PostgREST reimplementation.

import { mockDb, type Row } from './mockDb';

type FilterFn = (row: Row) => boolean;

const RELATIONS: Record<string, Record<string, { table: string; fk: string; many?: boolean }>> = {
    board_members: {
        profiles: { table: 'profiles', fk: 'user_id' },
        boards: { table: 'boards', fk: 'board_id' }
    },
    workspace_members: {
        profiles: { table: 'profiles', fk: 'user_id' },
        workspaces: { table: 'workspaces', fk: 'workspace_id' }
    },
    boards: {
        workspaces: { table: 'workspaces', fk: 'workspace_id' }
    }
};

function coerce(v: any): any {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null') return null;
    return v;
}

function applyOp(row: Row, col: string, op: string, val: any): boolean {
    const rv = row[col];
    switch (op) {
        case 'eq': return rv === coerce(val);
        case 'neq': return rv !== coerce(val);
        case 'gt': return rv > val;
        case 'gte': return rv >= val;
        case 'lt': return rv < val;
        case 'lte': return rv <= val;
        case 'is': return val === 'null' ? (rv === null || rv === undefined) : rv === coerce(val);
        case 'in': return Array.isArray(val) && val.includes(rv);
        case 'like':
        case 'ilike': {
            const pattern = String(val).replace(/[.*+?^${}()|[\]\\]/g, c => (c === '%' ? '.*' : `\\${c}`));
            const re = new RegExp(`^${pattern}$`, op === 'ilike' ? 'i' : undefined);
            return re.test(String(rv ?? ''));
        }
        default: return true;
    }
}

// Splits a select string into top-level column names and relation embeds,
// respecting parenthesis nesting so `a,b(c,d(e))` splits correctly.
function parseSelect(selectStr: string): { columns: string[]; embeds: { name: string; inner: string }[] } {
    const tokens: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of selectStr) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            tokens.push(cur.trim());
            cur = '';
        } else {
            cur += ch;
        }
    }
    if (cur.trim()) tokens.push(cur.trim());

    const columns: string[] = [];
    const embeds: { name: string; inner: string }[] = [];
    for (const t of tokens) {
        const m = t.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*)\)$/);
        if (m) embeds.push({ name: m[1], inner: m[2] });
        else if (t) columns.push(t);
    }
    return { columns, embeds };
}

function resolveEmbeds(table: string, row: Row, embeds: { name: string; inner: string }[]): Row {
    if (!embeds.length) return row;
    const out: Row = { ...row };
    const rel = RELATIONS[table];
    if (!rel) return out;
    for (const e of embeds) {
        const spec = rel[e.name];
        if (!spec) continue;
        const related = mockDb.get(spec.table).find(r => r.id === row[spec.fk]);
        if (!related) {
            out[e.name] = spec.many ? [] : null;
            continue;
        }
        const { embeds: nested } = parseSelect(e.inner);
        const resolved = nested.length ? resolveEmbeds(spec.table, related, nested) : { ...related };
        out[e.name] = spec.many ? [resolved] : resolved;
    }
    return out;
}

type QueryResult = { data: any; error: any; count?: number | null };

export class MockQueryBuilder implements PromiseLike<QueryResult> {
    private table: string;
    private filters: FilterFn[] = [];
    private orGroups: FilterFn[][] = [];
    private orderSpecs: { column: string; ascending: boolean }[] = [];
    private limitN: number | null = null;
    private rangeSpec: { from: number; to: number } | null = null;
    private wantSingle = false;
    private wantMaybeSingle = false;
    private selectEmbeds: { name: string; inner: string }[] = [];
    private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    private payload: any = null;
    private upsertOnConflict = 'id';
    private countMode: 'exact' | null = null;
    private headOnly = false;

    constructor(table: string) {
        this.table = table;
    }

    select(cols?: string, opts?: { count?: 'exact'; head?: boolean }) {
        if (opts?.count) this.countMode = opts.count;
        if (opts?.head) this.headOnly = true;
        if (cols) this.selectEmbeds = parseSelect(cols).embeds;
        return this;
    }

    insert(payload: any) { this.op = 'insert'; this.payload = payload; return this; }
    update(payload: any) { this.op = 'update'; this.payload = payload; return this; }
    upsert(payload: any, opts?: { onConflict?: string }) {
        this.op = 'upsert'; this.payload = payload; this.upsertOnConflict = opts?.onConflict || 'id';
        return this;
    }
    delete() { this.op = 'delete'; return this; }

    eq(col: string, val: any) { this.filters.push(r => r[col] === val); return this; }
    neq(col: string, val: any) { this.filters.push(r => r[col] !== val); return this; }
    gt(col: string, val: any) { this.filters.push(r => r[col] > val); return this; }
    gte(col: string, val: any) { this.filters.push(r => r[col] >= val); return this; }
    lt(col: string, val: any) { this.filters.push(r => r[col] < val); return this; }
    lte(col: string, val: any) { this.filters.push(r => r[col] <= val); return this; }
    in(col: string, vals: any[]) { this.filters.push(r => Array.isArray(vals) && vals.includes(r[col])); return this; }
    is(col: string, val: any) {
        this.filters.push(r => (val === null ? (r[col] === null || r[col] === undefined) : r[col] === val));
        return this;
    }
    not(col: string, _op: string, val: any) { this.filters.push(r => r[col] !== val); return this; }
    like(col: string, val: string) { this.filters.push(r => applyOp(r, col, 'like', val)); return this; }
    ilike(col: string, val: string) { this.filters.push(r => applyOp(r, col, 'ilike', val)); return this; }
    contains(col: string, val: any) {
        this.filters.push(r => {
            const rv = r[col];
            if (Array.isArray(rv)) {
                const arr = Array.isArray(val) ? val : [val];
                return arr.every(v => rv.includes(v));
            }
            if (rv && typeof rv === 'object') {
                return Object.entries(val || {}).every(([k, v]) => rv[k] === v);
            }
            return false;
        });
        return this;
    }
    match(obj: Record<string, any>) {
        this.filters.push(r => Object.entries(obj).every(([k, v]) => r[k] === v));
        return this;
    }
    filter(col: string, op: string, val: any) { this.filters.push(r => applyOp(r, col, op, val)); return this; }
    or(filterStr: string) {
        const clauses = filterStr.split(',').map(c => c.trim()).filter(Boolean);
        const fns: FilterFn[] = clauses.map(c => {
            const [col, op, ...rest] = c.split('.');
            const val = rest.join('.');
            return (r: Row) => applyOp(r, col, op, val);
        });
        this.orGroups.push(fns);
        return this;
    }
    order(col: string, opts?: { ascending?: boolean }) {
        this.orderSpecs.push({ column: col, ascending: opts?.ascending !== false });
        return this;
    }
    limit(n: number) { this.limitN = n; return this; }
    range(from: number, to: number) { this.rangeSpec = { from, to }; return this; }
    single() { this.wantSingle = true; return this; }
    maybeSingle() { this.wantMaybeSingle = true; return this; }

    private matches(row: Row): boolean {
        if (!this.filters.every(f => f(row))) return false;
        for (const group of this.orGroups) {
            if (!group.some(f => f(row))) return false;
        }
        return true;
    }

    private finish(rows: Row[], count: number | null = null): QueryResult {
        if (this.wantSingle) {
            if (rows.length !== 1) {
                return { data: null, error: { message: rows.length === 0 ? 'No rows found' : 'Multiple rows found' }, count };
            }
            return { data: rows[0], error: null, count };
        }
        if (this.wantMaybeSingle) {
            return { data: rows[0] ?? null, error: null, count };
        }
        return { data: rows, error: null, count };
    }

    private execute(): QueryResult {
        try {
            const rows = mockDb.get(this.table);

            if (this.op === 'insert' || this.op === 'upsert') {
                const items = Array.isArray(this.payload) ? this.payload : [this.payload];
                const inserted: Row[] = [];
                for (const item of items) {
                    const row: Row = { ...item };
                    if (row.id === undefined) row.id = crypto.randomUUID();
                    if (row.created_at === undefined) row.created_at = new Date().toISOString();

                    if (this.op === 'upsert') {
                        const idx = rows.findIndex(r => r[this.upsertOnConflict] === row[this.upsertOnConflict]);
                        if (idx >= 0) {
                            rows[idx] = { ...rows[idx], ...row };
                            inserted.push(rows[idx]);
                            continue;
                        }
                    }
                    rows.push(row);
                    inserted.push(row);
                }
                mockDb.set(this.table, rows);
                return this.finish(inserted);
            }

            if (this.op === 'update') {
                const matched = rows.filter(r => this.matches(r));
                matched.forEach(r => Object.assign(r, this.payload));
                mockDb.set(this.table, rows);
                return this.finish(matched);
            }

            if (this.op === 'delete') {
                const matched = rows.filter(r => this.matches(r));
                const remaining = rows.filter(r => !this.matches(r));
                mockDb.set(this.table, remaining);
                return this.finish(matched);
            }

            // select
            let result = rows.filter(r => this.matches(r));

            if (this.headOnly && this.countMode) {
                return { data: null, error: null, count: result.length };
            }

            if (this.orderSpecs.length) {
                result = [...result].sort((a, b) => {
                    for (const spec of this.orderSpecs) {
                        const av = a[spec.column];
                        const bv = b[spec.column];
                        if (av === bv) continue;
                        if (av === undefined || av === null) return 1;
                        if (bv === undefined || bv === null) return -1;
                        const cmp = av < bv ? -1 : 1;
                        return spec.ascending ? cmp : -cmp;
                    }
                    return 0;
                });
            }

            const count = this.countMode ? result.length : null;

            if (this.rangeSpec) result = result.slice(this.rangeSpec.from, this.rangeSpec.to + 1);
            else if (this.limitN !== null) result = result.slice(0, this.limitN);

            result = result.map(r => resolveEmbeds(this.table, { ...r }, this.selectEmbeds));

            return this.finish(result, count);
        } catch (e: any) {
            return { data: null, error: { message: e?.message || String(e) } };
        }
    }

    then<TResult1 = QueryResult, TResult2 = never>(
        onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ): PromiseLike<TResult1 | TResult2> {
        return Promise.resolve(this.execute()).then(onfulfilled as any, onrejected as any);
    }
}

export function from(table: string): MockQueryBuilder {
    return new MockQueryBuilder(table);
}
