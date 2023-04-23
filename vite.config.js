import { sveltekit } from '@sveltejs/kit/vite';

const config = {
	plugins: [sveltekit()],
	optimizeDeps: {
		exclude: ['bytemd']
	}
};

export default config;
