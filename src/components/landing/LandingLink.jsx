import { navigate } from "../../services/authNavigation"

export default function LandingLink({
  href,
  children,
  onNavigate,
  onClick,
  className = "",
  ...props
}) {
  function handleClick(event) {
    onClick?.(event)
    if (event.defaultPrevented) return
    if (!href || href.startsWith("#")) {
      onNavigate?.()
      return
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    if (!href.startsWith("/")) return

    event.preventDefault()
    onNavigate?.()
    navigate(href)
  }

  return (
    <a href={href} className={className} {...props} onClick={handleClick}>
      {children}
    </a>
  )
}
