/**
 * 仅在本地预览页使用：非扩展环境下没有 chrome.* API，
 * 这里给 faviconUrl 等用到 chrome.runtime.id 的地方补一个桩。
 */
;(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: { id: 'tagmark-preview' },
}
