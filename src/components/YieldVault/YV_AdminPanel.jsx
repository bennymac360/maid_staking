import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  CircularProgress,
  Snackbar,
  Alert
} from '@mui/material';
import { ethers } from 'ethers';
import NeonButton from '../NeonButton';

/**
 * Props
 * ► vault – connected YieldVault contract instance (v1 / v2)
 */
const YV_AdminPanel = ({ vault }) => {
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Timelock data from the contract
  const [timelock, setTimelock] = useState({
    token: '',
    to: '',
    amount: '',
    earliestExecTime: '0',
    isNative: false
  });

  // Scheduling withdraw fields
  const [scheduleToken, setScheduleToken] = useState('');
  const [scheduleTo, setScheduleTo] = useState('');
  const [scheduleAmount, setScheduleAmount] = useState('');
  const [scheduleIsEther, setScheduleIsEther] = useState(false);

  // For setMinStakeAmount
  const [newMinStakeAmount, setNewMinStakeAmount] = useState('');

  // For addRewardToken
  const [newRewardToken, setNewRewardToken] = useState('');

  // For removeRewardToken
  const [removeRewardTokenAddr, setRemoveRewardTokenAddr] = useState('');

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  const showMessage = (msg, severity = 'info') => {
    setSnackbar({ open: true, message: msg, severity });
  };

  /**
   * Fetch current timelock request from the contract.
   */
  const fetchTimelockRequest = async () => {
    if (!vault) return;
    setLoading(true);
    try {
      const r = await vault.timelockRequest();
      // Convert from wei to normal float if token is an ERC20
      const amtEther = ethers.utils.formatEther(r.amount);

      setTimelock({
        token: r.token,
        to: r.to,
        amount: amtEther,
        earliestExecTime: r.earliestExecTime.toString(),
        isNative: r.isNative
      });
    } catch (err) {
      console.error('timelockRequest() read error:', err);
      showMessage('Error reading timelock request from contract.', 'error');
    }
    setLoading(false);
  };

  /**
   * -------------- Admin Calls --------------
   */
  const callPause = async () => {
    if (!vault) return;
    setLoading(true);
    try {
      const tx = await vault.pause();
      await tx.wait();
      showMessage('YieldVault paused.', 'success');
    } catch (err) {
      console.error('pause error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  const callUnpause = async () => {
    if (!vault) return;
    setLoading(true);
    try {
      const tx = await vault.unpause();
      await tx.wait();
      showMessage('YieldVault unpaused!', 'success');
    } catch (err) {
      console.error('unpause error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // Timelock: schedule, cancel, execute
  const scheduleEmergencyWithdraw = async () => {
    if (!vault) return;
    if (!scheduleTo || !scheduleAmount) {
      showMessage('Please enter a "to" address and an amount.', 'error');
      return;
    }
    setLoading(true);
    try {
      const parsedAmount = ethers.utils.parseEther(scheduleAmount);
      const tx = await vault.scheduleEmergencyWithdraw(
        scheduleToken,
        scheduleTo,
        parsedAmount,
        scheduleIsEther
      );
      await tx.wait();
      showMessage('scheduleEmergencyWithdraw() success!', 'success');
      await fetchTimelockRequest();
    } catch (err) {
      console.error('scheduleEmergencyWithdraw error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  const cancelEmergencyWithdraw = async () => {
    if (!vault) return;
    setLoading(true);
    try {
      const tx = await vault.cancelEmergencyWithdraw();
      await tx.wait();
      showMessage('Timelock request canceled.', 'success');
      await fetchTimelockRequest();
    } catch (err) {
      console.error('cancelEmergencyWithdraw error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  const executeEmergencyWithdraw = async () => {
    if (!vault) return;
    setLoading(true);
    try {
      const tx = await vault.executeEmergencyWithdraw();
      await tx.wait();
      showMessage('Emergency withdraw executed!', 'success');
      await fetchTimelockRequest();
    } catch (err) {
      console.error('executeEmergencyWithdraw error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // setMinStakeAmount
  const updateMinStakeAmount = async () => {
    if (!vault || !newMinStakeAmount) return;
    setLoading(true);
    try {
      const parsedAmt = ethers.utils.parseEther(newMinStakeAmount);
      const tx = await vault.setMinStakeAmount(parsedAmt);
      await tx.wait();
      showMessage(`Min stake amount updated to ${newMinStakeAmount} tokens`, 'success');
    } catch (err) {
      console.error('setMinStakeAmount error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // addRewardToken
  const handleAddRewardToken = async () => {
    if (!vault || !newRewardToken) return;
    setLoading(true);
    try {
      const tx = await vault.addRewardToken(newRewardToken);
      await tx.wait();
      showMessage(`Successfully added reward token: ${newRewardToken}`, 'success');
      setNewRewardToken('');
    } catch (err) {
      console.error('addRewardToken error:', err);
      showMessage(`Error addRewardToken: ${err.message}`, 'error');
    }
    setLoading(false);
  };

  // removeRewardToken
  const handleRemoveRewardToken = async () => {
    if (!vault || !removeRewardTokenAddr) return;
    setLoading(true);
    try {
      const tx = await vault.removeRewardToken(removeRewardTokenAddr);
      await tx.wait();
      showMessage(`Removed token: ${removeRewardTokenAddr}`, 'success');
      setRemoveRewardTokenAddr('');
    } catch (err) {
      console.error('removeRewardToken error:', err);
      showMessage(`Error removeRewardToken: ${err.message}`, 'error');
    }
    setLoading(false);
  };

  // Fetch timelock request on mount or when vault changes
  useEffect(() => {
    if (vault) {
      fetchTimelockRequest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault]);

  /* ────────────────────────────────────────── guard while vault not ready */
  if (!vault) {
    return (
      <Typography sx={{ color: 'error.main', textAlign: 'center', mt: 4 }}>
        YieldVault contract not connected.
      </Typography>
    );
  }

  return (
    <Card
      sx={{
        backgroundColor: '#1e1e1e',
        maxWidth: 700,
        width: '100%',
        margin: '40px auto',
        boxShadow: '0 0 20px 5px rgba(0, 191, 255, 0.6)',
        borderRadius: '15px'
      }}
    >
      <CardContent>
        <Typography
          variant="h5"
          sx={{ color: '#00bfff', textAlign: 'center', fontFamily: 'Montserrat, sans-serif', mb: 2 }}
        >
          YieldVault Admin Panel
        </Typography>

        {/* Pause / Unpause */}
        <Box mb={2} display="flex" gap={2}>
          <NeonButton onClick={callPause} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Pause'}
          </NeonButton>
          <NeonButton onClick={callUnpause} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Unpause'}
          </NeonButton>
        </Box>

        {/* setMinStakeAmount */}
        <Box mb={3}>
          <Typography variant="subtitle1" sx={{ color: '#fff', mb: 1 }}>
            Update Minimum Stake Amount
          </Typography>
          <TextField
            label="Min Stake (in token units)"
            variant="outlined"
            size="small"
            value={newMinStakeAmount}
            onChange={(e) => setNewMinStakeAmount(e.target.value)}
            sx={{ mr: 2, mb: 1, width: '200px' }}
            inputProps={{ style: { color: '#fff' } }}
            InputLabelProps={{ style: { color: '#fff' } }}
          />
          <NeonButton onClick={updateMinStakeAmount} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Set Min Stake'}
          </NeonButton>
        </Box>

        {/* Add & Remove Reward Token */}
        <Box mb={3}>
          <Typography variant="subtitle1" sx={{ color: '#fff', mb: 1 }}>
            Manage Reward Tokens
          </Typography>
          {/* AddRewardToken */}
          <TextField
            label="Add Token Address"
            variant="outlined"
            size="small"
            value={newRewardToken}
            onChange={(e) => setNewRewardToken(e.target.value)}
            sx={{ mr: 2, mb: 1, width: '100%' }}
            inputProps={{ style: { color: '#fff' } }}
            InputLabelProps={{ style: { color: '#fff' } }}
          />
          <NeonButton onClick={handleAddRewardToken} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Add Reward Token'}
          </NeonButton>

          {/* RemoveRewardToken */}
          <Box mt={2}>
            <TextField
              label="Remove Token Address"
              variant="outlined"
              size="small"
              value={removeRewardTokenAddr}
              onChange={(e) => setRemoveRewardTokenAddr(e.target.value)}
              sx={{ mr: 2, mb: 1, width: '100%' }}
              inputProps={{ style: { color: '#fff' } }}
              InputLabelProps={{ style: { color: '#fff' } }}
            />
            <NeonButton onClick={handleRemoveRewardToken} disabled={loading}>
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Remove Reward Token'}
            </NeonButton>
          </Box>
        </Box>

        {/* Timelock (Emergency Withdraw) */}
        <Box>
          <Typography variant="h6" sx={{ color: '#00bfff', mb: 2 }}>
            Emergency Withdraw Timelock
          </Typography>

          {timelock.earliestExecTime !== '0' ? (
            <Box sx={{ mb: 2, color: '#fff' }}>
              <Typography>** Active Timelock Request **</Typography>
              <Typography>Token: {timelock.token}</Typography>
              <Typography>Recipient (to): {timelock.to}</Typography>
              <Typography>Amount: {timelock.amount}</Typography>
              <Typography>Is Ether?: {timelock.isNative ? 'Yes' : 'No'}</Typography>
              <Typography>Earliest Exec Time: {timelock.earliestExecTime}</Typography>

              <Box mt={1}>
                <NeonButton onClick={cancelEmergencyWithdraw} disabled={loading}>
                  {loading ? <CircularProgress size={24} color="inherit" /> : 'Cancel Timelock'}
                </NeonButton>
                <NeonButton onClick={executeEmergencyWithdraw} disabled={loading} sx={{ ml: 2 }}>
                  {loading ? <CircularProgress size={24} color="inherit" /> : 'Execute Withdraw'}
                </NeonButton>
              </Box>
            </Box>
          ) : (
            <Typography sx={{ color: '#fff', mb: 2 }}>
              No active timelock request
            </Typography>
          )}

          <Box sx={{ p: 2, border: '1px solid #00bfff', borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ color: '#fff', mb: 1 }}>
              Schedule New Emergency Withdraw
            </Typography>
            <TextField
              label="Token Address (0x0 if Ether)"
              variant="outlined"
              size="small"
              value={scheduleToken}
              onChange={(e) => setScheduleToken(e.target.value)}
              sx={{ mr: 2, mb: 1, width: '100%' }}
              inputProps={{ style: { color: '#fff' } }}
              InputLabelProps={{ style: { color: '#fff' } }}
            />
            <TextField
              label="Recipient (to)"
              variant="outlined"
              size="small"
              value={scheduleTo}
              onChange={(e) => setScheduleTo(e.target.value)}
              sx={{ mr: 2, mb: 1, width: '100%' }}
              inputProps={{ style: { color: '#fff' } }}
              InputLabelProps={{ style: { color: '#fff' } }}
            />
            <TextField
              label="Amount (ETH units)"
              variant="outlined"
              size="small"
              value={scheduleAmount}
              onChange={(e) => setScheduleAmount(e.target.value)}
              sx={{ mr: 2, mb: 1, width: '100%' }}
              inputProps={{ style: { color: '#fff' } }}
              InputLabelProps={{ style: { color: '#fff' } }}
            />

            <Box display="flex" alignItems="center" gap={2} mb={2}>
              <Typography sx={{ color: '#fff' }}>Withdraw Ether?</Typography>
              <input
                type="checkbox"
                checked={scheduleIsEther}
                onChange={(e) => setScheduleIsEther(e.target.checked)}
              />
            </Box>

            <NeonButton onClick={scheduleEmergencyWithdraw} disabled={loading}>
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Schedule Withdraw'}
            </NeonButton>
          </Box>
        </Box>
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

export default YV_AdminPanel;
