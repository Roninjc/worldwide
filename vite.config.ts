import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';

// Build-time version string shown in the app so you can tell which build is live.
// In CI the commit sha arrives via the APP_VERSION build-arg (the Docker build has
// no .git); locally it falls back to `git rev-parse`, then to "dev".
function resolveVersion(): string {
	let sha = process.env.APP_VERSION;
	if (!sha) {
		try {
			sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
				.toString()
				.trim();
		} catch {
			sha = 'dev';
		}
	}
	const short = sha.slice(0, 7);
	const date = new Date().toISOString().slice(0, 10);
	return `${short} · ${date}`;
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(resolveVersion())
	}
});
