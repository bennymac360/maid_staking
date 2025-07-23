import React, { useContext, useState } from 'react';
import { BlockchainContext } from '../../contexts/BlockchainContext';
import { Box, Card, CardContent, Typography, TextField, CircularProgress, Snackbar, Alert } from '@mui/material';
import NeonButton from './../NeonButton';
import { ethers } from 'ethers';

/**
 * AdminPanel for interacting with the OracleVault contract as Owner.
 * Must be the Owner to use these calls.
 */
const AdminPanel = () => {
  const { oracleVaultContract } = useContext(BlockchainContext);

  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // For delegation
  const [delegateProvider, setDelegateProvider] = useState('');
  const [delegateBips, setDelegateBips] = useState('');

  // Scheduling withdraw fields
  const [scheduleToken, setScheduleToken] = useState('');
  const [scheduleTo, setScheduleTo] = useState('');
  const [scheduleAmount, setScheduleAmount] = useState('');
  const [scheduleIsEther, setScheduleIsEther] = useState(false);

  // For setMinStakeAmount
  const [newMinStakeAmount, setNewMinStakeAmount] = useState('');

  // For setYieldVaultAddress
  const [yieldVaultAddr, setYieldVaultAddr] = useState('');

  // For redirectERC20
  const [redirectToken, setRedirectToken] = useState('');

  // Fields for airdrop claims
  const [airdropStartMonth, setAirdropStartMonth] = useState('');
  const [airdropEndMonth, setAirdropEndMonth] = useState('');
  const [airdropWrap, setAirdropWrap] = useState(false);

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  const showMessage = (msg, severity = 'info') => {
    setSnackbar({ open: true, message: msg, severity });
  };

  /**
   * -------------- Admin Calls --------------
   */
  // 1) autoAdvanceEpochPublic
  const callAutoAdvanceEpoch = async () => {
    if (!oracleVaultContract) return;
    setLoading(true);
    try {
      const tx = await oracleVaultContract.autoAdvanceEpochPublic();
      await tx.wait();
      showMessage('autoAdvanceEpochPublic() success!', 'success');
    } catch (err) {
      console.error('autoAdvanceEpochPublic error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // 2) claimAndFinalizeAll (replacing the old "claimAndAdvanceNoProofs")
  const callClaimAndFinalizeAll = async () => {
    if (!oracleVaultContract) return;
    setLoading(true);
    try {
      const tx = await oracleVaultContract.claimAndFinalizeAll();
      await tx.wait();
      showMessage('claimAndFinalizeAll() success!', 'success');
    } catch (err) {
      console.error('claimAndFinalizeAll error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // 3) Pause
  const callPause = async () => {
    if (!oracleVaultContract) return;
    setLoading(true);
    try {
      const tx = await oracleVaultContract.pause();
      await tx.wait();
      showMessage('Contract paused.', 'success');
    } catch (err) {
      console.error('pause error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // 4) Unpause
  const callUnpause = async () => {
    if (!oracleVaultContract) return;
    setLoading(true);
    try {
      const tx = await oracleVaultContract.unpause();
      await tx.wait();
      showMessage('Contract unpaused!', 'success');
    } catch (err) {
      console.error('unpause error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // 5) Delegate WNAT
  const callDelegateWnat = async () => {
    if (!oracleVaultContract || !delegateProvider || !delegateBips) return;
    setLoading(true);
    try {
      const tx = await oracleVaultContract.delegateWnat(delegateProvider, delegateBips);
      await tx.wait();
      showMessage(`Delegated WNAT => ${delegateProvider} @ bips=${delegateBips}`, 'success');
    } catch (err) {
      console.error('Delegate WNAT error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // 6) Undelegate All
  const callUndelegateAll = async () => {
    if (!oracleVaultContract) return;
    setLoading(true);
    try {
      const tx = await oracleVaultContract.undelegateAll();
      await tx.wait();
      showMessage('All WNAT undelegated.', 'success');
    } catch (err) {
      console.error('undelegateAll error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // 7) scheduleEmergencyWithdraw
  const scheduleEmergencyWithdraw = async () => {
    if (!oracleVaultContract) return;
    if (!scheduleTo || !scheduleAmount) {
      showMessage('Please enter recipient ("to") and amount.', 'error');
      return;
    }
    setLoading(true);
    try {
      const parsedAmount = ethers.utils.parseEther(scheduleAmount);
      const tx = await oracleVaultContract.scheduleEmergencyWithdraw(
        scheduleToken,
        scheduleTo,
        parsedAmount,
        scheduleIsEther
      );
      await tx.wait();
      showMessage('scheduleEmergencyWithdraw() success!', 'success');
    } catch (err) {
      console.error('scheduleEmergencyWithdraw error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // 8) cancelEmergencyWithdraw
  const cancelEmergencyWithdraw = async () => {
    if (!oracleVaultContract) return;
    setLoading(true);
    try {
      const tx = await oracleVaultContract.cancelEmergencyWithdraw();
      await tx.wait();
      showMessage('Timelock request canceled.', 'success');
    } catch (err) {
      console.error('cancelEmergencyWithdraw error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // 9) executeEmergencyWithdraw
  const executeEmergencyWithdraw = async () => {
    if (!oracleVaultContract) return;
    setLoading(true);
    try {
      const tx = await oracleVaultContract.executeEmergencyWithdraw();
      await tx.wait();
      showMessage('Emergency withdraw executed!', 'success');
    } catch (err) {
      console.error('executeEmergencyWithdraw error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // 10) setMinStakeAmount
  const updateMinStakeAmount = async () => {
    if (!oracleVaultContract || !newMinStakeAmount) return;
    setLoading(true);
    try {
      const parsedAmt = ethers.utils.parseEther(newMinStakeAmount);
      const tx = await oracleVaultContract.setMinStakeAmount(parsedAmt);
      await tx.wait();
      showMessage(`Min stake amount updated to ${newMinStakeAmount} tokens`, 'success');
    } catch (err) {
      console.error('setMinStakeAmount error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // 11) setYieldVaultAddress
  const updateYieldVaultAddress = async () => {
    if (!oracleVaultContract || !yieldVaultAddr) return;
    setLoading(true);
    try {
      const tx = await oracleVaultContract.setYieldVaultAddress(yieldVaultAddr);
      await tx.wait();
      showMessage(`Updated yieldVaultAddress = ${yieldVaultAddr}`, 'success');
    } catch (err) {
      console.error('setYieldVaultAddress error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // 12) redirectERC20ToYieldVault
  const callRedirectERC20 = async () => {
    if (!oracleVaultContract || !redirectToken) {
      showMessage('Please specify a token address to redirect.', 'error');
      return;
    }
    setLoading(true);
    try {
      const tx = await oracleVaultContract.redirectERC20ToYieldVault(redirectToken);
      await tx.wait();
      showMessage(`Redirected all tokens of ${redirectToken} to yield vault.`, 'success');
    } catch (err) {
      console.error('redirectERC20ToYieldVault error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

  // 13) claimMonthlyAirdropsInRange
  const callClaimAirdropsRange = async () => {
    if (!oracleVaultContract) return;
    if (!airdropStartMonth || !airdropEndMonth) {
      showMessage('Enter valid start/end months.', 'error');
      return;
    }
    setLoading(true);
    try {
      const startM = parseInt(airdropStartMonth, 10);
      const endM = parseInt(airdropEndMonth, 10);

      const tx = await oracleVaultContract.claimMonthlyAirdropsInRange(
        oracleVaultContract.address, // Vault claims on behalf of itself
        startM,
        endM,
        airdropWrap
      );
      await tx.wait();
      showMessage(`Airdrops claimed from month ${startM}..${endM}`, 'success');
    } catch (err) {
      console.error('claimMonthlyAirdropsInRange error:', err);
      showMessage(err.message, 'error');
    }
    setLoading(false);
  };

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
          Admin Panel (Owner Only)
        </Typography>

        {/* Auto-Advance Epoch / Claim & Finalize */}
        <Box mb={2} display="flex" gap={2}>
          <NeonButton onClick={callAutoAdvanceEpoch} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Advance Epoch'}
          </NeonButton>
          <NeonButton onClick={callClaimAndFinalizeAll} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Claim & Finalize All'}
          </NeonButton>
        </Box>

        {/* Pause / Unpause */}
        <Box mb={2} display="flex" gap={2}>
          <NeonButton onClick={callPause} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Pause'}
          </NeonButton>
          <NeonButton onClick={callUnpause} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Unpause'}
          </NeonButton>
        </Box>

        {/* Delegation */}
        <Box mb={2}>
          <Typography variant="subtitle1" sx={{ color: '#fff', mb: 1 }}>
            Delegate WNAT
          </Typography>
          <TextField
            label="Provider"
            variant="outlined"
            size="small"
            value={delegateProvider}
            onChange={(e) => setDelegateProvider(e.target.value)}
            sx={{ mr: 2, mb: 1 }}
            inputProps={{ style: { color: '#fff' } }}
            InputLabelProps={{ style: { color: '#fff' } }}
          />
          <TextField
            label="Bips"
            variant="outlined"
            size="small"
            value={delegateBips}
            onChange={(e) => setDelegateBips(e.target.value)}
            sx={{ mr: 2, mb: 1 }}
            inputProps={{ style: { color: '#fff' } }}
            InputLabelProps={{ style: { color: '#fff' } }}
          />
          <NeonButton onClick={callDelegateWnat} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Delegate'}
          </NeonButton>
        </Box>

        <Box mb={2}>
          <NeonButton onClick={callUndelegateAll} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Undelegate All'}
          </NeonButton>
        </Box>

        {/* Update Minimum Stake */}
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

        {/* setYieldVaultAddress */}
        <Box mb={3}>
          <Typography variant="subtitle1" sx={{ color: '#fff', mb: 1 }}>
            Update Yield Vault Address
          </Typography>
          <TextField
            label="Yield Vault Address"
            variant="outlined"
            size="small"
            value={yieldVaultAddr}
            onChange={(e) => setYieldVaultAddr(e.target.value)}
            sx={{ mr: 2, mb: 1, width: '100%' }}
            inputProps={{ style: { color: '#fff' } }}
            InputLabelProps={{ style: { color: '#fff' } }}
          />
          <NeonButton onClick={updateYieldVaultAddress} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Set Yield Vault'}
          </NeonButton>
        </Box>

        {/* redirectERC20ToYieldVault */}
        <Box mb={3}>
          <Typography variant="subtitle1" sx={{ color: '#fff', mb: 1 }}>
            Redirect ERC20 to Yield Vault
          </Typography>
          <TextField
            label="Token Address"
            variant="outlined"
            size="small"
            value={redirectToken}
            onChange={(e) => setRedirectToken(e.target.value)}
            sx={{ mr: 2, mb: 1, width: '100%' }}
            inputProps={{ style: { color: '#fff' } }}
            InputLabelProps={{ style: { color: '#fff' } }}
          />
          <NeonButton onClick={callRedirectERC20} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Redirect to Vault'}
          </NeonButton>
        </Box>

        {/* Airdrop claims */}
        <Box mt={4}>
          <Typography variant="h6" sx={{ color: '#00bfff', mb: 2 }}>
            Airdrop Claims
          </Typography>
          <Box sx={{ mb: 2 }}>
            <TextField
              label="Start Month"
              variant="outlined"
              size="small"
              value={airdropStartMonth}
              onChange={(e) => setAirdropStartMonth(e.target.value)}
              sx={{ mr: 2, mb: 1, width: 120 }}
              inputProps={{ style: { color: '#fff' } }}
              InputLabelProps={{ style: { color: '#fff' } }}
            />
            <TextField
              label="End Month"
              variant="outlined"
              size="small"
              value={airdropEndMonth}
              onChange={(e) => setAirdropEndMonth(e.target.value)}
              sx={{ mr: 2, mb: 1, width: 120 }}
              inputProps={{ style: { color: '#fff' } }}
              InputLabelProps={{ style: { color: '#fff' } }}
            />
            <Box display="flex" alignItems="center" gap={2} mb={2}>
              <Typography sx={{ color: '#fff' }}>Wrap to wNAT?</Typography>
              <input
                type="checkbox"
                checked={airdropWrap}
                onChange={(e) => setAirdropWrap(e.target.checked)}
              />
            </Box>

            <NeonButton onClick={callClaimAirdropsRange} disabled={loading}>
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Claim Airdrops Range'}
            </NeonButton>
          </Box>
        </Box>

        {/* Timelock (Emergency Withdraw) */}
        <Box mt={4}>
          <Typography variant="h6" sx={{ color: '#00bfff', mb: 2 }}>
            Emergency Withdraw
          </Typography>

          <Typography sx={{ color: '#fff', mb: 2 }}>
            Schedule or manage an emergency withdrawal. (Timelock details not directly readable from contract.)
          </Typography>

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

            <Box mt={2} display="flex" gap={2}>
              <NeonButton onClick={cancelEmergencyWithdraw} disabled={loading}>
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Cancel Timelock'}
              </NeonButton>
              <NeonButton onClick={executeEmergencyWithdraw} disabled={loading}>
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Execute Withdraw'}
              </NeonButton>
            </Box>
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

export default AdminPanel;
