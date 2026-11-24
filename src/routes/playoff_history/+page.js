import { getPlayoffHistory } from '$lib/utils/helper';

export async function load() {
    return {
        historyData: getPlayoffHistory(),
    };
}
