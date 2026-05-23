import { json } from '@sveltejs/kit';
import pool from '$lib/server/db.js';

export async function GET() {
    try {
        const { rows } = await pool.query(
            'SELECT id, date, parties, bet, added_by, added_at, edit_history FROM side_bets ORDER BY added_at ASC'
        );
        return json(rows.map(r => ({
            id: r.id,
            date: r.date,
            parties: r.parties,
            bet: r.bet,
            addedBy: r.added_by,
            addedAt: r.added_at,
            editHistory: r.edit_history
        })));
    } catch (e) {
        return json({ error: e.message }, { status: 500 });
    }
}

export async function POST({ request }) {
    try {
        const body = await request.json();
        const id = `sb-${Date.now()}`;
        const now = new Date().toISOString();
        const { rows } = await pool.query(
            `INSERT INTO side_bets (id, date, parties, bet, added_by, added_at, edit_history)
             VALUES ($1,$2,$3,$4,$5,$6,'[]') RETURNING *`,
            [id, body.date, body.parties, body.bet, body.submittedBy, now]
        );
        const r = rows[0];
        return json({
            id: r.id, date: r.date, parties: r.parties, bet: r.bet,
            addedBy: r.added_by, addedAt: r.added_at, editHistory: r.edit_history
        }, { status: 201 });
    } catch (e) {
        return json({ error: e.message }, { status: 500 });
    }
}

export async function PUT({ request }) {
    try {
        const body = await request.json();
        const { rows: existing } = await pool.query(
            'SELECT * FROM side_bets WHERE id = $1', [body.id]
        );
        if (!existing.length) return json({ error: 'Bet not found' }, { status: 404 });
        const prev = existing[0];
        const snapshot = {
            editedBy: body.submittedBy,
            editedAt: new Date().toISOString(),
            snapshot: { date: prev.date, parties: prev.parties, bet: prev.bet }
        };
        const newHistory = [...prev.edit_history, snapshot];
        const { rows } = await pool.query(
            `UPDATE side_bets SET date=$1, parties=$2, bet=$3, edit_history=$4
             WHERE id=$5 RETURNING *`,
            [body.date, body.parties, body.bet, JSON.stringify(newHistory), body.id]
        );
        const r = rows[0];
        return json({
            id: r.id, date: r.date, parties: r.parties, bet: r.bet,
            addedBy: r.added_by, addedAt: r.added_at, editHistory: r.edit_history
        });
    } catch (e) {
        return json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE({ request }) {
    try {
        const body = await request.json();
        const { rowCount } = await pool.query(
            'DELETE FROM side_bets WHERE id = $1', [body.id]
        );
        if (!rowCount) return json({ error: 'Bet not found' }, { status: 404 });
        return json({ success: true });
    } catch (e) {
        return json({ error: e.message }, { status: 500 });
    }
}
