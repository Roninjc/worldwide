import {
  register,
  init,
  getLocaleFromNavigator,
  locale,
  addMessages,
} from "svelte-i18n";

// Idiomas soportados
const SUPPORTED_LOCALES = ["en", "es", "fr", "de", "no"];

// Carga dinámica de mensajes
SUPPORTED_LOCALES.forEach((lang) => {
  register(lang, () => import(`./locales/${lang}.json`));
});

init({
  fallbackLocale: "en",
  initialLocale: getLocaleFromNavigator(),
});

export { locale, SUPPORTED_LOCALES };
