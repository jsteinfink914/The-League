import { json } from '@sveltejs/kit';
import pool from '$lib/server/db.js';

export async function GET() {
    const { rows } = await pool.query(
        'SELECT id, date, parties, picks, conditions, added_by, added_at, edit_history FROM conditional_trades ORDER BY added_at ASC'
    );
    return json(rows.map(r => ({
        id: r.id,
        date: r.date,
        parties: r.parties,
        picks: r.picks,
        conditions: r.conditions,
        addedBy: r.added_by,
        addedAt: r.added_at,
        editHistory: r.edit_history
    })));
}

export async function POST({ request }) {
    const body = await request.json();
    const id = `ct-${Date.now()}`;
    const now = new Date().toISOString();

    const { rows } = await pool.query(
        `INSERT INTO conditional_trades (id, date, parties, picks, conditions, added_by, added_at, edit_history)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'[]') RETURNING *`,
        [id, body.date, body.parties, JSON.stringify(body.picks), body.conditions, body.submittedBy, now]
    );
    const r = rows[0];
    return json({
        id: r.id, date: r.date, parties: r.parties, picks: r.picks,
        conditions: r.conditions, addedBy: r.added_by, addedAt: r.added_at, editHistory: r.edit_history
    }, { status: 201 });
}

export async function PUT({ request }) {
    const body = await request.json();

    const { rows: existing } = await pool.query(
        'SELECT * FROM conditional_trades WHERE id = $1', [body.id]
    );
    if (!existing.length) return json({ error: 'Trade not found' }, { status: 404 });

    const prev = existing[0];
    const snapshot = {
        editedBy: body.submittedBy,
        editedAt: new Date().toISOString(),
        snapshot: { date: prev.date, parties: prev.parties, picks: prev.picks, conditions: prev.conditions }
    };
    const newHistory = [...prev.edit_history, snapshot];

    const { rows } = await pool.query(
        `UPDATE conditional_trades SET date=$1, parties=$2, picks=$3, conditions=$4, edit_history=$5
         WHERE id=$6 RETURNING *`,
        [body.date, body.parties, JSON.stringify(body.picks), body.conditions, JSON.stringify(newHistory), body.id]
    );
    const r = rows[0];
    return json({
        id: r.id, date: r.date, parties: r.parties, picks: r.picks,
        conditions: r.conditions, addedBy: r.added_by, addedAt: r.added_at, editHistory: r.edit_history
    });
}

export async function DELETE({ request }) {
    const body = await request.json();
    const { rowCount } = await pool.query(
        'DELETE FROM conditional_trades WHERE id = $1', [body.id]
    );
    if (!rowCount) return json({ error: 'Trade not found' }, { status: 404 });
    return json({ success: true });
}
