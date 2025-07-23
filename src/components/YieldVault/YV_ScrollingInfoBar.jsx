// src/components/YieldVault/YV_ScrollingInfoBar.jsx
import React, { useContext, useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { BlockchainContext } from '../../contexts/BlockchainContext';
import { ethers } from 'ethers';

const YV_ScrollingInfoBar = () => {
  const { yieldVaultContract } = useContext(BlockchainContext);

  const [loading, setLoading] = useState(false);
  const [errorLoading, setErrorLoading] = useState(false);

  // Data fields
  const [currentEpochId, setCurrentEpochId] = useState('0');
  const [lastFinalizedEpochId, setLastFinalizedEpochId] = useState('0');
  const [totalActiveStake, setTotalActiveStake] = useState('0');
  const [minStakeAmount, setMinStakeAmount] = useState('0');

  useEffect(() => {
    const fetchData = async () => {
      if (!yieldVaultContract) return;
      setLoading(true);
      setErrorLoading(false);
      try {
        const gData = await yieldVaultContract.getGlobalVaultData();
        const gd = gData.globalData;
        setCurrentEpochId(gd.currentEpochId.toString());
        setLastFinalizedEpochId(gd.lastFinalizedEpochId.toString());
        setTotalActiveStake(ethers.utils.formatEther(gd.totalActiveStake));
        setMinStakeAmount(ethers.utils.formatEther(gd.minStakeAmount));
      } catch (err) {
        console.error('YieldVault scrolling bar error:', err);
        setErrorLoading(true);
      }
      setLoading(false);
    };
    fetchData();
  }, [yieldVaultContract]);

  const dataPoints = [
    { label: 'YV Current Epoch', value: currentEpochId },
    { label: 'YV Last Finalized', value: lastFinalizedEpochId },
    { label: 'YV Active Stake', value: parseFloat(totalActiveStake).toFixed(2) },
    { label: 'Min Stake', value: parseFloat(minStakeAmount).toFixed(2) }
  ];

  const tickerContent = dataPoints.map((dp, i) => (
    <React.Fragment key={i}>
      <Box component="span" sx={{ color: '#00bfff', fontWeight: 'bold', mr: 1 }}>
        {dp.label}:
      </Box>
      <Box component="span" sx={{ color: '#fff', mr: 6 }}>
        {dp.value}
      </Box>
    </React.Fragment>
  ));

  return (
    <Box sx={{ width: '100%', backgroundColor: '#1e1e1e', overflow: 'hidden', borderBottom: '1px solid #444' }}>
      <Box sx={{ height: 36, display: 'flex', alignItems: 'center', position: 'relative' }}>
        <Typography
          variant="body1"
          sx={{
            whiteSpace: 'nowrap',
            animation: 'scrolling-text 30s linear infinite'
          }}
        >
          {errorLoading
            ? 'Error loading YieldVault data...'
            : loading
            ? 'Loading yield vault data...'
            : tickerContent}
        </Typography>
      </Box>
    </Box>
  );
};

export default YV_ScrollingInfoBar;
