// pages/index/index.js

const { Storage, StorageKeys } = require("../../utils/storage")
const { API } = require("../../utils/api")

Page({
  data: {
    sessions: [],
    filteredSessions: [],
    loading: false,
    showSearch: false,
    searchQuery: "",
  },

  onLoad() {
    this.checkLogin()
    this.loadSessions()
  },

  onShow() {
    this.loadSessions()
  },

  onPullDownRefresh() {
    this.loadSessions().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  checkLogin() {
    const credentials = Storage.get(StorageKeys.CREDENTIALS, {})
    if (!credentials.token) {
      wx.redirectTo({
        url: "/pages/login/login",
      })
    }
  },

  async loadSessions() {
    if (this.data.loading) return

    this.setData({ loading: true })

    try {
      // 从 API 加载会话列表
      const response = await API.session.list()

      // 确保返回的是数组
      const sessions = Array.isArray(response) ? response : response?.data || []

      // 格式化会话数据
      const formattedSessions = sessions.map((session) => ({
        id: session.id,
        title: session.title || "新会话",
        preview: session.summary || "",
        time: this.formatTime(session.time?.created || Date.now()),
        agent: session.agent,
        model: session.model,
      }))

      this.setData({
        sessions: formattedSessions,
        filteredSessions: formattedSessions,
      })
    } catch (error) {
      console.error("Load sessions error:", error)
      // 加载失败时使用缓存数据
      const cached = Storage.get(StorageKeys.SESSIONS_CACHE, [])
      this.setData({
        sessions: cached,
        filteredSessions: cached,
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  formatTime(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date

    if (diff < 60000) return "刚刚"
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`

    return `${date.getMonth() + 1}/${date.getDate()}`
  },

  handleSessionTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/chat/chat?id=${id}`,
    })
  },

  handleNewSession() {
    wx.navigateTo({
      url: "/pages/chat/chat",
    })
  },

  async handleDelete(e) {
    const id = e.currentTarget.dataset.id

    wx.showModal({
      title: "确认删除",
      content: "确定要删除这个会话吗？",
      success: async (res) => {
        if (res.confirm) {
          try {
            await API.session.delete(id)
            wx.showToast({
              title: "删除成功",
              icon: "success",
            })
            this.loadSessions()
          } catch (error) {
            wx.showToast({
              title: "删除失败",
              icon: "none",
            })
          }
        }
      },
    })
  },

  handleSearch() {
    this.setData({ showSearch: true })
  },

  closeSearch() {
    this.setData({
      showSearch: false,
      searchQuery: "",
      filteredSessions: this.data.sessions,
    })
  },

  onSearchInput(e) {
    const query = e.detail.value.toLowerCase()
    this.setData({ searchQuery: query })

    if (!query) {
      this.setData({ filteredSessions: this.data.sessions })
      return
    }

    const filtered = this.data.sessions.filter(
      (session) =>
        (session.title && session.title.toLowerCase().includes(query)) ||
        (session.preview && session.preview.toLowerCase().includes(query)),
    )

    this.setData({ filteredSessions })
  },
})
