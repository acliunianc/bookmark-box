import './chrome-popup-stub'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PopupApp } from '../src/popup/App'
import { ToastRegion } from '../src/ui/toast'
import '../src/styles/global.css'

createRoot(document.getElementById('popup-root')!).render(
  <StrictMode>
    <PopupApp />
    <ToastRegion />
  </StrictMode>,
)
