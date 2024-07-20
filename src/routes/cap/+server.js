// src/routes/cap/+server.js
import { readFile } from 'fs/promises';
import Papa from 'papaparse';
import { json } from '@sveltejs/kit';

export async function GET({ url }) {
  try {
    const year = url.searchParams.get('year') || new Date().getFullYear().toString();
    const csvFilePath = '/Player_Values.txt'; // Ensure path is correct
    const csvFile = await readFile(csvFilePath, 'utf8');
    const parsedData = Papa.parse(csvFile, { header: true }).data;

    const years = [...new Set(parsedData.map(d => d.Year))];
    const selectedYear = year;
    const salaryData = parsedData.filter(d => d.Year === selectedYear);
    const previousYearData = parsedData.filter(d => d.Year === (parseInt(selectedYear) - 1).toString());

    const differenceData = salaryData.map(current => {
      const previous = previousYearData.find(d => d.Name === current.Name) || {};
      return {
        Name: current.Name,
        Difference: current.Value - (previous.Value || 0),
      };
    });

    return json({
      salaryData,
      differenceData,
      years,
      selectedYear
    });
  } catch (error) {
    console.error('Failed to fetch salary cap data:', error);
    return new Response('Failed to fetch salary cap data', { status: 500 });
  }
}
