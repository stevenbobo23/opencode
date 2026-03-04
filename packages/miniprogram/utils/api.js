// utils/api.js

const { Storage, StorageKeys } = require("./storage")

class APIClient {
  constructor() {
    this.baseURL = ""
    this.timeout = 30000
  }

  init() {
    this.baseURL = Storage.get(StorageKeys.SERVER_URL, "http://localhost:4096")
    const credentials = Storage.get(StorageKeys.CREDENTIALS, {})
    this.authHeader = credentials.token ? `Bearer ${credentials.token}` : ""
  }

  request(options) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseURL}${options.url}`

      const header = {
        "Content-Type": "application/json",
        ...options.header,
      }

      if (this.authHeader) {
        header["Authorization"] = this.authHeader
      }

      wx.request({
        url,
        method: options.method || "GET",
        data: options.data,
        header,
        timeout: options.timeout || this.timeout,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data)
          } else {
            reject({
              statusCode: res.statusCode,
              message: res.data?.message || "Request failed",
              data: res.data,
            })
          }
        },
        fail: (err) => {
          reject({
            message: err.errMsg || "Network error",
            error: err,
          })
        },
      })
    })
  }

  get(url, params) {
    return this.request({ url, method: "GET", data: params })
  }

  post(url, data) {
    return this.request({ url, method: "POST", data })
  }

  put(url, data) {
    return this.request({ url, method: "PUT", data })
  }

  patch(url, data) {
    return this.request({ url, method: "PATCH", data })
  }

  delete(url) {
    return this.request({ url, method: "DELETE" })
  }
}

const client = new APIClient()

const API = {
  init: () => client.init(),

  updateAuthHeader(token) {
    client.authHeader = `Bearer ${token}`
  },

  // 全局
  global: {
    health: () => client.get("/global/health"),
    config: () => client.get("/global/config"),
  },

  // 认证
  auth: {
    set: (providerID, credentials) => client.put(`/auth/${providerID}`, credentials),
    remove: (providerID) => client.delete(`/auth/${providerID}`),
  },

  // 项目
  project: {
    list: () => client.get("/project"),
    current: (directory) => client.get("/project/current", { directory }),
  },

  // 会话
  session: {
    list: (directory) => client.get("/session", { directory }),
    get: (id) => client.get(`/session/${id}`),
    create: (data) => client.post("/session", data),
    delete: (id) => client.delete(`/session/${id}`),
    update: (id, data) => client.patch(`/session/${id}`, data),
  },

  // 消息
  message: {
    list: (sessionID, limit) => client.get(`/session/${sessionID}/message`, { limit }),
    send: (sessionID, data) => client.post(`/session/${sessionID}/message`, data),
    // 流式消息端点
    stream: (sessionID) => `/session/${sessionID}/stream`,
  },
}

module.exports = { API }
