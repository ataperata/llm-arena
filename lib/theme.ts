export const THEME_STORAGE_KEY = "llm-arena-theme";

export const themeBootScript = `(function(){try{var stored=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var dark=stored?stored==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;var root=document.documentElement;root.classList.toggle("dark",dark);root.style.colorScheme=dark?"dark":"light";}catch(e){}})();`;

export function setDarkClass(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function applyTheme(dark: boolean) {
  setDarkClass(dark);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    // Private mode can reject storage; the class still updates this view.
  }
  window.dispatchEvent(new Event("arena-theme"));
}

export function readThemePreference(): boolean {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored === "dark";
  } catch {
    // Fall through to the system preference.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
