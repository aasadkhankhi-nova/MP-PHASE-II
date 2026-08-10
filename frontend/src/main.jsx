/**
 * main.jsx — Entry point. Mounts the React app into <div id="root">
 * (see index.html) and loads the global stylesheet.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { captureOAuthSession } from './api.js'
import './styles.css'

// If the user is coming back from a Google login, the URL contains a
// login token (#access_token=...). Save it BEFORE the app renders so
// the app starts already logged in, then the URL is cleaned up.
captureOAuthSession()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
