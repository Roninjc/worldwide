let theme = $state<'dark' | 'light'>('dark');

export const themeStore = {
	get current() { return theme; },
	toggle() {
		theme = theme === 'dark' ? 'light' : 'dark';
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('theme', theme);
		}
	},
	init() {
		if (typeof localStorage !== 'undefined') {
			const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
			if (saved) theme = saved;
		}
	}
};
