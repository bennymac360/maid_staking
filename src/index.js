// src/index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import BlockchainProvider from './contexts/BlockchainContext'; // Updated Import
import './index.css'; // Import global styles
import "@fontsource/montserrat";
import "@fontsource/montserrat/300.css";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/700.css";

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <BlockchainProvider>
      <App />
    </BlockchainProvider>
  </React.StrictMode>
);
