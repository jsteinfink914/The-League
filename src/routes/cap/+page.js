// src/routes/api/salary-cap.js

import { readFile } from 'fs/promises';
import Papa from 'papaparse';
import { json } from '@sveltejs/kit';

export async function GET({ url }) {
  try {
    // Get the year parameter from the URL
    const year = url.searchParams.get('year');
    if (!year) {
      return json({ error: 'Year parameter is required' }, { status: 400 });
    }

    // Load and parse the CSV file
    const csvFile = './static/Player_Values.csv'; // Ensure this path is correct
    const csvData = await readFile(csvFile, 'utf8');
    const parsedData = Papa.parse(csvData, { header: true }).data;

    // Filter data based on the requested year
    const data = parsedData.filter(d => d.Year === year);
    const previousYear = (parseInt(year) - 1).toString();
    const previousYearData = parsedData.filter(d => d.Year === previousYear);

    // Calculate differences
    const differenceData = data.map(current => {
      const previous = previousYearData.find(d => d.Name === current.Name) || {};
      return {
        Name: current.Name,
        Difference: parseFloat(current.Value) - (parseFloat(previous.Value) || 0),
      };
    });

    // Return the data as JSON
    return json({
      salaryData: data,
      differenceData
    });
  } catch (error) {
    console.error('Error fetching salary cap data:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
