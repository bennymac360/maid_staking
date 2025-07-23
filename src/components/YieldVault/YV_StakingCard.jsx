// src/components/YieldVault/YV_StakingCard.jsx
import React, { useContext, useState, useEffect, useMemo } from 'react';
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
  Slider
} from '@mui/material';
import { ethers } from 'ethers';
import { BlockchainContext } from '../../contexts/BlockchainContext';
import NeonButton from '../NeonButton';

// Minimal ERC-20 interface
const erc20ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

// Use your actual FOTON token address from .env
const FOTON_TOKEN_ADDRESS =
  process.env.REACT_APP_FOTON_TOKEN_ADDRESS || '0x8B1EA814149d533330b2D0BB15d797d937F9948C';

/**
 * A regex allowing up to 6 decimal places.
 * Examples of valid:
 *   "", "0", "123", "0.123456", ".5", "123.45"
 * Examples of invalid:
 *   "abc", "1.2345678", "1.2.3", "++"
 */
const decimal6Regex = /^(\d+(\.\d{0,6})?|\.\d{0,6})?$/;

/**
 * Clamps a user-input float string to a maximum balance using 18-decimals BigNumber math.
 * Returns the final string still in decimal form (not BN).
 */
function clampValue(valueString, maxBalanceString) {
  try {
    const valBn = ethers.utils.parseUnits(valueString || '0', 18);
    const maxBn = ethers.utils.parseUnits(maxBalanceString || '0', 18);
    const clamped = valBn.gt(maxBn) ? maxBn : valBn;
    return ethers.utils.formatUnits(clamped, 18);
  } catch {
    // If parsing fails, fallback to '0'
    return '0';
  }
}

/**
 * Helper to finalize a typed input:
 *  1) Clamps vs user's balance
 *  2) Converts to exactly 6 decimals
 *  3) Returns both the final string & a BN
 */
function finalizeAndParse(rawValue, maxBalanceString, minStakeString) {
  const valBn = ethers.utils.parseUnits(rawValue || '0', 18);
  const maxBn = ethers.utils.parseUnits(maxBalanceString || '0', 18);
  const minBn = ethers.utils.parseUnits(minStakeString || '0', 18);

  // 1) bump up to at least the min
  const atLeastMin = valBn.lt(minBn) ? minBn : valBn;
  // 2) then cap to the user’s max
  const bounded = atLeastMin.gt(maxBn) ? maxBn : atLeastMin;

  return {
    bn: bounded,
    finalStr: ethers.utils.formatUnits(bounded, 18),
  };
}

/**
 * `vault` is the actual Yield‑Vault contract instance passed down
 * from `YieldVaultPage`. `version` is optional and only useful if you
 * need to branch on UI text.
 */
const YV_StakingCard = ({ vault, version = 'v1' }) => {
  const { account, provider, signer } = useContext(BlockchainContext);

  const [loading, setLoading] = useState(false);
  const [errorLoading, setErrorLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Basic vault data
  const [activeStake, setActiveStake] = useState('0');
  const [pendingStake, setPendingStake] = useState('0');
  const [minStakeAmount, setMinStakeAmount] = useState('0');
  const [totalActiveStake, setTotalActiveStake] = useState('0');
  const [fotonBalance, setFotonBalance] = useState('0');
  const [userUnclaimed, setUserUnclaimed] = useState('0');
  const [lastFinalizedEpochId, setLastFinalizedEpochId] = useState(0);

  // User input fields (raw typed strings, up to 6 decimals, clamped on blur or final usage)
  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [pendingWithdrawAmount, setPendingWithdrawAmount] = useState('');

  // Tabs
  const [tabValue, setTabValue] = useState('stake');

  // Closes the snackbar
  const handleCloseSnackbar = () => setSnackbar((prev) => ({ ...prev, open: false }));

  // Helper for showing messages
  const showMessage = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  // Build Ethers contract for FOTON
  const erc20Contract = useMemo(() => {
    if (!FOTON_TOKEN_ADDRESS) return null;
    const useSigner = signer || provider;
    return new ethers.Contract(FOTON_TOKEN_ADDRESS, erc20ABI, useSigner);
  }, [signer, provider]);

  /**
   * Fetch aggregator data from vault:
   * 1) getGlobalVaultData() -> returns (YieldGlobalData, YieldRewardTokenData[])
   * 2) from vaultData, destructure lastFinalizedEpochId, minStake, totalActiveStake, etc.
   * 3) getEverything(account, start, end) -> for userActiveStake, etc.
   * 4) getUserTotalUnclaimed(...) -> sums up ephemeral across reward tokens
   */
  const fetchAllData = async () => {
    if (!vault || !account) return;
    setLoading(true);
    setErrorLoading(false);

    try {
      // 1) getGlobalVaultData -> [vaultData, tokenData]
      const [gVaultData] = await vault.getGlobalVaultData();
      const {
        currentEpochId,
        lastFinalizedEpochId: finalEpochBn,
        totalActiveStake: totalStakeBn,
        minStakeAmount: minStakeBn
      } = gVaultData;

      const finalEpochNum = Number(finalEpochBn);
      setLastFinalizedEpochId(finalEpochNum);
      setMinStakeAmount(ethers.utils.formatEther(minStakeBn));
      setTotalActiveStake(ethers.utils.formatEther(totalStakeBn));

      // 2) If finalEpochNum > 0 => getEverything
      let startEpoch = finalEpochNum > 31 ? finalEpochNum - 31 : 1;
      if (finalEpochNum < 1) {
        startEpoch = 1;
      }

      const everything = await vault.getEverything(account, startEpoch, finalEpochNum);

      // userActiveStake
      setActiveStake(ethers.utils.formatEther(everything.userActiveStake));

      // pending stake
      const pendingBn = await vault.pendingStake(account);
      setPendingStake(ethers.utils.formatEther(pendingBn));

      // 3) FOTON wallet balance
      if (erc20Contract) {
        const userFotonBal = await erc20Contract.balanceOf(account);
        setFotonBalance(ethers.utils.formatEther(userFotonBal));
      }

      // 4) total unclaimed
      const tokenAmounts = await vault.getUserTotalUnclaimed(account);
      let totalUnclaimedBN = ethers.BigNumber.from(0);
      for (const amtBn of tokenAmounts) {
        totalUnclaimedBN = totalUnclaimedBN.add(amtBn);
      }
      setUserUnclaimed(Number(ethers.utils.formatEther(totalUnclaimedBN)).toFixed(3));
    } catch (err) {
      console.error('YieldVault fetchAllData error:', err);
      showMessage(`Error fetching yield vault data: ${err.message}`, 'error');
      setErrorLoading(true);
    }

    setLoading(false);
  };

  // On mount or changes
  useEffect(() => {
    if (account && vault) {
      fetchAllData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, vault, erc20Contract]);

  // ---------------------------
  // CONTRACT CALLS
  // ---------------------------
  const handleStake = async () => {
    if (!vault || !erc20Contract) return;
    setLoading(true);
    try {
      // finalize user input
       const { finalStr, bn } = finalizeAndParse(
        stakeAmount,
        fotonBalance,     // user’s balance
        minStakeAmount    // on‑chain minimum
      );

      // Check min stake
      if (parseFloat(finalStr) < parseFloat(minStakeAmount)) {
        showMessage(`Minimum stake is ${minStakeAmount} FOTON.`, 'error');
        setLoading(false);
        return;
      }

      // check allowance
      const allowance = await erc20Contract.allowance(account, vault.address);
      if (allowance.lt(bn)) {
        const approveTx = await erc20Contract.approve(vault.address, bn);
        await approveTx.wait();
        showMessage(`Approved ${finalStr} FOTON for staking.`, 'info');
      }

      // stake
      const tx = await vault.stake(bn);
      await tx.wait();
      showMessage(`Staked ${finalStr} FOTON successfully!`, 'success');

      setStakeAmount('');
      fetchAllData();
    } catch (err) {
      console.error('stake error:', err);
      showMessage(`Stake error: ${err.message}`, 'error');
    }
    setLoading(false);
  };

  const handleUnstake = async () => {
    if (!vault) return;
    setLoading(true);
    try {
      const { finalStr, bn } = finalizeAndParse(unstakeAmount, activeStake);

      if (parseFloat(finalStr) <= 0) {
        showMessage('Please enter an unstake amount > 0.', 'error');
        setLoading(false);
        return;
      }

      const tx = await vault.unstake(bn);
      await tx.wait();
      showMessage(`Unstaked ${finalStr} FOTON successfully!`, 'success');

      setUnstakeAmount('');
      fetchAllData();
    } catch (err) {
      console.error('unstake error:', err);
      showMessage(`Unstake error: ${err.message}`, 'error');
    }
    setLoading(false);
  };

  const withdrawPending = async () => {
    if (!vault) return;
    setLoading(true);
    try {
      const { finalStr, bn } = finalizeAndParse(pendingWithdrawAmount, pendingStake);

      if (parseFloat(finalStr) <= 0) {
        showMessage('Please enter a valid pending withdraw amount.', 'error');
        setLoading(false);
        return;
      }

      const tx = await vault.withdrawPendingStake(bn);
      await tx.wait();
      showMessage(`Withdrew ${finalStr} from pending stake.`, 'success');

      setPendingWithdrawAmount('');
      fetchAllData();
    } catch (err) {
      console.error('withdrawPendingStake error:', err);
      showMessage(`Withdraw error: ${err.message}`, 'error');
    }
    setLoading(false);
  };

  // claimAll => vault.claimAll()
  const handleClaimAll = async () => {
    if (!vault) return;
    setLoading(true);

    try {
      const tx = await vault.claimAll();
      await tx.wait();
      showMessage('ClaimAll completed successfully!', 'success');
      fetchAllData();
    } catch (err) {
      console.error('claimAll error:', err);
      showMessage(`ClaimAll error: ${err.message}`, 'error');
    }
    setLoading(false);
  };

  // ---------------------------
  // SLIDER LOGIC
  // ---------------------------
  const fotonBalNum = parseFloat(fotonBalance) || 0;
  const activeStakeNum = parseFloat(activeStake) || 0;
  const pendingStakeNum = parseFloat(pendingStake) || 0;

  // Convert string inputs to number or 0 for slider
  const stakeSliderValue = parseFloat(stakeAmount) || 0;
  const unstakeSliderValue = parseFloat(unstakeAmount) || 0;
  const pendingSliderValue = parseFloat(pendingWithdrawAmount) || 0;

  const handleStakeSliderChange = (e, newVal) => {
    // convert to string with up to 18 decimals
    const valString = newVal.toFixed(18);
    const clamped = clampValue(valString, fotonBalance);
    // show up to 6 decimals in the typed box
    setStakeAmount(Number(clamped).toFixed(6));
  };

  const handleUnstakeSliderChange = (e, newVal) => {
    const valString = newVal.toFixed(18);
    const clamped = clampValue(valString, activeStake);
    setUnstakeAmount(Number(clamped).toFixed(6));
  };

  const handlePendingSliderChange = (e, newVal) => {
    const valString = newVal.toFixed(18);
    const clamped = clampValue(valString, pendingStake);
    setPendingWithdrawAmount(Number(clamped).toFixed(6));
  };

  // ---------------------------
  // TEXT FIELD LOGIC
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

  if (!vault || !account) {
    return (
      <Card
        sx={{
          backgroundColor: '#1e1e1e',
          maxWidth: 600,
          width: '100%',
          margin: 'auto',
          mt: 4,
          borderRadius: '15px'
        }}
      >
        <CardContent>
          <Typography color="error" textAlign="center">
            No YieldVault contract or wallet connected.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  // For color-coding the stake text field if < minStake
  const isStakeValid = parseFloat(stakeAmount || '0') >= parseFloat(minStakeAmount);

  return (
    <Card
      sx={{
        backgroundColor: '#1e1e1e',
        maxWidth: 600,
        width: '100%',
        margin: 'auto',
        borderRadius: '15px',
        boxShadow: '0 0 20px 5px rgba(0, 191, 255, 0.6)',
        mt: { xs: 3, md: 4 }
      }}
    >
      <CardContent>
        <Typography variant="h5" sx={{ color: '#00bfff', textAlign: 'center', mb: 2 }}>
          Stake
        </Typography>

        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="150px">
            <CircularProgress sx={{ color: '#00bfff' }} />
          </Box>
        ) : errorLoading ? (
          <Typography variant="body2" color="error" textAlign="center">
            Failed to load yield vault data. Please retry.
          </Typography>
        ) : (
          <Box sx={{ color: '#fff' }}>
            {/* Summary info */}
            <Typography>
              My $FOTON:{' '}
              <Box component="span" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
                {parseFloat(fotonBalance).toFixed(3)}
              </Box>
            </Typography>
            <Typography>
              My Active Stake:{' '}
              <Box component="span" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
                {parseFloat(activeStake).toFixed(3)}
              </Box>
            </Typography>
            <Typography>
              My Pending Stake:{' '}
              <Box component="span" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
                {parseFloat(pendingStake).toFixed(3)}
              </Box>
            </Typography>
            <Typography>
              Unclaimed:{' '}
              <Box component="span" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
                {userUnclaimed}
              </Box>
            </Typography>
            <Typography>
              Total Active Stake :{' '}
              <Box component="span" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
                {parseFloat(totalActiveStake).toFixed(3)}
              </Box>
            </Typography>

            <hr style={{ margin: '10px 0', border: '1px solid #444' }} />

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

            {tabValue === 'stake' && (
              <Box>
                <Typography variant="h6" sx={{ color: '#fff', mb: 1 }}>
                  Stake FOTON
                </Typography>
                <Slider
                  value={stakeSliderValue}
                  min={0}
                  max={fotonBalNum}
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

                <Box display="flex" gap={2} mt={1} flexWrap="wrap">
                  <NeonButton onClick={handleStake} disabled={loading || !isStakeValid}>
                    {loading ? <CircularProgress size={24} color="inherit" /> : 'Stake'}
                  </NeonButton>
                  <NeonButton
                    onClick={handleClaimAll}
                    disabled={loading || Number(userUnclaimed) <= 0}
                  >
                    {loading ? 'Claiming...' : 'Claim All'}
                  </NeonButton>
                </Box>
              </Box>
            )}

            {tabValue === 'unstake' && (
              <Box>
                <Typography variant="h6" sx={{ color: '#fff', mb: 1 }}>
                  Unstake
                </Typography>
                <Slider
                  value={unstakeSliderValue}
                  min={0}
                  max={activeStakeNum}
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

                <Box display="flex" gap={2} mb={3} flexWrap="wrap">
                  <NeonButton onClick={handleUnstake} disabled={loading}>
                    {loading ? <CircularProgress size={24} color="inherit" /> : 'Unstake'}
                  </NeonButton>
                </Box>

                <Typography variant="h6" sx={{ color: '#fff', mb: 1 }}>
                  Withdraw Pending
                </Typography>
                <Slider
                  value={pendingSliderValue}
                  min={0}
                  max={pendingStakeNum}
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
            )}
          </Box>
        )}
      </CardContent>

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
    </Card>
  );
};

export default YV_StakingCard;
