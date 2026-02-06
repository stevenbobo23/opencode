// pages/login/login.js

const { Storage, StorageKeys } = require("../../utils/storage")
const { API } = require("../../utils/api")

Page({
  data: {
    serverUrl: "",
    username: "",
    password: "",
    showPassword: false,
    loading: false,
    errorMessage: "",
  },

  onLoad() {
    // 加载已保存的服务器地址
    const savedUrl = Storage.get(StorageKeys.SERVER_URL, "http://192.168.101.86:6015")
    this.setData({ serverUrl: savedUrl })

    // 检查是否已登录
    const credentials = Storage.get(StorageKeys.CREDENTIALS, {})
    if (credentials.token) {
      // 已登录，跳转到首页
      wx.switchTab({
        url: "/pages/index/index",
      })
    }
  },

  onServerUrlInput(e) {
    this.setData({ serverUrl: e.detail.value })
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword })
  },

  async handleLogin() {
    const { serverUrl, username, password } = this.data

    if (!serverUrl) {
      this.showError("请输入服务器地址")
      return
    }

    if (!username) {
      this.showError("请输入用户名")
      return
    }

    if (!password) {
      this.showError("请输入密码")
      return
    }

    this.setData({ loading: true, errorMessage: "" })

    try {
      // 保存服务器地址
      this.saveServerUrl(serverUrl)

      // 初始化 API
      API.init()

      // 尝试连接服务器
      await API.global.health()

      // 这里模拟登录认证（实际需要根据 OpenCode 的认证方式调整）
      // OpenCode 使用 Provider-based auth，这里简化处理
      await this.authenticate(username, password)

      // 登录成功
      wx.showToast({
        title: "登录成功",
        icon: "success",
      })

      // 跳转到首页
      setTimeout(() => {
        wx.switchTab({
          url: "/pages/index/index",
        })
      }, 1000)
    } catch (error) {
      console.error("Login error:", error)
      this.showError(error.message || "登录失败，请检查服务器地址和密码")
    } finally {
      this.setData({ loading: false })
    }
  },

  async authenticate(username, password) {
    // TODO: 实现实际的认证逻辑
    // OpenCode 的认证方式需要根据实际 API 调整
    // 这里暂时使用模拟的方式

    // 模拟生成 token（实际需要从服务器获取）
    const token = "mock_token_" + Date.now()

    // 保存凭证
    Storage.set(StorageKeys.CREDENTIALS, {
      username,
      token,
      serverUrl: this.data.serverUrl,
    })

    // 更新全局状态
    const app = getApp()
    app.login({
      username,
      token,
      serverUrl: this.data.serverUrl,
    })
  },

  saveServerUrl(url) {
    // 验证 URL 格式
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "http://" + url
    }

    Storage.set(StorageKeys.SERVER_URL, url)
    getApp().setServerUrl(url)
  },

  showError(message) {
    this.setData({ errorMessage: message })

    wx.showToast({
      title: message,
      icon: "none",
      duration: 2000,
    })
  },
})
