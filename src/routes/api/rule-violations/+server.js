import { json } from '@sveltejs/kit';
import pool from '$lib/server/db.js';

// Rule violations registry: the public record of rule-breaking in The
// League — salary-cap charges (a charge is final once a team has played
// a week still over the $600 cap) and Rule 8 roster-limit infringements
// (max 5 roster spots across QB + K + DEF on the active roster; IR and
// taxi players don't count). Written by the nightly watcher via POST
// with a stable event_key per infringement, so a re-post updates the
// same row (active -> resolved) instead of duplicating it. Read by the
// Commish > Rule Violations page.
const ensureTable = () => pool.query(`
    CREATE TABLE IF NOT EXISTS rule_violations (
        id TEXT PRIMARY KEY,
        event_key TEXT UNIQUE NOT NULL,
        rule TEXT NOT NULL,
        roster_id INT,
        manager TEXT NOT NULL,
        headline TEXT NOT NULL,
        detail TEXT,
        status TEXT NOT NULL,
        first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ
    )
`);

const RULES = ['cap', 'rule8'];
const STATUSES = ['active', 'charged', 'resolved'];

const row = (r) => ({
    id: r.id,
    eventKey: r.event_key,
    rule: r.rule,
    rosterId: r.roster_id,
    manager: r.manager,
    headline: r.headline,
    detail: r.detail,
    status: r.status,
    firstSeen: r.first_seen,
    resolvedAt: r.resolved_at,
});

export async function GET() {
    try {
        await ensureTable();
        const { rows } = await pool.query(
            'SELECT * FROM rule_violations ORDER BY first_seen DESC'
        );
        return json(rows.map(row));
    } catch (e) {
        return json({ error: e.message }, { status: 500 });
    }
}

export async function POST({ request }) {
    try {
        const body = await request.json();
        const eventKey = String(body?.eventKey || '').slice(0, 120);
        const rule = RULES.includes(body?.rule) ? body.rule : null;
        const status = STATUSES.includes(body?.status) ? body.status : null;
        const manager = String(body?.manager || '').slice(0, 80);
        const headline = String(body?.headline || '').slice(0, 300);
        if (!eventKey || !rule || !status || !manager || !headline) {
            return json({ error: 'eventKey, rule, status, manager and headline are required' }, { status: 400 });
        }
        const detail = body?.detail ? String(body.detail).slice(0, 1000) : null;
        const rosterId = Number.isInteger(body?.rosterId) ? body.rosterId : null;
        const occurredAt = body?.occurredAt && !Number.isNaN(Date.parse(body.occurredAt))
            ? new Date(body.occurredAt).toISOString()
            : null;
        await ensureTable();
        const { rows } = await pool.query(
            `INSERT INTO rule_violations (id, event_key, rule, roster_id, manager, headline, detail, status, first_seen, resolved_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()), CASE WHEN $8 = 'resolved' THEN now() ELSE NULL END)
             ON CONFLICT (event_key) DO UPDATE SET
                status = EXCLUDED.status,
                headline = EXCLUDED.headline,
                detail = EXCLUDED.detail,
                resolved_at = CASE WHEN EXCLUDED.status = 'resolved' THEN now() ELSE rule_violations.resolved_at END
             RETURNING *`,
            [`rv-${eventKey}`, eventKey, rule, rosterId, manager, headline, detail, status, occurredAt]
        );
        return json(row(rows[0]), { status: 201 });
    } catch (e) {
        return json({ error: e.message }, { status: 500 });
    }
}

// Retraction path: a record posted in error (e.g. a historical flag that
// a game-time timing audit later overturned) can be removed by its
// event_key. Same zero-friction posture as the rest of the site's
// registries (conditional trades has the same shape).
export async function DELETE({ request }) {
    try {
        const body = await request.json();
        const eventKey = String(body?.eventKey || '').slice(0, 120);
        if (!eventKey) return json({ error: 'eventKey is required' }, { status: 400 });
        await ensureTable();
        const { rowCount } = await pool.query(
            'DELETE FROM rule_violations WHERE event_key = $1', [eventKey]
        );
        if (!rowCount) return json({ error: 'Record not found' }, { status: 404 });
        return json({ success: true });
    } catch (e) {
        return json({ error: e.message }, { status: 500 });
    }
}
