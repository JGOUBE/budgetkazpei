import { forwardRef } from "react"

const AuthField = forwardRef(function AuthField({
  id,
  label,
  error,
  hint,
  className = "",
  ...props
}, ref) {
  const describedBy = [
    hint ? `${id}-hint` : "",
    error ? `${id}-error` : "",
  ].filter(Boolean).join(" ") || undefined

  return (
    <div className={`auth-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      <input
        ref={ref}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...props}
      />
      {hint && <p id={`${id}-hint`} className="auth-field__hint">{hint}</p>}
      {error && <p id={`${id}-error`} className="auth-field__error" role="alert">{error}</p>}
    </div>
  )
})

export default AuthField
