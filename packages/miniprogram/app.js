// app.js

const { Storage, StorageKeys } = require("./utils/storage")
const { API } = require("./utils/api")

App({
  globalData: {
    serverUrl: "",
    isLoggedIn: false,
    userInfo: null,
  },

  onLaunch() {
    this.init()
  },

  init() {
    // 初始化 API
    API.init()

    // 检查登录状态
    this.checkLoginStatus()

    // 加载主题
    this.loadTheme()
  },

  checkLoginStatus() {
    const credentials = Storage.get(StorageKeys.CREDENTIALS, {})
    this.globalData.isLoggedIn = !!credentials.token
    this.globalData.userInfo = credentials
  },

  loadTheme() {
    const theme = Storage.get(StorageKeys.THEME, "dark")
    this.setTheme(theme)
  },

  setTheme(theme) {
    Storage.set(StorageKeys.THEME, theme)

    if (theme === "light") {
      wx.setPageStyle({
        style: {
          mode: "light",
        },
      })
    } else {
      wx.setPageStyle({
        style: {
          mode: "dark",
        },
      })
    }
  },

  login(credentials) {
    Storage.set(StorageKeys.CREDENTIALS, credentials)
    API.updateAuthHeader(credentials.token)
    this.globalData.isLoggedIn = true
    this.globalData.userInfo = credentials
  },

  logout() {
    Storage.remove(StorageKeys.CREDENTIALS)
    Storage.remove(StorageKeys.CURRENT_SESSION)
    API.updateAuthHeader("")
    this.globalData.isLoggedIn = false
    this.globalData.userInfo = null

    // 跳转到登录页
    wx.reLaunch({
      url: "/pages/login/login",
    })
  },

  setServerUrl(url) {
    Storage.set(StorageKeys.SERVER_URL, url)
    this.globalData.serverUrl = url
    API.init()
  },
})
