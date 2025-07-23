import React, { useContext, useEffect, useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Snackbar,
  Alert,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import NeonButton from '../NeonButton';
import { BlockchainContext } from '../../contexts/BlockchainContext';
import { ethers } from 'ethers';
import { useTheme, useMediaQuery } from '@mui/material';

// For the chart
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend
} from 'recharts';

const MAX_EPOCHS_TO_SHOW = 26;
const EPOCHS_PER_PAGE = 5;

/**
 * Props
 * ──────────────────────────────────────────
 * ► vault    – a connected YieldVault contract instance (v1 or v2)
 * ► version  – optional string just for display logic
 */
const YV_GlobalEpochHistoryMerged = ({ vault, version = 'v1' }) => {
  const {} = useContext(BlockchainContext); // Keep for potential future usage

  // Basic states
  const [loading, setLoading] = useState(false);
  const [errorLoading, setErrorLoading] = useState(false);

  // Range info for the paginated table
  const [startEpoch, setStartEpoch] = useState(0);
  const [endEpoch, setEndEpoch] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Table data
  const [tableData, setTableData] = useState([]);
  const [pagesCache, setPagesCache] = useState({}); // to cache each page's data

  // Token aggregator data
  const [tokenData, setTokenData] = useState([]);

  // Chart data
  const [chartData, setChartData] = useState([]);
  const [showTotalStake, setShowTotalStake] = useState(true);

  // For notifications
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const handleCloseSnackbar = () => setSnackbar((prev) => ({ ...prev, open: false }));
  const showMessage = (msg, severity = 'info') =>
    setSnackbar({ open: true, message: msg, severity });

  // Mobile detection
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // ---------------------------
  // 1) Initialize range & fetch aggregator tokens
  // ---------------------------
  const initEpochRange = async () => {
    if (!vault) return;
    setLoading(true);
    setErrorLoading(false);

    try {
      // getGlobalVaultData => [vaultData, rewardTokenData]
      const [vaultData, rewardTknData] = await vault.getGlobalVaultData();
      setTokenData(rewardTknData || []);

      const currentEpoch = vaultData.currentEpochId.toNumber
        ? vaultData.currentEpochId.toNumber()
        : parseInt(vaultData.currentEpochId, 10);

      if (currentEpoch < 1) {
        // No epoch
        setStartEpoch(0);
        setEndEpoch(0);
        setTotalPages(1);
        setCurrentPage(1);
        setTableData([]);
        setChartData([]);
        setLoading(false);
        return;
      }

      // define the range [start..end]
      const end = currentEpoch - 1;
      const start =
        end > MAX_EPOCHS_TO_SHOW - 1 ? end - (MAX_EPOCHS_TO_SHOW - 1) : 1;

      setStartEpoch(start);
      setEndEpoch(end);

      // total pages for the table
      const count = end - start + 1;
      const pages = Math.ceil(count / EPOCHS_PER_PAGE);
      setTotalPages(pages);
      setCurrentPage(1);
      setPagesCache({});
      setTableData([]);

      // also build chart data from that entire [start..end]
      await fetchChartData(start, end);
    } catch (err) {
      console.error('initEpochRange error:', err);
      showMessage(`Error init global epoch range: ${err.message}`, 'error');
      setErrorLoading(true);
    }

    setLoading(false);
  };

  // ---------------------------
  // 2) Fetch table chunk for a given page
  // ---------------------------
  const fetchTableChunk = async (lowest, highest) => {
    if (!vault) return [];
    try {
      const [epochIds, finalized, totalStakes] = await vault.getGlobalDataAcrossEpochs(
        lowest,
        highest
      );

      const result = [];
      // Put them in descending order for the table
      for (let i = epochIds.length - 1; i >= 0; i--) {
        const epochIdNum = epochIds[i].toNumber
          ? epochIds[i].toNumber()
          : parseInt(epochIds[i], 10);
        const stakeBn = ethers.BigNumber.from(totalStakes[i]);
        result.push({
          epochId: epochIdNum,
          isFinalized: finalized[i],
          epochTotalStake: stakeBn
        });
      }
      return result;
    } catch (err) {
      console.error('fetchTableChunk error:', err);
      showMessage(`Error fetching epoch table chunk: ${err.message}`, 'error');
      setErrorLoading(true);
      return [];
    }
  };

  const fetchDataForPage = async (page) => {
    if (!vault || startEpoch === 0 || endEpoch === 0) return;
    setLoading(true);
    setErrorLoading(false);

    const offset = (page - 1) * EPOCHS_PER_PAGE;
    let highest = endEpoch - offset;
    let lowest = highest - (EPOCHS_PER_PAGE - 1);
    if (lowest < startEpoch) lowest = startEpoch;
    if (lowest > highest) {
      setTableData([]);
      setLoading(false);
      return;
    }

    if (pagesCache[page]) {
      // use cache
      setTableData(pagesCache[page]);
      setLoading(false);
      return;
    }

    const chunk = await fetchTableChunk(lowest, highest);
    setTableData(chunk);
    setPagesCache({ ...pagesCache, [page]: chunk });
    setLoading(false);
  };

  // ---------------------------
  // 3) Build chart data from [start..end]
  // ---------------------------
  const fetchChartData = async (start, end) => {
    if (!vault) return;
    setLoading(true);
    setErrorLoading(false);

    try {
      const [epochIds, finalized, totalStakes] = await vault.getGlobalDataAcrossEpochs(start, end);

      const arr = [];
      for (let i = 0; i < epochIds.length; i++) {
        const eId = epochIds[i].toNumber ? epochIds[i].toNumber() : parseInt(epochIds[i], 10);
        const stakeNum = parseFloat(ethers.utils.formatEther(totalStakes[i]));

        arr.push({
          epoch: `E${eId}`,
          totalStake: stakeNum,
          isFinalized: finalized[i]
        });
      }
      // sort ascending by actual numeric epoch
      arr.sort((a, b) => {
        const eA = parseInt(a.epoch.replace('E', ''), 10);
        const eB = parseInt(b.epoch.replace('E', ''), 10);
        return eA - eB;
      });

      setChartData(arr);
    } catch (err) {
      console.error('fetchChartData error:', err);
      showMessage(`Error fetching chart data: ${err.message}`, 'error');
      setErrorLoading(true);
    }

    setLoading(false);
  };

  // ---------------------------
  // Lifecycle
  // ---------------------------
  useEffect(() => {
    if (vault) {
      initEpochRange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault]);

  useEffect(() => {
    if (startEpoch && endEpoch && startEpoch <= endEpoch) {
      fetchDataForPage(currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, startEpoch, endEpoch]);

  if (!vault) {
    return null; // render nothing until the contract is ready
  }

  // ---------------------------
  // Helper to compute newRewards = vaultBal - totalRecognized (floored at 0)
  // ---------------------------
  const computeNewRewards = (vaultBalNum, totalRecognizedNum) => {
    let newRewards = vaultBalNum - totalRecognizedNum;
    if (newRewards < 0) newRewards = 0;
    return newRewards.toFixed(4);
  };

  // ---------------------------
  // Layouts: Mobile vs Desktop
  // ---------------------------
  const MobileLayout = () => (
    <Card
      sx={{
        backgroundColor: '#1e1e1e',
        width: '95%',
        margin: '20px auto',
        borderRadius: '15px',
        boxShadow: '0 0 20px 5px rgba(0, 191, 255, 0.6)',
        mt: 2,
        p: 1
      }}
    >
      <CardContent>
        <Typography variant="h6" sx={{ color: '#00bfff', textAlign: 'center', mb: 2 }}>
          Global Epoch History
        </Typography>

        {/* chart toggles */}
        <Box display="flex" justifyContent="center" gap={2} mb={2} flexWrap="wrap">
          <FormControlLabel
            control={
              <Checkbox
                checked={showTotalStake}
                onChange={(e) => setShowTotalStake(e.target.checked)}
                style={{ color: '#00bfff' }}
              />
            }
            label="Show Total Stake"
            sx={{ color: '#fff', fontSize: '0.85rem' }}
          />
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" my={2}>
            <CircularProgress sx={{ color: '#00bfff' }} />
          </Box>
        ) : errorLoading ? (
          <Typography color="error" textAlign="center">
            Failed to load global epoch data.
          </Typography>
        ) : tableData.length === 0 ? (
          <Typography sx={{ color: '#fff' }} textAlign="center">
            No data available.
          </Typography>
        ) : (
          <>
            {/* Table: each epoch stacked */}
            {tableData.map((row, idx) => {
              const stakeNum = parseFloat(
                ethers.utils.formatEther(row.epochTotalStake)
              ).toFixed(2);

              return (
                <Box
                  key={idx}
                  sx={{
                    backgroundColor: '#2a2a2a',
                    borderRadius: 2,
                    p: 2,
                    mb: 1
                  }}
                >
                  <Typography sx={{ color: '#fff', fontSize: '0.9rem' }}>
                    Epoch: {row.epochId}
                  </Typography>
                  <Typography sx={{ color: '#fff', fontSize: '0.9rem' }}>
                    Stake: {stakeNum}
                  </Typography>
                  <Typography
                    sx={{
                      color: row.isFinalized ? '#0f0' : '#ff4444',
                      fontSize: '0.85rem',
                      mt: 0.5
                    }}
                  >
                    Finalized? {row.isFinalized ? 'Yes' : 'No'}
                  </Typography>
                </Box>
              );
            })}

            {/* pagination */}
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
            <Typography
              sx={{ color: '#fff', textAlign: 'center', mt: 1, fontSize: '0.85rem' }}
            >
              Page {currentPage} of {totalPages}
            </Typography>
          </>
        )}

        {/* chart */}
        <Box sx={{ width: '100%', height: 250, mt: 3 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="epoch" stroke="#ccc" />
              <YAxis stroke="#ccc" />
              {!isMobile && <CartesianGrid strokeDasharray="3 3" stroke="#666" />}
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#2a2a2a', // dark background
                  borderColor: '#ccc' // border color
                }}
                labelStyle={{ color: '#fff' }}
              />
              {!isMobile && <Legend />}
              {showTotalStake && (
                <Line
                  type="monotone"
                  dataKey="totalStake"
                  stroke="#00bfff"
                  name="Total Stake"
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </Box>

        {/* aggregator token data */}
        {tokenData.length > 0 && !loading && !errorLoading && (
          <Box mt={4} sx={{ overflowX: 'auto' }}>
            <Typography variant="h6" sx={{ color: '#00bfff', mb: 1 }}>
              Reward Tokens
            </Typography>
            <Table size="small" sx={{ minWidth: 500 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: '#00bfff', fontSize: '0.85rem' }}>Symbol</TableCell>
                  <TableCell sx={{ color: '#00bfff', fontSize: '0.85rem' }}>Total Rec.</TableCell>
                  <TableCell sx={{ color: '#00bfff', fontSize: '0.85rem' }}>Left. (Fin)</TableCell>
                  <TableCell sx={{ color: '#00bfff', fontSize: '0.85rem' }}>Vault Bal</TableCell>
                  {/* NEW column for "New Rewards" */}
                  <TableCell sx={{ color: '#00bfff', fontSize: '0.85rem' }}>
                    New Rewards
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tokenData
                  // skip index [1] => presumably FOTON
                  .filter((_, index) => index !== 1)
                  .map((tk, i) => {
                    const totalRecognizedNum = parseFloat(
                      ethers.utils.formatEther(tk.totalRecognized.toString())
                    );
                    const leftoverCurr = parseFloat(
                      ethers.utils.formatEther(tk.leftoverInThisEpoch.toString())
                    ).toFixed(4);
                    const leftoverFinal = parseFloat(
                      ethers.utils.formatEther(tk.leftoverInLastFinalEpoch.toString())
                    ).toFixed(4);
                    const vaultBalNum = parseFloat(
                      ethers.utils.formatEther(tk.vaultBalance.toString())
                    );

                    // compute newRewards
                    let newRewStr = computeNewRewards(vaultBalNum, totalRecognizedNum);

                    return (
                      <TableRow key={i}>
                        <TableCell sx={{ color: '#fff', fontSize: '0.8rem' }}>
                          {tk.symbol || '???'}
                        </TableCell>

                        {/* total recognized with small flare logo */}
                        <TableCell sx={{ color: '#fff', fontSize: '0.8rem' }}>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Box
                              component="img"
                              src="/img/flare_logo.png"
                              alt="Flare"
                              sx={{ width: 14, height: 14 }}
                            />
                            <Typography component="span" sx={{ fontSize: '0.8rem' }}>
                              {totalRecognizedNum.toFixed(4)}
                            </Typography>
                          </Stack>
                        </TableCell>

                        <TableCell sx={{ color: '#fff', fontSize: '0.8rem' }}>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Box
                              component="img"
                              src="/img/flare_logo.png"
                              alt="Flare"
                              sx={{ width: 14, height: 14 }}
                            />
                            <Typography component="span" sx={{ fontSize: '0.8rem' }}>
                              {leftoverFinal}
                            </Typography>
                          </Stack>
                        </TableCell>

                        {/* vault balance with logo */}
                        <TableCell sx={{ color: '#fff', fontSize: '0.8rem' }}>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Box
                              component="img"
                              src="/img/flare_logo.png"
                              alt="Flare"
                              sx={{ width: 14, height: 14 }}
                            />
                            <Typography component="span" sx={{ fontSize: '0.8rem' }}>
                              {vaultBalNum.toFixed(4)}
                            </Typography>
                          </Stack>
                        </TableCell>

                        {/* new rewards with logo */}
                        <TableCell sx={{ color: '#fff', fontSize: '0.8rem' }}>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Box
                              component="img"
                              src="/img/flare_logo.png"
                              alt="Flare"
                              sx={{ width: 14, height: 14 }}
                            />
                            <Typography component="span" sx={{ fontSize: '0.8rem' }}>
                              {newRewStr}
                            </Typography>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const DesktopLayout = () => (
    <Card
      sx={{
        backgroundColor: '#1e1e1e',
        maxWidth: 1000,
        width: '95%',
        margin: '20px auto',
        borderRadius: '15px',
        boxShadow: '0 0 20px 5px rgba(0, 191, 255, 0.6)',
        mt: 2,
        p: 2
      }}
    >
      <CardContent>
        <Typography variant="h5" sx={{ color: '#00bfff', textAlign: 'center', mb: 2 }}>
          Vault History
        </Typography>

        {/* toggles for chart */}
        <Box display="flex" justifyContent="center" gap={2} mb={2} flexWrap="wrap">
          <FormControlLabel
            control={
              <Checkbox
                checked={showTotalStake}
                onChange={(e) => setShowTotalStake(e.target.checked)}
                style={{ color: '#00bfff' }}
              />
            }
            label="Show Total Stake"
            sx={{ color: '#fff' }}
          />
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" my={2}>
            <CircularProgress sx={{ color: '#00bfff' }} />
          </Box>
        ) : errorLoading ? (
          <Typography color="error" textAlign="center">
            Failed to load global epoch data.
          </Typography>
        ) : tableData.length === 0 ? (
          <Typography sx={{ color: '#fff' }} textAlign="center">
            No data available.
          </Typography>
        ) : (
          <>
            {/* table of epochs */}
            <Box sx={{ overflowX: 'auto' }}>
              <Table sx={{ minWidth: 650, width: '100%' }} size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#00bfff' }}>Epoch</TableCell>
                    <TableCell sx={{ color: '#00bfff' }}>Total Stake</TableCell>
                    <TableCell sx={{ color: '#00bfff' }}>Finalized?</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableData.map((row, idx) => {
                    const epoch = row.epochId;
                    const stakeNum = parseFloat(
                      ethers.utils.formatEther(row.epochTotalStake)
                    ).toFixed(2);

                    return (
                      <TableRow key={idx}>
                        <TableCell sx={{ color: '#fff' }}>{epoch}</TableCell>
                        <TableCell sx={{ color: '#fff' }}>{stakeNum}</TableCell>
                        <TableCell
                          sx={{
                            color: row.isFinalized ? '#0f0' : '#ff4444'
                          }}
                        >
                          {row.isFinalized ? 'Yes' : 'No'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>

            {/* pagination row */}
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
            <Typography sx={{ color: '#fff', textAlign: 'center', mt: 1 }}>
              Page {currentPage} of {totalPages}
            </Typography>
          </>
        )}

        {/* chart for the entire ~26 epochs */}
        <Box sx={{ width: '100%', height: isMobile ? 250 : 400, mt: 3 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
              <XAxis dataKey="epoch" stroke="#ccc" />
              <YAxis stroke="#ccc" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#2a2a2a', // dark background
                  borderColor: '#ccc' // border color
                }}
                labelStyle={{ color: '#fff' }}
              />
              <CartesianGrid strokeDasharray="3 3" stroke="#666" />
              <Legend />
              {showTotalStake && (
                <Line
                  type="monotone"
                  dataKey="totalStake"
                  stroke="#00bfff"
                  name="Total Stake"
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </Box>

        {tokenData.length > 0 && !loading && !errorLoading && (
          <Box mt={4} sx={{ overflowX: 'auto' }}>
            <Typography variant="h6" sx={{ color: '#00bfff', mb: 1 }}>
              Reward Tokens
            </Typography>
            <Table size="small" sx={{ minWidth: 500 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: '#00bfff', fontSize: '0.85rem' }}>Symbol</TableCell>
                  <TableCell sx={{ color: '#00bfff', fontSize: '0.85rem' }}>Total Rec.</TableCell>
                  <TableCell sx={{ color: '#00bfff', fontSize: '0.85rem' }}>Left. (Fin)</TableCell>
                  <TableCell sx={{ color: '#00bfff', fontSize: '0.85rem' }}>Vault Bal</TableCell>
                  {/* NEW column for newRewards */}
                  <TableCell sx={{ color: '#00bfff', fontSize: '0.85rem' }}>
                    New Rewards
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tokenData
                  .filter((_, index) => index !== 1) // skip FOTON
                  .map((tk, i) => {
                    const totalRecognizedNum = parseFloat(
                      ethers.utils.formatEther(tk.totalRecognized.toString())
                    );
                    const leftoverCurr = parseFloat(
                      ethers.utils.formatEther(tk.leftoverInThisEpoch.toString())
                    ).toFixed(4);
                    const leftoverFinal = parseFloat(
                      ethers.utils.formatEther(tk.leftoverInLastFinalEpoch.toString())
                    ).toFixed(4);
                    const vaultBalNum = parseFloat(
                      ethers.utils.formatEther(tk.vaultBalance.toString())
                    );

                    const newRewardsStr = computeNewRewards(vaultBalNum, totalRecognizedNum);

                    return (
                      <TableRow key={i}>
                        <TableCell sx={{ color: '#fff', fontSize: '0.8rem' }}>
                          {tk.symbol || '???'}
                        </TableCell>

                        {/* total recognized w/ small Flare logo */}
                        <TableCell sx={{ color: '#fff', fontSize: '0.8rem' }}>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Box
                              component="img"
                              src="/img/flare_logo.png"
                              alt="Flare"
                              sx={{ width: 14, height: 14 }}
                            />
                            <Typography component="span" sx={{ fontSize: '0.8rem' }}>
                              {totalRecognizedNum.toFixed(4)}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ color: '#fff', fontSize: '0.8rem' }}>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Box
                              component="img"
                              src="/img/flare_logo.png"
                              alt="Flare"
                              sx={{ width: 14, height: 14 }}
                            />
                            <Typography component="span" sx={{ fontSize: '0.8rem' }}>
                              {leftoverFinal}
                            </Typography>
                          </Stack>
                        </TableCell>

                        {/* vault bal w/ logo */}
                        <TableCell sx={{ color: '#fff', fontSize: '0.8rem' }}>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Box
                              component="img"
                              src="/img/flare_logo.png"
                              alt="Flare"
                              sx={{ width: 14, height: 14 }}
                            />
                            <Typography component="span" sx={{ fontSize: '0.8rem' }}>
                              {vaultBalNum.toFixed(4)}
                            </Typography>
                          </Stack>
                        </TableCell>

                        {/* newRewards w/ logo */}
                        <TableCell sx={{ color: '#fff', fontSize: '0.8rem' }}>
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Box
                              component="img"
                              src="/img/flare_logo.png"
                              alt="Flare"
                              sx={{ width: 14, height: 14 }}
                            />
                            <Typography component="span" sx={{ fontSize: '0.8rem' }}>
                              {newRewardsStr}
                            </Typography>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      {isMobile ? <MobileLayout /> : <DesktopLayout />}

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
    </>
  );
};

export default YV_GlobalEpochHistoryMerged;
