// utils/sse.js

class SSEClient {
  constructor() {
    this.requestTask = null
    this.isConnected = false
    this.onMessage = null
    this.onError = null
    this.onOpen = null
    this.onClose = null
    this.buffer = ""
  }

  connect(url, options = {}) {
    return new Promise((resolve, reject) => {
      this.onMessage = options.onMessage
      this.onError = options.onError
      this.onOpen = options.onOpen
      this.onClose = options.onClose

      console.log("Connecting to SSE:", url)

      this.requestTask = wx.request({
        url,
        method: "GET",
        enableChunked: true,
        header: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          ...options.header,
        },
        timeout: 120000,

        success: (res) => {
          console.log("SSE request success:", res.statusCode)
          this.isConnected = false
          this.onClose?.()
          resolve()
        },

        fail: (err) => {
          console.error("SSE request fail:", err)
          this.isConnected = false
          this.onError?.(err)
          reject(err)
        },
      })

      // 监听分块数据接收
      this.requestTask.onChunkReceived((res) => {
        if (!this.isConnected) {
          this.isConnected = true
          this.onOpen?.()
        }

        try {
          // 解码 ArrayBuffer 到字符串
          const decoder = new TextDecoder()
          const chunk = decoder.decode(res.data, { stream: true })

          // 添加到缓冲区并处理
          this.buffer += chunk
          this.processBuffer()
        } catch (err) {
          console.error("Decode error:", err)
        }
      })
    })
  }

  processBuffer() {
    // SSE 消息以 \n\n 分隔
    const messages = this.buffer.split("\n\n")

    // 保留最后一个不完整的消息
    this.buffer = messages.pop() || ""

    for (const message of messages) {
      if (message.trim()) {
        const event = this.parseEvent(message)
        if (event && event.data) {
          this.onMessage?.(event)
        }
      }
    }
  }

  parseEvent(data) {
    const event = {
      id: null,
      event: "message",
      data: "",
    }

    const lines = data.split("\n")

    for (const line of lines) {
      if (!line.trim()) continue

      // SSE 格式: field: value
      const colonIndex = line.indexOf(":")
      if (colonIndex === -1) continue

      const field = line.substring(0, colonIndex).trim()
      const value = line.substring(colonIndex + 1).trim()

      switch (field) {
        case "id":
          event.id = value
          break
        case "event":
          event.event = value
          break
        case "data":
          event.data += (event.data ? "\n" : "") + value
          break
      }
    }

    // 尝试解析 JSON
    if (event.data) {
      try {
        event.parsedData = JSON.parse(event.data)
      } catch (e) {
        // 不是 JSON，保持原样
        event.parsedData = event.data
      }
    }

    return event
  }

  close() {
    if (this.requestTask) {
      this.requestTask.abort()
      this.requestTask = null
    }
    this.isConnected = false
    this.buffer = ""
  }
}

function createSSE(url, options = {}) {
  const sse = new SSEClient()
  sse.connect(url, options).catch((err) => {
    options.onError?.(err)
  })
  return sse
}

// 全局事件流 - 使用 /event 端点
function handleEventStream(options = {}) {
  const { StorageKeys, Storage } = require("./storage")
  const serverUrl = Storage.get(StorageKeys.SERVER_URL, "http://192.168.101.86:6015")
  const url = `${serverUrl}/event`

  console.log("Connecting to event stream:", url)

  return createSSE(url, {
    onMessage: (event) => {
      try {
        if (event.parsedData) {
          options.onMessage?.(event.parsedData)
        }
      } catch (err) {
        console.error("Failed to process event:", err, event)
      }
    },
    onOpen: options.onOpen,
    onError: options.onError,
    onClose: options.onClose,
  })
}

module.exports = {
  createSSE,
  handleEventStream,
  SSEClient,
}
