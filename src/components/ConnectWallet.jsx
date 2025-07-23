import React, { useContext, useState, useEffect } from 'react';
import { BlockchainContext } from '../contexts/BlockchainContext';
import { Button, Box, Typography, Tooltip, Snackbar, Alert, IconButton } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

const ConnectWallet = () => {
  const {
    account,
    connectWallet,
    disconnectWallet,
    error,
  } = useContext(BlockchainContext);

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info',
  });

  // Track if the screen is small (< 1000px wide)
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 1000);

  useEffect(() => {
    const handleResize = () => setIsSmallScreen(window.innerWidth < 1000);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // If there's an error from context, show it in a red snackbar
  useEffect(() => {
    if (error) {
      setSnackbar({
        open: true,
        message: error,
        severity: 'error',
      });
    }
  }, [error]);

  const copyAddress = () => {
    if (account) {
      navigator.clipboard.writeText(account);
      setSnackbar({
        open: true,
        message: 'Address copied to clipboard!',
        severity: 'success',
      });
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  if (!account) {
    // Not connected, show "Connect Wallet"
    return (
      <Box display="flex" flexDirection="column" alignItems="center" gap={1}>
        <Tooltip title="If Phantom is also installed, disable it or use another browser profile to avoid conflicts.">
          <Button variant="contained" onClick={connectWallet}>
            Connect Wallet
          </Button>
        </Tooltip>

        <Snackbar
          open={snackbar.open}
          autoHideDuration={3000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity={snackbar.severity} variant="filled" onClose={handleCloseSnackbar}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    );
  }

  // If connected but screen is small, hide icon/address
  if (isSmallScreen) {
    return (
      <Box display="flex" flexDirection="column" alignItems="flex-start" gap={1}>
        {/* You could display a minimal text or button here, or nothing at all. */}
        {/* Example: */}
        <Typography variant="subtitle1">Wallet Connected</Typography>

        <Snackbar
          open={snackbar.open}
          autoHideDuration={3000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity={snackbar.severity} variant="filled" onClose={handleCloseSnackbar}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    );
  }

  // If connected and screen is wide, show address + copy icon
  return (
    <Box display="flex" flexDirection="column" alignItems="flex-start" gap={1}>
      <Box display="flex" alignItems="center" gap={1}>
        <Tooltip title="Click to copy address">
          <Box
            sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
            onClick={copyAddress}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              {account.slice(0, 6)}...{account.slice(-4)}
            </Typography>
            <IconButton size="small">
              <ContentCopyIcon fontSize="inherit" />
            </IconButton>
          </Box>
        </Tooltip>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} variant="filled" onClose={handleCloseSnackbar}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ConnectWallet;
