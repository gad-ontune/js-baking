import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { StoreProvider } from './lib/store'
import { NotificationProvider } from './lib/notificationCenter'
import { registerServiceWorker } from './lib/deviceNotifications'
import { ToastHost } from './components/ui'
import './index.css'

registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <NotificationProvider>
          <App />
          <ToastHost />
        </NotificationProvider>
      </StoreProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
