import { allSettledWithConcurrency } from './request';

export const waitForAll = async (...ps) => Promise.all(ps);
export { allSettledWithConcurrency };