// pages/chat/chat.js

const { Storage, StorageKeys } = require("../../utils/storage")
const { API } = require("../../utils/api")
const { handleEventStream } = require("../../utils/sse")
const { markdownToHtml } = require("../../utils/markdown")

Page({
  data: {
    sessionId: null,
    sessionTitle: "",
    messages: [],
    inputValue: "",
    loading: false,
    isSending: false,
    isStreaming: false,
    streamingParts: [], // 流式消息的所有 parts，按顺序排列
    currentMessageId: null,
    scrollTop: 0,
    scrollToView: "",
    sse: null,
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ sessionId: options.id })
      this.loadSession()
    } else {
      this.createNewSession()
    }
  },

  onUnload() {
    if (this.data.sse) {
      this.data.sse.close()
    }
  },

  async loadSession() {
    if (!this.data.sessionId) return

    this.setData({ loading: true })

    try {
      const [sessionInfo, messages] = await Promise.all([
        API.session.get(this.data.sessionId).catch(() => null),
        API.message.list(this.data.sessionId),
      ])

      const formattedMessages = []
      let lastTime = null

      if (Array.isArray(messages)) {
        messages.forEach((msg) => {
          if (msg.info && msg.parts) {
            const msgTime = this.formatTime(msg.info.time?.created)
            const showTime = this.shouldShowTime(lastTime, msg.info.time?.created)
            lastTime = msg.info.time?.created

            // 转换 parts 结构，保持原始顺序
            const parts = msg.parts
              .filter((part) => ["text", "reasoning", "tool"].includes(part.type))
              .map((part) => {
                if (part.type === "tool") {
                  return {
                    id: part.id,
                    type: part.type,
                    tool: part.tool,
                    state: part.state,
                    collapsed: true, // tool 默认折叠
                  }
                } else {
                  return {
                    id: part.id,
                    type: part.type,
                    text: part.text || "",
                    textHtml: markdownToHtml(part.text || ""),
                    collapsed: part.type === "reasoning", // reasoning 默认折叠
                  }
                }
              })

            formattedMessages.push({
              id: msg.info.id,
              role: msg.info.role,
              parts: parts,
              time: msgTime,
              showTime: showTime,
            })
          }
        })
      }

      this.setData({
        sessionTitle: sessionInfo?.title || "新会话",
        messages: formattedMessages,
        loading: false,
      })

      this.scrollToBottom()
    } catch (error) {
      console.error("Load session error:", error)
      this.setData({ loading: false })
    }
  },

  shouldShowTime(lastTime, currentTime) {
    if (!lastTime) return true
    const diff = currentTime - lastTime
    return diff > 5 * 60 * 1000
  },

  async createNewSession() {
    try {
      const session = await API.session.create({
        title: "新会话",
      })

      this.setData({ sessionId: session.id })
    } catch (error) {
      console.error("Create session error:", error)
      wx.showToast({
        title: "创建会话失败",
        icon: "none",
      })
    }
  },

  formatTime(timestamp) {
    const date = new Date(timestamp)
    const hours = String(date.getHours()).padStart(2, "0")
    const minutes = String(date.getMinutes()).padStart(2, "0")
    return `${hours}:${minutes}`
  },

  onInputChange(e) {
    this.setData({ inputValue: e.detail.value })
  },

  async handleSend() {
    const { inputValue, sessionId, isSending } = this.data

    if (!inputValue?.trim() || isSending) return

    const messageContent = inputValue

    // 添加用户消息 - 使用 parts 结构
    const userMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      parts: [
        {
          id: `part_${Date.now()}`,
          type: "text",
          text: messageContent,
          textHtml: markdownToHtml(messageContent),
          collapsed: false,
        },
      ],
      time: this.formatTime(Date.now()),
      showTime: this.shouldShowTime(this.data.messages[this.data.messages.length - 1]?.time, Date.now()),
    }

    this.setData({
      messages: [...this.data.messages, userMessage],
      inputValue: "",
      isSending: true,
    })

    this.scrollToBottom()

    // 先建立 SSE 连接，再发送消息
    this.startEventStream(sessionId)

    // 延迟发送消息
    setTimeout(async () => {
      try {
        await API.message.send(sessionId, {
          parts: [
            {
              type: "text",
              text: messageContent,
            },
          ],
        })
      } catch (error) {
        console.error("Send message error:", error)
        this.stopStreaming()
        wx.showToast({
          title: "发送失败",
          icon: "none",
        })
      }
    }, 100)
  },

  startEventStream(sessionId) {
    this.setData({
      isStreaming: true,
      streamingParts: [], // 重置流式 parts
      currentMessageId: null,
    })

    const sse = handleEventStream({
      onMessage: (data) => {
        this.handleEventData(data, sessionId)
      },
      onOpen: () => {
        console.log("Event stream connected")
      },
      onError: (err) => {
        console.error("Event stream error:", err)
      },
      onClose: () => {
        console.log("Event stream closed")
        this.finalizeStreaming()
      },
    })

    this.setData({ sse })

    // 60秒后自动停止
    setTimeout(() => {
      if (this.data.isStreaming) {
        this.finalizeStreaming()
      }
    }, 60000)
  },

  handleEventData(data, sessionId) {
    const eventSessionId = data.properties?.sessionID || data.properties?.part?.sessionID || data.sessionID
    if (eventSessionId && eventSessionId !== sessionId) {
      return
    }

    console.log("Event:", data.type, data)

    switch (data.type) {
      case "message.part.updated":
        const part = data.properties?.part
        if (!part?.messageID?.startsWith("msg_")) break

        // 检查是否是用户消息
        const isUserMessage = this.data.messages.some((m) => m.id === part.messageID)
        if (isUserMessage) {
          console.log("Skipping user message:", part.messageID)
          break
        }

        // 处理不同类型的 part
        if (part.type === "reasoning" || part.type === "text") {
          const text = part.text || ""
          console.log(`Received ${part.type} [${part.id}]:`, text.substring(0, 50))

          // 根据 part.id 查找或添加 part，保持顺序
          const streamingParts = [...this.data.streamingParts]
          const existingIndex = streamingParts.findIndex((p) => p.id === part.id)

          if (existingIndex >= 0) {
            // 更新现有 part
            streamingParts[existingIndex] = {
              id: part.id,
              type: part.type,
              text: text,
              textHtml: markdownToHtml(text),
              collapsed:
                streamingParts[existingIndex].collapsed !== undefined ? streamingParts[existingIndex].collapsed : false,
            }
          } else {
            // 添加新 part 到末尾，保持服务器发送的顺序
            streamingParts.push({
              id: part.id,
              type: part.type,
              text: text,
              textHtml: markdownToHtml(text),
              collapsed: false, // 流式时默认展开
            })
          }

          this.setData({
            streamingParts: streamingParts,
            currentMessageId: part.messageID,
          })
          this.scrollToBottom()
        } else if (part.type === "tool") {
          console.log(`Received tool [${part.id}]:`, part.tool)

          // 处理 tool 类型
          const streamingParts = [...this.data.streamingParts]
          const existingIndex = streamingParts.findIndex((p) => p.id === part.id)

          if (existingIndex >= 0) {
            // 更新现有 tool
            streamingParts[existingIndex] = {
              id: part.id,
              type: part.type,
              tool: part.tool,
              state: part.state,
              collapsed:
                streamingParts[existingIndex].collapsed !== undefined ? streamingParts[existingIndex].collapsed : true,
            }
          } else {
            // 添加新 tool 到末尾
            streamingParts.push({
              id: part.id,
              type: part.type,
              tool: part.tool,
              state: part.state,
              collapsed: true, // tool 默认折叠
            })
          }

          this.setData({
            streamingParts: streamingParts,
            currentMessageId: part.messageID,
          })
          this.scrollToBottom()
        }
        break

      case "message.updated":
        if (data.properties?.info?.role === "assistant") {
          this.setData({
            currentMessageId: data.properties.info.id,
          })
        }
        break

      case "session.idle":
        this.finalizeStreaming()
        break

      case "message.completed":
      case "message.finished":
        this.finalizeStreaming()
        break

      case "error":
        this.stopStreaming()
        break
    }
  },

  finalizeStreaming() {
    const { streamingParts, currentMessageId, messages } = this.data

    if (streamingParts.length > 0 && currentMessageId) {
      const lastMsg = messages[messages.length - 1]

      // 转换流式 parts 为最终 parts
      const finalParts = streamingParts.map((part) => {
        if (part.type === "tool") {
          return {
            id: part.id,
            type: part.type,
            tool: part.tool,
            state: part.state,
            collapsed: true, // tool 默认折叠
          }
        } else {
          return {
            id: part.id,
            type: part.type,
            text: part.text,
            textHtml: part.textHtml,
            collapsed: part.type === "reasoning", // reasoning 默认折叠，text 不折叠
          }
        }
      })

      const assistantMessage = {
        id: currentMessageId,
        role: "assistant",
        parts: finalParts,
        time: this.formatTime(Date.now()),
        showTime: this.shouldShowTime(lastMsg?.time, Date.now()),
      }

      this.setData({
        messages: [...this.data.messages, assistantMessage],
        streamingParts: [],
        currentMessageId: null,
        isStreaming: false,
        isSending: false,
      })
    } else {
      this.setData({
        isStreaming: false,
        isSending: false,
      })
    }

    if (this.data.sse) {
      this.data.sse.close()
      this.setData({ sse: null })
    }
  },

  stopStreaming() {
    this.setData({
      isStreaming: false,
      streamingParts: [],
      currentMessageId: null,
      isSending: false,
    })

    if (this.data.sse) {
      this.data.sse.close()
      this.setData({ sse: null })
    }
  },

  // 切换历史消息的 part 折叠状态
  togglePartCollapsed(e) {
    const msgIndex = e.currentTarget.dataset.msgIndex
    const partIndex = e.currentTarget.dataset.partIndex
    const messages = this.data.messages

    messages[msgIndex].parts[partIndex].collapsed = !messages[msgIndex].parts[partIndex].collapsed
    this.setData({ messages })
  },

  // 切换流式消息的 part 折叠状态
  toggleStreamingPartCollapsed(e) {
    const partIndex = e.currentTarget.dataset.partIndex
    const streamingParts = [...this.data.streamingParts]

    streamingParts[partIndex].collapsed = !streamingParts[partIndex].collapsed
    this.setData({ streamingParts })
  },

  scrollToBottom() {
    const { messages, isStreaming } = this.data
    const targetIndex = isStreaming ? messages.length : messages.length - 1

    if (targetIndex >= 0) {
      this.setData({
        scrollToView: `msg-${targetIndex}`,
        scrollTop: 999999,
      })
    }
  },

  goBack() {
    wx.navigateBack()
  },

  handleChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.uploadImage(tempFilePath)
      },
      fail: (err) => {
        console.error("Choose image failed:", err)
      },
    })
  },

  async uploadImage(filePath) {
    const { sessionId } = this.data

    wx.showLoading({ title: "上传中..." })

    try {
      const credentials = Storage.get(StorageKeys.CREDENTIALS, {})
      const serverUrl = credentials.serverUrl || ""

      const uploadRes = await wx.uploadFile({
        url: `${serverUrl}/api/upload`,
        filePath: filePath,
        name: "file",
        header: {
          Authorization: `Bearer ${credentials.token}`,
        },
      })

      const data = JSON.parse(uploadRes.data)

      if (data.url) {
        const imageMessage = {
          id: `user_${Date.now()}`,
          role: "user",
          parts: [
            {
              id: `part_${Date.now()}`,
              type: "text",
              text: "[图片]",
              textHtml: markdownToHtml("[图片]"),
              collapsed: false,
            },
          ],
          time: this.formatTime(Date.now()),
          showTime: this.shouldShowTime(this.data.messages[this.data.messages.length - 1]?.time, Date.now()),
          imageUrl: data.url,
        }

        this.setData({
          messages: [...this.data.messages, imageMessage],
          isSending: true,
        })

        this.scrollToBottom()

        await API.message.send(sessionId, {
          parts: [
            {
              type: "image",
              image: data.url,
            },
          ],
        })

        this.startEventStream(sessionId)
      }
    } catch (error) {
      console.error("Upload image error:", error)
      wx.showToast({
        title: "上传失败",
        icon: "none",
      })
      this.setData({ isSending: false })
    } finally {
      wx.hideLoading()
    }
  },
})
