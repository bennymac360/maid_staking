// src/components/OracleVault/StakingCard.jsx

import React, { useContext, useEffect, useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  CircularProgress,
  Snackbar,
  Alert,
  Tab,
  Tabs,
  Slider,
  Tooltip,
  useTheme,
  useMediaQuery
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import { ethers } from 'ethers';

import { BlockchainContext } from '../../contexts/BlockchainContext';
import NeonButton from '../NeonButton';

// Minimal ERC-20 interface (for direct approvals)
const erc20ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

// Use your FOTON token address from .env, or a fallback
const FOTON_TOKEN_ADDRESS = process.env.REACT_APP_FOTON_TOKEN_ADDRESS || '';

/**
 * Safely clamp a user-input string to a maximum balance
 * by converting to BN with 18 decimals, comparing, then returning
 * a string again (in 18 decimal units).
 */
function clampValue(valueString, maxBalanceString) {
  try {
    const valBn = ethers.utils.parseUnits(valueString || '0', 18);
    const maxBn = ethers.utils.parseUnits(maxBalanceString || '0', 18);
    const clamped = valBn.gt(maxBn) ? maxBn : valBn;
    return ethers.utils.formatUnits(clamped, 18);
  } catch {
    // If parsing fails (user typed something invalid), return '0'
    return '0';
  }
}

/**
 * Regex to allow up to 6 decimals
 * Examples of valid:
 *   "", "0", "123", "0.123456", ".5", "123.45"
 * Examples of invalid:
 *   "abc", "1.2345678", "1.2.3", "++"
 */
const decimal6Regex = /^(\d+(\.\d{0,6})?|\.\d{0,6})?$/;

const StakingCard = () => {
  const { account, oracleVaultContract, provider, signer } = useContext(BlockchainContext);

  // Responsive helpers
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // UI states
  const [loading, setLoading] = useState(false);
  const [errorLoading, setErrorLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Vault/global data
  const [activeStake, setActiveStake] = useState('0');
  const [pendingStake, setPendingStake] = useState('0');
  const [totalActiveStake, setTotalActiveStake] = useState('0');
  const [minStakeAmount, setMinStakeAmount] = useState('0');
  const [fotonBalance, setFotonBalance] = useState('0');
  const [lastFinalizedEpoch, setLastFinalizedEpoch] = useState(0);

  // User ephemeral unclaimed (sum of wNAT + FOTON)
  const [userunclaimed, setUserunclaimed] = useState(0);

  // User input states (raw typed), for stake/unstake/pending
  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [pendingWithdrawAmount, setPendingWithdrawAmount] = useState('');

  // Tab switching (stake vs unstake)
  const [tabValue, setTabValue] = useState('stake');

  // Minimal FOTON contract for approvals
  const erc20Contract = useMemo(() => {
    if (!FOTON_TOKEN_ADDRESS) return null;
    const useSigner = signer || provider;
    return new ethers.Contract(FOTON_TOKEN_ADDRESS, erc20ABI, useSigner);
  }, [signer, provider]);

  // Helper for closing snackbar
  const handleCloseSnackbar = () => setSnackbar((prev) => ({ ...prev, open: false }));
  // Helper for showing messages
  const showMessage = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  // ---------------------------
  // 1) FETCH VAULT DATA
  // ---------------------------
  const fetchAllData = async () => {
    if (!oracleVaultContract || !account) return;
    setLoading(true);
    setErrorLoading(false);

    try {
      // 1) Global vault data
      const globalVaultResponse = await oracleVaultContract.getGlobalVaultData();
      const { vaultData } = globalVaultResponse;

      setTotalActiveStake(ethers.utils.formatEther(vaultData.totalActiveStake));
      setMinStakeAmount(ethers.utils.formatEther(vaultData.minStakeAmount));

      const finalEpoch = Number(vaultData.lastFinalizedEpochId);
      setLastFinalizedEpoch(finalEpoch);

      // 2) If there are finalized epochs, compute user data
      if (finalEpoch > 0) {
        const startEpoch = finalEpoch > 31 ? finalEpoch - 31 : 1;
        const everything = await oracleVaultContract.getEverything(account, startEpoch, finalEpoch);

        // Extract user wallet/stake
        setFotonBalance(ethers.utils.formatEther(everything.fotonWalletBalance));
        setPendingStake(ethers.utils.formatEther(everything.pendingStake));
        setActiveStake(ethers.utils.formatEther(everything.activeStake));

        // 3) Fetch ephemeral unclaimed
        const ephemeralData = await oracleVaultContract.getUserEphemeralRewards(
          account,
          startEpoch,
          finalEpoch
        );

        let ephemeralSum = 0;
        ephemeralData.forEach((epochInfo) => {
          const wnatVal = parseFloat(ethers.utils.formatEther(epochInfo.wnatAmount));
          ephemeralSum += wnatVal ;
        });
        setUserunclaimed(ephemeralSum);
      } else {
        // No finalized => zero everything
        setFotonBalance('0');
        setPendingStake('0');
        setActiveStake('0');
        setUserunclaimed(0);
      }
    } catch (err) {
      console.error('Error fetching vault data:', err);
      showMessage('Error fetching vault data. Check console.', 'error');
      setErrorLoading(true);
    }

    setLoading(false);
  };

  // On mount
  useEffect(() => {
    if (account && oracleVaultContract) {
      fetchAllData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, oracleVaultContract, erc20Contract]);

  // ---------------------------
  // 2) CONTRACT CALLS
  // ---------------------------
  const finalizeAndParse = (rawValue, maxBalance) => {
    const clamped = clampValue(rawValue, maxBalance);
    const finalStr = Number(clamped).toFixed(6);
    return {
      finalStr,
      bn: ethers.utils.parseEther(finalStr)
    };
  };

  // 2a) STAKE
  const stakeFoton = async () => {
    if (!oracleVaultContract || !erc20Contract) return;
    setLoading(true);

    try {
      const { finalStr, bn } = finalizeAndParse(stakeAmount, fotonBalance);
      if (parseFloat(finalStr) < parseFloat(minStakeAmount)) {
        showMessage(`Minimum stake is ${Number(minStakeAmount).toFixed(6)} FOTON`, 'error');
        setLoading(false);
        return;
      }

      // Check allowance
      const allowance = await erc20Contract.allowance(account, oracleVaultContract.address);
      if (allowance.lt(bn)) {
        const approveTx = await erc20Contract.approve(oracleVaultContract.address, bn);
        await approveTx.wait();
        showMessage(`Approved ${finalStr} FOTON for staking`, 'info');
      }

      // Stake
      const tx = await oracleVaultContract.stakeFoton(bn);
      await tx.wait();
      showMessage(`Successfully staked ${finalStr} FOTON`, 'success');

      // reset + refresh
      setStakeAmount('');
      fetchAllData();
    } catch (err) {
      console.error('stakeFoton error:', err);
      showMessage(`Stake failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 2b) Unstake Partial
  const unstakePartial = async () => {
    if (!oracleVaultContract) return;
    setLoading(true);

    try {
      const { finalStr, bn } = finalizeAndParse(unstakeAmount, activeStake);
      if (parseFloat(finalStr) <= 0) {
        showMessage('Please enter an unstake amount > 0.', 'error');
        setLoading(false);
        return;
      }

      const tx = await oracleVaultContract.reduceStakeFoton(bn);
      await tx.wait();
      showMessage(`Successfully unstaked ${finalStr} FOTON`, 'success');

      setUnstakeAmount('');
      fetchAllData();
    } catch (err) {
      console.error('Unstake error:', err);
      showMessage(`Unstake failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 2c) Unstake All
  const unstakeAll = async () => {
    if (!oracleVaultContract) return;
    setLoading(true);

    try {
      const tx = await oracleVaultContract.unstakeFoton();
      await tx.wait();
      showMessage('Successfully unstaked ALL FOTON.', 'success');
      fetchAllData();
    } catch (err) {
      console.error('Unstake all error:', err);
      showMessage(`Unstake all failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 2d) Claim last 32 epochs
  const claimLastEpochs = async () => {
    if (!oracleVaultContract) return;
    setLoading(true);

    try {
      if (!lastFinalizedEpoch || lastFinalizedEpoch < 1) {
        showMessage('No finalized epochs found to claim.', 'info');
        setLoading(false);
        return;
      }

      const start = Math.max(1, lastFinalizedEpoch - 31);
      const end = lastFinalizedEpoch;

      const tx = await oracleVaultContract.claimAllEpochRewards(start, end);
      await tx.wait();
      showMessage(`Successfully claimed epochs ${start}..${end}.`, 'success');

      fetchAllData();
    } catch (err) {
      console.error('claimLastEpochs error:', err);
      showMessage(`Claim failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 2e) Claim + Unstake All
  const claimAndUnstakeAll = async () => {
    if (!oracleVaultContract) return;
    setLoading(true);

    try {
      // Unstake all
      await unstakeAll();
      // Then claim everything
      const claimTx = await oracleVaultContract.claimAllForUser();
      await claimTx.wait();
      showMessage('All stake unstaked, and all rewards claimed.', 'success');
      fetchAllData();
    } catch (err) {
      console.error('Claim + Unstake All error:', err);
      showMessage(`Claim + Unstake All failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 2f) Withdraw Pending
  const withdrawPending = async () => {
    if (!oracleVaultContract) return;
    setLoading(true);

    try {
      const { finalStr, bn } = finalizeAndParse(pendingWithdrawAmount, pendingStake);
      if (parseFloat(finalStr) <= 0) {
        showMessage('Please enter a valid amount to withdraw from pending stake.', 'error');
        setLoading(false);
        return;
      }

      const tx = await oracleVaultContract.withdrawPendingStake(bn);
      await tx.wait();
      showMessage(`Successfully withdrew ${finalStr} FOTON from pending stake.`, 'success');

      setPendingWithdrawAmount('');
      fetchAllData();
    } catch (err) {
      console.error('Withdraw pending stake error:', err);
      showMessage(`Withdraw pending stake failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------
  // 3) SLIDER LOGIC
  // ---------------------------
  const maxFotonBalanceNum = parseFloat(fotonBalance) || 0;
  const maxActiveNum = parseFloat(activeStake) || 0;
  const maxPendingNum = parseFloat(pendingStake) || 0;

  const stakeSliderValue = parseFloat(stakeAmount) || 0;
  const unstakeSliderValue = parseFloat(unstakeAmount) || 0;
  const pendingSliderValue = parseFloat(pendingWithdrawAmount) || 0;

  const handleStakeSliderChange = (event, newVal) => {
    const valString = newVal.toFixed(18);
    const clamped = clampValue(valString, fotonBalance);
    setStakeAmount(Number(clamped).toFixed(6));
  };

  const handleUnstakeSliderChange = (event, newVal) => {
    const valString = newVal.toFixed(18);
    const clamped = clampValue(valString, activeStake);
    setUnstakeAmount(Number(clamped).toFixed(6));
  };

  const handlePendingSliderChange = (event, newVal) => {
    const valString = newVal.toFixed(18);
    const clamped = clampValue(valString, pendingStake);
    setPendingWithdrawAmount(Number(clamped).toFixed(6));
  };

  // ---------------------------
  // 4) TEXT FIELD LOGIC
  // ---------------------------
  const handleStakeInputChange = (e) => {
    const val = e.target.value;
    if (decimal6Regex.test(val)) {
      setStakeAmount(val);
    }
  };
  const handleStakeBlur = () => {
    if (!stakeAmount) return;
    const clamped = clampValue(stakeAmount, fotonBalance);
    setStakeAmount(Number(clamped).toFixed(6));
  };

  const handleUnstakeInputChange = (e) => {
    const val = e.target.value;
    if (decimal6Regex.test(val)) {
      setUnstakeAmount(val);
    }
  };
  const handleUnstakeBlur = () => {
    if (!unstakeAmount) return;
    const clamped = clampValue(unstakeAmount, activeStake);
    setUnstakeAmount(Number(clamped).toFixed(6));
  };

  const handlePendingInputChange = (e) => {
    const val = e.target.value;
    if (decimal6Regex.test(val)) {
      setPendingWithdrawAmount(val);
    }
  };
  const handlePendingBlur = () => {
    if (!pendingWithdrawAmount) return;
    const clamped = clampValue(pendingWithdrawAmount, pendingStake);
    setPendingWithdrawAmount(Number(clamped).toFixed(6));
  };

  // If not connected or missing contract, show fallback
  if (!oracleVaultContract || !account) {
    return (
      <Card
        sx={{
          backgroundColor: '#1e1e1e',
          maxWidth: isMobile ? 360 : 600,
          width: '100%',
          margin: 'auto',
          boxShadow: '0 0 20px 5px rgba(0, 191, 255, 0.6)',
          borderRadius: '15px',
          mt: { xs: 2, md: 4 }
        }}
      >
        <CardContent>
          <Typography color="error" textAlign="center">
            Wallet or contract not connected. Please ensure you are connected.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  // Validate stake vs minStake for input coloring
  const isStakeValid = parseFloat(stakeAmount || '0') >= parseFloat(minStakeAmount);

  return (
    <Card
      sx={{
        backgroundColor: '#1e1e1e',
        maxWidth: isMobile ? 360 : 800,
        minWidth: isMobile ? '240px' : '600px',
        width: '100%',
        margin: 'auto',
        boxShadow: '0 0 20px 5px rgba(0, 191, 255, 0.6)',
        borderRadius: '15px',
        mt: { xs: 2, md: 4 }
      }}
    >
      <CardContent>
        <Typography
          variant="h5"
          sx={{ color: '#00bfff', textAlign: 'center', fontFamily: 'Montserrat, sans-serif', mb: 2 }}
        >
          Stake (Migrate to YV)
        </Typography>

        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
            <CircularProgress sx={{ color: '#00bfff' }} />
          </Box>
        ) : errorLoading ? (
          <Typography variant="body2" color="error" textAlign="center">
            Failed to load staking data. Please retry.
          </Typography>
        ) : (
          <>
            {/* Basic Stats */}
            <Box mb={2} sx={{ color: '#fff',  textAlign: 'left' }}>
              <Typography>
                FOTON Balance:{' '}
                <Box component="span" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
                  {Number(fotonBalance).toFixed(3)}
                  <Tooltip title="User FOTON Balance" arrow>
                    <InfoIcon sx={{ fontSize: 18, color: '#aaa', cursor: 'pointer' }} />
                  </Tooltip>
                </Box>
              </Typography>
              <Typography>
                Active Stake:{' '}
                <Box component="span" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
                  {Number(activeStake).toFixed(3)}
                  <Tooltip title="User Active Stake" arrow>
                    <InfoIcon sx={{ fontSize: 18, color: '#aaa', cursor: 'pointer' }} />
                  </Tooltip>
                </Box>
              </Typography>
              <Typography>
                Pending Stake:{' '}
                <Box component="span" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
                  {Number(pendingStake).toFixed(3)}
                  <Tooltip title="User Pending Stake" arrow>
                    <InfoIcon sx={{ fontSize: 18, color: '#aaa', cursor: 'pointer' }} />
                  </Tooltip>
                </Box>
              </Typography>
              <Typography>
                Unclaimed Rewards:{' '}
                <Box component="span" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
                  {userunclaimed.toFixed(3)}
                  <Tooltip title="User's unclaimed rewards (live ephemeral across last epochs)" arrow>
                    <InfoIcon sx={{ fontSize: 18, color: '#aaa', cursor: 'pointer' }} />
                  </Tooltip>
                </Box>
              </Typography>

              <hr style={{ margin: '10px 0', border: '1px solid #444' }} />

              <Typography>
                Total Active Stake:{' '}
                <Box component="span" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
                  {Number(totalActiveStake).toFixed(3)}
                  <Tooltip title="Total Active Stake in the Oracle Vault" arrow>
                    <InfoIcon sx={{ fontSize: 18, color: '#aaa', cursor: 'pointer' }} />
                  </Tooltip>
                </Box>
              </Typography>
            </Box>

            {/* Tabs: stake/unstake */}
            <Tabs
              value={tabValue}
              onChange={(e, newVal) => setTabValue(newVal)}
              textColor="secondary"
              indicatorColor="secondary"
              centered
              sx={{ marginBottom: '16px' }}
            >
              <Tab label="Stake" value="stake" sx={{ color: '#fff' }} />
              <Tab label="Unstake" value="unstake" sx={{ color: '#fff' }} />
            </Tabs>

            {/* STAKE TAB */}
            {tabValue === 'stake' && (
              <Box>
                <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="h6" sx={{ color: '#fff', mr: 1 }}>
                    Stake FOTON
                  </Typography>
                  <Tooltip title={`Minimum stake is ${Number(minStakeAmount).toFixed(6)} FOTON`} arrow>
                    <InfoIcon sx={{ fontSize: 18, color: '#aaa', cursor: 'pointer' }} />
                  </Tooltip>
                </Box>

                <Box mb={2}>
                  <Slider
                    value={stakeSliderValue}
                    min={0}
                    max={maxFotonBalanceNum}
                    step={0.0001}
                    onChange={handleStakeSliderChange}
                    sx={{ color: '#00bfff' }}
                  />
                  <TextField
                    label="Amount"
                    variant="outlined"
                    fullWidth
                    value={stakeAmount}
                    onChange={handleStakeInputChange}
                    onBlur={handleStakeBlur}
                    sx={{ mb: 1 }}
                    inputProps={{ style: { color: isStakeValid ? '#fff' : '#ff4444' } }}
                    InputLabelProps={{ style: { color: '#fff' } }}
                  />
                  <Box display="flex" gap={2} flexWrap="wrap">
                    <NeonButton onClick={stakeFoton} disabled={!isStakeValid || loading}>
                      {loading ? <CircularProgress size={24} color="inherit" /> : 'Stake'}
                    </NeonButton>
                    <NeonButton onClick={claimLastEpochs} disabled={loading || userunclaimed <= 0}>
                      {loading ? <CircularProgress size={24} color="inherit" /> : 'Claim'}
                    </NeonButton>
                  </Box>
                </Box>
              </Box>
            )}

            {/* UNSTAKE TAB */}
            {tabValue === 'unstake' && (
              <Box>
                <Typography variant="h6" sx={{ color: '#fff', mb: 1 }}>
                  Unstake Active
                </Typography>
                <Box mb={2}>
                  <Slider
                    value={unstakeSliderValue}
                    min={0}
                    max={maxActiveNum}
                    step={0.0001}
                    onChange={handleUnstakeSliderChange}
                    sx={{ color: '#00bfff' }}
                  />
                  <TextField
                    label="Amount"
                    variant="outlined"
                    fullWidth
                    value={unstakeAmount}
                    onChange={handleUnstakeInputChange}
                    onBlur={handleUnstakeBlur}
                    sx={{ mb: 1 }}
                    inputProps={{ style: { color: '#fff' } }}
                    InputLabelProps={{ style: { color: '#fff' } }}
                  />
                  <Box display="flex" gap={2} flexWrap="wrap">
                    <NeonButton onClick={unstakePartial} disabled={loading}>
                      {loading ? <CircularProgress size={24} color="inherit" /> : 'Unstake'}
                    </NeonButton>
                  </Box>
                </Box>

                <Typography variant="h6" sx={{ color: '#fff', mb: 1 }}>
                  Withdraw Pending
                </Typography>
                <Box mb={2}>
                  <Slider
                    value={pendingSliderValue}
                    min={0}
                    max={maxPendingNum}
                    step={0.0001}
                    onChange={handlePendingSliderChange}
                    sx={{ color: '#00bfff' }}
                  />
                  <TextField
                    label="Amount"
                    variant="outlined"
                    fullWidth
                    value={pendingWithdrawAmount}
                    onChange={handlePendingInputChange}
                    onBlur={handlePendingBlur}
                    sx={{ mb: 1 }}
                    inputProps={{ style: { color: '#fff' } }}
                    InputLabelProps={{ style: { color: '#fff' } }}
                  />
                  <Box display="flex" gap={2} flexWrap="wrap">
                    <NeonButton onClick={withdrawPending} disabled={loading}>
                      {loading ? <CircularProgress size={24} color="inherit" /> : 'Withdraw'}
                    </NeonButton>
                  </Box>
                </Box>
              </Box>
            )}
          </>
        )}
      </CardContent>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert variant="filled" severity={snackbar.severity} onClose={handleCloseSnackbar}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Card>
  );
};

export default StakingCard;
