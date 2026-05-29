// hooks/useLanguage.js
import { useState } from "react";
import { t } from "../i18n/index";

export function useLanguage() {
  const [lang, setLang] = useState("fr");

  function translate(section, key) {
    return t(lang, section, key);
  }

  function toggleLang() {
    setLang(prev => (prev === "fr" ? "cr" : "fr"));
  }

  return { lang, toggleLang, t: translate };
}