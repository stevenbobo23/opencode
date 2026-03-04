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
    projects: [],
    selectedProjectIndex: 0,
    selectedProject: null,
  },

  onLoad() {
    this.checkLogin()
    this.loadProjects()
  },

  onShow() {
    if (this.data.projects.length > 0) {
      this.loadSessions()
    }
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

  async loadProjects() {
    try {
      const projects = await API.project.list()
      
      if (Array.isArray(projects) && projects.length > 0) {
        // 格式化项目列表用于picker显示
        const formattedProjects = projects.map(p => ({
          id: p.id,
          worktree: p.worktree,
          displayName: this.getProjectDisplayName(p.worktree)
        }))
        
        this.setData({
          projects: formattedProjects,
          selectedProject: formattedProjects[0]
        })
        
        // 加载第一个项目的会话
        this.loadSessions()
      }
    } catch (error) {
      console.error("Load projects error:", error)
      wx.showToast({
        title: "加载项目失败",
        icon: "none"
      })
    }
  },

  getProjectDisplayName(worktree) {
    // 从路径中提取项目名称
    const parts = worktree.split('/')
    return parts[parts.length - 1] || worktree
  },

  onProjectChange(e) {
    const index = e.detail.value
    const selectedProject = this.data.projects[index]
    
    this.setData({
      selectedProjectIndex: index,
      selectedProject: selectedProject
    })
    
    // 重新加载会话列表
    this.loadSessions()
  },

  async loadSessions() {
    if (this.data.loading) return

    this.setData({ loading: true })

    try {
      // 获取当前选中项目的worktree作为directory参数
      const directory = this.data.selectedProject?.worktree
      
      // 从 API 加载会话列表
      const response = await API.session.list(directory)

      // 确保返回的是数组
      const sessions = Array.isArray(response) ? response : response?.data || []

      // 格式化会话数据
      const formattedSessions = sessions.map((session) => {
        // 处理preview，可能是对象或字符串
        let previewText = ""
        if (session.summary) {
          if (typeof session.summary === "string") {
            previewText = session.summary
          } else if (typeof session.summary === "object") {
            // 如果是对象，尝试提取文本内容
            previewText = session.summary.text || session.summary.content || JSON.stringify(session.summary).substring(0, 100)
          }
        }
        
        return {
          id: session.id,
          title: session.title || "新会话",
          preview: previewText,
          time: this.formatTime(session.time?.created || Date.now()),
          agent: session.agent,
          model: session.model,
        }
      })

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
    const projectId = this.data.selectedProject?.id
    const url = projectId ? `/pages/chat/chat?projectId=${projectId}` : "/pages/chat/chat"
    wx.navigateTo({ url })
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

  clearSearch() {
    this.setData({
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
