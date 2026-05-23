import { json } from '@sveltejs/kit';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_PATH = join(process.cwd(), 'data', 'conditionalTrades.json');

function readTrades() {
    try {
        return JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
    } catch {
        return [];
    }
}

function writeTrades(trades) {
    writeFileSync(DATA_PATH, JSON.stringify(trades, null, 2));
}

export function GET() {
    return json(readTrades());
}

export async function POST({ request }) {
    const body = await request.json();
    const trades = readTrades();

    const newTrade = {
        id: `ct-${Date.now()}`,
        date: body.date,
        parties: body.parties,
        picks: body.picks,
        conditions: body.conditions,
        addedBy: body.submittedBy,
        addedAt: new Date().toISOString(),
        editHistory: []
    };

    trades.push(newTrade);
    writeTrades(trades);
    return json(newTrade, { status: 201 });
}

export async function DELETE({ request }) {
    const body = await request.json();
    const trades = readTrades();
    const filtered = trades.filter(t => t.id !== body.id);
    if (filtered.length === trades.length) {
        return json({ error: 'Trade not found' }, { status: 404 });
    }
    writeTrades(filtered);
    return json({ success: true });
}

export async function PUT({ request }) {
    const body = await request.json();
    const trades = readTrades();

    const idx = trades.findIndex(t => t.id === body.id);
    if (idx === -1) {
        return json({ error: 'Trade not found' }, { status: 404 });
    }

    const prev = trades[idx];
    trades[idx] = {
        ...prev,
        date: body.date,
        parties: body.parties,
        picks: body.picks,
        conditions: body.conditions,
        editHistory: [
            ...prev.editHistory,
            {
                editedBy: body.submittedBy,
                editedAt: new Date().toISOString(),
                snapshot: {
                    date: prev.date,
                    parties: prev.parties,
                    picks: prev.picks,
                    conditions: prev.conditions
                }
            }
        ]
    };

    writeTrades(trades);
    return json(trades[idx]);
}
