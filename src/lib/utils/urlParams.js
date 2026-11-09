import { goto } from '$app/navigation';
import { get } from 'svelte/store';

// Build a setParams(updates) function bound to the $app/stores page store.
// Updates merge into the current URL query string; a null or '' value deletes
// the key, so default values stay out of the URL. Navigation uses
// replaceState so filter changes don't stack history entries, and keeps
// focus/scroll so controls don't jump while being used.
//
// Usage in a component:
//   import { page } from '$app/stores';
//   import { createSetParams } from '$lib/utils/urlParams';
//   const setParams = createSetParams(page);
export const createSetParams = (page) => (updates) => {
    const url = new URL(get(page).url);
    for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === '') url.searchParams.delete(k);
        else url.searchParams.set(k, v);
    }
    goto(url.pathname + url.search, { replaceState: true, keepFocus: true, noScroll: true });
};
