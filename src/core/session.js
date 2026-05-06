const ACTIVE_USER_KEY = 'mgdi_active_user_id'

export function getOrCreateActiveUserId() {
  const raw = window.localStorage.getItem(ACTIVE_USER_KEY)
  if (raw && /^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10)
  }
  const generated = Math.floor(100000 + Math.random() * 900000)
  window.localStorage.setItem(ACTIVE_USER_KEY, String(generated))
  return generated
}
