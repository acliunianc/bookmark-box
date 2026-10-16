import { defineManifest } from '@crxjs/vite-plugin'

const VERSION = '0.1.0'

export default defineManifest({
  manifest_version: 3,
  name: 'BookmarkBox',
  version: VERSION,
  description: '标签式书签管理：3 秒收藏、标签组合检索、文件树批量打标签',
  icons: {
    16: 'icon-16.png',
    32: 'icon-32.png',
    48: 'icon-48.png',
    128: 'icon-128.png',
  },
  action: {
    default_popup: 'index.html',
    default_title: 'BookmarkBox · 收藏当前页',
    default_icon: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: ['bookmarks', 'tabs', 'activeTab', 'storage', 'favicon', 'unlimitedStorage', 'contextMenus'],
  optional_permissions: ['downloads'],
  commands: {
    'quick-save': {
      suggested_key: { default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' },
      description: '收藏当前页（打开快速收藏浮层）',
    },
    'instant-save': {
      description: '以上次使用的标签组合极速保存当前页（需在 chrome://extensions/shortcuts 自行绑定按键）',
    },
  },
})
