export async function load({ fetch, url }) {
    const year = url.searchParams.get('year') || '2024';
  
    const res = await fetch(`/cap?year=${year}`);
    if (!res.ok) {
      throw new Error('Failed to fetch salary cap data');
    }
  
    const { salaryData, differenceData, years } = await res.json();
  
    return {
      salaryData,
      differenceData,
      years,
      year
    };
  }
  