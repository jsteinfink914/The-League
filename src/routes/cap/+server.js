import { readFile } from 'fs/promises';
import Papa from 'papaparse';
import { json } from '@sveltejs/kit';

export async function GET() {
  try {
    const csvFile = './static/Player_Values.csv';
    const csvData = await readFile(csvFile, 'utf8');
    const parsedData = Papa.parse(csvData, { header: true }).data;

    return json(parsedData);
  } catch (error) {
    console.error('Error fetching CSV data:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
