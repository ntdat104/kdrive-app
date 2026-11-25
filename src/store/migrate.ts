// One-time move of persisted state from the pre-rename "disbox:" keys.
for (const key of ['settings', 'drives']) {
  try {
    const old = localStorage.getItem(`disbox:${key}`)
    if (old && !localStorage.getItem(`kdrive:${key}`)) localStorage.setItem(`kdrive:${key}`, old)
    localStorage.removeItem(`disbox:${key}`)
  } catch {
    /* storage unavailable */
  }
}
