// src/components/YieldVault/YieldVaultPage.jsx
import React, { useContext, useState, useEffect, useMemo } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useTheme, useMediaQuery } from '@mui/material';

import { BlockchainContext } from '../../contexts/BlockchainContext';
import NeonButton from '../NeonButton';

import YV_StakingCard from './YV_StakingCard';
import YV_EpochHistoryCard from './YV_EpochHistoryCard';
import YV_GlobalEpochHistory from './YV_GlobalEpochHistory';
import YV_StatusBanner from './YV_StatusBanner';
import YV_AdminPanel from './YV_AdminPanel';

const YieldVaultPage = ({ version = 'v1' }) => {
  const {
    account,
    yieldVaultContract,   // V1
    yieldVaultV2Contract  // V2
  } = useContext(BlockchainContext);

  const location = useLocation();
  const [isOwner, setIsOwner] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Dynamically choose the vault contract based on version
  const vault = useMemo(
    () => (version === 'v2' ? yieldVaultV2Contract : yieldVaultContract),
    [version, yieldVaultContract, yieldVaultV2Contract]
  );

  useEffect(() => {
    const checkOwner = async () => {
      if (!account || !vault) return;
      try {
        const ownerAddr = await vault.owner();
        setIsOwner(ownerAddr.toLowerCase() === account.toLowerCase());
      } catch (err) {
        console.error('Error checking Yield Vault owner:', err);
      }
    };
    checkOwner();
  }, [account, vault]);

  return (
    <Box
      sx={{
        alignItems: 'flex-start',
        width: '100%',
        overflowX: 'hidden',
        maxWidth: isMobile ? '350px' : '100%',
        margin: '0 auto',
        display: 'auto',
        flexDirection: 'column',
        px: { xs: 1, md: 2 },
      }}
    >
      {/* Sub-Navigation */}
      <Stack
        direction={isMobile ? 'row' : 'row'}
        spacing={{ xs: 1, sm: 2 }}
        mt={{ xs: 2, sm: 4 }}
        mb={{ xs: 1, sm: 2 }}
        justifyContent="center"
        alignItems="center"
        sx={{
          mr: { xs: 0, sm: 2 },
          ml: { xs: 0, sm: 2 },
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
        }}
      >
        <Link
          to={`/${version === 'v2' ? 'yieldvaultv2' : 'yieldvault'}/stake`}
          style={{ textDecoration: 'none' }}
        >
          <NeonButton
            variant={location.pathname.includes('/stake') ? 'contained' : 'outlined'}
            sx={{ width: isMobile ? '100%' : 'auto' }}
          >
            Stake
          </NeonButton>
        </Link>

        <Link
          to={`/${version === 'v2' ? 'yieldvaultv2' : 'yieldvault'}/user`}
          style={{ textDecoration: 'none' }}
        >
          <NeonButton
            variant={location.pathname.includes('/user') ? 'contained' : 'outlined'}
            sx={{ width: isMobile ? '100%' : 'auto' }}
          >
            User
          </NeonButton>
        </Link>

        <Link
          to={`/${version === 'v2' ? 'yieldvaultv2' : 'yieldvault'}/vault`}
          style={{ textDecoration: 'none' }}
        >
          <NeonButton
            variant={location.pathname.includes('/vault') ? 'contained' : 'outlined'}
            sx={{ width: isMobile ? '100%' : 'auto' }}
          >
            Vault
          </NeonButton>
        </Link>

        {isOwner && (
          <Link
            to={`/${version === 'v2' ? 'yieldvaultv2' : 'yieldvault'}/admin`}
            style={{ textDecoration: 'none' }}
          >
            <NeonButton
              variant={location.pathname.includes('/admin') ? 'contained' : 'outlined'}
              sx={{ width: isMobile ? '100%' : 'auto' }}
            >
              Admin
            </NeonButton>
          </Link>
        )}
      </Stack>

      {/* Nested Routes */}
      <Box sx={{ width: '100%', overflowX: 'hidden' }}>
        <Routes>
          {/* redirect /yieldvault -> /yieldvault/stake (or /yieldvaultv2 -> /yieldvaultv2/stake) */}
          <Route index element={<Navigate to="stake" replace />} />

          <Route
            path="stake"
            element={<YV_StakingCard vault={vault} version={version} />}
          />

          <Route
            path="user"
            element={
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  width: '100%',
                  overflowX: 'auto',
                }}
              >
                <YV_EpochHistoryCard vault={vault} version={version} />
              </Box>
            }
          />

          <Route
            path="vault"
            element={
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  width: '100%',
                  overflowX: 'auto',
                }}
              >
                <YV_StatusBanner vault={vault} version={version} />
                <YV_GlobalEpochHistory vault={vault} version={version} />
              </Box>
            }
          />

          <Route
            path="admin"
            element={
              isOwner ? (
                <YV_AdminPanel vault={vault} version={version} />
              ) : (
                <Typography variant="h6" sx={{ color: '#ff4444' }}>
                  You are not the Yield Vault owner.
                </Typography>
              )
            }
          />
        </Routes>
      </Box>
    </Box>
  );
};

export default YieldVaultPage;
