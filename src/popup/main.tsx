import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/global.css'
import { ToastRegion } from '../ui/toast'
import { PopupApp } from './App'

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 容器')

createRoot(container).render(
  <StrictMode>
    <PopupApp />
    <ToastRegion />
  </StrictMode>,
)
