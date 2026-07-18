export default function AuthCard({ children, busy = false }) {
  return (
    <div className="auth-card" aria-busy={busy}>
      {children}
    </div>
  )
}
