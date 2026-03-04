// pages/settings/settings.js

const { Storage, StorageKeys } = require("../../utils/storage")

Page({
  data: {
    userInfo: {},
    serverUrl: "",
    theme: "dark",
  },

  onLoad() {
    this.loadUserInfo()
    this.loadSettings()
  },

  loadUserInfo() {
    const credentials = Storage.get(StorageKeys.CREDENTIALS, {})
    const serverUrl = Storage.get(StorageKeys.SERVER_URL, "http://localhost:4096")

    this.setData({
      userInfo: credentials,
      serverUrl,
    })
  },

  loadSettings() {
    const theme = Storage.get(StorageKeys.THEME, "dark")
    this.setData({ theme })
  },

  toggleTheme() {
    const newTheme = this.data.theme === "dark" ? "light" : "dark"
    this.setData({ theme: newTheme })

    // 更新存储
    Storage.set(StorageKeys.THEME, newTheme)

    // 更新全局主题
    const app = getApp()
    app.setTheme(newTheme)

    wx.showToast({
      title: newTheme === "dark" ? "已切换到深色模式" : "已切换到浅色模式",
      icon: "none",
    })
  },

  handleClearCache() {
    wx.showModal({
      title: "清除缓存",
      content: "确定要清除所有缓存数据吗？",
      success: (res) => {
        if (res.confirm) {
          Storage.remove(StorageKeys.SESSIONS_CACHE)

          wx.showToast({
            title: "缓存已清除",
            icon: "success",
          })
        }
      },
    })
  },

  handleAbout() {
    wx.showModal({
      title: "关于 OpenCode",
      content: "OpenCode - AI 编程助手\n\n版本: 1.0.0\n\n基于 OpenCode 移动端设计\n开发: OpenCode Team",
      showCancel: false,
    })
  },

  handleLogout() {
    wx.showModal({
      title: "退出登录",
      content: "确定要退出登录吗？",
      success: (res) => {
        if (res.confirm) {
          const app = getApp()
          app.logout()
        }
      },
    })
  },
})
