import {
  register,
  init,
  getLocaleFromNavigator,
  locale,
  waitLocale,
  isLoading,
} from "svelte-i18n";

const SUPPORTED_LOCALES = ["en", "es", "fr", "de", "no"];

SUPPORTED_LOCALES.forEach((lang) => {
  register(lang, () => import(`./locales/${lang}.json`));
});

init({
  fallbackLocale: "en",
  initialLocale: getLocaleFromNavigator(),
});

export { locale, SUPPORTED_LOCALES, waitLocale, isLoading };
