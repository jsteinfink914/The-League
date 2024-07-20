export async function load({ fetch, params }) {
    const year = params.year || '2024'; // Default year
  
    const res = await fetch(`/cap?year=${year}`);
    if (!res.ok) {
      throw new Error('Failed to fetch salary cap data');
    }
  
    const { salaryData, differenceData, years } = await res.json();
  
    return {
      props: {
        salaryData,
        differenceData,
        years,
        year
      }
    };
  }
  