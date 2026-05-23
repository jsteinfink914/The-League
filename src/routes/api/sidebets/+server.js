import { json } from '@sveltejs/kit';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_PATH = join(process.cwd(), 'data', 'sideBets.json');

function readBets() {
    try {
        return JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
    } catch {
        return [];
    }
}

function writeBets(bets) {
    writeFileSync(DATA_PATH, JSON.stringify(bets, null, 2));
}

export function GET() {
    return json(readBets());
}

export async function POST({ request }) {
    const body = await request.json();
    const bets = readBets();

    const newBet = {
        id: `sb-${Date.now()}`,
        date: body.date,
        parties: body.parties,
        bet: body.bet,
        addedBy: body.submittedBy,
        addedAt: new Date().toISOString(),
        editHistory: []
    };

    bets.push(newBet);
    writeBets(bets);
    return json(newBet, { status: 201 });
}

export async function DELETE({ request }) {
    const body = await request.json();
    const bets = readBets();
    const filtered = bets.filter(b => b.id !== body.id);
    if (filtered.length === bets.length) {
        return json({ error: 'Bet not found' }, { status: 404 });
    }
    writeBets(filtered);
    return json({ success: true });
}

export async function PUT({ request }) {
    const body = await request.json();
    const bets = readBets();

    const idx = bets.findIndex(b => b.id === body.id);
    if (idx === -1) {
        return json({ error: 'Bet not found' }, { status: 404 });
    }

    const prev = bets[idx];
    bets[idx] = {
        ...prev,
        date: body.date,
        parties: body.parties,
        bet: body.bet,
        editHistory: [
            ...prev.editHistory,
            {
                editedBy: body.submittedBy,
                editedAt: new Date().toISOString(),
                snapshot: {
                    date: prev.date,
                    parties: prev.parties,
                    bet: prev.bet
                }
            }
        ]
    };

    writeBets(bets);
    return json(bets[idx]);
}
