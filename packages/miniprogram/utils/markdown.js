// utils/markdown.js

// 简单的 Markdown 转 HTML 函数
function markdownToHtml(markdown) {
  if (!markdown) return ""

  let html = markdown

  // 转义 HTML 特殊字符
  html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  // 代码块 ```code```
  html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")

  // 行内代码 `code`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>")

  // 粗体 **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")

  // 斜体 *text*
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>")

  // 标题 # ## ###
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>")
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>")
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>")

  // 链接 [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #fdffca;">$1</a>')

  // 无序列表 - item
  html = html.replace(/^\- (.*$)/gim, "<li>$1</li>")
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")

  // 有序列表 1. item
  html = html.replace(/^\d+\. (.*$)/gim, "<li>$1</li>")

  // 换行符转 <br>
  html = html.replace(/\n/g, "<br>")

  return html
}

module.exports = {
  markdownToHtml,
}
