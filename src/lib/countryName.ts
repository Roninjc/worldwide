import { getName, getNames, registerLocale } from "i18n-iso-countries";

// Register all supported locales
import en from "i18n-iso-countries/langs/en.json";
import es from "i18n-iso-countries/langs/es.json";
import fr from "i18n-iso-countries/langs/fr.json";
import de from "i18n-iso-countries/langs/de.json";
import no from "i18n-iso-countries/langs/no.json";

registerLocale(en);
registerLocale(es);
registerLocale(fr);
registerLocale(de);
registerLocale(no);

/**
 * Get translated country name from ISO alpha-2 code
 * @param isoAlpha2 - ISO alpha-2 country code (e.g., "ES", "FR")
 * @param currentLocale - Current locale string (e.g., "es", "es-ES")
 */
export function getCountryName(
  isoAlpha2: string,
  currentLocale: string | null | undefined,
): string {
  const lang = (currentLocale ?? "en").split("-")[0];
  return getName(isoAlpha2, lang) ?? isoAlpha2;
}

/**
 * All countries as `{ code, name }`, localized and sorted by name. Used to
 * offer a picker when correcting a manually filled day.
 */
export function getAllCountryNames(
  currentLocale: string | null | undefined,
): { code: string; name: string }[] {
  const lang = (currentLocale ?? "en").split("-")[0];
  const names = getNames(lang) as Record<string, string>;
  return Object.entries(names)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}
