import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:                  1000 * 10,   // data considered fresh for 10 s
      refetchInterval:            1000 * 15,   // background poll every 15 s
      refetchIntervalInBackground: false,       // pause polling when tab isn't focused
      refetchOnWindowFocus:       true,         // immediate re-fetch when you re-focus the tab
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <App />
          <Toaster position="top-right" toastOptions={{
            style: { background: '#1e293b', color: '#f1f5f9', borderRadius: '8px', border: '1px solid rgba(51,65,85,0.8)' },
            success: { iconTheme: { primary: '#4f46e5', secondary: '#fff' } },
          }} />
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
