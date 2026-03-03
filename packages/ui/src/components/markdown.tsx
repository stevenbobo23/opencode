import { useMarked } from "../context/marked"
import { useI18n } from "../context/i18n"
import DOMPurify from "dompurify"
import morphdom from "morphdom"
import { checksum } from "@opencode-ai/util/encode"
import { ComponentProps, createEffect, createResource, createSignal, onCleanup, splitProps } from "solid-js"
import { isServer } from "solid-js/web"

let mermaidReady: Promise<typeof import("mermaid")> | undefined
let mermaidCounter = 0

function getMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
        fontFamily: "var(--font-family-sans)",
      })
      return m
    })
  }
  return mermaidReady
}

type Entry = {
  hash: string
  html: string
}

const max = 200
const cache = new Map<string, Entry>()

if (typeof window !== "undefined" && DOMPurify.isSupported) {
  DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
    if (!(node instanceof HTMLAnchorElement)) return
    if (node.target !== "_blank") return

    const rel = node.getAttribute("rel") ?? ""
    const set = new Set(rel.split(/\s+/).filter(Boolean))
    set.add("noopener")
    set.add("noreferrer")
    node.setAttribute("rel", Array.from(set).join(" "))
  })
}

const config = {
  USE_PROFILES: { html: true, mathMl: true },
  ADD_ATTR: ["target"],
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
}

const iconPaths = {
  copy: '<path d="M6.2513 6.24935V2.91602H17.0846V13.7493H13.7513M13.7513 6.24935V17.0827H2.91797V6.24935H13.7513Z" stroke="currentColor" stroke-linecap="round"/>',
  check: '<path d="M5 11.9657L8.37838 14.7529L15 5.83398" stroke="currentColor" stroke-linecap="square"/>',
}

function sanitize(html: string) {
  if (!DOMPurify.isSupported) return ""
  return DOMPurify.sanitize(html, config)
}

type CopyLabels = {
  copy: string
  copied: string
}

const imageExtPattern = /\.(?:png|jpe?g|gif|webp|svg|bmp|ico|avif)(?:[?#].*)?$/i
const urlPattern = /^https?:\/\/[^\s<>()`"']+$/

function codeUrl(text: string) {
  const href = text.trim().replace(/[),.;!?]+$/, "")
  if (!urlPattern.test(href)) return
  try {
    const url = new URL(href)
    return url.toString()
  } catch {
    return
  }
}

function createIcon(path: string, slot: string) {
  const icon = document.createElement("div")
  icon.setAttribute("data-component", "icon")
  icon.setAttribute("data-size", "small")
  icon.setAttribute("data-slot", slot)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("data-slot", "icon-svg")
  svg.setAttribute("fill", "none")
  svg.setAttribute("viewBox", "0 0 20 20")
  svg.setAttribute("aria-hidden", "true")
  svg.innerHTML = path
  icon.appendChild(svg)
  return icon
}

function createCopyButton(labels: CopyLabels) {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("data-component", "icon-button")
  button.setAttribute("data-variant", "secondary")
  button.setAttribute("data-size", "small")
  button.setAttribute("data-slot", "markdown-copy-button")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("data-tooltip", labels.copy)
  button.appendChild(createIcon(iconPaths.copy, "copy-icon"))
  button.appendChild(createIcon(iconPaths.check, "check-icon"))
  return button
}

function setCopyState(button: HTMLButtonElement, labels: CopyLabels, copied: boolean) {
  if (copied) {
    button.setAttribute("data-copied", "true")
    button.setAttribute("aria-label", labels.copied)
    button.setAttribute("data-tooltip", labels.copied)
    return
  }
  button.removeAttribute("data-copied")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("data-tooltip", labels.copy)
}

function ensureCodeWrapper(block: HTMLPreElement, labels: CopyLabels) {
  const parent = block.parentElement
  if (!parent) return
  const wrapped = parent.getAttribute("data-component") === "markdown-code"
  if (!wrapped) {
    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-component", "markdown-code")
    parent.replaceChild(wrapper, block)
    wrapper.appendChild(block)
    wrapper.appendChild(createCopyButton(labels))
    return
  }

  const buttons = Array.from(parent.querySelectorAll('[data-slot="markdown-copy-button"]')).filter(
    (el): el is HTMLButtonElement => el instanceof HTMLButtonElement,
  )

  if (buttons.length === 0) {
    parent.appendChild(createCopyButton(labels))
    return
  }

  for (const button of buttons.slice(1)) {
    button.remove()
  }
}

function markCodeLinks(root: HTMLDivElement) {
  const codeNodes = Array.from(root.querySelectorAll(":not(pre) > code"))
  for (const code of codeNodes) {
    const href = codeUrl(code.textContent ?? "")
    const parentLink =
      code.parentElement instanceof HTMLAnchorElement && code.parentElement.classList.contains("external-link")
        ? code.parentElement
        : null

    if (!href) {
      if (parentLink) parentLink.replaceWith(code)
      continue
    }

    if (parentLink) {
      parentLink.href = href
      continue
    }

    const link = document.createElement("a")
    link.href = href
    link.className = "external-link"
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    code.parentNode?.replaceChild(link, code)
    link.appendChild(code)
  }
}

function isImageUrl(href: string) {
  try {
    const url = new URL(href)
    return imageExtPattern.test(url.pathname)
  } catch {
    return imageExtPattern.test(href)
  }
}

function setupImagePreview(root: HTMLDivElement) {
  let preview: HTMLDivElement | null = null
  let img: HTMLImageElement | null = null
  let current: HTMLAnchorElement | null = null
  let hideTimeout: ReturnType<typeof setTimeout> | undefined

  function show(anchor: HTMLAnchorElement) {
    if (current === anchor) return
    current = anchor

    if (!preview) {
      preview = document.createElement("div")
      preview.setAttribute("data-slot", "image-preview")
      img = document.createElement("img")
      img.style.cursor = "pointer"
      img.addEventListener("click", () => {
        if (img?.src) window.open(img.src, "_blank", "noopener,noreferrer")
      })
      preview.appendChild(img)
      document.body.appendChild(preview)

      preview.addEventListener("mouseenter", () => {
        if (hideTimeout) clearTimeout(hideTimeout)
      })
      preview.addEventListener("mouseleave", () => {
        hide()
      })
    }

    if (img) {
      img.src = anchor.href
      img.alt = anchor.textContent ?? ""
    }
    preview.style.display = "block"
    position(anchor)
  }

  function position(anchor: HTMLAnchorElement) {
    if (!preview) return
    const rect = anchor.getBoundingClientRect()
    const previewWidth = 320
    const previewMaxHeight = 240
    const gap = 8

    let top = rect.top - previewMaxHeight - gap
    if (top < 8) top = rect.bottom + gap

    let left = rect.left + rect.width / 2 - previewWidth / 2
    if (left < 8) left = 8
    if (left + previewWidth > window.innerWidth - 8) left = window.innerWidth - previewWidth - 8

    preview.style.top = `${top}px`
    preview.style.left = `${left}px`
  }

  function hide() {
    if (hideTimeout) clearTimeout(hideTimeout)
    hideTimeout = undefined
    current = null
    if (preview) preview.style.display = "none"
  }

  function handleMouseEnter(event: MouseEvent) {
    const target = event.target
    console.log(
      "[image-preview] mouseenter target:",
      target,
      "tagName:",
      target instanceof Element ? target.tagName : "N/A",
    )
    if (!(target instanceof Element)) return
    const anchor = target.closest("a.external-link")
    console.log(
      "[image-preview] closest anchor:",
      anchor,
      "href:",
      anchor instanceof HTMLAnchorElement ? anchor.href : "N/A",
    )
    if (!(anchor instanceof HTMLAnchorElement)) return
    const isImg = isImageUrl(anchor.href)
    console.log("[image-preview] isImageUrl:", isImg, "href:", anchor.href)
    if (!isImg) return
    if (hideTimeout) clearTimeout(hideTimeout)
    show(anchor)
  }

  function handleMouseLeave(event: MouseEvent) {
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest("a.external-link")
    if (!(anchor instanceof HTMLAnchorElement)) return
    if (!isImageUrl(anchor.href)) return
    hideTimeout = setTimeout(hide, 150)
  }

  console.log(
    "[image-preview] setupImagePreview called on root:",
    root,
    "links found:",
    root.querySelectorAll("a.external-link").length,
  )
  root.addEventListener("mouseenter", handleMouseEnter, true)
  root.addEventListener("mouseleave", handleMouseLeave, true)

  return () => {
    root.removeEventListener("mouseenter", handleMouseEnter, true)
    root.removeEventListener("mouseleave", handleMouseLeave, true)
    if (hideTimeout) clearTimeout(hideTimeout)
    if (preview) {
      preview.remove()
      preview = null
      img = null
    }
    current = null
  }
}

function isMermaidBlock(pre: HTMLPreElement) {
  const code = pre.querySelector("code")
  if (!code) return false
  if (code.className.includes("language-mermaid")) return true
  return false
}

function getMermaidSource(pre: HTMLPreElement) {
  const code = pre.querySelector("code")
  return code?.textContent?.trim() ?? ""
}

function setupMermaidButtons(root: HTMLDivElement) {
  const pres = Array.from(root.querySelectorAll("pre")).filter(isMermaidBlock)
  for (const pre of pres) {
    const wrapper = pre.closest('[data-component="markdown-code"]') ?? pre.parentElement
    if (!wrapper) continue
    if (wrapper.hasAttribute("data-mermaid")) continue

    wrapper.setAttribute("data-mermaid", "ready")
    wrapper.setAttribute("data-mermaid-view", "code")

    // toolbar
    const toolbar = document.createElement("div")
    toolbar.setAttribute("data-slot", "mermaid-toolbar")

    // segmented toggle
    const seg = document.createElement("div")
    seg.setAttribute("data-slot", "mermaid-seg")

    const btnCode = document.createElement("button")
    btnCode.type = "button"
    btnCode.textContent = "\u4ee3\u7801"
    btnCode.setAttribute("data-active", "")

    const btnDiagram = document.createElement("button")
    btnDiagram.type = "button"
    btnDiagram.textContent = "\u9884\u89c8\u56fe"

    seg.appendChild(btnCode)
    seg.appendChild(btnDiagram)

    // zoom controls (hidden until diagram view)
    const zoom = document.createElement("div")
    zoom.setAttribute("data-slot", "mermaid-zoom")

    let scale = 1
    let svg: SVGSVGElement | null = null
    let loading = false

    function apply() {
      if (!svg) return
      svg.style.transform = `scale(${scale})`
    }

    const minus = document.createElement("button")
    minus.type = "button"
    minus.textContent = "\u2212"
    minus.addEventListener("click", () => {
      scale = Math.max(0.25, scale - 0.15)
      apply()
    })

    const reset = document.createElement("button")
    reset.type = "button"
    reset.textContent = "1:1"
    reset.addEventListener("click", () => {
      scale = 1
      apply()
    })

    const plus = document.createElement("button")
    plus.type = "button"
    plus.textContent = "+"
    plus.addEventListener("click", () => {
      scale = Math.min(3, scale + 0.15)
      apply()
    })

    zoom.appendChild(minus)
    zoom.appendChild(reset)
    zoom.appendChild(plus)

    toolbar.appendChild(seg)
    toolbar.appendChild(zoom)
    wrapper.insertBefore(toolbar, wrapper.firstChild)

    function setView(view: "code" | "diagram") {
      wrapper!.setAttribute("data-mermaid-view", view)
      if (view === "code") {
        btnCode.setAttribute("data-active", "")
        btnDiagram.removeAttribute("data-active")
      } else {
        btnDiagram.setAttribute("data-active", "")
        btnCode.removeAttribute("data-active")
      }
    }

    btnCode.addEventListener("click", () => {
      if (loading) return
      setView("code")
    })

    btnDiagram.addEventListener("click", async () => {
      if (loading) return
      let diagram = wrapper.querySelector('[data-slot="mermaid-diagram"]') as HTMLDivElement | null
      if (!diagram) {
        const source = getMermaidSource(pre)
        if (!source) return
        loading = true
        btnDiagram.textContent = "\u52a0\u8f7d\u4e2d..."
        try {
          const mermaid = await getMermaid()
          const id = `mermaid-${++mermaidCounter}`
          const result = await mermaid.default.render(id, source)
          diagram = document.createElement("div")
          diagram.setAttribute("data-slot", "mermaid-diagram")
          diagram.innerHTML = result.svg
          svg = diagram.querySelector("svg")
          if (svg) {
            svg.style.transformOrigin = "center top"
            svg.style.transition = "transform 0.15s ease"
          }
          wrapper.insertBefore(diagram, pre)
        } catch {
          btnDiagram.textContent = "\u9884\u89c8\u56fe"
          loading = false
          return
        }
        btnDiagram.textContent = "\u9884\u89c8\u56fe"
        loading = false
      }

      setView("diagram")
    })

    // Ctrl/Cmd + wheel zoom
    ;(wrapper as HTMLElement).addEventListener(
      "wheel",
      (e: WheelEvent) => {
        if (wrapper.getAttribute("data-mermaid-view") !== "diagram") return
        if (!e.ctrlKey && !e.metaKey) return
        e.preventDefault()
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        scale = Math.max(0.25, Math.min(3, scale + delta))
        apply()
      },
      { passive: false },
    )
  }
}

function decorate(root: HTMLDivElement, labels: CopyLabels) {
  const blocks = Array.from(root.querySelectorAll("pre"))
  for (const block of blocks) {
    ensureCodeWrapper(block, labels)
  }
  markCodeLinks(root)
}

function setupCodeCopy(root: HTMLDivElement, labels: CopyLabels) {
  const timeouts = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>()

  const updateLabel = (button: HTMLButtonElement) => {
    const copied = button.getAttribute("data-copied") === "true"
    setCopyState(button, labels, copied)
  }

  const handleClick = async (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const button = target.closest('[data-slot="markdown-copy-button"]')
    if (!(button instanceof HTMLButtonElement)) return
    const code = button.closest('[data-component="markdown-code"]')?.querySelector("code")
    const content = code?.textContent ?? ""
    if (!content) return
    const clipboard = navigator?.clipboard
    if (!clipboard) return
    await clipboard.writeText(content)
    setCopyState(button, labels, true)
    const existing = timeouts.get(button)
    if (existing) clearTimeout(existing)
    const timeout = setTimeout(() => setCopyState(button, labels, false), 2000)
    timeouts.set(button, timeout)
  }

  decorate(root, labels)

  const buttons = Array.from(root.querySelectorAll('[data-slot="markdown-copy-button"]'))
  for (const button of buttons) {
    if (button instanceof HTMLButtonElement) updateLabel(button)
  }

  root.addEventListener("click", handleClick)

  return () => {
    root.removeEventListener("click", handleClick)
    for (const timeout of timeouts.values()) {
      clearTimeout(timeout)
    }
  }
}

function touch(key: string, value: Entry) {
  cache.delete(key)
  cache.set(key, value)

  if (cache.size <= max) return

  const first = cache.keys().next().value
  if (!first) return
  cache.delete(first)
}

export function Markdown(
  props: ComponentProps<"div"> & {
    text: string
    cacheKey?: string
    class?: string
    classList?: Record<string, boolean>
  },
) {
  const [local, others] = splitProps(props, ["text", "cacheKey", "class", "classList"])
  const marked = useMarked()
  const i18n = useI18n()
  const [root, setRoot] = createSignal<HTMLDivElement>()
  const [html] = createResource(
    () => local.text,
    async (markdown) => {
      if (isServer) return ""

      const hash = checksum(markdown)
      const key = local.cacheKey ?? hash

      if (key && hash) {
        const cached = cache.get(key)
        if (cached && cached.hash === hash) {
          touch(key, cached)
          return cached.html
        }
      }

      const next = await marked.parse(markdown)
      const safe = sanitize(next)
      if (key && hash) touch(key, { hash, html: safe })
      return safe
    },
    { initialValue: "" },
  )

  let copySetupTimer: ReturnType<typeof setTimeout> | undefined
  let copyCleanup: (() => void) | undefined
  let imagePreviewCleanup: (() => void) | undefined
  let mermaidTimer: ReturnType<typeof setTimeout> | undefined

  createEffect(() => {
    const container = root()
    const content = html()
    if (!container) return
    if (isServer) return

    if (!content) {
      container.innerHTML = ""
      return
    }

    const temp = document.createElement("div")
    temp.innerHTML = content
    decorate(temp, {
      copy: i18n.t("ui.message.copy"),
      copied: i18n.t("ui.message.copied"),
    })

    morphdom(container, temp, {
      childrenOnly: true,
      onBeforeElUpdated: (fromEl, toEl) => {
        if (fromEl instanceof HTMLElement && fromEl.hasAttribute("data-mermaid")) return false
        if (fromEl.isEqualNode(toEl)) return false
        return true
      },
    })

    if (copySetupTimer) clearTimeout(copySetupTimer)
    copySetupTimer = setTimeout(() => {
      if (copyCleanup) copyCleanup()
      copyCleanup = setupCodeCopy(container, {
        copy: i18n.t("ui.message.copy"),
        copied: i18n.t("ui.message.copied"),
      })
    }, 150)

    if (mermaidTimer) clearTimeout(mermaidTimer)
    mermaidTimer = setTimeout(() => setupMermaidButtons(container), 800)

    if (!imagePreviewCleanup) {
      imagePreviewCleanup = setupImagePreview(container)
    }
  })

  onCleanup(() => {
    if (copySetupTimer) clearTimeout(copySetupTimer)
    if (copyCleanup) copyCleanup()
    if (mermaidTimer) clearTimeout(mermaidTimer)
    if (imagePreviewCleanup) imagePreviewCleanup()
  })

  return (
    <div
      data-component="markdown"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
      ref={setRoot}
      {...others}
    />
  )
}
