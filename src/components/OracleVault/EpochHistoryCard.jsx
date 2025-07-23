import React, { useContext, useState, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Snackbar,
  Alert,
  Stack,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  FormControlLabel,
  FormControl
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import NeonButton from '../NeonButton';
import { BlockchainContext } from '../../contexts/BlockchainContext';
import { ethers } from 'ethers';
import { useTheme, useMediaQuery } from '@mui/material';

// For the chart
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

const EPOCHS_PER_PAGE = 4;
const MAX_EPOCHS_TO_SHOW = 26;

// Adjust these to match your environment addresses for WNAT / FOTON
const WNAT_ADDRESS = (process.env.REACT_APP_WNAT_ADDRESS || '').toLowerCase();
const FOTON_ADDRESS = (process.env.REACT_APP_FOTON_TOKEN_ADDRESS || '').toLowerCase();

// A fallback symbol if aggregator doesn’t provide one
function fallbackSymbol(sym) {
  if (!sym || sym.trim() === '') return '???';
  return sym;
}

/**
 * Default tokens for WNAT & FOTON.
 */
function getDefaultTokens() {
  return [
    {
      token: WNAT_ADDRESS,
      symbol: 'WFLR'
    },
    {
      token: FOTON_ADDRESS,
      symbol: 'FOTON'
    }
  ];
}

/**
 * unifyTokens merges aggregator’s reported tokens with the
 * default WNAT/FOTON, ensuring no duplicates.
 */
function unifyTokens(aggregatorTokenData) {
  const defaults = getDefaultTokens();
  const unified = [];

  // aggregator tokens first
  aggregatorTokenData.forEach((item) => {
    const lowerAddr = item.token.toLowerCase();
    const displaySym = fallbackSymbol(item.symbol || item.name);
    if (!unified.find((x) => x.token === lowerAddr)) {
      unified.push({ token: lowerAddr, symbol: displaySym });
    }
  });

  // ensure defaults
  defaults.forEach((def) => {
    if (!def.token) return;
    if (!unified.find((x) => x.token === def.token)) {
      unified.push(def);
    }
  });

  return unified;
}

export default function EpochHistoryCard() {
  const { account, oracleVaultContract } = useContext(BlockchainContext);

  // Loading / error states
  const [loading, setLoading] = useState(false);
  const [errorLoading, setErrorLoading] = useState(false);

  // **Top-bar** user + vault data
  const [activeStake, setActiveStake] = useState('0');
  const [pendingStake, setPendingStake] = useState('0');
  const [fotonBalance, setFotonBalance] = useState('0');
  const [wnatBalance, setWnatBalance] = useState('0');
  const [userunclaimed, setUserunclaimed] = useState('0'); // ephemeral sum of WNAT
  const [shareOfPool, setShareOfPool] = useState('0');
  const [totalActiveStake, setTotalActiveStake] = useState('0');
  const [lastFinalizedEpoch, setLastFinalizedEpoch] = useState(0);

  // aggregator page & chart data
  const [startEpoch, setStartEpoch] = useState(0);
  const [endEpoch, setEndEpoch] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pagedEpochs, setPagedEpochs] = useState([]);

  const [graphEpochs, setGraphEpochs] = useState([]);
  const [chartData, setChartData] = useState([]);

  // aggregator tokens + tabs
  const [availableTokens, setAvailableTokens] = useState([]);
  const [tokenTabIndex, setTokenTabIndex] = useState(0);

  // chart line toggles
  const [showStakeLine, setShowStakeLine] = useState(true);
  const [showClaimedLine, setShowClaimedLine] = useState(true);

  // For messages
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const handleCloseSnackbar = () => setSnackbar((prev) => ({ ...prev, open: false }));
  const showMessage = (msg, severity = 'info') =>
    setSnackbar({ open: true, message: msg, severity });

  // Responsive
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // ----------------------------------------------------------------
  // (A) fetchAllData: same approach as StakingCard
  // ----------------------------------------------------------------
  const fetchAllData = async () => {
    if (!oracleVaultContract || !account) return;
    setLoading(true);
    setErrorLoading(false);

    try {
      // 1) Global vault data
      const globalVaultResponse = await oracleVaultContract.getGlobalVaultData();
      const { vaultData } = globalVaultResponse;

      setTotalActiveStake(ethers.utils.formatEther(vaultData.totalActiveStake));

      const finalEpoch = Number(vaultData.lastFinalizedEpochId);
      setLastFinalizedEpoch(finalEpoch);

      // 2) If we have finalized epochs, get ephemeral user data
      if (finalEpoch > 0) {
        const startEp = finalEpoch > 31 ? finalEpoch - 31 : 1;
        const everything = await oracleVaultContract.getEverything(account, startEp, finalEpoch);

        // user’s wallet/stake
        setFotonBalance(ethers.utils.formatEther(everything.fotonWalletBalance));
        setPendingStake(ethers.utils.formatEther(everything.pendingStake));
        setActiveStake(ethers.utils.formatEther(everything.activeStake));

        // ephemeral unclaimed (WNAT) across [startEp..finalEpoch]
        const ephemeralData = await oracleVaultContract.getUserEphemeralRewards(
          account,
          startEp,
          finalEpoch
        );

        let ephemeralSum = 0;
        ephemeralData.forEach((epochInfo) => {
          const wnatVal = parseFloat(ethers.utils.formatEther(epochInfo.wnatAmount));
          ephemeralSum += wnatVal;
        });
        setUserunclaimed(ephemeralSum.toString());

        // share% = userActive / totalActive * 100
        const userActiveBn = ethers.utils.parseEther(
          (everything.activeStake || '0').toString()
        );
        const vaultActiveBn = ethers.utils.parseEther(
          (vaultData.totalActiveStake || '0').toString()
        );

        let share = '0';
        if (!vaultActiveBn.isZero()) {
          const ratio = userActiveBn/vaultActiveBn * 100;
          share = ratio.toFixed(5) + '%';
        }
        setShareOfPool(share);
      } else {
        // no finalized => zero everything
        setFotonBalance('0');
        setPendingStake('0');
        setActiveStake('0');
        setUserunclaimed('0');
        setShareOfPool('0');
      }
    } catch (err) {
      console.error('Error fetching vault data:', err);
      showMessage('Error fetching vault data. Check console.', 'error');
      setErrorLoading(true);
    }

    setLoading(false);
  };

  // ----------------------------------------------------------------
  // (B) aggregator for table & chart
  // ----------------------------------------------------------------
  const initEpochRange = async () => {
    if (!oracleVaultContract || !account) return;
    setLoading(true);

    try {
      // We'll read lastFinalizedEpochId to form aggregator table range
      const resp = await oracleVaultContract.getGlobalVaultData();
      const { vaultData } = resp;

      const finalEnd = Number(vaultData.lastFinalizedEpochId);
      if (finalEnd < 1) {
        showMessage('No finalized epochs to show.', 'info');
        setStartEpoch(0);
        setEndEpoch(0);
        setTotalPages(1);
        setCurrentPage(1);
        setPagedEpochs([]);
        setLoading(false);
        return;
      }

      const computedStart =
        finalEnd > MAX_EPOCHS_TO_SHOW ? finalEnd - (MAX_EPOCHS_TO_SHOW - 1) : 1;

      setStartEpoch(computedStart);
      setEndEpoch(finalEnd);

      const count = finalEnd - computedStart + 1;
      const pages = Math.ceil(count / EPOCHS_PER_PAGE);
      setTotalPages(pages);
      setCurrentPage(1);

      // aggregator chart data
      await fetchAllEpochsForChart(computedStart, finalEnd);
    } catch (err) {
      console.error('initEpochRange error:', err);
      showMessage(`initEpochRange error: ${err.message}`, 'error');
      setErrorLoading(true);
    }
    setLoading(false);
  };

  const fetchAllEpochsForChart = async (lowE, highE) => {
    if (!oracleVaultContract || !account) return;
    try {
      const finalRangeSize = 26;
      let startRange = highE - (finalRangeSize - 1);
      if (startRange < 1) startRange = 1;

      const aggregatorData = {};
      for (let e = startRange; e <= highE; e++) {
        try {
          const rep = await oracleVaultContract.getUserEpochReport(e, account);
          aggregatorData[e] = rep;
        } catch {
          aggregatorData[e] = null;
        }
      }

      const finalList = [];
      for (let e = startRange; e <= highE; e++) {
        let stakeBn = ethers.BigNumber.from(0);
        let forfeitedBn = ethers.BigNumber.from(0);
        let totalClaimBn = ethers.BigNumber.from(0);

        if (aggregatorData[e]) {
          const [ stSnap, forfSnap, , tokensArr, amountsArr ] = aggregatorData[e];
          stakeBn = ethers.BigNumber.from(stSnap || 0);
          forfeitedBn = ethers.BigNumber.from(forfSnap || 0);

          tokensArr.forEach((tok, idx) => {
            totalClaimBn = totalClaimBn.add(amountsArr[idx]);
          });
        }
        const effBn = stakeBn.sub(forfeitedBn);
        const effStake = effBn.lt(0) ? ethers.BigNumber.from(0) : effBn;

        finalList.push({
          epochId: e,
          stakeBn: effStake,
          claimedBn: totalClaimBn
        });
      }

      setGraphEpochs(finalList);
    } catch (err) {
      console.error('fetchAllEpochsForChart error:', err);
    }
  };

  const fetchPagedEpochs = async (page) => {
    if (!oracleVaultContract || !account || startEpoch === 0 || endEpoch === 0) return;
    setLoading(true);

    try {
      const offset = (page - 1) * EPOCHS_PER_PAGE;
      let highest = endEpoch - offset;
      let lowest = highest - (EPOCHS_PER_PAGE - 1);
      if (lowest < startEpoch) lowest = startEpoch;
      if (lowest > highest) {
        setPagedEpochs([]);
        setLoading(false);
        return;
      }

      // aggregator calls for [lowest..highest]
      const aggregatorDataMap = {};
      for (let e = lowest; e <= highest; e++) {
        try {
          const rep = await oracleVaultContract.getUserEpochReport(e, account);
          aggregatorDataMap[e] = rep;
        } catch {
          aggregatorDataMap[e] = null;
        }
      }

      // unify aggregator tokens with default
      const recognized = unifyTokens([]);
      setAvailableTokens(recognized);

      const rows = [];
      for (let e = lowest; e <= highest; e++) {
        const rep = aggregatorDataMap[e];
        if (!rep) {
          rows.push({
            epoch: e,
            staked: 0,
            forfeited: 0,
            claimedWnat: 0,
            claimedFoton: 0,
            status: 'NoData'
          });
          continue;
        }
        const [ stSnap, forfSnap, claimedEpoch, tokensArr, amountsArr ] = rep;
        let stBn = ethers.BigNumber.from(stSnap || 0);
        let ffBn = ethers.BigNumber.from(forfSnap || 0);
        let effBn = stBn.sub(ffBn);
        if (effBn.lt(0)) effBn = ethers.BigNumber.from(0);

        let wnatClaim = ethers.BigNumber.from(0);
        let fotonClaim = ethers.BigNumber.from(0);
        tokensArr.forEach((tok, idx) => {
          const amtBn = amountsArr[idx];
          if (tok.toLowerCase() === WNAT_ADDRESS) {
            wnatClaim = wnatClaim.add(amtBn);
          } else if (tok.toLowerCase() === FOTON_ADDRESS) {
            fotonClaim = fotonClaim.add(amtBn);
          }
        });

        const stakedNum = parseFloat(ethers.utils.formatEther(effBn));
        const forfNum = parseFloat(ethers.utils.formatEther(ffBn));
        const claimedWn = parseFloat(ethers.utils.formatEther(wnatClaim));
        const claimedFo = parseFloat(ethers.utils.formatEther(fotonClaim));

        let rowSt = 'None';
        if (claimedEpoch) rowSt = 'Claimed';

        rows.push({
          epoch: e,
          staked: stakedNum,
          forfeited: forfNum,
          claimedWnat: claimedWn,
          claimedFoton: claimedFo,
          status: rowSt
        });
      }
      rows.sort((a, b) => b.epoch - a.epoch);
      setPagedEpochs(rows);
    } catch (err) {
      console.error('fetchPagedEpochs error:', err);
      showMessage(`fetchPagedEpochs error: ${err.message}`, 'error');
    }
    setLoading(false);
  };

  // ----------------------------------------------------------------
  // 4) Build chart data from aggregator
  // ----------------------------------------------------------------
  const buildChartData = () => {
    const asc = [...graphEpochs];
    asc.sort((a, b) => a.epochId - b.epochId);

    const cData = asc.map((ep) => {
      const stNum = parseFloat(ethers.utils.formatEther(ep.stakeBn || 0));
      const clNum = parseFloat(ethers.utils.formatEther(ep.claimedBn || 0));
      return {
        epoch: ep.epochId,
        stake: stNum,
        claimed: clNum
      };
    });
    setChartData(cData);
  };

  // ----------------------------------------------------------------
  // 5) Lifecycle
  // ----------------------------------------------------------------

  // On mount, load ephemeral top-bar data + aggregator range
  useEffect(() => {
    if (!oracleVaultContract || !account) return;
    // fetch ephemeral top bar data (like in StakingCard)
    fetchAllData().then(() => {
      // then init aggregator range for chart/table
      initEpochRange();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oracleVaultContract, account]);

  // After we know startEpoch/endEpoch, fetch aggregator table
  useEffect(() => {
    if (startEpoch && endEpoch && startEpoch <= endEpoch) {
      fetchPagedEpochs(currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, startEpoch, endEpoch]);

  // Once aggregator data is loaded, build chart
  useEffect(() => {
    buildChartData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphEpochs]);

  // ----------------------------------------------------------------
  // 6) Table pagination helper
  // ----------------------------------------------------------------
  const goToPage = (p) => {
    if (p < 1) return;
    if (p > totalPages) return;
    setCurrentPage(p);
  };

  // ----------------------------------------------------------------
  // 7) Token tab switching
  // ----------------------------------------------------------------
  const handleChangeTokenTab = (event, newIndex) => {
    setTokenTabIndex(newIndex);
  };

  // The selected aggregator token
  const selectedToken = useMemo(() => {
    if (tokenTabIndex < availableTokens.length) {
      return availableTokens[tokenTabIndex];
    }
    return null;
  }, [tokenTabIndex, availableTokens]);

  // ----------------------------------------------------------------
  // RENDER LAYOUTS
  // ----------------------------------------------------------------
  const MobileLayout = () => (
    <Card
      sx={{
        backgroundColor: '#1e1e1e',
        maxWidth: 900,
        width: '95%',
        margin: '20px auto',
        borderRadius: '15px',
        boxShadow: '0 0 20px 5px rgba(0, 191, 255, 0.6)',
        p: 1
      }}
    >
      <CardContent>
        {renderUserInfoMobile()}
        {renderTokenTabs()}
        {renderMobileAccordion()}
        {renderChart()}
      </CardContent>
    </Card>
  );

  const DesktopLayout = () => (
    <Card
      sx={{
        backgroundColor: '#1e1e1e',
        maxWidth: 900,
        minWidth: 700,
        width: '95%',
        margin: '20px auto',
        borderRadius: '15px',
        boxShadow: '0 0 20px 5px rgba(0, 191, 255, 0.6)',
        p: 2
      }}
    >
      <CardContent>
        {renderUserInfoDesktop()}
        {renderTokenTabs()}
        {renderDesktopTable()}
        {renderChartOptions()}
        {renderChart()}
      </CardContent>
    </Card>
  );

  // ----------------------------------------------------------------
  // 8) Render: Top Bar (Mobile)
  // ----------------------------------------------------------------
  const renderUserInfoMobile = () => (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        justifyContent: 'center',
        mb: 3
      }}
    >
      {/* Active */}
      <Box
        sx={{
          backgroundColor: '#2a2a2a',
          borderRadius: 2,
          p: 1,
          textAlign: 'center',
          minWidth: '70px'
        }}
      >
        <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
          Actv
        </Typography>
        <Typography sx={{ color: '#fff', fontSize: '0.85rem' }}>
          {parseFloat(activeStake).toFixed(2)}
        </Typography>
      </Box>

      {/* Pending */}
      <Box
        sx={{
          backgroundColor: '#2a2a2a',
          borderRadius: 2,
          p: 1,
          textAlign: 'center',
          minWidth: '70px'
        }}
      >
        <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
          Pend
        </Typography>
        <Typography sx={{ color: '#fff', fontSize: '0.85rem' }}>
          {parseFloat(pendingStake).toFixed(2)}
        </Typography>
      </Box>

      {/* Share% */}
      <Box
        sx={{
          backgroundColor: '#2a2a2a',
          borderRadius: 2,
          p: 1,
          textAlign: 'center',
          minWidth: '70px'
        }}
      >
        <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
          S%
        </Typography>
        <Typography sx={{ color: '#fff', fontSize: '0.85rem' }}>
          {shareOfPool}
        </Typography>
      </Box>

      {/* Unclaimed */}
      <Box
        sx={{
          backgroundColor: '#2a2a2a',
          borderRadius: 2,
          p: 1,
          textAlign: 'center',
          minWidth: '80px'
        }}
      >
        <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
          Uncl
        </Typography>
        <Typography sx={{ color: '#fff', fontSize: '0.85rem' }}>
          {parseFloat(userunclaimed).toFixed(2)}
        </Typography>
      </Box>
    </Box>
  );

  // ----------------------------------------------------------------
  // Render: Top Bar (Desktop)
  // ----------------------------------------------------------------
  const renderUserInfoDesktop = () => (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        justifyContent: 'center',
        mb: 3
      }}
    >
      {/* Active */}
      <Box
        sx={{
          backgroundColor: '#2a2a2a',
          borderRadius: 2,
          p: 2,
          textAlign: 'center',
          minWidth: 80
        }}
      >
        <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
          Active
        </Typography>
        <Typography sx={{ color: '#fff' }}>
          {parseFloat(activeStake).toFixed(2)}
        </Typography>
      </Box>

      {/* Pending */}
      <Box
        sx={{
          backgroundColor: '#2a2a2a',
          borderRadius: 2,
          p: 2,
          textAlign: 'center',
          minWidth: 80
        }}
      >
        <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
          Pending
        </Typography>
        <Typography sx={{ color: '#fff' }}>
          {parseFloat(pendingStake).toFixed(2)}
        </Typography>
      </Box>

      {/* Unclaimed */}
      <Box
        sx={{
          backgroundColor: '#2a2a2a',
          borderRadius: 2,
          p: 2,
          textAlign: 'center',
          minWidth: 80
        }}
      >
        <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
          Unclaimed
        </Typography>
        <Typography sx={{ color: '#fff' }}>
          {parseFloat(userunclaimed).toFixed(2)}
        </Typography>
      </Box>

      {/* Share% */}
      <Box
        sx={{
          backgroundColor: '#2a2a2a',
          borderRadius: 2,
          p: 2,
          textAlign: 'center',
          minWidth: 80
        }}
      >
        <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
          Share%
        </Typography>
        <Typography sx={{ color: '#fff' }}>
          {shareOfPool}
        </Typography>
      </Box>
    </Box>
  );

  // ----------------------------------------------------------------
  // aggregator token tabs
  // ----------------------------------------------------------------
  const renderTokenTabs = () => {
    if (availableTokens.length === 0) return null;

    return (
      <Tabs
        value={tokenTabIndex}
        onChange={handleChangeTokenTab}
        textColor="secondary"
        indicatorColor="secondary"
        variant="scrollable"
        sx={{ marginBottom: '16px' }}
      >
        {availableTokens.map((tkn, idx) => (
          <Tab key={idx} label={tkn.symbol} sx={{ color: '#fff', textTransform: 'none' }} />
        ))}
      </Tabs>
    );
  };

  // ----------------------------------------------------------------
  // Mobile => Accordion for aggregator table
  // ----------------------------------------------------------------
  const renderMobileAccordion = () => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center">
          <CircularProgress sx={{ color: '#00bfff' }} />
        </Box>
      );
    }
    if (errorLoading) {
      return (
        <Typography color="error" textAlign="center">
          Failed to load epoch data.
        </Typography>
      );
    }
    if (pagedEpochs.length === 0) {
      return (
        <Typography sx={{ color: '#fff', textAlign: 'center' }}>
          No data for this page.
        </Typography>
      );
    }

    return (
      <>
        {pagedEpochs.map((row, idx) => {
          // aggregator doesn't store ephemeral => ephemeralVal=0
          let claimedVal = 0;
          let ephemeralVal = 0;

          if (selectedToken?.token === WNAT_ADDRESS) {
            claimedVal = row.claimedWnat;
          } else if (selectedToken?.token === FOTON_ADDRESS) {
            claimedVal = row.claimedFoton;
          }

          const claimedColor = claimedVal > 0 ? 'green' : 'gray';
          const unclaimedColor = ephemeralVal > 0 ? 'red' : 'gray';

          return (
            <Accordion
              key={idx}
              sx={{
                backgroundColor: '#2a2a2a',
                color: '#fff',
                mb: 1,
                borderRadius: '8px'
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#fff' }} />}>
                <Typography sx={{ fontWeight: 'bold', color: '#00bfff', fontSize: '0.9rem' }}>
                  Epoch {row.epoch}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography sx={{ fontSize: '0.85rem' }}>
                  Stake: {row.staked.toFixed(2)}, Forfeit: {row.forfeited.toFixed(2)}
                </Typography>

                {selectedToken && (
                  <Typography sx={{ fontSize: '0.85rem', mt: 0.5 }}>
                    <Box component="span" sx={{ color: claimedColor, marginRight: '8px' }}>
                      C: {claimedVal.toFixed(4)}
                    </Box>
                    /
                    <Box component="span" sx={{ color: unclaimedColor, marginLeft: '8px' }}>
                      U: {ephemeralVal.toFixed(4)}
                    </Box>
                  </Typography>
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
        {renderPagination()}
      </>
    );
  };

  // ----------------------------------------------------------------
  // Desktop => Table
  // ----------------------------------------------------------------
  const renderDesktopTable = () => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center">
          <CircularProgress sx={{ color: '#00bfff' }} />
        </Box>
      );
    }
    if (errorLoading) {
      return (
        <Typography color="error" textAlign="center">
          Failed to load epoch data.
        </Typography>
      );
    }
    if (pagedEpochs.length === 0) {
      return (
        <Typography sx={{ color: '#fff', textAlign: 'center' }}>
          No data for this page.
        </Typography>
      );
    }

    return (
      <>
        <Box sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 650, width: '100%' }} size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: '#00bfff' }}>Epoch</TableCell>
                <TableCell sx={{ color: '#00bfff' }}>Stake</TableCell>
                <TableCell sx={{ color: '#00bfff' }}>Forfeited</TableCell>
                <TableCell sx={{ color: '#00bfff' }}>Claimed</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedEpochs.map((row, idx) => {
                let claimedVal = 0;
                let ephemeralVal = 0; // aggregator doesn't store ephemeral => 0

                if (selectedToken?.token === WNAT_ADDRESS) {
                  claimedVal = row.claimedWnat;
                } else if (selectedToken?.token === FOTON_ADDRESS) {
                  claimedVal = row.claimedFoton;
                }

                const claimedColor = claimedVal > 0 ? 'green' : 'gray';
                const unclaimedColor = ephemeralVal > 0 ? 'red' : 'gray';

                return (
                  <TableRow key={idx}>
                    <TableCell sx={{ color: '#fff' }}>{row.epoch}</TableCell>
                    <TableCell sx={{ color: '#fff' }}>
                      {row.staked.toFixed(2)}
                    </TableCell>
                    <TableCell sx={{ color: '#fff' }}>
                      {row.forfeited.toFixed(2)}
                    </TableCell>
                    <TableCell sx={{ color: '#fff' }}>
                      <Box component="span" sx={{ color: claimedColor, marginRight: '8px' }}>
                        {claimedVal.toFixed(4)} FLR
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
        {renderPagination()}
      </>
    );
  };

  // ----------------------------------------------------------------
  // Chart toggles
  // ----------------------------------------------------------------
  const renderChartOptions = () => (
    <Box display="flex" justifyContent="center" alignItems="center" gap={2} flexWrap="wrap" my={2}>
      <FormControlLabel
        control={
          <Checkbox
            checked={showStakeLine}
            onChange={(e) => setShowStakeLine(e.target.checked)}
            style={{ color: '#ff00ff' }}
          />
        }
        label="Show Stake Line"
        sx={{ color: '#fff' }}
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={showClaimedLine}
            onChange={(e) => setShowClaimedLine(e.target.checked)}
            style={{ color: '#00bfff' }}
          />
        }
        label="Show Claimed Line"
        sx={{ color: '#fff' }}
      />
    </Box>
  );

  // ----------------------------------------------------------------
  // The Chart
  // ----------------------------------------------------------------
  const renderChart = () => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center">
          <CircularProgress sx={{ color: '#00bfff' }} />
        </Box>
      );
    }
    if (errorLoading) {
      return (
        <Typography variant="body2" color="error" textAlign="center">
          Failed to load chart data.
        </Typography>
      );
    }
    if (chartData.length === 0) {
      return (
        <Typography variant="body2" sx={{ color: '#fff', textAlign: 'center' }}>
          No chart data to display.
        </Typography>
      );
    }

    if (isMobile) {
      return (
        <Box sx={{ width: '100%', height: 300, mt: 4,   }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} >
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis dataKey="epoch" stroke="#ccc" tick={false} />
              <YAxis yAxisId="left" stroke="#ccc" tick={{ fill: '#ccc', fontSize: 12 }} />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#ccc"
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

              {showClaimedLine && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="claimed"
                  stroke="#00bfff"
                  name="Claimed"
                  dot={true}
                />
              )}
              {showStakeLine && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="stake"
                  stroke="#ff00ff"
                  name="Stake"
                  dot={true}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </Box>
      );
    }

    return (
      <Box sx={{ width: '100%', height: 300, mt: 4 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis dataKey="epoch" stroke="#ccc" />
            <YAxis yAxisId="left" stroke="#ccc"  />
            <YAxis yAxisId="right" orientation="right" stroke="#ccc"  />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: '#2a2a2a',  // dark background
                borderColor: '#ccc',        // border color
              }}
              labelStyle={{ color: '#fff' }}
            />
            <Legend />

            {showClaimedLine && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="claimed"
                stroke="#00bfff"
                name="Claimed"
                dot={true}
              />
            )}
            {showStakeLine && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="stake"
                stroke="#ff00ff"
                name="Stake"
                dot={true}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Box>
    );
  };

  // ----------------------------------------------------------------
  // Render: Table Pagination
  // ----------------------------------------------------------------
  const renderPagination = () => (
    <Box
      mt={2}
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}
    >
      <Stack direction="row" spacing={2} mb={{ xs: 2, md: 0 }}>
        <NeonButton onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
          Prev
        </NeonButton>
        <NeonButton onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>
          Next
        </NeonButton>
        <Typography sx={{ color: '#fff', fontSize: '0.85rem' }}>
          Page {currentPage} of {totalPages}
        </Typography>
      </Stack>
    </Box>
  );

  // ----------------------------------------------------------------
  // FINAL RENDER
  // ----------------------------------------------------------------
  return (
    <>
      {isMobile ? <MobileLayout /> : <DesktopLayout />}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
