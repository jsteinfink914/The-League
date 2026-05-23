import vercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  kit: {
    adapter: vercel()
  },
  preprocess: vitePreprocess()
};

export default config;
