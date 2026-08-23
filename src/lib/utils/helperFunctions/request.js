const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;
const MAX_CONCURRENCY = 6;

export class RequestError extends Error {
  constructor(message, { status = 0, url = '', cause } = {}) {
    super(message, { cause });
    this.name = 'RequestError';
    this.status = status;
    this.url = url;
  }
}

const shouldRetry = (error) =>
  error instanceof RequestError
    ? error.status === 408 || error.status === 429 || error.status >= 500
    : true;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch with a deadline and a small retry budget. The caller can provide
 * SvelteKit's fetch implementation through options.fetcher.
 */
export async function fetchWithRetry(input, init = {}, options = {}) {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);
  const url = typeof input === 'string' ? input : input?.url || '';
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    init.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await fetcher(input, { ...init, signal: controller.signal });
      if (!response.ok) {
        throw new RequestError(`Request failed (${response.status})`, {
          status: response.status,
          url
        });
      }
      return response;
    } catch (error) {
      lastError =
        error?.name === 'AbortError'
          ? new RequestError(`Request timed out after ${timeoutMs}ms`, { url, cause: error })
          : error instanceof RequestError
            ? error
            : new RequestError(error?.message || 'Network request failed', { url, cause: error });
      if (attempt >= retries || !shouldRetry(lastError)) throw lastError;
      await delay(250 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', onAbort);
    }
  }

  throw lastError;
}

export async function fetchJson(input, init = {}, options = {}) {
  const response = await fetchWithRetry(input, init, options);
  try {
    return await response.json();
  } catch (error) {
    throw new RequestError('Response was not valid JSON', {
      url: typeof input === 'string' ? input : input?.url || '',
      cause: error
    });
  }
}

export async function fetchText(input, init = {}, options = {}) {
  const response = await fetchWithRetry(input, init, options);
  return response.text();
}

/**
 * Run independent requests without allowing one failed request to discard
 * successful results. Tasks are functions so requests start at the limit.
 */
export async function allSettledWithConcurrency(tasks, concurrency = MAX_CONCURRENCY) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), MAX_CONCURRENCY, tasks.length) }, worker)
  );
  return results;
}