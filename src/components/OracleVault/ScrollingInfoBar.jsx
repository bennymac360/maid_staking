import React, { useContext, useEffect, useState } from 'react';
import { BlockchainContext } from '../../contexts/BlockchainContext';
import { ethers } from 'ethers';
import { Box, Typography } from '@mui/material';

/**
 * This component fetches similar data as 'StatusBanner'
 * and displays it in a horizontally scrolling ticker bar.
 */

const ScrollingInfoBar = () => {
  const { oracleVaultContract, provider } = useContext(BlockchainContext);

  const [loading, setLoading] = useState(false);
  const [errorLoading, setErrorLoading] = useState(false);

  // Data fields from getGlobalVaultData (specifically from vaultData)
  const [currentEpochId, setCurrentEpochId] = useState('0');
  const [lastFinalizedEpochId, setLastFinalizedEpochId] = useState('0');
  const [totalActiveStake, setTotalActiveStake] = useState('0');
  const [totalFotonStaked, setTotalFotonStaked] = useState('0');
  const [totalDelegationRewards, setTotalDelegationRewards] = useState('0');
  const [wnatBalanceInVault, setWnatBalanceInVault] = useState('0');

  // "Current Flare Epoch" from managerCurrentEpoch (in vaultData)
  const [currentFlareEpoch, setCurrentFlareEpoch] = useState('0');

  // Summaries for unclaimed data
  const [vaultUnclaimed, setVaultUnclaimed] = useState('0');
  const [claimableEpochsList, setClaimableEpochsList] = useState('');

  // Additional: pendingStakersCount in vaultData
  const [pendingStakersCount, setPendingStakersCount] = useState('0');

  // Vault "status" for quick read
  const [vaultStatus, setVaultStatus] = useState('Unknown');

  // Minimal reward manager ABI with corrected return types (uint24):
  const rewardManagerAbi = [
    'function getRewardEpochIdsWithClaimableRewards() external view returns (uint24, uint24)'
  ];

  // ------------------------------------------------
  //  Fetch main vault data
  // ------------------------------------------------
  const fetchVaultStatus = async () => {
    if (!oracleVaultContract) return;
    setLoading(true);
    setErrorLoading(false);

    try {
      // getGlobalVaultData => destructure vaultData from the returned object
      const gData = await oracleVaultContract.getGlobalVaultData();
      const { vaultData } = gData;

      setCurrentEpochId(vaultData.currentEpochId.toString());
      setLastFinalizedEpochId(vaultData.lastFinalizedEpochId.toString());
      setTotalActiveStake(ethers.utils.formatEther(vaultData.totalActiveStake));
      setTotalDelegationRewards(ethers.utils.formatEther(vaultData.totalDelegationRewards));
      setWnatBalanceInVault(ethers.utils.formatEther(vaultData.wnatBalanceInVault));
      setCurrentFlareEpoch(vaultData.managerCurrentEpoch.toString());
      setPendingStakersCount(vaultData.pendingStakersCount.toString());

    } catch (err) {
      console.error('Error calling getGlobalVaultData:', err);
      setErrorLoading(true);
    }

    setLoading(false);
  };

  // ------------------------------------------------
  //  Fetch manager claimable range + unclaimed
  // ------------------------------------------------
  const fetchClaimableRangeAndUnclaimed = async () => {
    if (!oracleVaultContract || !provider) return;
    try {
      const rewardManagerAddress = await oracleVaultContract.rewardManager();
      const rmContract = new ethers.Contract(rewardManagerAddress, rewardManagerAbi, provider);
      const [start, end] = await rmContract.getRewardEpochIdsWithClaimableRewards();

      if (start <= end) {
        const unclaimedEpochsData = await oracleVaultContract.getRewardManagerUnclaimedEpochsData(
          oracleVaultContract.address,
          start,
          end
        );
        let totalUnclaimedForVault = ethers.BigNumber.from(0);
        let epochIds = [];

        for (let i = 0; i < unclaimedEpochsData.length; i++) {
          const entry = unclaimedEpochsData[i];
          if (entry.claimable) {
            totalUnclaimedForVault = totalUnclaimedForVault.add(entry.totalUnclaimed);
            epochIds.push(entry.rewardEpochId.toString());
          }
        }

        setVaultUnclaimed(ethers.utils.formatEther(totalUnclaimedForVault));
        setClaimableEpochsList(epochIds.join(', '));
      } else {
        setVaultUnclaimed('0');
        setClaimableEpochsList('(none)');
      }
    } catch (err) {
      console.error('Error fetching manager claimable/unclaimed data:', err);
    }
  };

  // ------------------------------------------------
  //  Compute "Vault State"
  // ------------------------------------------------
  const computeVaultState = () => {
    const cfe = parseInt(currentFlareEpoch, 10);
    const ce = parseInt(currentEpochId, 10);
    const lfe = parseInt(lastFinalizedEpochId, 10);

    let newStatus = 'Unknown';
    if (!isNaN(cfe) && !isNaN(ce) && !isNaN(lfe)) {
      if (cfe > ce) {
        newStatus = 'Advance Local Epoch';
      } else if (cfe === ce && lfe === ce - 1) {
        newStatus = 'Synced';
      } else if (cfe === ce && lfe < ce - 1) {
        newStatus = 'Awaiting finalisation';
      }
    }
    setVaultStatus(newStatus);
  };

  // ------------------------------------------------
  //  Lifecycle
  // ------------------------------------------------
  useEffect(() => {
    if (oracleVaultContract) {
      fetchVaultStatus();
      fetchClaimableRangeAndUnclaimed();
    }
  }, [oracleVaultContract]);

  useEffect(() => {
    computeVaultState();
  }, [currentFlareEpoch, currentEpochId, lastFinalizedEpochId]);

  // ------------------------------------------------
  //  Ticker data
  // ------------------------------------------------
  const dataPoints = [
    { label: 'Vault WFLR', value: wnatBalanceInVault },
    { label: 'Current Epoch', value: currentEpochId },
    { label: 'Last Finalized', value: lastFinalizedEpochId },
    { label: 'Total Active Stake', value: totalActiveStake },
    { label: 'Pending Stakers', value: pendingStakersCount },
    { label: 'Current Flare Epoch', value: currentFlareEpoch },
    { label: 'Total Delegation Rewards', value: totalDelegationRewards },
    { label: "Vault's Claimable Epochs", value: claimableEpochsList || '(none)' },
    {
      label: 'Vault Unclaimed WFLR',
      value: parseFloat(vaultUnclaimed).toFixed(2)
    },
    { label: 'Vault State', value: vaultStatus }
  ];

  const renderTickerLine = () => {
    return dataPoints.map((dp) => (
      <React.Fragment key={dp.label}>
        <Box component="span" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
          {dp.label}:
        </Box>
        <Box component="span" sx={{ color: '#fff', ml: 0.5, mr: 15 }}>
          {dp.value}
        </Box>
      </React.Fragment>
    ));
  };

  const tickerContent = (
    <>
      {renderTickerLine()}
      <Box component="span" sx={{ display: 'inline-block', width: '50vw' }} />
    </>
  );

  return (
    <Box
      sx={{
        width: '100%',
        backgroundColor: '#1e1e1e',
        overflow: 'hidden',
        borderBottom: '1px solid #444'
      }}
    >
      <Box sx={{ height: 36, display: 'flex', alignItems: 'center', position: 'relative' }}>
        <Typography
          variant="body1"
          sx={{
            whiteSpace: 'nowrap',
            animation: 'scrolling-text 30s linear infinite'
          }}
        >
          {errorLoading
            ? 'Error loading vault data...'
            : loading
            ? 'Loading vault data...'
            : tickerContent}
        </Typography>
      </Box>
    </Box>
  );
};

export default ScrollingInfoBar;
