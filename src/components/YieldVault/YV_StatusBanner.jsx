// src/components/YieldVault/YV_StatusBanner.jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Snackbar,
  Alert
} from '@mui/material';
import { useTheme, useMediaQuery } from '@mui/material';
import { ethers } from 'ethers';
import NeonButton from '../NeonButton';

const STATS_PER_PAGE = 4;

/**
 * Props
 * ► vault – connected YieldVault contract instance (v1 / v2)
 */
const YV_StatusBanner = ({ vault }) => {
  // ──────────────────────────────────────────
  // 1) Declare all hooks at the top, unconditionally
  // ──────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [errorLoading, setErrorLoading] = useState(false);

  const [currentEpochId, setCurrentEpochId] = useState('0');
  const [lastFinalizedEpochId, setLastFinalizedEpochId] = useState('0');
  const [totalActiveStake, setTotalActiveStake] = useState('0');
  const [minStakeAmount, setMinStakeAmount] = useState('0');
  const [prunedUpToEpoch, setPrunedUpToEpoch] = useState('0');

  // Pagination states for desktop
  const [currentPage, setCurrentPage] = useState(1);

  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const handleCloseSnackbar = () => setSnackbar((prev) => ({ ...prev, open: false }));
  const showMessage = (msg, severity = 'info') =>
    setSnackbar({ open: true, message: msg, severity });

  // Detect mobile
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // ──────────────────────────────────────────
  // 2) Now we can safely do the effect
  // ──────────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      if (!vault) return;
      setLoading(true);
      setErrorLoading(false);

      try {
        // getGlobalVaultData returns [vaultData, tokenData]
        const [vaultData /*, tokenData*/] = await vault.getGlobalVaultData();

        setCurrentEpochId(vaultData.currentEpochId.toString());
        setLastFinalizedEpochId(vaultData.lastFinalizedEpochId.toString());
        setTotalActiveStake(ethers.utils.formatEther(vaultData.totalActiveStake));
        setMinStakeAmount(ethers.utils.formatEther(vaultData.minStakeAmount));
        setPrunedUpToEpoch(vaultData.prunedUpToEpoch.toString());
      } catch (err) {
        console.error('YieldVault getGlobalVaultData error:', err);
        showMessage(`Could not load yield vault data: ${err.message}`, 'error');
        setErrorLoading(true);
      }
      setLoading(false);
    };
    fetchData();
  }, [vault]);

  // ──────────────────────────────────────────
  // 3) Guard clause after hooks
  // ──────────────────────────────────────────
  if (!vault) {
    return null;
  }

  // Prepare the stats array
  const allStats = [
    { label: 'Current Ep.', value: currentEpochId },
    { label: 'Last Finalized', value: lastFinalizedEpochId },
    {
      label: 'Tot. Staked',
      value: parseFloat(totalActiveStake).toLocaleString()
    },
    {
      label: 'Min Stake',
      value: parseFloat(minStakeAmount).toFixed(2)
    },
    { label: 'Pruned Up To', value: prunedUpToEpoch }
  ];

  // Desktop pagination logic
  const totalPages = Math.ceil(allStats.length / STATS_PER_PAGE);
  const indexOfLast = currentPage * STATS_PER_PAGE;
  const indexOfFirst = indexOfLast - STATS_PER_PAGE;
  const currentStats = allStats.slice(indexOfFirst, indexOfLast);

  // ---------------------------
  // MOBILE LAYOUT
  // ---------------------------
  const MobileLayout = () => (
    <Card
      sx={{
        backgroundColor: '#1e1e1e',
        width: '95%',
        margin: '20px auto',
        borderRadius: '15px',
        boxShadow: '0 0 20px 5px rgba(0, 191, 255, 0.6)',
        mb: 2,
        p: 1
      }}
    >
      <CardContent>
        <Typography variant="h6" sx={{ color: '#00bfff', textAlign: 'center', mb: 2 }}>
          Vault Status
        </Typography>

        {loading ? (
          <Box display="flex" justifyContent="center">
            <CircularProgress sx={{ color: '#00bfff' }} />
          </Box>
        ) : errorLoading ? (
          <Typography color="error" textAlign="center">
            Failed to load yield vault data.
          </Typography>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 1
            }}
          >
            {allStats.map((stat, idx) => (
              <Box
                key={idx}
                sx={{
                  backgroundColor: '#2a2a2a',
                  borderRadius: '8px',
                  p: 1,
                  textAlign: 'center',
                  boxShadow: 'inset 0 0 3px rgba(0, 191, 255, 0.3)'
                }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{ color: '#00bfff', fontWeight: 'bold', fontSize: '0.85rem' }}
                >
                  {stat.label}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: '#fff', fontSize: '0.85rem', mt: 0.5 }}
                >
                  {stat.value}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );

  // ---------------------------
  // DESKTOP LAYOUT
  // ---------------------------
  const DesktopLayout = () => (
    <Card
      sx={{
        backgroundColor: '#1e1e1e',
        maxWidth: 800,
        width: '90%',
        margin: '20px auto',
        borderRadius: '15px',
        boxShadow: '0 0 20px 5px rgba(0, 191, 255, 0.6)',
        mb: { xs: 2, md: 4 }
      }}
    >
      <CardContent>
        <Typography variant="h5" sx={{ color: '#00bfff', textAlign: 'center', mb: 3 }}>
          Vault Status
        </Typography>

        {loading ? (
          <Box display="flex" justifyContent="center">
            <CircularProgress sx={{ color: '#00bfff' }} />
          </Box>
        ) : errorLoading ? (
          <Typography color="error" textAlign="center">
            Failed to load yield vault data.
          </Typography>
        ) : (
          <Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 2
              }}
            >
              {currentStats.map((stat, idx) => (
                <Box
                  key={idx}
                  sx={{
                    backgroundColor: '#2a2a2a',
                    borderRadius: '8px',
                    p: 2,
                    textAlign: 'center',
                    boxShadow: 'inset 0 0 5px rgba(0, 191, 255, 0.3)'
                  }}
                >
                  <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
                    {stat.label}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#fff' }}>
                    {stat.value}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* pagination controls */}
            <Box display="flex" justifyContent="center" alignItems="center" mt={3}>
              <NeonButton
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                sx={{ mr: 2 }}
              >
                Prev
              </NeonButton>
              <NeonButton
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Next
              </NeonButton>
            </Box>
            <Typography textAlign="center" color="#fff" mt={1}>
              Page {currentPage} of {totalPages}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      {isMobile ? <MobileLayout /> : <DesktopLayout />}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert variant="filled" severity={snackbar.severity} onClose={handleCloseSnackbar}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default YV_StatusBanner;
