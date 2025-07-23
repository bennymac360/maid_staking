// src/App.jsx
import React, { useState, useEffect } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Box, CircularProgress } from '@mui/material';
import GlobalStyles from '@mui/material/GlobalStyles';
import '@fontsource/montserrat';
import '@fontsource/montserrat/300.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/700.css';

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import BlockchainProvider from './contexts/BlockchainContext';
import Navbar from './components/Navbar';
import SocialFooter from './components/SocialFooter';

import NFTStakingPage from './components/NFTStaking/NFTStakingPage';

const theme = createTheme({
  typography: {
    fontFamily: 'Montserrat, sans-serif'
  },
  palette: {
    background: { default: '#121212' },
    text: { primary: '#ffffff' }
  }
});

function AppLayout() {
  return (
    <Routes>
      <Route index element={<Navigate to="nftstaking" replace />} />
      <Route path="nftstaking/*" element={<NFTStakingPage />} />
      <Route path="*" element={<Navigate to="nftstaking" replace />} />
    </Routes>
  );
}

function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [pageLoaded, setPageLoaded] = useState(false);

  useEffect(() => {
    if (document?.fonts?.ready) {
      document.fonts.ready.then(() => setFontsLoaded(true));
    } else {
      setFontsLoaded(true);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setPageLoaded(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  if (!fontsLoaded || !pageLoaded) {
    return (
      <Box
        sx={{
          width: '100vw',
          height: '100vh',
          backgroundColor: '#121212',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: '#00bfff'
        }}
      >
        <CircularProgress sx={{ color: '#00bfff' }} size={44} />
      </Box>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles
        styles={`
          @keyframes pulse {
            0% { box-shadow: 0 0 10px rgba(0, 191, 255, 0.6); }
            50% { box-shadow: 0 0 30px rgba(0, 191, 255, 1); }
            100% { box-shadow: 0 0 10px rgba(0, 191, 255, 0.6); }
          }
          @keyframes scrolling-text {
            0% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
        `}
      />
      <Router>
        <BlockchainProvider>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: '100vh',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat',
              backgroundAttachment: { xs: 'scroll', md: 'fixed' },
              backgroundPosition: 'center',
              color: '#fff',
              overflowX: 'hidden',
            }}
          >
            <Navbar />
            <Box sx={{ flex: 1, px: { xs: 1, md: 2 } }}>
              <AppLayout />
            </Box>
            <SocialFooter />
          </Box>
        </BlockchainProvider>
      </Router>
    </ThemeProvider>
  );
}

export default App;
