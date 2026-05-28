import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import { languages } from "./i18n";
import LanguageSwitcher from "./components/LanguageSwitcher";
import './App.css'

function App() {
  const [lang, setLang] = useState("fr");
  const t = languages[lang];

  const [count, setCount] = useState(0);

  return (
    <>
      {/* LANGUE */}
      <LanguageSwitcher lang={lang} setLang={setLang} />

      {/* TITRE TRADUIT */}
      <h1>{t.dashboard}</h1>

      {/* HERO SECTION */}
      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>

        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.jsx</code> and save to test <code>HMR</code>
          </p>
        </div>

        <button
          type="button"
          className="counter"
          onClick={() => setCount((c) => c + 1)}
        >
          Count is {count}
        </button>
      </section>

      {/* NEXT STEPS */}
      <section id="next-steps">
        <div id="docs">
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
        </div>
      </section>
    </>
  )
}

export default App