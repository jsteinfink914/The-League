import vercel from '@sveltejs/adapter-vercel';
import node from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dockerBuild = process.env.DOCKER_BUILD;

const config = {
  kit: {
    adapter: dockerBuild ? node() : vercel()
  },
  preprocess: vitePreprocess()
};

export default config;
