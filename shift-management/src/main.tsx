import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Trước khi mount: sự kiện mời cài app có thể đến rất sớm.
import './pwa/install'
import { startServiceWorker } from './pwa/serviceWorker'
import App from './App.tsx'

startServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
