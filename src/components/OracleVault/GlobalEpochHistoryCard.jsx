import React, { useContext, useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Table,
  TableHead,
  TableRow,
  Tooltip,
  TableCell,
  TableBody,
  CircularProgress,
  Snackbar,
  Alert,
  Stack,
  Checkbox,
  FormControlLabel,
  useTheme,
  useMediaQuery,
  Container
} from '@mui/material';
import { ethers } from 'ethers';
import NeonButton from '../NeonButton';

import InfoIcon from '@mui/icons-material/Info';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

import { BlockchainContext } from '../../contexts/BlockchainContext';

// Minimal RewardManager ABI (for claimable range)
const rewardManagerABI = [
  'function getRewardEpochIdsWithClaimableRewards() external view returns (uint24, uint24)'
];

// Table & chart config
const MAX_EPOCHS_TO_SHOW = 26; // Show up to 26 epochs
const EPOCHS_PER_PAGE = 5;     // 5 items per page in the table

export default function EpochHistoryCard() {
  const { oracleVaultContract, provider } = useContext(BlockchainContext);

  // --------------------------- 1) State: Vault Stats
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const [currentEpochId, setCurrentEpochId] = useState('0');
  const [lastFinalizedEpochId, setLastFinalizedEpochId] = useState('0');
  const [lastDelegationEpochClaimed, setLastDelegationEpochClaimed] = useState('0');
  const [totalActiveStake, setTotalActiveStake] = useState('0');
  const [totalDelegationRewards, setTotalDelegationRewards] = useState('0');
  const [wnatBalanceInVault, setWnatBalanceInVault] = useState('0');

  const [pendingStakersCount, setPendingStakersCount] = useState('0');
  const [lastForgottenEpoch, setLastForgottenEpoch] = useState('0');
  const [canAdvanceEpochNow, setCanAdvanceEpochNow] = useState(false);
  const [currentFlareEpoch, setCurrentFlareEpoch] = useState('0');

  const [claimableRangeStart, setClaimableRangeStart] = useState('0');
  const [claimableRangeEnd, setClaimableRangeEnd] = useState('0');
  const [vaultUnclaimed, setVaultUnclaimed] = useState('0');
  const [claimableEpochsList, setClaimableEpochsList] = useState('');

  // --------------------------- 2) State: Chart & Table
  const [startEpoch, setStartEpoch] = useState(0);
  const [endEpoch, setEndEpoch] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pagesCache, setPagesCache] = useState({});
  const [tableData, setTableData] = useState([]);

  // The chart data
  const [chartData, setChartData] = useState([]);
  // Toggles for the chart lines
  const [showTotalClaimed, setShowTotalClaimed] = useState(true);
  const [showEpochClaimed, setShowEpochClaimed] = useState(true);

  // --------------------------- 3) Snackbar for messages
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const showMessage = (msg, severity = 'info') =>
    setSnackbar({ open: true, message: msg, severity });
  const handleCloseSnackbar = () => setSnackbar((prev) => ({ ...prev, open: false }));

  // Responsive
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // ----------------------------------------------------------------
  // 1) Vault Status
  // ----------------------------------------------------------------
  const fetchVaultStatus = async () => {
    if (!oracleVaultContract) return;
    try {
      const resp = await oracleVaultContract.getGlobalVaultData();
      const { vaultData } = resp;

      setCurrentEpochId(vaultData.currentEpochId.toString());
      setLastFinalizedEpochId(vaultData.lastFinalizedEpochId.toString());
      setLastDelegationEpochClaimed(vaultData.lastDelegationEpochClaimed.toString());
      setTotalActiveStake(ethers.utils.formatEther(vaultData.totalActiveStake));
      setTotalDelegationRewards(ethers.utils.formatEther(vaultData.totalDelegationRewards));
      setWnatBalanceInVault(ethers.utils.formatEther(vaultData.wnatBalanceInVault));

      setCurrentFlareEpoch(vaultData.managerCurrentEpoch.toString());
      setPendingStakersCount(vaultData.pendingStakersCount.toString());
      setLastForgottenEpoch(vaultData.lastForgottenEpoch.toString());

      const canAdvance = vaultData.allRewardsClaimed && vaultData.allStakersActivated;
      setCanAdvanceEpochNow(canAdvance);
    } catch (err) {
      console.error('Error calling getGlobalVaultData:', err);
      showMessage('Could not load global vault data.', 'error');
      setError(true);
    }
  };

  const fetchClaimableRangeAndUnclaimed = async () => {
    if (!oracleVaultContract || !provider) return;
    try {
      const rewardManagerAddress = await oracleVaultContract.rewardManager();
      const rmContract = new ethers.Contract(rewardManagerAddress, rewardManagerABI, provider);

      const [start, end] = await rmContract.getRewardEpochIdsWithClaimableRewards();
      setClaimableRangeStart(start.toString());
      setClaimableRangeEnd(end.toString());

      if (start <= end) {
        const unclaimedEpochsData = await oracleVaultContract.getRewardManagerUnclaimedEpochsData(
          oracleVaultContract.address,
          start,
          end
        );

        let totalUnclaimedForVault = ethers.BigNumber.from(0);
        const epochIds = [];

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
        setClaimableEpochsList('');
      }
    } catch (err) {
      console.error('Could not read claimable range/unclaimed data:', err);
    }
  };

  // ----------------------------------------------------------------
  // 2) Chart & Table aggregator
  // ----------------------------------------------------------------
  const initEpochRange = async () => {
    if (!oracleVaultContract) return;
    try {
      const resp = await oracleVaultContract.getGlobalVaultData();
      const { vaultData } = resp;
      const currentEpoch = Number(vaultData.currentEpochId);

      if (currentEpoch < 1) {
        setStartEpoch(0);
        setEndEpoch(0);
        setTableData([]);
        setTotalPages(1);
        return;
      }

      // Subtract 1 so the table ends one epoch earlier
      let end = currentEpoch - 1;
      if (end < 1) {
        end = 1;
      }

      let start = end > MAX_EPOCHS_TO_SHOW - 1 ? end - (MAX_EPOCHS_TO_SHOW - 1) : 1;

      setStartEpoch(start);
      setEndEpoch(end);

      const count = end - start + 1;
      const pages = Math.ceil(count / EPOCHS_PER_PAGE);
      setTotalPages(pages);
      setCurrentPage(1);
      setPagesCache({});
      setTableData([]);
    } catch (err) {
      console.error('initEpochRange error:', err);
      setError(true);
    }
  };

  // Retrieves aggregator data across [lowest..highest]
  const fetchEpochDataRange = async (lowest, highest) => {
    if (!oracleVaultContract) return [];
    try {
      const rawArray = await oracleVaultContract.getGlobalDataAcrossEpochs(lowest, highest);
      const mapById = {};
      rawArray.forEach((item) => {
        const eid = Number(item.epochId);
        mapById[eid] = item;
      });

      const result = [];
      for (let e = highest; e >= lowest; e--) {
        if (mapById[e]) {
          result.push(mapById[e]);
        } else {
          // zero fill if aggregator has no record
          result.push({
            epochId: ethers.BigNumber.from(e),
            epochTotalStake: ethers.constants.Zero,
            epochAccRewardPerShare: ethers.constants.Zero,
            epochAccFotonRewardPerShare: ethers.constants.Zero,
            epochLastDelegRewards: ethers.constants.Zero,
            epochLastFotonRewards: ethers.constants.Zero,
            isFinalized: false
          });
        }
      }
      return result;
    } catch (err) {
      console.error('fetchEpochDataRange error:', err);
      showMessage('Error fetching global epoch data. Check console.', 'error');
      setError(true);
      return [];
    }
  };

  const fetchDataForPage = async (page) => {
    if (!oracleVaultContract || startEpoch === 0 || endEpoch === 0) return;
    try {
      const offset = (page - 1) * EPOCHS_PER_PAGE;
      let highest = endEpoch - offset;
      let lowest = highest - (EPOCHS_PER_PAGE - 1);

      if (lowest < startEpoch) lowest = startEpoch;
      if (lowest > highest) {
        setTableData([]);
        return;
      }

      // If we have a cached page, use it
      if (pagesCache[page]) {
        setTableData(pagesCache[page]);
        return;
      }

      // Otherwise, fetch aggregator data for [lowest..highest]
      const chunk = await fetchEpochDataRange(lowest, highest);
      const newCache = { ...pagesCache, [page]: chunk };
      setPagesCache(newCache);
      setTableData(chunk);
    } catch (err) {
      console.error('fetchDataForPage error:', err);
      setError(true);
    }
  };

  // For the chart, we want "totalClaimed" (the aggregator field is epochLastDelegRewards as a running sum)
  // and "epochClaimed" (the difference from the previous row).
  const fetchChartData = async () => {
    if (!oracleVaultContract) return;
    try {
      const resp = await oracleVaultContract.getGlobalVaultData();
      const { vaultData } = resp;
      const currentEp = Number(vaultData.currentEpochId);

      if (currentEp < 1) {
        setChartData([]);
        return;
      }

      // We'll fetch aggregator for up to 26 epochs
      let start = currentEp > MAX_EPOCHS_TO_SHOW - 1 ? currentEp - (MAX_EPOCHS_TO_SHOW - 1) : 1;

      // We'll fetch [start..currentEp], but we'll skip the 'currentEp' itself
      // if we want the same logic as the table that shows currentEp-1.
      const rawArray = await oracleVaultContract.getGlobalDataAcrossEpochs(start, currentEp);

      const mapById = {};
      rawArray.forEach((item) => {
        const e = Number(item.epochId);
        mapById[e] = item;
      });

      const descendingList = [];
      for (let e = currentEp - 1; e >= start; e--) {
        if (mapById[e]) {
          descendingList.push(mapById[e]);
        } else {
          descendingList.push({
            epochId: ethers.BigNumber.from(e),
            epochTotalStake: ethers.constants.Zero,
            epochAccRewardPerShare: ethers.constants.Zero,
            epochAccFotonRewardPerShare: ethers.constants.Zero,
            epochLastDelegRewards: ethers.constants.Zero,
            epochLastFotonRewards: ethers.constants.Zero,
            isFinalized: false
          });
        }
      }

      // reverse ascending so it's easier to do the delta
      const ascendingList = [...descendingList].reverse();

      // Compute 'totalClaimed' from epochLastDelegRewards, then 'epochClaimed' as a difference
      // from the prior row in ascending order.
      let prevValue = 0;
      const chartPoints = ascendingList.map((row) => {
        const eId = Number(row.epochId);
        const totalClaimedFloat = parseFloat(
          ethers.utils.formatEther(row.epochLastDelegRewards)
        );

        // difference from previous "totalClaimed"
        const epochClaimedFloat = totalClaimedFloat - prevValue;
        prevValue = totalClaimedFloat;

        return {
          epoch: eId,
          totalClaimed: totalClaimedFloat,
          epochClaimed: epochClaimedFloat
        };
      });

      // Re-sort descending if you prefer the highest epoch on the left
      // but we typically want ascending along the X-axis
      // so we'll keep ascending by epoch:
      setChartData(chartPoints);
    } catch (err) {
      console.error('fetchChartData error:', err);
      showMessage('Error reading global epoch data for chart. Check console.', 'error');
      setError(true);
    }
  };

  // ----------------------------------------------------------------
  // 3) Lifecycle
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!oracleVaultContract) return;
    setLoading(true);
    setError(false);

    const loadAll = async () => {
      await fetchVaultStatus();
      await fetchClaimableRangeAndUnclaimed();
      await initEpochRange();
      await fetchChartData();
      setLoading(false);
    };
    loadAll();
  }, [oracleVaultContract]);

  useEffect(() => {
    if (startEpoch > 0 && endEpoch >= startEpoch) {
      fetchDataForPage(currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startEpoch, endEpoch, currentPage]);

  // ----------------------------------------------------------------
  // 4) Building the "Vault Stats"
  // ----------------------------------------------------------------
  const vaultAdvanceStateMsg = canAdvanceEpochNow
    ? 'Vault is ready to finalize an epoch.'
    : 'Vault is waiting / cannot advance now.';

  const allStats = [
    { label: 'Vault WFLR Balance', value: Number(wnatBalanceInVault).toLocaleString(), tooltip: 'The vault’s current WFLR holdings.' },
    { label: 'Current Epoch ID', value: currentEpochId, tooltip: 'The latest local epoch index in the vault.' },
    { label: 'Last Finalized Epoch ID', value: lastFinalizedEpochId, tooltip: 'The most recent local epoch that has been fully finalized.' },
    { label: 'Total Active Stake', value: Number(totalActiveStake).toLocaleString(), tooltip: 'Sum of all actively staked FOTON in the vault.' },
    { label: 'Current Flare Epoch', value: currentFlareEpoch, tooltip: 'The current reward epoch from the Flare network.' },
    { label: 'Last Delegation Epoch Claimed', value: lastDelegationEpochClaimed, tooltip: 'The last epoch for which delegation rewards have been claimed.' },
    { label: 'Pending Stakers', value: pendingStakersCount, tooltip: 'Number of stakers in the pending queue.' },
    { label: 'Last Forgotten Epoch', value: lastForgottenEpoch, tooltip: 'The oldest epoch that was pruned / forcibly removed from memory.' },
    { label: 'Advance State', value: vaultAdvanceStateMsg, tooltip: 'Whether the vault can currently finalize a new epoch.' },
    { label: 'Claimable Flare Epoch Range', value: `${claimableRangeStart} ... ${claimableRangeEnd}`, tooltip: 'Range of Flare epochs currently claimable by the vault.' },
    { label: 'Vault Unclaimed WFLR', value: Number(vaultUnclaimed).toLocaleString(undefined, { minimumFractionDigits: 2 }), tooltip: 'Total WFLR still unclaimed by this vault in claimable epochs.' },
    { label: 'Claimable Epoch IDs', value: claimableEpochsList || '(none)', tooltip: 'Specific epochs claimable for the vault right now.' },
    { label: 'Total Delegation Rewards', value: Number(totalDelegationRewards).toLocaleString(), tooltip: 'Total WFLR rewards earned from delegation so far.' }
  ];

  const STATS_PER_PAGE = 4;
  const statsPages = Math.ceil(allStats.length / STATS_PER_PAGE);
  const [statsPage, setStatsPage] = useState(1);
  const statsIndexOfLast = statsPage * STATS_PER_PAGE;
  const statsIndexOfFirst = statsIndexOfLast - STATS_PER_PAGE;
  const currentStats = allStats.slice(statsIndexOfFirst, statsIndexOfLast);

  // ----------------------------------------------------------------
  // 5) Rendering
  // ----------------------------------------------------------------
  return (
    <Container maxWidth="md" sx={{ p: { xs: 1, md: 3 } }}>
      <Card
        sx={{
          backgroundColor: '#1e1e1e',
          maxWidth: isMobile ? '330px' : '900px',
          minWidth: isMobile ? '240px' : '600px',
          width: '100%',
          mx: 'auto',
          my: 2,
          borderRadius: '15px',
          boxShadow: '0 0 20px 5px rgba(0, 191, 255, 0.6)',
          overflowX: 'hidden'
        }}
      >
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" mb={3}>
              <CircularProgress sx={{ color: '#00bfff' }} />
            </Box>
          ) : error ? (
            <Typography variant="body2" color="error" textAlign="center" mb={3}>
              Failed to load vault data or epoch data.
            </Typography>
          ) : (
            <>
              {/* ---- Vault Stats Grid ---- */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: isMobile
                    ? '1fr'
                    : 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: 2,
                  mb: 2
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
                      <Box display="flex" justifyContent="center" alignItems="center">
                        {stat.label}
                        <Tooltip title={stat.tooltip} arrow>
                          <InfoIcon
                            sx={{ ml: 0.5, fontSize: 16, color: '#aaa', cursor: 'pointer' }}
                          />
                        </Tooltip>
                      </Box>
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#fff' }}>
                      {stat.value}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {/* Stats pagination */}
              <Box display="flex" justifyContent="center" mb={4}>
                <NeonButton
                  onClick={() => setStatsPage((prev) => Math.max(prev - 1, 1))}
                  disabled={statsPage === 1}
                  sx={{ mr: '8px' }}
                >
                  Prev
                </NeonButton>
                <NeonButton
                  onClick={() => setStatsPage((prev) => Math.min(prev + 1, statsPages))}
                  disabled={statsPage === statsPages}
                >
                  Next
                </NeonButton>
              </Box>

              {/* Chart Toggles */}
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  mb: 2
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showTotalClaimed}
                      onChange={(e) => setShowTotalClaimed(e.target.checked)}
                      style={{ color: '#00bfff' }}
                    />
                  }
                  label="Total Claimed"
                  sx={{ color: '#fff' }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showEpochClaimed}
                      onChange={(e) => setShowEpochClaimed(e.target.checked)}
                      style={{ color: '#ffd700' }}
                    />
                  }
                  label="Epoch Claimed"
                  sx={{ color: '#fff' }}
                />
              </Box>

              {/* Chart */}
              {chartData.length === 0 ? (
                <Typography variant="body2" color="#fff" textAlign="center" mb={2}>
                  No data to display for the chart.
                </Typography>
              ) : (
                <Box sx={{ width: '100%', height: isMobile ? 250 : 400, mb: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 10, right: 25, left: 25, bottom: 10 }}
                    >
                      {/* Improve tick positions */}
                      <CartesianGrid strokeDasharray="2 2" stroke="#666" />
                      <XAxis
                        dataKey="epoch"
                        type="number"
                        interval={4}
                        allowDecimals={false}
                        scale="linear"
                        domain={['dataMin', 'dataMax']}
                        tick={{ fill: '#ccc', fontSize: 12 }}
                        stroke="#ccc"
                      />
                      {/* Y-axes for each line */}
                      <YAxis
                        yAxisId="left"
                        stroke="#00bfff"
                        tick={{ fill: '#ccc', fontSize: 12 }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#ffd700"
                        tick={{ fill: '#ccc', fontSize: 12 }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: '#2a2a2a',  // dark background
                          borderColor: '#ccc',        // border color
                        }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Legend />

                      {showTotalClaimed && (
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="totalClaimed"
                          stroke="#00bfff"
                          name="Tot. Claimed"
                          dot={false}
                        />
                      )}
                      {showEpochClaimed && (
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="epochClaimed"
                          stroke="#ffd700"
                          name="Epoch Claimed"
                          dot={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              )}

              {/* Table */}
              {tableData.length === 0 ? (
                <Typography variant="body2" color="#fff" textAlign="center">
                  No epochs in table.
                </Typography>
              ) : (
                <>
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table
                      sx={{
                        minWidth: isMobile ? '150px' : '200px',
                        width: '100%'
                      }}
                      size="small"
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ color: '#00bfff' }}>Epoch</TableCell>
                          {/* "Tot. Claimed" = aggregator's running total */}
                          <TableCell sx={{ color: '#00bfff' }}>Tot. Claimed</TableCell>
                          {/* "Epoch Claimed" = difference from the previous row */}
                          <TableCell sx={{ color: '#00bfff' }}>Epoch Claimed</TableCell>
                          <TableCell sx={{ color: '#00bfff' }}>Finalized</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {tableData.map((row, idx) => {
                          const displayedEpoch = Number(row.epochId);

                          // aggregator's "running total" for claimed WFLR
                          const totalClaimFloat = parseFloat(
                            ethers.utils.formatEther(row.epochLastDelegRewards)
                          );
                          const totalClaimEth = totalClaimFloat.toFixed(2);

                          // "epoch claimed" = difference from next row (since tableData is descending)
                          let epochClaimed = 0;
                          if (idx < tableData.length - 1) {
                            const prevFloat = parseFloat(
                              ethers.utils.formatEther(tableData[idx + 1].epochLastDelegRewards)
                            );
                            epochClaimed = totalClaimFloat - prevFloat;
                          }
                          const epochClaimedEth = epochClaimed.toFixed(2);

                          const finalized = row.isFinalized ? 'Yes' : 'No';

                          return (
                            <TableRow key={idx}>
                              <TableCell sx={{ color: '#fff' }}>
                                {displayedEpoch}
                              </TableCell>
                              <TableCell sx={{ color: '#fff' }}>
                                {totalClaimEth}
                              </TableCell>
                              <TableCell sx={{ color: '#fff' }}>
                                {epochClaimedEth}
                              </TableCell>
                              <TableCell
                                sx={{ color: row.isFinalized ? '#0f0' : '#ff4444' }}
                              >
                                {finalized}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Box>

                  {/* Table pagination */}
                  <Stack direction="row" spacing={2} justifyContent="center" mt={2}>
                    <NeonButton
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      Prev
                    </NeonButton>
                    <NeonButton
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </NeonButton>
                  </Stack>
                  <Typography variant="body2" color="#fff" textAlign="center" mt={1}>
                    Page {currentPage} of {totalPages}
                  </Typography>
                </>
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
    </Container>
  );
}
