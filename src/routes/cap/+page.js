// src/routes/cap/+page.js (if necessary)
export async function load({ fetch, url }) {
    const year = url.searchParams.get('year') || new Date().getFullYear().toString();
    const res = await fetch(`/cap?year=${year}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.statusText}`);
    }
    const data = await res.json();
    return {
      props: data
    };
  }
  