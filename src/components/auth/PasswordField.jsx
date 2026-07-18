import { forwardRef, useState } from "react"

const PasswordField = forwardRef(function PasswordField({
  id,
  label,
  error,
  hint,
  autoComplete,
  ...props
}, ref) {
  const [visible, setVisible] = useState(false)
  const describedBy = [
    hint ? `${id}-hint` : "",
    error ? `${id}-error` : "",
  ].filter(Boolean).join(" ") || undefined

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password">
        <input
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible(value => !value)}
          aria-label={visible ? `Masquer ${label.toLowerCase()}` : `Afficher ${label.toLowerCase()}`}
        >
          {visible ? "Masquer" : "Afficher"}
        </button>
      </div>
      {hint && <p id={`${id}-hint`} className="auth-field__hint">{hint}</p>}
      {error && <p id={`${id}-error`} className="auth-field__error" role="alert">{error}</p>}
    </div>
  )
})

export default PasswordField
