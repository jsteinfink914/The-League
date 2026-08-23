const DEFAULT_TIMEOUT_MS = 12_000;

export async function fetchWithTimeout(resource, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJsonWithTimeout(resource, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetchWithTimeout(resource, options, timeoutMs);
  return response.json();
}

export async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}