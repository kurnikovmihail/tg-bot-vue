const ACTIVE_USER_KEY = 'mgdi_active_user_id'
const ADMIN_ACCESS_KEY = 'mgdi_admin_access'
const ADMIN_PASSWORD = '205813'

export function isAdminAccessGranted() {
  return window.localStorage.getItem(ADMIN_ACCESS_KEY) === '1'
}

export function grantAdminAccessByPassword(password) {
  if (String(password ?? '').trim() !== ADMIN_PASSWORD) {
    return false
  }
  window.localStorage.setItem(ADMIN_ACCESS_KEY, '1')
  return true
}

export function getOrCreateActiveUserId() {
  const raw = window.localStorage.getItem(ACTIVE_USER_KEY)
  if (raw && /^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10)
  }
  const generated = Math.floor(100000 + Math.random() * 900000)
  window.localStorage.setItem(ACTIVE_USER_KEY, String(generated))
  return generated
}
