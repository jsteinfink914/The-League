import { readFile } from 'fs/promises';
import Papa from 'papaparse';
import { json } from '@sveltejs/kit';

export async function GET({ url }) {
  try {
    const year = url.searchParams.get('year');
    if (!year) {
      return json({ error: 'Year parameter is required' }, { status: 400 });
    }

    const csvFile = './static/Player_Values.csv';
    const csvData = await readFile(csvFile, 'utf8');
    const parsedData = Papa.parse(csvData, { header: true }).data;

    const data = parsedData.filter(d => d.Year === year);
    const previousYear = (parseInt(year) - 1).toString();
    const previousYearData = parsedData.filter(d => d.Year === previousYear);

    const differenceData = data.map(current => {
      const previous = previousYearData.find(d => d.Name === current.Name) || {};
      return {
        Name: current.Name,
        Difference: parseFloat(current.Value) - (parseFloat(previous.Value) || 0),
      };
    });

    return json({
      salaryData: data,
      differenceData,
      years: [...new Set(parsedData.map(d => d.Year))]
    });
  } catch (error) {
    console.error('Error fetching salary cap data:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
