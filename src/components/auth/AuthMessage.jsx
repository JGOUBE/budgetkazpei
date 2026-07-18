export default function AuthMessage({ type = "error", children }) {
  if (!children) return null

  const isError = type === "error"

  return (
    <div
      className={`auth-message auth-message--${type}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      {children}
    </div>
  )
}
