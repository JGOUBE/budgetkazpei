// i18n/index.js
import fr from "./fr";
import kreol from "./kreol";

export const languages = { fr, cr: kreol };

export function t(lang, section, key) {
  return languages[lang]?.[section]?.[key] ?? languages["fr"][section]?.[key] ?? key;
}