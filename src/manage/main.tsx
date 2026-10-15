import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/global.css'
import { ToastRegion } from '../ui/toast'
import { ManageApp } from './App'
import { StoreProvider } from './store'

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 容器')

createRoot(container).render(
  <StrictMode>
    <StoreProvider>
      <ManageApp />
      <ToastRegion />
    </StoreProvider>
  </StrictMode>,
)
