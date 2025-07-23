import React, { useContext, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  Card,
  CardContent,
  Snackbar,
  Alert,
  styled,
  LinearProgress,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Paper,
  Select,
  MenuItem
} from '@mui/material';
import { ethers } from 'ethers';
import { BlockchainContext } from '../../contexts/BlockchainContext';

/* 
  ================================
  =  0. Utility & Styled Helpers =
  ================================
*/

/** formatSeconds: converts raw seconds -> "DDd HHh MMm SSs" */
function formatSeconds(totalSeconds) {
  let s = Number(totalSeconds);
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  s = s % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

// For label & value styling in the table
const TableLabel = styled(Typography)(() => ({
  color: '#fff',
  fontSize: '0.9rem'
}));

const TableValue = styled(Typography)(() => ({
  color: '#00bfff',
  fontSize: '0.9rem'
}));

/**
 * Placeholder USD rate for the reward token—could fetch from an API
 * or keep as a user-settable parameter.
 */
const DEFAULT_USD_RATE = 0.5; // e.g. 1 FOTON = $0.50

/* 
  ===================
  =  Main Component =
  ===================
*/

export default function LPStakingPage() {
  const { account, lpStakingContract, signer, provider } = useContext(BlockchainContext);

  // Loading states
  const [loading, setLoading] = useState(false);

  // For deposit/withdraw form inputs
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  // On-chain user data
  // userStaked: how many tokens user has staked
  // userRewardDebt: internal accounting (not displayed directly)
  // userPendingReward: how many tokens are ready to claim
  const [userStaked, setUserStaked] = useState('0');
  const [userPendingReward, setUserPendingReward] = useState('0');

  // The user’s wallet balance of the staking token
  const [userWalletBalance, setUserWalletBalance] = useState('0');

  // On-chain global data
  const [globalData, setGlobalData] = useState(null); // from getAllGlobalData()
  // The contract’s baseRewardRate, totalStaked, etc. for internal usage
  const [baseRewardRate, setBaseRewardRate] = useState('0');
  const [totalStaked, setTotalStaked] = useState('0');

  // Admin / Owner check
  const [isOwner, setIsOwner] = useState(false);

  // Table page handling (like the NFT version)
  const [tablePage, setTablePage] = useState(1);
  const totalPages = 3;

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const handleCloseSnackbar = () => setSnackbar((prev) => ({ ...prev, open: false }));
  const showMessage = (msg, severity = 'info') => {
    setSnackbar({ open: true, message: msg, severity });
  };

  // We’ll keep a placeholder for the token’s USD rate
  const [usdRate] = useState(DEFAULT_USD_RATE);

  //======================== LOAD DATA ========================
  async function loadData() {
    if (!account || !lpStakingContract) return;
    setLoading(true);

    try {
      // 1) Global data (epoch info, budgets, etc.)
      const global = await lpStakingContract.getAllGlobalData();
      /* getAllGlobalData returns:
         [ baseRewardRate, totalStaked, accRewardPerShare, lastRewardTimestamp,
           totalRemaining, epochBudget, epochEndTimestamp, currentEpoch,
           secondsUntilEpochEnd
         ]
      */
      const [
        _baseRewardRate,
        _totalStaked,
        _accRewardPerShare,
        _lastRewardTimestamp,
        _totalRemaining,
        _epochBudget,
        _epochEndTimestamp,
        _currentEpoch,
        _secondsUntilEpochEnd
      ] = global;

      setGlobalData({
        baseRewardRate: _baseRewardRate,
        totalStaked: _totalStaked,
        accRewardPerShare: _accRewardPerShare,
        lastRewardTimestamp: _lastRewardTimestamp,
        totalRemaining: _totalRemaining,
        epochBudget: _epochBudget,
        epochEndTimestamp: _epochEndTimestamp,
        currentEpoch: _currentEpoch,
        secondsUntilEpochEnd: _secondsUntilEpochEnd
      });

      setBaseRewardRate(_baseRewardRate.toString());
      setTotalStaked(_totalStaked.toString());

      // 2) getAllDataForUser => returns (userStakedAmount, userRewardDebt, userPendingReward)
      const userData = await lpStakingContract.getAllDataForUser(account);
      // userData = [ userStakedAmount, userRewardDebt, userPendingReward ]
      setUserStaked(userData[0].toString());
      setUserPendingReward(userData[2].toString());

      // 3) Check if user is the owner
      const ownerAddr = await lpStakingContract.owner();
      setIsOwner(ownerAddr.toLowerCase() === account.toLowerCase());

      // 4) Check user’s wallet balance of the staking token
      const stakingTokenAddr = await lpStakingContract.stakingToken();
      if (stakingTokenAddr) {
        const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
        const stakingToken = new ethers.Contract(stakingTokenAddr, erc20Abi, provider);
        const balBN = await stakingToken.balanceOf(account);
        setUserWalletBalance(balBN.toString());
      }
    } catch (err) {
      console.error('loadData error:', err);
      showMessage(`Error loading data: ${err.message}`, 'error');
    }

    setLoading(false);
  }

  // Initial load
  useEffect(() => {
    if (account && lpStakingContract) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, lpStakingContract]);

  //======================== USER ACTIONS ========================
  const handleClaimRewards = async () => {
    try {
      setLoading(true);
      const tx = await lpStakingContract.claimRewards();
      await tx.wait();
      showMessage('Rewards claimed successfully!', 'success');
      await loadData();
    } catch (err) {
      console.error('claimRewards:', err);
      showMessage(`Error claiming rewards: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!depositAmount || Number(depositAmount) <= 0) {
      showMessage('Please enter a valid amount to deposit.', 'warning');
      return;
    }
    try {
      setLoading(true);

      // 1) We need to ensure approval for the staking token
      const stakingTokenAddr = await lpStakingContract.stakingToken();
      const erc20Abi = [
        'function balanceOf(address) view returns (uint256)',
        'function allowance(address,address) view returns (uint256)',
        'function approve(address spender, uint256 amount) external returns (bool)'
      ];
      const stakingToken = new ethers.Contract(stakingTokenAddr, erc20Abi, signer);

      // Check allowance
      const allowance = await stakingToken.allowance(account, lpStakingContract.address);
      const depositWei = ethers.utils.parseEther(depositAmount);

      if (allowance.lt(depositWei)) {
        const approveTx = await stakingToken.approve(lpStakingContract.address, depositWei);
        await approveTx.wait();
      }

      // 2) deposit to the contract
      const tx = await lpStakingContract.deposit(depositWei);
      await tx.wait();

      showMessage('Deposit successful!', 'success');
      setDepositAmount('');
      await loadData();
    } catch (err) {
      console.error('handleDeposit:', err);
      showMessage(`Error in deposit: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || Number(withdrawAmount) <= 0) {
      showMessage('Please enter a valid amount to withdraw.', 'warning');
      return;
    }
    try {
      setLoading(true);

      // Convert user’s input to Wei
      const withdrawWei = ethers.utils.parseEther(withdrawAmount);
      const tx = await lpStakingContract.withdraw(withdrawWei);
      await tx.wait();

      showMessage('Withdraw successful!', 'success');
      setWithdrawAmount('');
      await loadData();
    } catch (err) {
      console.error('handleWithdraw:', err);
      showMessage(`Error in withdraw: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  //======================== DERIVED DATA ========================
  let userSharePercent = 0;
  let userRatePerSecond = 0;
  let userRatePerDay = 0;
  let userRatePerYear = 0;
  let epochProgressPercent = 0;
  const totalSecInEpoch = 365 * 24 * 3600; // 1 year

  if (globalData) {
    // share of pool = userStaked / totalStaked
    const ts = Number(ethers.utils.formatEther(globalData.totalStaked || 0));
    const us = Number(ethers.utils.formatEther(userStaked));

    if (ts > 0) {
      userSharePercent = (us / ts) * 100;
    }

    // user’s fraction of baseRewardRate
    const fraction = ts > 0 ? us / ts : 0;
    const baseRateNum = Number(ethers.utils.formatEther(globalData.baseRewardRate || 0));
    userRatePerSecond = fraction * baseRateNum;
    userRatePerDay = userRatePerSecond * 86400;
    userRatePerYear = userRatePerSecond * 31536000;

    // epoch progress
    const leftover = Number(globalData.secondsUntilEpochEnd);
    const elapsed = totalSecInEpoch - leftover;
    if (elapsed <= 0) {
      epochProgressPercent = leftover <= 0 ? 100 : 0; // If leftover negative => epoch is done
    } else {
      epochProgressPercent = (elapsed / totalSecInEpoch) * 100;
    }
  }

  const dailyUsd = userRatePerDay * usdRate;
  const yearlyUsd = userRatePerYear * usdRate;

  //======================== TABLE DATA (3 PAGES) ========================
  // page1 -> [ Pending Rewards, Share of Pool, FOTON/sec, FOTON/day ]
  // page2 -> [ Current Epoch, Epoch Budget, Epoch Ends In, Remaining, Epoch Progress ]
  // page3 -> [ Base Reward Rate, Total Staked, User Staked, Your FOTON/year ]
  const page1Rows = [
    {
      label: 'Pending Rewards',
      value: `${parseFloat(ethers.utils.formatEther(userPendingReward)).toFixed(5)} FOTON`
    },
    {
      label: 'Share of Pool (%)',
      value: `${userSharePercent.toFixed(2)}%`
    },
    {
      label: 'FOTON/sec',
      value: userRatePerSecond.toFixed(5)
    },
    {
      label: 'FOTON/day',
      value: userRatePerDay.toFixed(5)
    }
  ];

  const page2Rows = globalData
    ? [
        {
          label: 'Current Epoch',
          value: globalData.currentEpoch.toString()
        },
        {
          label: 'Epoch Budget',
          value:
            parseFloat(ethers.utils.formatEther(globalData.epochBudget)).toFixed(5) + ' FOTON'
        },
        {
          label: 'Epoch Ends In',
          value: formatSeconds(globalData.secondsUntilEpochEnd.toString())
        },
        {
          label: 'Total Remaining Balance',
          value:
            parseFloat(ethers.utils.formatEther(globalData.totalRemaining)).toFixed(5) + ' FOTON'
        },
        {
          label: 'Epoch Progress (%)',
          value: `${epochProgressPercent.toFixed(2)}%`,
          isProgressBar: true
        }
      ]
    : [];

  const page3Rows = globalData
    ? [
        {
          label: 'Base Reward Rate (FOTON/sec)',
          value: parseFloat(
            ethers.utils.formatEther(globalData.baseRewardRate)
          ).toFixed(10)
        },
        {
          label: 'Total Staked (LP)',
          value: parseFloat(ethers.utils.formatEther(globalData.totalStaked)).toFixed(5)
        },
        {
          label: 'User Staked (LP)',
          value: parseFloat(ethers.utils.formatEther(userStaked)).toFixed(5)
        },
        {
          label: 'Your FOTON/year',
          value: userRatePerYear.toFixed(3)
        }
      ]
    : [];

  let displayedRows = [];
  if (tablePage === 1) displayedRows = page1Rows;
  if (tablePage === 2) displayedRows = page2Rows;
  if (tablePage === 3) displayedRows = page3Rows;

  //======================== RENDER ========================
  if (!account || !lpStakingContract) {
    return (
      <Box sx={{ color: '#fff', textAlign: 'center', mt: 4 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Please connect your wallet to view LP Staking.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1 }}>
      {loading ? (
        <CircularProgress sx={{ color: '#00bfff', my: 4 }} />
      ) : (
        <>
          {/* ==================== DASHBOARD TABLE (PAGINATED) ==================== */}
          {globalData && (
            <Box
              sx={{
                p: 2,
                backgroundColor: '#2a2a2a',
                borderRadius: 2,
                boxShadow: '0 0 10px rgba(0,191,255,0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                mb: 3
              }}
            >
              {/* Row: Claim button top-left */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Button
                  variant="contained"
                  sx={{ backgroundColor: '#00bfff', color: '#fff' }}
                  onClick={handleClaimRewards}
                  disabled={loading}
                >
                  Claim Rewards
                </Button>
              </Box>

              {/* Table with pagination (3 pages) */}
              <TableContainer component={Paper} sx={{ backgroundColor: '#1e1e1e' }}>
                <Table>
                  <TableBody>
                    {displayedRows.map((row, idx) => (
                      <TableRow key={`dashboard-row-${idx}`}>
                        <TableCell>
                          <TableLabel>{row.label}</TableLabel>
                        </TableCell>
                        <TableCell>
                          {row.isProgressBar ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <TableValue>{row.value}</TableValue>
                              <LinearProgress
                                variant="determinate"
                                value={epochProgressPercent}
                                sx={{ backgroundColor: '#444' }}
                              />
                            </Box>
                          ) : (
                            <TableValue>{row.value}</TableValue>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Table pagination controls */}
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1 }}>
                <Button
                  variant="outlined"
                  sx={{ color: '#fff', borderColor: '#00bfff' }}
                  disabled={tablePage <= 1}
                  onClick={() => setTablePage((prev) => prev - 1)}
                >
                  Prev
                </Button>
                <Typography sx={{ color: '#fff' }}>
                  Page {tablePage} of {totalPages}
                </Typography>
                <Button
                  variant="outlined"
                  sx={{ color: '#fff', borderColor: '#00bfff' }}
                  disabled={tablePage >= totalPages}
                  onClick={() => setTablePage((prev) => prev + 1)}
                >
                  Next
                </Button>
              </Box>
            </Box>
          )}

          {/* ==================== STAKING ACTIONS ==================== */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              gap: 3,
              mb: 3
            }}
          >
            {/* Deposit (Stake) Section */}
            <Card
              sx={{
                flex: 1,
                backgroundColor: '#1b1b1b',
                color: '#fff',
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 2
              }}
            >
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Deposit LP Tokens
                </Typography>
                <Typography variant="body2" sx={{ color: '#ccc', mb: 1 }}>
                  Your Wallet Balance: {parseFloat(ethers.utils.formatEther(userWalletBalance)).toFixed(5)} LP
                </Typography>
                <TextField
                  label="Amount to Deposit"
                  variant="outlined"
                  size="small"
                  fullWidth
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  sx={{ input: { color: '#fff' }, mb: 2, backgroundColor: '#2a2a2a' }}
                  InputLabelProps={{ style: { color: '#ccc' } }}
                />
                <Button
                  variant="contained"
                  sx={{ backgroundColor: '#00bfff', color: '#fff' }}
                  onClick={handleDeposit}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Deposit'}
                </Button>
              </CardContent>
            </Card>

            {/* Withdraw (Unstake) Section */}
            <Card
              sx={{
                flex: 1,
                backgroundColor: '#1b1b1b',
                color: '#fff',
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 2
              }}
            >
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Withdraw LP Tokens
                </Typography>
                <Typography variant="body2" sx={{ color: '#ccc', mb: 1 }}>
                  Your Staked Balance: {parseFloat(ethers.utils.formatEther(userStaked)).toFixed(5)} LP
                </Typography>
                <TextField
                  label="Amount to Withdraw"
                  variant="outlined"
                  size="small"
                  fullWidth
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  sx={{ input: { color: '#fff' }, mb: 2, backgroundColor: '#2a2a2a' }}
                  InputLabelProps={{ style: { color: '#ccc' } }}
                />
                <Button
                  variant="contained"
                  sx={{ backgroundColor: '#00bfff', color: '#fff' }}
                  onClick={handleWithdraw}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Withdraw'}
                </Button>
              </CardContent>
            </Card>
          </Box>
        </>
      )}

      {/* SNACKBAR */}
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
    </Box>
  );
}
