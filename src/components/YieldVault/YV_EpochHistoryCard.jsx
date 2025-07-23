import React, { useContext, useState, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Snackbar,
  Alert,
  Link as MUILink,
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
  Tooltip
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

/**
 * If aggregator returns empty symbol, fallback to ???.
 */
function fallbackSymbol(sym) {
  if (!sym || sym.trim() === '') return '???';
  return sym;
}

/**
 * WNAT & FOTON always displayed by default.
 */
function getDefaultTokens() {
  return [
    {
      token: (process.env.REACT_APP_WNAT_ADDRESS || '').toLowerCase(),
      symbol: 'WFLR'
    },
    {
      token: (process.env.REACT_APP_FOTON_TOKEN_ADDRESS || '').toLowerCase(),
      symbol: 'FOTON'
    }
  ];
}

/**
 * unifyTokens merges aggregator’s reported tokens with the default WNAT/FOTON
 * and ensures no duplicates.
 */
function unifyTokens(yvTokenData) {
  const defaults = getDefaultTokens();
  const unified = [];

  // Insert aggregator tokens first
  yvTokenData.forEach((item) => {
    const lowerAddr = item.token.toLowerCase();
    const fallbackSym = fallbackSymbol(item.symbol || item.name);
    if (!unified.find((x) => x.token === lowerAddr)) {
      unified.push({ token: lowerAddr, symbol: fallbackSym });
    }
  });

  // Ensure WNAT / FOTON are present if not already
  defaults.forEach((def) => {
    if (!unified.find((x) => x.token === def.token) && def.token) {
      unified.push(def);
    }
  });

  return unified;
}

/**
 * Compute the total user-expected rewards across aggregatorTokenData,
 * skipping index [1], i.e. aggregatorTokenData[1].
 */
function computeTotalExpected(aggregatorTokenData, shareOfPool) {
  const userShare = parseFloat(shareOfPool) / 100;
  if (aggregatorTokenData.length === 0 || isNaN(userShare)) return '0.0000';

  let total = 0;
  aggregatorTokenData
    .filter((_, index) => index !== 1) // skip aggregatorTokenData[1]
    .forEach((tk) => {
      const totalRecognizedNum = parseFloat(
        ethers.utils.formatEther(tk.totalRecognized.toString())
      );
      const vaultBalNum = parseFloat(
        ethers.utils.formatEther(tk.vaultBalance.toString())
      );

      let newRewards = vaultBalNum - totalRecognizedNum;
      if (newRewards < 0) newRewards = 0;

      total += newRewards * userShare;
    });

  return total.toFixed(4);
}

/**
 * `vault` – the Yield‑Vault contract instance to use
 * `version` – optional string, lets you change labels/UI if needed
 */
const YV_EpochHistoryCard = ({ vault, version = 'v1' }) => {
  const { account } = useContext(BlockchainContext);

  // Loading / error states
  const [loading, setLoading] = useState(false);
  const [errorLoading, setErrorLoading] = useState(false);

  // Basic user stats
  const [fotonBalance, setFotonBalance] = useState('0');
  const [activeStake, setActiveStake] = useState('0'); // User's active stake
  const [pendingStake, setPendingStake] = useState('0');
  const [vaultActiveStake, setVaultActiveStake] = useState('0'); // Entire vault's active stake
  const [shareOfPool, setShareOfPool] = useState('0'); // (User activeStake / vaultActiveStake) * 100
  const [totalUnclaimed, setTotalUnclaimed] = useState('0'); // Summed across all tokens

  // aggregator token data (the "Reward Tokens" array)
  const [aggregatorTokenData, setAggregatorTokenData] = useState([]);

  // Range info
  const [startEpoch, setStartEpoch] = useState(0);
  const [endEpoch, setEndEpoch] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Current page data (pagedEpochs) for the TABLE only
  const [currentPage, setCurrentPage] = useState(1);
  const [pagedEpochs, setPagedEpochs] = useState([]);

  // CHART data (full 26 epochs)
  const [graphEpochs, setGraphEpochs] = useState([]);

  // Recognized reward tokens + tab index
  const [availableTokens, setAvailableTokens] = useState([]);
  const [tokenTabIndex, setTokenTabIndex] = useState(0);

  // Explorer link for user address
  const [addressLink, setAddressLink] = useState('');

  // Notifications / snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const handleCloseSnackbar = () => setSnackbar((prev) => ({ ...prev, open: false }));
  const showMessage = (msg, severity = 'info') =>
    setSnackbar({ open: true, message: msg, severity });

  // For mobile layout
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Shorten address
  const shortAddress = useMemo(() => {
    if (!account) return '';
    return `${account.slice(0, 6)}...${account.slice(-4)}`;
  }, [account]);

  // --------------------------------
  // HELPER: aggregator logic to parse epochs
  // --------------------------------
  const parseEpochsData = async (epochArray, aggregatorMap) => {
    let prevCumulative = {};
    let prevClaimed = {};

    const epDataArr = epochArray.map((epObj) => {
      const eId = Number(epObj.epochId);
      const stakedEp = parseFloat(ethers.utils.formatEther(epObj.staked));
      const forfEp = parseFloat(ethers.utils.formatEther(epObj.forfeited));

      // aggregator snapshot
      const agg = aggregatorMap[eId];
      const stakeSnapBn = agg.stakeSnapshot;
      const forfeitSnapBn = agg.forfeitedSnapshot;
      const finalStakeNum = parseFloat(ethers.utils.formatEther(stakeSnapBn));
      const finalForfeitedNum = parseFloat(ethers.utils.formatEther(forfeitSnapBn));

      // choose displayed stake
      const displayStake = stakeSnapBn.toString() !== '0' ? finalStakeNum : stakedEp;
      const displayForfeit = forfeitSnapBn.toString() !== '0' ? finalForfeitedNum : forfEp;

      const tokenRewardMap = {};
      if (epObj.tokens && epObj.tokens.length) {
        for (let tk of epObj.tokens) {
          const tkAddr = tk.token.toLowerCase();
          let ephemeralBn = ethers.BigNumber.from(tk.ephemeralReward || 0);

          let aggregatorClaimBn = ethers.BigNumber.from(0);
          if (agg.tokens) {
            const idx = agg.tokens.findIndex((aTkAddr) => aTkAddr.toLowerCase() === tkAddr);
            if (idx >= 0) {
              aggregatorClaimBn = ethers.BigNumber.from(agg.amounts[idx]);
            }
          }

          const lastEphem = prevCumulative[tkAddr] || ethers.BigNumber.from(0);
          const lastClaim = prevClaimed[tkAddr] || ethers.BigNumber.from(0);

          let epochRewardBn = ephemeralBn.sub(lastEphem);
          let epochClaimedBn = aggregatorClaimBn.sub(lastClaim);

          if (epochRewardBn.lt(0)) epochRewardBn = ethers.BigNumber.from(0);
          if (epochClaimedBn.lt(0)) epochClaimedBn = ethers.BigNumber.from(0);

          let epochUnclaimedBn = epochRewardBn.sub(epochClaimedBn);
          if (epochUnclaimedBn.lt(0)) epochUnclaimedBn = ethers.BigNumber.from(0);

          let ephemeralVal = parseFloat(ethers.utils.formatEther(epochRewardBn));
          let claimedVal = parseFloat(ethers.utils.formatEther(epochClaimedBn));
          let unclaimedVal = parseFloat(ethers.utils.formatEther(epochUnclaimedBn));

          if (agg.claimedThisEpoch) {
            const totalAggClaim = parseFloat(ethers.utils.formatEther(aggregatorClaimBn));
            if (totalAggClaim > claimedVal) {
              claimedVal = totalAggClaim;
              ephemeralVal = Math.max(ephemeralVal, claimedVal);
              unclaimedVal = Math.max(ephemeralVal - claimedVal, 0);
            }
          }

          tokenRewardMap[tkAddr] = {
            ephemeral: ephemeralVal,
            claimedSoFar: claimedVal,
            unclaimed: unclaimedVal
          };

          prevCumulative[tkAddr] = ephemeralBn;
          prevClaimed[tkAddr] = aggregatorClaimBn;
        }
      }

      return {
        epoch: eId,
        staked: stakedEp,
        forfeited: forfEp,
        aggregator: {
          stakeSnapshot: stakeSnapBn,
          forfeitedSnapshot: forfeitSnapBn,
          claimedThisEpoch: agg.claimedThisEpoch,
          finalStake: displayStake,
          finalForfeited: displayForfeit
        },
        tokenRewards: tokenRewardMap
      };
    });

    epDataArr.reverse();
    return epDataArr;
  };

  // -----------------------
  // 1) Init global range
  // -----------------------
  const initEpochRange = async () => {
    if (!vault || !account) return;
    setLoading(true);
    setErrorLoading(false);

    try {
      const [yvGlobalData, yvTokenData] = await vault.getGlobalVaultData();
      const finalEnd = Number(yvGlobalData.lastFinalizedEpochId);

      setAggregatorTokenData(yvTokenData || []);

      const vaultActStr = ethers.utils.formatEther(yvGlobalData.totalActiveStake);
      setVaultActiveStake(vaultActStr);

      const userActBn = await vault.activeStake(account);
      const userActStr = ethers.utils.formatEther(userActBn);
      setActiveStake(userActStr);

      const userPend = await vault.pendingStake(account);
      setPendingStake(ethers.utils.formatEther(userPend));

      const userUnclaimedArr = await vault.getUserTotalUnclaimed(account);
      let totalUnclaimedBN = ethers.BigNumber.from(0);
      for (const amt of userUnclaimedArr) {
        totalUnclaimedBN = totalUnclaimedBN.add(amt);
      }
      setTotalUnclaimed(parseFloat(ethers.utils.formatEther(totalUnclaimedBN)).toFixed(4));

      const vaultActNum = parseFloat(vaultActStr);
      const userActNum = parseFloat(userActStr);
      const shareNum = vaultActNum > 0 ? (userActNum / vaultActNum) * 100 : 0;
      setShareOfPool(shareNum.toFixed(2));

      setFotonBalance('0');

      if (finalEnd < 1) {
        showMessage('No finalized epochs to show.', 'info');
        setStartEpoch(0);
        setEndEpoch(0);
        setTotalPages(1);
        setPagedEpochs([]);
        setCurrentPage(1);

        const baseUrl = 'https://flare-explorer.flare.network/address/';
        setAddressLink(`${baseUrl}${account}`);

        setLoading(false);
        return;
      }

      const computedStart =
        finalEnd > MAX_EPOCHS_TO_SHOW ? finalEnd - (MAX_EPOCHS_TO_SHOW - 1) : 1;
      setStartEpoch(computedStart);
      setEndEpoch(finalEnd);

      const recognized = unifyTokens(yvTokenData);
      setAvailableTokens(recognized);

      const count = finalEnd - computedStart + 1;
      const pages = Math.ceil(count / EPOCHS_PER_PAGE);
      setTotalPages(pages);
      setCurrentPage(1);

      const baseUrl = 'https://flare-explorer.flare.network/address/';
      setAddressLink(`${baseUrl}${account}`);

      await fetchAllEpochsForChart(computedStart, finalEnd);
      setLoading(false);
    } catch (err) {
      console.error('initEpochRange error:', err);
      showMessage(`Error: ${err.message}`, 'error');
      setErrorLoading(true);
      setLoading(false);
    }
  };

  // -----------------------
  // 1b) Fetch all 26 epochs for CHART
  // -----------------------
  const fetchAllEpochsForChart = async (lowE, highE) => {
    if (!vault) return;
    try {
      const chunkEverything = await vault.getEverything(account, lowE, highE);
      const epDataAsc = [...chunkEverything.epochsData];
      epDataAsc.sort((a, b) => Number(a.epochId) - Number(b.epochId));

      const aggregatorMap = {};
      for (let epObj of epDataAsc) {
        const eId = Number(epObj.epochId);
        const agg = await vault.getUserEpochReport(eId, account);
        aggregatorMap[eId] = agg;
      }

      const parsed = await parseEpochsData(epDataAsc, aggregatorMap);
      setGraphEpochs(parsed);
    } catch (err) {
      console.error('fetchAllEpochsForChart error:', err);
    }
  };

  // -----------------------
  // 2) Fetch a single page (TABLE data)
  // -----------------------
  const fetchPageData = async (page) => {
    if (!vault || !endEpoch || endEpoch < startEpoch) return;
    setLoading(true);
    setErrorLoading(false);

    try {
      const offset = (page - 1) * EPOCHS_PER_PAGE;
      let highest = endEpoch - offset;
      let lowest = highest - (EPOCHS_PER_PAGE - 1);

      if (lowest < startEpoch) {
        lowest = startEpoch;
      }
      if (lowest > highest) {
        setPagedEpochs([]);
        setLoading(false);
        return;
      }

      const chunkEverything = await vault.getEverything(account, lowest, highest);
      const epDataAsc = [...chunkEverything.epochsData];
      epDataAsc.sort((a, b) => Number(a.epochId) - Number(b.epochId));

      const aggregatorMap = {};
      for (let epObj of epDataAsc) {
        const eId = Number(epObj.epochId);
        const agg = await vault.getUserEpochReport(eId, account);
        aggregatorMap[eId] = agg;
      }

      const parsed = await parseEpochsData(epDataAsc, aggregatorMap);
      setPagedEpochs(parsed);
      setLoading(false);
    } catch (err) {
      console.error('fetchPageData error:', err);
      showMessage(`Error fetching page data: ${err.message}`, 'error');
      setErrorLoading(true);
      setLoading(false);
    }
  };

  // -------------------------------------
  // Claim all => reload table
  // -------------------------------------
  const handleClaimAll = async () => {
    if (!vault) return;
    setLoading(true);

    try {
      const tx = await vault.claimAll();
      await tx.wait();
      showMessage('ClaimAll successful!', 'success');
      fetchPageData(currentPage);
      await fetchAllEpochsForChart(startEpoch, endEpoch);
    } catch (err) {
      console.error('claimAll error:', err);
      showMessage(`claimAll error: ${err.message}`, 'error');
    }
    setLoading(false);
  };

  // pagination
  const goToPage = (pageNum) => {
    if (pageNum < 1) return;
    if (pageNum > totalPages) return;
    setCurrentPage(pageNum);
    fetchPageData(pageNum);
  };

  // tab change
  const handleChangeTokenTab = (event, newIndex) => {
    setTokenTabIndex(newIndex);
  };

  // on mount => init
  useEffect(() => {
    if (vault && account) {
      initEpochRange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault, account]);

  // whenever page changes (for TABLE)
  useEffect(() => {
    if (startEpoch && endEpoch && startEpoch <= endEpoch) {
      fetchPageData(currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, startEpoch, endEpoch]);

  if (!vault || !account) {
    return null; // or a fallback UI
  }

  const selectedToken =
    tokenTabIndex < availableTokens.length ? availableTokens[tokenTabIndex] : null;

  const totalExpected = computeTotalExpected(aggregatorTokenData, shareOfPool);

  // ---------------------------
  // 1) Custom Legend
  // ---------------------------
  const CustomChartLegend = ({ payload }) => {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
        {payload.map((entry, index) => {
          const isClaimedLine = entry.dataKey === 'claimed';
          return (
            <Box
              key={`legend-${index}`}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  backgroundColor: entry.color,
                  borderRadius: '50%'
                }}
              />
              {isClaimedLine ? (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Box
                    component="img"
                    src="/img/flare_logo.png"
                    alt="Flare"
                    sx={{ width: 16, height: 16 }}
                  />
                  <Typography component="span" sx={{ color: '#fff' }}>
                    Claimed
                  </Typography>
                </Stack>
              ) : (
                <Typography component="span" sx={{ color: '#fff' }}>
                  {entry.value}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    );
  };

  // ---------------------------
  // 2) Custom Tooltip
  // ---------------------------
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <Box
        sx={{
          backgroundColor: '#2a2a2a',
          border: '1px solid #ccc',
          padding: '8px',
          borderRadius: '4px'
        }}
      >
        {/* label is the x-axis label, e.g. "E34" */}
        <Typography sx={{ color: '#fff', fontWeight: 'bold' }}>
          Epoch: {label}
        </Typography>
        {payload.map((entry, idx) => {
          const val = entry.value?.toFixed(4) ?? '0.0000';
          const isClaimed = entry.dataKey === 'claimed';

          if (isClaimed) {
            return (
              <Box
                key={idx}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}
              >
                <Box
                  component="img"
                  src="/img/flare_logo.png"
                  alt="Flare"
                  sx={{ width: 16, height: 16 }}
                />
                <Typography sx={{ color: '#fff' }}>{val}</Typography>
              </Box>
            );
          } else {
            // For non-claimed lines, just show their standard text
            return (
              <Typography key={idx} sx={{ color: '#fff', mt: 1 }}>
                {entry.name}: {val}
              </Typography>
            );
          }
        })}
      </Box>
    );
  };

  // ---------------------------------------------------
  // RENDER "EXPECTED REWARDS" TABLE
  // ---------------------------------------------------
  const renderExpectedRewardsTable = () => {
    if (aggregatorTokenData.length === 0) return null;

    const userShare = parseFloat(shareOfPool) / 100;
    return (
      <Box mt={4} sx={{ overflowX: 'auto' }}>
        <Typography variant="h6" sx={{ color: '#00bfff', mb: 1 }}>
          Expected Rewards
        </Typography>
        <Table size="small" sx={{ minWidth: 500 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#00bfff', fontSize: '0.85rem' }}>
                Token
              </TableCell>
              <TableCell sx={{ color: '#00bfff', fontSize: '0.85rem' }}>
                New Vault Rewards
              </TableCell>
              <TableCell sx={{ color: '#00bfff', fontSize: '0.85rem' }}>
                Expected Rewards
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {aggregatorTokenData
              .filter((_, index) => index !== 1)
              .map((tk, i) => {
                const totalRecognizedNum = parseFloat(
                  ethers.utils.formatEther(tk.totalRecognized.toString())
                );
                const vaultBalNum = parseFloat(
                  ethers.utils.formatEther(tk.vaultBalance.toString())
                );

                let newRewards = vaultBalNum - totalRecognizedNum;
                if (newRewards < 0) newRewards = 0;
                const userExpected = newRewards * userShare;

                return (
                  <TableRow key={i}>
                    <TableCell sx={{ color: '#fff', fontSize: '0.8rem' }}>
                      {tk.symbol || '???'}
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
                          {newRewards.toFixed(4)}
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
                          {userExpected.toFixed(4)}
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </Box>
    );
  };

  // ---------------------------------------------------
  // MOBILE LAYOUT
  // ---------------------------------------------------
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
        {/* user info row */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            justifyContent: 'center',
            mb: 3
          }}
        >
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
              Share%
            </Typography>
            <Typography sx={{ color: '#fff', fontSize: '0.85rem' }}>
              {shareOfPool}
            </Typography>
          </Box>

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
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
              <Box
                component="img"
                src="/img/flare_logo.png"
                alt="Flare"
                sx={{ width: 16, height: 16 }}
              />
              <Typography sx={{ color: '#fff', fontSize: '0.85rem' }}>
                {totalUnclaimed}
              </Typography>
            </Stack>
          </Box>

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
              Exp.
            </Typography>
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
              <Box
                component="img"
                src="/img/flare_logo.png"
                alt="Flare"
                sx={{ width: 16, height: 16 }}
              />
              <Typography sx={{ color: '#fff', fontSize: '0.85rem' }}>
                {totalExpected}
              </Typography>
            </Stack>
          </Box>

          <Tooltip
            title="this attempts to synchronise and claim any new rewards"
            placement="top"
          >
            <Box
              sx={{
                backgroundColor: '#2a2a2a',
                borderRadius: 2,
                p: 1,
                textAlign: 'center',
                minWidth: '100px'
              }}
            >
              <NeonButton onClick={handleClaimAll}>Try Sync. & Claim</NeonButton>
            </Box>
          </Tooltip>
        </Box>

        {availableTokens.length > 0 && (
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
        )}

        {loading ? (
          <Box display="flex" justifyContent="center">
            <CircularProgress sx={{ color: '#00bfff' }} />
          </Box>
        ) : errorLoading ? (
          <Typography color="error" textAlign="center">
            Failed to load epoch data.
          </Typography>
        ) : pagedEpochs.length === 0 ? (
          <Typography sx={{ color: '#fff', textAlign: 'center' }}>
            No data for this page.
          </Typography>
        ) : (
          <>
            {pagedEpochs.map((ep, idx) => {
              const aggregatorStakeBn = ep.aggregator.stakeSnapshot;
              const aggregatorForfBn = ep.aggregator.forfeitedSnapshot;
              const aggregatorStake = ep.aggregator.finalStake;
              const aggregatorForf = ep.aggregator.finalForfeited;

              const displayStake =
                aggregatorStakeBn !== '0' ? aggregatorStake : ep.staked;
              const displayForfeit =
                aggregatorForfBn !== '0' ? aggregatorForf : ep.forfeited;

              let claimedVal = 0;
              let leftover = 0;
              if (selectedToken && ep.tokenRewards) {
                const lowerSel = selectedToken.token.toLowerCase();
                const info = ep.tokenRewards[lowerSel];
                if (info) {
                  claimedVal = info.claimedSoFar;
                  leftover = Math.max(info.ephemeral - claimedVal, 0);
                }
              }

              const claimedColor = claimedVal > 0 ? 'green' : 'gray';
              const unclaimedColor = leftover > 0 ? 'red' : 'gray';

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
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon sx={{ color: '#fff' }} />}
                    sx={{ '&.Mui-expanded': { minHeight: '0' } }}
                  >
                    <Typography sx={{ fontWeight: 'bold', color: '#00bfff', fontSize: '0.95rem' }}>
                      E{ep.epoch}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography sx={{ color: '#fff', fontSize: '0.85rem' }}>
                      Stake: {displayStake.toFixed(2)}, Forf: {displayForfeit.toFixed(2)}
                    </Typography>
                    {selectedToken && (
                      <Typography sx={{ fontSize: '0.85rem', mt: 0.5 }}>
                        <Box component="span" sx={{ color: claimedColor }}>
                          Claimed {selectedToken.symbol}: {claimedVal.toFixed(4)}
                        </Box>
                        {'  /  '}
                        <Box component="span" sx={{ color: unclaimedColor }}>
                          Unclaimed: {leftover.toFixed(4)}
                        </Box>
                      </Typography>
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </>
        )}

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
            <NeonButton
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </NeonButton>
            <Typography sx={{ color: '#fff', fontSize: '0.85rem' }}>
              Page {currentPage} of {totalPages}
            </Typography>
          </Stack>
        </Box>

        {/* MOBILE CHART */}
        {selectedToken && (
          <Box mt={4} sx={{ width: '100%', height: 300 }}>
            <RewardsChartMobile chartEpochs={graphEpochs} selectedToken={selectedToken} />
          </Box>
        )}

        {renderExpectedRewardsTable()}
      </CardContent>
    </Card>
  );

  // ===========================================
  // MOBILE CHART
  // ===========================================
  const RewardsChartMobile = ({ chartEpochs, selectedToken }) => {
    const tokenAddr = selectedToken.token.toLowerCase();
    const copy = [...chartEpochs];
    copy.sort((a, b) => a.epoch - b.epoch);

    const chartData = copy.map((ep) => {
      const aggregatorStakeBn = ep.aggregator.stakeSnapshot;
      const aggregatorStakeVal = ep.aggregator.finalStake;
      const fallbackStakeVal = ep.staked;
      const chosenStake = aggregatorStakeBn !== '0' ? aggregatorStakeVal : fallbackStakeVal;

      const info = ep.tokenRewards[tokenAddr];
      const claimedVal = info ? info.claimedSoFar : 0;

      return {
        epoch: ep.epoch,
        claimed: parseFloat(claimedVal.toFixed(4)),
        stake: parseFloat(chosenStake.toFixed(2))
      };
    });

    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />
          <XAxis dataKey="epoch" stroke="#ccc" tick={false} />
          <YAxis yAxisId="left" stroke="#ccc" tick={{ fill: '#ccc', fontSize: 12 }} />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#ccc"
            tick={{ fill: '#ccc', fontSize: 12 }}
          />

          {/* 1) Our custom tooltip with Flare icon for claimed */}
          <RechartsTooltip content={<CustomTooltip />} />

          {/* 2) Legend bottom-centered, custom icon for 'claimed' */}
          <Legend
            content={<CustomChartLegend />}
            verticalAlign="bottom"
            align="center"
          />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="claimed"
            stroke="#00bfff"
            name={`Claimed ${selectedToken.symbol}`}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="stake"
            stroke="#ff00ff"
            name="Stake"
          />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  // ---------------------------------------------------
  // DESKTOP LAYOUT
  // ---------------------------------------------------
  const DesktopLayout = () => (
    <Card
      sx={{
        backgroundColor: '#1e1e1e',
        maxWidth: 900,
        width: '95%',
        margin: '20px auto',
        borderRadius: '15px',
        boxShadow: '0 0 20px 5px rgba(0, 191, 255, 0.6)',
        p: 2
      }}
    >
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            justifyContent: 'center',
            mb: 3
          }}
        >
          <Box sx={{ backgroundColor: '#2a2a2a', borderRadius: 2, p: 2, textAlign: 'center' }}>
            <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
              Active
            </Typography>
            <Typography sx={{ color: '#fff' }}>
              {parseFloat(activeStake).toFixed(2)}
            </Typography>
          </Box>
          <Box sx={{ backgroundColor: '#2a2a2a', borderRadius: 2, p: 2, textAlign: 'center' }}>
            <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
              Pending
            </Typography>
            <Typography sx={{ color: '#fff' }}>
              {parseFloat(pendingStake).toFixed(2)}
            </Typography>
          </Box>
          <Box sx={{ backgroundColor: '#2a2a2a', borderRadius: 2, p: 2, textAlign: 'center' }}>
            <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
              Share%
            </Typography>
            <Typography sx={{ color: '#fff' }}>
              {shareOfPool}
            </Typography>
          </Box>

          <Box sx={{ backgroundColor: '#2a2a2a', borderRadius: 2, p: 2, textAlign: 'center' }}>
            <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
              Unclaimed
            </Typography>
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
              <Box
                component="img"
                src="/img/flare_logo.png"
                alt="Flare"
                sx={{ width: 16, height: 16 }}
              />
              <Typography sx={{ color: '#fff' }}>
                {totalUnclaimed}
              </Typography>
            </Stack>
          </Box>
          <Box sx={{ backgroundColor: '#2a2a2a', borderRadius: 2, p: 2, textAlign: 'center' }}>
            <Typography variant="subtitle2" sx={{ color: '#00bfff', fontWeight: 'bold' }}>
              Expected
            </Typography>
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
              <Box
                component="img"
                src="/img/flare_logo.png"
                alt="Flare"
                sx={{ width: 16, height: 16 }}
              />
              <Typography sx={{ color: '#fff' }}>
                {totalExpected}
              </Typography>
            </Stack>
          </Box>
          <Tooltip title="this attempts to synchronise and claim any new rewards" placement="top">
            <Box
              sx={{
                backgroundColor: '#2a2a2a',
                borderRadius: 2,
                p: 2,
                textAlign: 'center',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              <NeonButton onClick={handleClaimAll}>Try Sync. & Claim</NeonButton>
            </Box>
          </Tooltip>
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center">
            <CircularProgress sx={{ color: '#00bfff' }} />
          </Box>
        ) : errorLoading ? (
          <Typography color="error" textAlign="center">
            Failed to load epoch data.
          </Typography>
        ) : (
          <Box>
            {availableTokens.length > 0 && (
              <Tabs
                value={tokenTabIndex}
                onChange={handleChangeTokenTab}
                textColor="secondary"
                indicatorColor="secondary"
                centered
                sx={{ marginBottom: '16px' }}
              >
                {availableTokens.map((tkn, idx) => (
                  <Tab
                    key={idx}
                    label={tkn.symbol}
                    sx={{ color: '#fff', textTransform: 'none' }}
                  />
                ))}
              </Tabs>
            )}

            <Box sx={{ overflowX: 'auto' }}>
              <Table sx={{ minWidth: 650, width: '100%' }} size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#00bfff' }}>Epoch</TableCell>
                    <TableCell sx={{ color: '#00bfff' }}>Stake</TableCell>
                    <TableCell sx={{ color: '#00bfff' }}>Forfeited</TableCell>
                    <TableCell sx={{ color: '#00bfff' }}>Rewards</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagedEpochs.map((ep, idx) => {
                    const aggregatorStakeBn = ep.aggregator.stakeSnapshot;
                    const aggregatorForfBn = ep.aggregator.forfeitedSnapshot;
                    const aggregatorStake = ep.aggregator.finalStake;
                    const aggregatorForf = ep.aggregator.finalForfeited;

                    const displayStake =
                      aggregatorStakeBn !== '0' ? aggregatorStake : ep.staked;
                    const displayForfeit =
                      aggregatorForfBn !== '0' ? aggregatorForf : ep.forfeited;

                    let claimedVal = 0;
                    if (selectedToken && ep.tokenRewards) {
                      const lowerSel = selectedToken.token.toLowerCase();
                      const info = ep.tokenRewards[lowerSel];
                      if (info) {
                        claimedVal = info.claimedSoFar;
                      }
                    }

                    const claimedColor = claimedVal > 0 ? 'green' : 'gray';

                    const rewardsCell = (
                      <Box>
                        <Box component="span" sx={{ color: claimedColor, marginRight: '8px' }}>
                          <Box
                            component="img"
                            src="/img/flare_logo.png"
                            alt="Flare"
                            sx={{ width: 16, height: 16 }}
                          />
                          {claimedVal.toFixed(4)}
                        </Box>
                      </Box>
                    );

                    return (
                      <TableRow key={idx}>
                        <TableCell sx={{ color: '#fff' }}>{ep.epoch}</TableCell>
                        <TableCell sx={{ color: '#fff' }}>
                          {displayStake.toFixed(2)}
                        </TableCell>
                        <TableCell sx={{ color: '#fff' }}>
                          {displayForfeit.toFixed(2)}
                        </TableCell>
                        <TableCell sx={{ color: '#fff' }}>{rewardsCell}</TableCell>
                      </TableRow>
                    );
                  })}
                  {pagedEpochs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ textAlign: 'center', color: '#fff' }}>
                        No data for this page.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>

            <Box
              mt={2}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <Stack direction="row" spacing={2}>
                <NeonButton onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
                  Prev
                </NeonButton>
                <NeonButton
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </NeonButton>
                <Typography sx={{ color: '#fff' }}>
                  Page {currentPage} of {totalPages}
                </Typography>
              </Stack>
            </Box>

            {selectedToken && (
              <Box mt={4} sx={{ width: '100%', height: 300 }}>
                <RewardsChartDesktop chartEpochs={graphEpochs} selectedToken={selectedToken} />
              </Box>
            )}

            {renderExpectedRewardsTable()}
          </Box>
        )}
      </CardContent>
    </Card>
  );

  // ---------------------------------------------------
  // DESKTOP CHART
  // ---------------------------------------------------
  const RewardsChartDesktop = ({ chartEpochs, selectedToken }) => {
    const tokenAddr = selectedToken.token.toLowerCase();
    const copy = [...chartEpochs];
    copy.sort((a, b) => a.epoch - b.epoch);

    const chartData = copy.map((ep) => {
      const aggregatorStakeBn = ep.aggregator.stakeSnapshot;
      const aggregatorStakeVal = ep.aggregator.finalStake;
      const fallbackStakeVal = ep.staked;
      const chosenStake = aggregatorStakeBn !== '0' ? aggregatorStakeVal : fallbackStakeVal;

      const info = ep.tokenRewards[tokenAddr];
      const claimedVal = info ? info.claimedSoFar : 0;

      return {
        epoch: ep.epoch,
        claimed: parseFloat(claimedVal.toFixed(4)),
        stake: parseFloat(chosenStake.toFixed(2))
      };
    });

    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />
          <XAxis dataKey="epoch" stroke="#ccc" />
          <YAxis yAxisId="left" stroke="#ccc" />
          <YAxis yAxisId="right" orientation="right" stroke="#ccc" />

          {/* Our custom tooltip with flare icon for claimed */}
          <RechartsTooltip content={<CustomTooltip />} />
          {/* Legend at bottom, centered, with custom label for claimed */}
          <Legend
            content={<CustomChartLegend />}
            verticalAlign="bottom"
            align="center"
          />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="claimed"
            stroke="#00bfff"
            name={`Claimed ${selectedToken.symbol}`}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="stake"
            stroke="#ff00ff"
            name="Stake"
          />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  // ---------------------------------------------------
  // MAIN RENDER
  // ---------------------------------------------------
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

export default YV_EpochHistoryCard;
