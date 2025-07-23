// src/components/OracleVault/OracleVaultPage.jsx

import React, { useContext, useState, useEffect } from 'react';
import { Box, Typography, Stack, useTheme, useMediaQuery } from '@mui/material';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { ethers } from 'ethers';

import { BlockchainContext } from '../../contexts/BlockchainContext';

import NeonButton from '../NeonButton';
import StakingCard from './StakingCard';
import EpochHistoryCard from './EpochHistoryCard';
import GlobalEpochHistoryCard from './GlobalEpochHistoryCard';
import AdminPanel from './AdminPanel';

// If your environment doesn't support top-level arrays in ABIs, put them inline or adapt accordingly
const rewardManagerABI = [
  'function getRewardEpochIdsWithClaimableRewards() external view returns (uint256, uint256)'
];

const OracleVaultPage = () => {
  const { account, oracleVaultContract, provider } = useContext(BlockchainContext);
  const location = useLocation();

  const [isOwner, setIsOwner] = useState(false);
  const [claimableEpochIds, setClaimableEpochIds] = useState([]);
  const [loadingClaimCheck, setLoadingClaimCheck] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    const checkOwner = async () => {
      if (!account || !oracleVaultContract) return;
      try {
        const ownerAddr = await oracleVaultContract.owner();
        setIsOwner(ownerAddr.toLowerCase() === account.toLowerCase());
      } catch (err) {
        console.error('Error checking owner:', err);
      }
    };
    checkOwner();
  }, [account, oracleVaultContract]);

  const checkClaimableEpochs = async () => {
    if (!oracleVaultContract || !provider) return;
    setLoadingClaimCheck(true);
    try {
      const rewardManagerAddress = await oracleVaultContract.rewardManager();
      const rmContract = new ethers.Contract(rewardManagerAddress, rewardManagerABI, provider);
      const [cStart, cEnd] = await rmContract.getRewardEpochIdsWithClaimableRewards();
      let found = [];

      if (cStart.lte(cEnd)) {
        const unclaimedData = await oracleVaultContract.getRewardManagerUnclaimedEpochsData(
          oracleVaultContract.address,
          cStart,
          cEnd
        );
        for (let i = 0; i < unclaimedData.length; i++) {
          if (unclaimedData[i].claimable) {
            found.push(unclaimedData[i].rewardEpochId.toString());
          }
        }
      }
      setClaimableEpochIds(found);
    } catch (err) {
      console.error('checkClaimableEpochs error:', err);
    }
    setLoadingClaimCheck(false);
  };

  useEffect(() => {
    if (oracleVaultContract) {
      checkClaimableEpochs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oracleVaultContract]);

  // -------------------------------------------------------------------------
  // New function to call autoAdvanceEpochPublic:
  // -------------------------------------------------------------------------
  const callClaimAllForUser = async () => {
    if (!oracleVaultContract) return;
    try {
      const tx = await oracleVaultContract.claimAllForUser();
      await tx.wait();
      checkClaimableEpochs();
      alert('Rewards claimed successfully!');
    } catch (err) {
      alert('Error: ' + err.message);
      console.error(err);
    }
  };

  // -------------------------------------------------------------------------
  // Updated button style: gold background, silver text, gold glow effect
  // -------------------------------------------------------------------------
  const advanceButtonStyle = {
    backgroundColor: '#FFD700',      // gold color
    color: '#C0C0C0',               // silver text
    boxShadow: '0 0 10px #FFD700, 0 0 20px #FFD700, 0 0 30px #FFD700',
    animation: 'pulseGold 1.5s infinite',
    '@keyframes pulseGold': {
      '0%': { boxShadow: '0 0 5px #FFD700' },
      '50%': { boxShadow: '0 0 20px #FFD700' },
      '100%': { boxShadow: '0 0 5px #FFD700' }
    }
  };

  return (
    <Box
      sx={{
        // Rely on the parent's horizontal padding from App.jsx
        // Just do a maxWidth or width: '100%' to limit content if desired:
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflowX: 'hidden'
      }}
    >
      {/* Sub-Navigation */}
      <Stack
        direction="row"
        spacing={2}
        mt={4}
        mb={2}
        justifyContent="center"
        alignItems="center"
        sx={{
          flexWrap: 'wrap'
        }}
      >
        {/* 
          Where the button is displayed:
          The button appears ONLY if `claimableEpochIds.length > 0`.
          That is our logic condition to show "Advance Epoch!" 
          if the contract can be synchronized.
        */}
        {claimableEpochIds.length > 0 && (
          <NeonButton
            onClick={callClaimAllForUser}
            disabled={loadingClaimCheck}
            sx={advanceButtonStyle}
          >
            Advance Epoch!
          </NeonButton>
        )}

        <Link to="/oraclevault/stake" style={{ textDecoration: 'none' }}>
          <NeonButton variant={location.pathname.includes('/stake') ? 'contained' : 'outlined'}>
            Stake
          </NeonButton>
        </Link>

        <Link to="/oraclevault/user" style={{ textDecoration: 'none' }}>
          <NeonButton variant={location.pathname.includes('/user') ? 'contained' : 'outlined'}>
            User
          </NeonButton>
        </Link>

        <Link to="/oraclevault/vault" style={{ textDecoration: 'none' }}>
          <NeonButton variant={location.pathname.includes('/vault') ? 'contained' : 'outlined'}>
            Vault
          </NeonButton>
        </Link>

        {isOwner && (
          <Link to="/oraclevault/admin" style={{ textDecoration: 'none' }}>
            <NeonButton variant={location.pathname.includes('/admin') ? 'contained' : 'outlined'}>
              Admin
            </NeonButton>
          </Link>
        )}
      </Stack>

      {/* Nested Routes */}
      <Routes>
        <Route index element={<Navigate to="stake" replace />} />

        <Route
          path="stake"
          element={
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 2
              }}
            >
              <StakingCard />
            </Box>
          }
        />

        <Route
          path="user"
          element={
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 2
              }}
            >
              <EpochHistoryCard />
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
                textAlign: 'center',
                gap: 2
              }}
            >
              <GlobalEpochHistoryCard />
            </Box>
          }
        />

        <Route
          path="admin"
          element={
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 2
              }}
            >
              {isOwner ? (
                <AdminPanel />
              ) : (
                <Typography variant="h6" sx={{ color: '#ff4444' }}>
                  You are not the contract owner.
                </Typography>
              )}
            </Box>
          }
        />
      </Routes>
    </Box>
  );
};

export default OracleVaultPage;
