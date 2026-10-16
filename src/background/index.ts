import { handlers } from './handlers'
import type { RequestMap, RequestType } from '../shared/messages'

type UntypedHandler = (payload: never) => Promise<unknown>

const handlerMap = handlers as unknown as Record<string, UntypedHandler | undefined>

/** service worker 内部直调，避免自己给自己发消息 */
async function call<K extends RequestType>(
  type: K,
  payload: RequestMap[K]['req'],
): Promise<RequestMap[K]['res']> {
  const handler = handlerMap[type]
  if (typeof handler !== 'function') throw new Error(`未知请求：${type}`)
  return (await handler(payload as never)) as RequestMap[K]['res']
}

interface IncomingMessage {
  type?: string
  payload?: unknown
}

chrome.runtime.onMessage.addListener((message: IncomingMessage, _sender, sendResponse) => {
  const handler = message?.type ? handlerMap[message.type] : undefined
  if (typeof handler !== 'function') {
    sendResponse({ ok: false, error: `未知请求：${message?.type ?? '(空)'}` })
    return false
  }

  Promise.resolve(handler(message.payload as never))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error: unknown) => {
      console.error('[BookmarkBox] 处理失败：', message.type, error)
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
    })

  // 保持消息通道打开以便异步回复
  return true
})

export function openManagePage(): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL('manage.html') })
}

async function flashBadge(text: string, color: string): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color })
  await chrome.action.setBadgeText({ text })
  setTimeout(() => {
    void chrome.action.setBadgeText({ text: '' })
  }, 1600)
}

/** 极速保存：直接使用上次的标签组合 */
async function instantSave(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return

  const context = await call('page/context', { url: tab.url, title: tab.title ?? tab.url })
  if (context.lastTagIds.length === 0) {
    await flashBadge('!', '#f59e0b')
    try {
      await chrome.action.openPopup()
    } catch {
      /* 无可用标签时提示用户手动打开浮层 */
    }
    return
  }

  try {
    await call('bookmark/save', {
      url: tab.url,
      title: tab.title ?? tab.url,
      tagIds: context.lastTagIds,
      rememberTags: false,
    })
    await flashBadge('✓', '#22c55e')
  } catch (error) {
    console.error('[BookmarkBox] 极速保存失败：', error)
    await flashBadge('×', '#ef4444')
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === 'quick-save') {
      try {
        await chrome.action.openPopup()
      } catch {
        await instantSave()
      }
      return
    }
    if (command === 'instant-save') await instantSave()
  } catch (error) {
    console.error('[BookmarkBox] 快捷键处理失败：', command, error)
  }
})

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'bookmarkbox-open-manage',
      title: '打开 BookmarkBox 管理页',
      contexts: ['action'],
    })
  })
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('manage.html') })
  }
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'bookmarkbox-open-manage') openManagePage()
})
