// utils/storage.js

const StorageKeys = {
  SERVER_URL: "opencode_server_url",
  CREDENTIALS: "opencode_credentials",
  THEME: "opencode_theme",
  SESSIONS_CACHE: "opencode_sessions_cache",
  CURRENT_SESSION: "opencode_current_session",
}

const Storage = {
  set(key, value) {
    try {
      wx.setStorageSync(key, JSON.stringify(value))
      return true
    } catch (err) {
      console.error("Storage set error:", err)
      return false
    }
  },

  get(key, defaultValue = null) {
    try {
      const value = wx.getStorageSync(key)
      if (value) {
        return JSON.parse(value)
      }
      return defaultValue
    } catch (err) {
      console.error("Storage get error:", err)
      return defaultValue
    }
  },

  remove(key) {
    try {
      wx.removeStorageSync(key)
      return true
    } catch (err) {
      console.error("Storage remove error:", err)
      return false
    }
  },

  clear() {
    try {
      wx.clearStorageSync()
      return true
    } catch (err) {
      console.error("Storage clear error:", err)
      return false
    }
  },
}

module.exports = {
  StorageKeys,
  Storage,
}
