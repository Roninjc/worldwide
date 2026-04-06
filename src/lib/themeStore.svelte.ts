let theme = $state<"dark" | "light">("dark");

function applyTheme(t: "dark" | "light") {
  if (typeof document !== "undefined") {
    if (t === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }
}

export const themeStore = {
  get current() {
    return theme;
  },
  toggle() {
    theme = theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("theme", theme);
    }
  },
  init() {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("theme") as "dark" | "light" | null;
      if (saved) theme = saved;
    }
    applyTheme(theme);
  },
};
