// Keep the model's content intact while fixing malformed list typography.
// Both French and Réunion Creole messages can contain numbered headings
// separated from their descriptions by spurious newlines and lone colons.
export function normalizeAdvisorAnswerFormatting(value = "") {
  const raw = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+\n/g, "\n")

  const lines = raw.split("\n")
  const result = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()

    // "1.\n**Association**" -> "1. **Association**", even with an empty line.
    if (/^\d{1,2}[.)]$/.test(line)) {
      let next = index + 1
      while (next < lines.length && !lines[next].trim()) next += 1
      if (next < lines.length && !/^\d{1,2}[.)]$/.test(lines[next].trim())) {
        result.push(`${line} ${lines[next].trim()}`)
        index = next
        continue
      }
    }

    // "**K'DI LE CŒUR**\n: C'est une épicerie..."
    // -> "**K'DI LE CŒUR** — C'est une épicerie..."
    // Applies only to a colon at the *start* of a line, not to normal punctuation.
    if (/^:\s*\S/.test(line) && result.length) {
      let last = result.length - 1
      while (last >= 0 && !result[last].trim()) last -= 1
      if (last >= 0 && !/^\d{1,2}[.)]$/.test(result[last].trim())) {
        result.splice(last + 1)
        result[last] = `${result[last].trimEnd()} — ${line.slice(1).trimStart()}`
        continue
      }
    }

    result.push(line)
  }

  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}
