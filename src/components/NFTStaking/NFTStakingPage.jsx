import React, {
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo
} from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  Card,
  CardMedia,
  CardContent,
  Checkbox,
  FormControlLabel,
  Snackbar,
  Alert,
  MenuItem,
  Select,
  InputLabel,
  styled,
  LinearProgress,
  TextField,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Paper,
  Grid, // <-- NEW: Import Grid for responsive card layout
  useTheme, // for breakpoint-based styling if needed
  Skeleton
} from '@mui/material';
import debounce from 'lodash.debounce';       // <<< add
import { FixedSizeGrid as VirtualGrid } from 'react-window'; // <<< add
import { ethers } from 'ethers';
import { BlockchainContext } from '../../contexts/BlockchainContext';
import useIpfsImg from '../../hooks/useIpfsImg'  // adjust path as needed
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

// A small styled FormControl for the page size dropdown
const StyledFormControl = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1)
}));

/**
 * The authorized NFT contract for staking
 */
const AUTHORIZED_NFT_CONTRACT = '0xbc42e9a6c24664749b2a0d571fd67f23386e34b8'.toLowerCase();

/* 
  =================================
  =  1. Caching & Retry Utilities =
  =================================
*/

/**
 * Load any existing NFT metadata cache from localStorage
 */
function loadCacheFromLocalStorage() {
  try {
    const raw = localStorage.getItem('nftMetadataCache');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to parse NFT metadata cache:', err);
    return {};
  }
}

/** Save updated cache object back to localStorage */
function saveCacheToLocalStorage(cacheObject) {
  try {
    localStorage.setItem('nftMetadataCache', JSON.stringify(cacheObject));
  } catch (err) {
    console.warn('Failed to save NFT metadata cache:', err);
  }
}

/**
 * Exponential backoff fetch wrapper
 * Attempts up to `maxAttempts` times with increasing delays.
 */
async function fetchWithRetry(url, options = {}, maxAttempts = 3, attempt = 1) {
  try {
    const resp = await fetch(url, options);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    return resp;
  } catch (err) {
    if (attempt >= maxAttempts) {
      throw err;
    }
    // Wait (2^attempt * 100) ms
    const delayMs = 100 * (2 ** attempt);
    console.warn(`fetchWithRetry: attempt #${attempt} failed. Retrying in ${delayMs}ms...`);
    await new Promise((r) => setTimeout(r, delayMs));
    return fetchWithRetry(url, options, maxAttempts, attempt + 1);
  }
}

/**
 * Use local + in-memory caching for NFT metadata.
 * Also uses retry logic in fetch.
 */
async function fetchTokenInstanceMetadata(contractAddr, tokenId, metadataCacheRef) {
  const cacheKey = `${contractAddr}-${tokenId}`;

  // 1) Check in-memory cache
  if (metadataCacheRef.current[cacheKey]) {
    return metadataCacheRef.current[cacheKey];
  }

  // 2) Check localStorage cache
  const storedCache = loadCacheFromLocalStorage();
  if (storedCache[cacheKey]) {
    metadataCacheRef.current[cacheKey] = storedCache[cacheKey];
    return storedCache[cacheKey];
  }

  // 3) Not found => fetch from Explorer with retry
  const url = `https://flare-explorer.flare.network/api/v2/tokens/${contractAddr}/instances/${tokenId}`;

    /* ---------------------------------------------------------- */
    /*  helper – turn *any* ipfs://… or …/ipfs/CID into a gateway */
/* ---------------------------------------------------------- */
    const normalizeIpfs = (u) => {
      if (!u) return null;
      // ipfs://CID/[…]
      if (u.startsWith('ipfs://')) {
        return `https://dweb.link/ipfs/${u.slice(7)}`;
      }
      // https://foo.bar/ipfs/CID/[…]
      const m = u.match(/\/ipfs\/(.+)/);
      if (m) return `https://dweb.link/ipfs/${m[1]}`;
      return u;                              // already https/http
    };

  try {
    const resp = await fetchWithRetry(url, { method: 'GET', headers: { accept: 'application/json' } }, 3);
    const data = await resp.json();

    

    const normalizeIpfs = (u) => {
      if (!u) return null;

      // 1. ipfs://CID/…  -> gateway/ipfs/CID/…
      if (u.startsWith('ipfs://')) {
        return `https://dweb.link/ipfs/${u.slice(7)}`;
      }

      // 2. https://whatever.tld/ipfs/CID/… -> rewrite to the same CID on gateway
      const m = u.match(/\/ipfs\/(.+)/);
      if (m) {
        return `https://dweb.link/ipfs/${m[1]}`;
      }

      // 3. already https and not IPFS – leave as is
      return u;
    };

    const imageUrl = normalizeIpfs(data.image_url || data.media_url);


    const meta = data.metadata || null;
    const symbol = data.token?.symbol || null;

    const fetchedData = {
      contractAddress: contractAddr,
      tokenId,
      image_url: imageUrl,
      metadata: meta,
      tokenSymbol: symbol,
      is_unique: data.is_unique || false
    };

    // Cache in memory + localStorage
    metadataCacheRef.current[cacheKey] = fetchedData;
    storedCache[cacheKey] = fetchedData;
    saveCacheToLocalStorage(storedCache);

    return fetchedData;
  } catch (err) {
    console.warn(`fetchTokenInstanceMetadata error for ${tokenId}:`, err);
    // fallback
    const fallbackData = {
      contractAddress: contractAddr,
      tokenId,
      image_url: null,
      metadata: null,
      tokenSymbol: null
    };
    metadataCacheRef.current[cacheKey] = fallbackData;
    storedCache[cacheKey] = fallbackData;
    saveCacheToLocalStorage(storedCache);
    return fallbackData;
  }
}

/* 
  ==========================
  =  2. On-Chain Fetchers  =
  ==========================
*/
async function fetchUnstakedPage(userAddress, nftStakingContract, metadataCacheRef, pageSize, pageIndex) {
  const offset = (pageIndex - 1) * pageSize;
  const url =
    `https://flare-explorer.flare.network/api/v2/addresses/${userAddress}/nft` +
    `?type=ERC-721&limit=${pageSize}&offset=${offset}`;

  const resp = await fetchWithRetry(url, { headers: { accept: 'application/json' } });
  const items = (await resp.json()).items || [];

  const filtered = items.filter(i => 
    i.token?.address?.toLowerCase() === AUTHORIZED_NFT_CONTRACT
  );

  // fetch metadata in parallel, drop any delays
  return Promise.all(
    filtered.map(i =>
      fetchTokenInstanceMetadata(AUTHORIZED_NFT_CONTRACT, i.id, metadataCacheRef)
    )
  );
}
/* 
  ============================
  =  3. NFT Checkbox + Card  =
  ============================
*/

/**
 * Lazy-loaded card with fallback image handling + search-friendly data attributes
 */
function NFTCheckboxCard({
  nft,
  selected,
  onSelectChange,
  isStaked = false,
  unclaimed = '0'
}) {
  const { tokenId, image_url, metadata } = nft;
  const nftName = metadata?.name || `Token #${tokenId}`;

// ← new IPFS‐aware hook
const {
  src: displayImage,
  loaded,
  onError: handleImageError,
  onLoad
} = useIpfsImg(image_url);

  return (
    <Card
      data-token-id={tokenId} // for searching/filtering
      aria-label={`NFT card for token #${tokenId}`}
      sx={{
        // Remove maxWidth so it can scale in a responsive grid
        width: '100%',
        minWidth: 280,
        backgroundColor: '#1e1e1e',
        color: '#fff',
        // Use breakpoints to soften shadows on smaller devices
        boxShadow: {
          xs: '0 0 10px rgba(0,191,255,0.3)',
          sm: '0 0 20px 5px rgba(0,191,255,0.4)',
          md: '0 0 20px 5px rgba(0,191,255,0.6)'
        },
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
    >
      {displayImage && (
        <CardMedia
          component="img"
          sx={{
            width: '100%',
            height: { xs: 'auto', sm: 200 },
            objectFit: 'cover',
          }}
          image={displayImage}
          alt={`NFT #${tokenId}`}
          loading="lazy"
          onLoad={onLoad}
          onError={handleImageError}
        />
      )}
      <CardContent sx={{ textAlign: 'center', p: 1 }}>
        <Typography variant="subtitle1" sx={{ color: '#00bfff', mb: 0.5 }} aria-label="NFT name">
          {nftName}
        </Typography>
        {isStaked && (
          <Tooltip title="Unclaimed rewards for this specific NFT.">
            <Typography variant="body2" sx={{ color: '#ccc' }}>
              Unclaimed:
            </Typography>
            <Typography variant="body2" sx={{ color: '#ccc', mb: 1 }}>
              {parseFloat(unclaimed).toFixed(5)} $Maid
            </Typography>
          </Tooltip>
        )}

        <FormControlLabel
          control={
            <Checkbox
              checked={selected}
              onChange={(e) => onSelectChange(tokenId, e.target.checked)}
              sx={{ color: '#00bfff', '&.Mui-checked': { color: '#00bfff' } }}
            />
          }
          label={isStaked ? 'Unstake' : 'Stake'}
          sx={{ color: '#fff', mt: 1 }}
          aria-label={isStaked ? `Unstake Token #${tokenId}` : `Stake Token #${tokenId}`}
        />
      </CardContent>
    </Card>
  );
}

/* 
  =====================
  =  4. Main Page App =
  =====================
*/

export default function NFTStakingPage() {
  const { account, nftStakingContract, signer, provider } = useContext(BlockchainContext);

    /* ------------------------------------------------------------------ */
  /*   DECIMALS — read once from chain and share with whole component    */
  /* ------------------------------------------------------------------ */
  const [rewardDecimals, setRewardDecimals] = useState(18);          // default → 18

  useEffect(() => {
    async function loadDecimals() {
      try {
        const erc20 = new ethers.Contract(
          process.env.REACT_APP_FOTON_TOKEN_ADDRESS,
          ['function decimals() view returns (uint8)'],
          provider
        );
        setRewardDecimals(await erc20.decimals());
      } catch (e) {
        console.warn('Could not read decimals(), fallback to 18', e);
      }
    }
    if (provider) loadDecimals();
  }, [provider]);


  // only call loadData once we know rewardDecimals has been set
  useEffect(() => {
    if (!account || !nftStakingContract) return;
    // rewardDecimals starts at 18, but if your real token is different,
    // this guarantees we don't load data until after we read the on‑chain decimals.
    loadData();
  }, [account, nftStakingContract, rewardDecimals]);

  /** helper: BigNumber → float using current token decimals */
  const toFloat = (bn) => parseFloat(ethers.utils.formatUnits(bn || 0, rewardDecimals));

  // Loading states
  const [loading, setLoading] = useState(false);
  const [loadingBatch, setLoadingBatch] = useState(false);

  // On-chain user data, global data
  const [userData, setUserData] = useState(null);
  const [globalData, setGlobalData] = useState(null);

  // We define a small local state for the table page *here*, at top-level
  const [tablePage, setTablePage] = useState(1);
  const totalPages = 3;

  // Admin / Owner check
  const [isOwner, setIsOwner] = useState(false);

  // Unstaked vs staked items
  const [unstakedNfts, setUnstakedNfts] = useState([]);
  const [stakedNfts, setStakedNfts] = useState([]);

  // Selections
  const [selectedToStake, setSelectedToStake] = useState([]);
  const [selectedToUnstake, setSelectedToUnstake] = useState([]);

  // Pagination
  // We'll keep staked and unstaked pagination separate
  const [stakedPageSize, setStakedPageSize] = useState(4);
  const [unstakedPageSize, setUnstakedPageSize] = useState(4);

  const [stakedPage, setStakedPage] = useState(1);
  const [unstakedPage, setUnstakedPage] = useState(1);

  // Search / Filter states
  const [unstakedSearchTerm, setUnstakedSearchTerm] = useState('');
  const [stakedSearchTerm, setStakedSearchTerm] = useState('');

   // debounced handler for the unstaked search box
  const onUnstakedSearchChange = useMemo(
    () => debounce(val => {
      setUnstakedSearchTerm(val);
      setUnstakedPage(1);
    }, 200),
    []
  );

  // Sort state: can be, 'name', or 'tokenId'
  const [unstakedSort, setUnstakedSort] = useState('tokenId');
  const [stakedSort, setStakedSort] = useState('tokenId');

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const handleCloseSnackbar = () => setSnackbar((prev) => ({ ...prev, open: false }));
  const showMessage = (msg, severity = 'info') => {
    setSnackbar({ open: true, message: msg, severity });
  };

  // In-memory caching for NFT metadata
  const metadataCacheRef = useRef({});

  // For token price -> USD conversion (placeholder)
  const [usdRate, setUsdRate] = useState(0.5); // "1 RewardToken = $0.5" (example)

  //======================== LOAD DATA ========================
  async function loadData() {
    if (!account || !nftStakingContract) return;
    setLoading(true);

    try {
      // 1) Global data (epoch info, budgets, etc.)
      const global = await nftStakingContract.getAllGlobalData();
      setGlobalData(global);

      // 2) getAllDataForUser => userData
      const data = await nftStakingContract.getAllDataForUser(account);
      setUserData(data);

      // 3) Check if user is the owner
      const ownerAddr = await nftStakingContract.owner();
      setIsOwner(ownerAddr.toLowerCase() === account.toLowerCase());

      // 4) STAKED items
      const stakedArr = await Promise.all(
        data.stakedTokenIds.map(async (bn, i) => {
          const tokenId = bn.toString();
          // 1) Grab the raw BigNumber; default to Zero
          const unclaimedBn = data.tokenUnclaimedRewards[i] || ethers.constants.Zero;
          // 2) Format to a JS string, then parse to a float
          const rawString = ethers.utils.formatUnits(unclaimedBn, rewardDecimals);
          const unclaimedFloat = parseFloat(rawString);

          // 3) Fetch metadata in parallel
          const meta = await fetchTokenInstanceMetadata(
            AUTHORIZED_NFT_CONTRACT,
            tokenId,
            metadataCacheRef
          );

          // 4) Return the NFT + **numeric** unclaimed
          return {
            ...meta,
            unclaimed: unclaimedFloat
          };
        })
      );

      // 5) UNSTAKED: fetch only the current page
      const unstakedArr = await fetchUnstakedPage(
        account,
        nftStakingContract,
        metadataCacheRef,
        unstakedPageSize,
        unstakedPage
      );

      // 6) Sort both arrays by default => 
      stakedArr.sort((a, b) => Number(b.tokenId) - Number(a.tokenId));
      unstakedArr.sort((a, b) => Number(b.tokenId) - Number(a.tokenId));

      // 7) Update states
      setStakedNfts(stakedArr);
      setUnstakedNfts(unstakedArr);
      setSelectedToStake([]);
      setSelectedToUnstake([]);
    } catch (err) {
      console.error('loadData error:', err);
      showMessage(`Error loading data: ${err.message}`, 'error');
    }

    setLoading(false);
  }

  // Initial load
  useEffect(() => {
    if (account && nftStakingContract) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, nftStakingContract]);

  //======================== APPROVAL ========================
  async function ensureApprovedForAll() {
    if (!signer || !account) return;
    const erc721Abi = [
      'function isApprovedForAll(address owner, address operator) view returns (bool)',
      'function setApprovalForAll(address operator, bool approved) external'
    ];
    const nftContract = new ethers.Contract(AUTHORIZED_NFT_CONTRACT, erc721Abi, signer);
    const alreadyApproved = await nftContract.isApprovedForAll(account, nftStakingContract.address);
    if (!alreadyApproved) {
      const tx = await nftContract.setApprovalForAll(nftStakingContract.address, true);
      await tx.wait();
    }
  }

  //======================== BATCH ACTIONS ========================
  const handleSelectUnstaked = (tokenId, checked) => {
    setSelectedToStake((prev) => {
      if (checked) return [...prev, tokenId];
      return prev.filter((t) => t !== tokenId);
    });
  };
  const handleSelectStaked = (tokenId, checked) => {
    setSelectedToUnstake((prev) => {
      if (checked) return [...prev, tokenId];
      return prev.filter((t) => t !== tokenId);
    });
  };

  const handleBatchStake = async () => {
    if (!selectedToStake.length) {
      showMessage('No NFTs selected for staking', 'warning');
      return;
    }
    try {
      setLoadingBatch(true);
      await ensureApprovedForAll();
      const tokenIds = selectedToStake.map((id) => ethers.BigNumber.from(id));
      const tx = await nftStakingContract.stakeNFTs(tokenIds);
      await tx.wait();
      showMessage('Stake transaction successful!', 'success');
      await loadData();
    } catch (err) {
      console.error('handleBatchStake:', err);
      showMessage(`Error in batch stake: ${err.message}`, 'error');
    }
    setLoadingBatch(false);
  };

  const handleBatchUnstake = async () => {
    if (!selectedToUnstake.length) {
      showMessage('No NFTs selected for unstaking', 'warning');
      return;
    }
    try {
      setLoadingBatch(true);
      const tokenIds = selectedToUnstake.map((id) => ethers.BigNumber.from(id));
      const tx = await nftStakingContract.unstakeNFTs(tokenIds);
      await tx.wait();
      showMessage('Unstake transaction successful!', 'success');
      await loadData();
    } catch (err) {
      console.error('handleBatchUnstake:', err);
      showMessage(`Error in batch unstake: ${err.message}`, 'error');
    }
    setLoadingBatch(false);
  };

  const handleClaimRewards = async () => {
    try {
      setLoadingBatch(true);
      const tx = await nftStakingContract.claimRewards();
      await tx.wait();
      showMessage('Rewards claimed successfully!', 'success');
      await loadData();
    } catch (err) {
      console.error('claimRewards:', err);
      showMessage(`Error claiming rewards: ${err.message}`, 'error');
    }
    setLoadingBatch(false);
  };

  //======================== PAGINATION & FILTERS ========================
  function paginateItems(items, page, size) {
    const start = (page - 1) * size;
    return items.slice(start, start + size);
  }

  // Search / Filter function
  function filterNfts(items, searchTerm) {
    const lower = searchTerm.toLowerCase();
    return items.filter((item) => {
      const { tokenId, metadata } = item;
      const name = metadata?.name?.toLowerCase() || '';
      // match if tokenId or name includes the searchTerm
      return (
        tokenId.toString().includes(lower) ||
        name.includes(lower)
      );
    });
  }

  // Sorting function
  function sortNfts(items, sortBy) {
    const sorted = [...items];
    if (sortBy === 'tokenId') {
      // desc
      sorted.sort((a, b) => Number(b.tokenId) - Number(a.tokenId));
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => {
        const nameA = (a.metadata?.name || '').toLowerCase();
        const nameB = (b.metadata?.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
    } else if (sortBy === 'tokenId') {
      sorted.sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
    }
    return sorted;
  }

  // Deriving staked arrays
  const filteredStaked = filterNfts(stakedNfts, stakedSearchTerm);
  const sortedStaked = sortNfts(filteredStaked, stakedSort);
  const stakedTotalPages = Math.ceil(sortedStaked.length / stakedPageSize) || 1;
  const pagedStaked = paginateItems(sortedStaked, stakedPage, stakedPageSize);

  // Deriving unstaked arrays
  const filteredUnstaked = useMemo(
    () => filterNfts(unstakedNfts, unstakedSearchTerm),
    [unstakedNfts, unstakedSearchTerm]
  );
  const sortedUnstaked = useMemo(
    () => sortNfts(filteredUnstaked, unstakedSort),
    [filteredUnstaked, unstakedSort]
  );
  const unstakedTotalPages = Math.ceil(sortedUnstaked.length / unstakedPageSize) || 1;
  const pagedUnstaked = paginateItems(sortedUnstaked, unstakedPage, unstakedPageSize);

  //======================== DERIVED FINANCIAL DATA ========================
  let userRatePerSecond = 0;
  let userRatePerDay = 0;
  let userRatePerYear = 0;
  let userSharePercent = 0;
  let epochProgressPercent = 0;
  const totalSecInEpoch = 365 * 24 * 3600;

  if (globalData && userData) {
    const rawUserMult = 1.0;
    const rawTotalMult = 1.0;
    const rawBaseRate = userData.baseRewardRate;

    if (rawTotalMult && rawTotalMult) {
      const fraction = Number(rawUserMult.toString()) / Number(rawTotalMult.toString());
      userSharePercent = fraction * 100;

      const scaledFrac = Math.floor(fraction * 1e6);
      const userRateBn = rawBaseRate.mul(scaledFrac).div(1e6);
      userRatePerSecond = Number(ethers.utils.formatUnits(userRateBn, rewardDecimals));
      userRatePerDay = userRatePerSecond * 86400;
      userRatePerYear = userRatePerSecond * 31536000;
    }

    // epoch progress
    const secondsLeft = globalData.secondsUntilEpochEnd.toString();
    const leftover = Number(secondsLeft);
    const elapsed = totalSecInEpoch - leftover;
    if (elapsed < 0) {
      epochProgressPercent = leftover <= 0 ? 100 : 0;
    } else {
      epochProgressPercent = (elapsed / totalSecInEpoch) * 100;
    }
  }

  // Convert to USD (placeholder)
  const dailyUsd = userRatePerDay * usdRate;
  const yearlyUsd = userRatePerYear * usdRate;

  // Admin panel example
  const handleTopUp = async () => {
    showMessage('Would implement a top-up flow here.', 'info');
  };

  // ======================== ARRAYS FOR DASHBOARD TABLE PAGES ======================
  const page1Rows = [

    {
      label: 'Pending Rewards',
      value: userData
        ? toFloat(userData.userPendingReward).toFixed(5) + ' $Maid'
        : '0'
    },
    {
      label: 'Share of Pool (%)',
      value: `${userSharePercent.toFixed(2)}%`
    },
    {
      label: '$Maid/sec',
      value: userRatePerSecond.toFixed(5)
    },
    {
      label: '$Maid/day',
      value: `${userRatePerDay.toFixed(5)}`
    }
    
  ];

  const page2Rows = [
    {
      label: 'Current Epoch',
      value: globalData ? globalData.currentEpoch.toString() : '0'
    },
    {
      label: 'Epoch Budget',
      value: globalData
        ? toFloat(globalData.epochBudget).toFixed(5) + ' $Maid'
        : '0'
    },
    {
      label: 'Epoch Ends In',
      value: globalData
        ? formatSeconds(globalData.secondsUntilEpochEnd.toString())
        : '0'
    },
    {
      label: 'Total Remaining Balance',
      value: globalData
        ? toFloat(globalData.totalRemaining).toFixed(5) + ' $Maid'
        : '0'
    },
    {
      label: 'Epoch Progress (%)',
      value: `${epochProgressPercent.toFixed(2)}%`,
      isProgressBar: true
    }
  ];

  const page3Rows = [
    {
      label: 'Base Reward Rate ($Maid/sec)',
      value: userData
        ? toFloat(userData.baseRewardRate).toFixed(10)
        : '0'
    },
    {
      label: 'Your $Maid/year',
      value: `${userRatePerYear.toFixed(3)}`
    }
  ];

  let displayedRows;
  if (tablePage === 1) {
    displayedRows = page1Rows;
  } else if (tablePage === 2) {
    displayedRows = page2Rows;
  } else {
    displayedRows = page3Rows;
  }

  //======================== RENDER ========================
  if (!account || !nftStakingContract) {
    return (
      <Box sx={{ color: '#fff', textAlign: 'center', mt: 4 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Please connect your wallet to view Floor Sweeper Staking.
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
          {userData && globalData && (
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
                  disabled={loadingBatch}
                >
                  {loadingBatch ? 'Processing...' : 'Claim Rewards'}
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

          {/* ==================== STAKED NFTs ==================== */}
          <Box
            sx={{
              p: 2,
              backgroundColor: '#1b1b1b',
              borderRadius: 2,
              mb: 3
            }}
          >
            <Typography variant="h6" sx={{ color: '#fff', mb: 2 }}>
              Staked Floor Sweepers
            </Typography>

            {/* Sort/Search row (Staked) */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1, md: 2 }, mb: 2 }}>
              <TextField
                label="Search Staked"
                variant="outlined"
                size="small"
                value={stakedSearchTerm}
                onChange={(e) => {
                  setStakedSearchTerm(e.target.value);
                  setStakedPage(1);
                }}
                sx={{ maxWidth: 200, color: '#fff', backgroundColor: '#2a2a2a' }}
                InputLabelProps={{ style: { color: '#ccc' } }}
              />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, md: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Select
                    value={stakedSort}
                    label="Sort Staked"
                    onChange={(e) => {
                      setStakedSort(e.target.value);
                      setStakedPage(1);
                    }}
                    sx={{ color: '#fff', minWidth: '100px' }}
                    size="small"

                    MenuProps={{
                      PaperProps: {
                        sx: {
                          // Dark background color
                          bgcolor: '#1e1e1e',
                          // Set menu items' text color
                          '& .MuiMenuItem-root': {
                            color: '#fff'
                          },
                          // Hover effect for menu items
                          '& .MuiMenuItem-root:hover': {
                            backgroundColor: '#2a2a2a'
                          }
                        }
                      }
                    }}
                  >
                    <MenuItem value="name">Name</MenuItem>
                    <MenuItem value="tokenId">Token ID</MenuItem>
                  </Select>
                </Box>

                {/* Items per page (Staked) */}
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <InputLabel sx={{ color: '#ccc', mr: 1 }}>Items per page</InputLabel>
                  <Select
                    value={stakedPageSize}
                    label="Staked Page Size"
                    onChange={(e) => {
                      setStakedPageSize(e.target.value);
                      setStakedPage(1);
                    }}
                    sx={{ color: '#fff', minWidth: '60px' }}
                    size="small"

                    MenuProps={{
                      PaperProps: {
                        sx: {
                          // Dark background color
                          bgcolor: '#1e1e1e',
                          // Set menu items' text color
                          '& .MuiMenuItem-root': {
                            color: '#fff'
                          },
                          // Hover effect for menu items
                          '& .MuiMenuItem-root:hover': {
                            backgroundColor: '#2a2a2a'
                          }
                        }
                      }
                    }}
                  >
                    <MenuItem value={4}>4</MenuItem>
                    <MenuItem value={8}>8</MenuItem>
                    <MenuItem value={16}>16</MenuItem>
                  </Select>
                </Box>
              </Box>
            </Box>

            {/* Display staked NFTs in a responsive grid */}
            {sortedStaked.length === 0 ? (
              <Typography sx={{ color: '#ccc' }}>No staked Floor Sweepers found.</Typography>
            ) : (
              <Grid container spacing={2} justifyContent="center">
                {pagedStaked.map((item) => {
                  const selected = selectedToUnstake.includes(item.tokenId);
                  return (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={item.tokenId}>
                      <NFTCheckboxCard
                        nft={item}
                        selected={selected}
                        onSelectChange={handleSelectStaked}
                        isStaked
                        unclaimed={item.unclaimed}
                      />
                    </Grid>
                  );
                })}
              </Grid>
            )}

            {/* Pagination + Unstake Button */}
            {sortedStaked.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  disabled={stakedPage <= 1}
                  onClick={() => setStakedPage((prev) => prev - 1)}
                  sx={{ color: '#fff', borderColor: '#00bfff' }}
                >
                  Prev
                </Button>
                <Typography sx={{ color: '#fff' }}>
                  Page {stakedPage} of {stakedTotalPages}
                </Typography>
                <Button
                  variant="outlined"
                  disabled={stakedPage >= stakedTotalPages}
                  onClick={() => setStakedPage((prev) => prev + 1)}
                  sx={{ color: '#fff', borderColor: '#00bfff' }}
                >
                  Next
                </Button>

                <Button
                  variant="contained"
                  sx={{ ml: 'auto', backgroundColor: '#00bfff', color: '#fff' }}
                  onClick={handleBatchUnstake}
                  disabled={loadingBatch}
                >
                  {loadingBatch ? 'Processing...' : 'Unstake Selected'}
                </Button>
              </Box>
            )}
          </Box>



          {/* ==================== UNSTAKED NFTs ==================== */}
          <Box
            sx={{
              p: 2,
              backgroundColor: '#1b1b1b',
              borderRadius: 2,
              mb: 3
            }}
          >
            <Typography variant="h6" sx={{ color: '#fff', mb: 2 }}>
              Unstaked Floor Sweepers
            </Typography>

            {/* Sort/Search row (Unstaked) */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1, md: 2 }, mb: 2 }}>
              <TextField
                label="Search Unstaked"
                variant="outlined"
                size="small"
                value={unstakedSearchTerm}
                onChange={e => onUnstakedSearchChange(e.target.value)}
                sx={{ maxWidth: 200, color: '#fff', backgroundColor: '#2a2a2a' }}
                InputLabelProps={{ style: { color: '#ccc' } }}
              />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, md: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Select
                    value={unstakedSort}
                    label="Sort Unstaked"
                    onChange={(e) => {
                      setUnstakedSort(e.target.value);
                      setUnstakedPage(1);
                    }}
                    sx={{ color: '#fff', minWidth: '100px' }}
                    size="small"

                    MenuProps={{
                      PaperProps: {
                        sx: {
                          // Dark background color
                          bgcolor: '#1e1e1e',
                          // Set menu items' text color
                          '& .MuiMenuItem-root': {
                            color: '#fff'
                          },
                          // Hover effect for menu items
                          '& .MuiMenuItem-root:hover': {
                            backgroundColor: '#2a2a2a'
                          }
                        }
                      }
                    }}
                  >
                    <MenuItem value="name">Name</MenuItem>
                    <MenuItem value="tokenId">Token ID</MenuItem>
                  </Select>
                </Box>

                {/* Items per page (Unstaked) */}
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <InputLabel sx={{ color: '#ccc', mr: 1 }}>Items per page</InputLabel>
                  <Select
                    value={unstakedPageSize}
                    label="Unstaked Page Size"
                    onChange={(e) => {
                      setUnstakedPageSize(e.target.value);
                      setUnstakedPage(1);
                    }}
                    sx={{ color: '#fff', minWidth: '60px' }}
                    size="small"

                    MenuProps={{
                      PaperProps: {
                        sx: {
                          // Dark background color
                          bgcolor: '#1e1e1e',
                          // Set menu items' text color
                          '& .MuiMenuItem-root': {
                            color: '#fff'
                          },
                          // Hover effect for menu items
                          '& .MuiMenuItem-root:hover': {
                            backgroundColor: '#2a2a2a'
                          }
                        }
                      }
                    }}
                  >
                    <MenuItem value={4}>4</MenuItem>
                    <MenuItem value={8}>8</MenuItem>
                    <MenuItem value={16}>16</MenuItem>
                  </Select>
                </Box>
              </Box>
            </Box>

            {/* Display unstaked NFTs with virtualization and skeleton placeholders */}
            {sortedUnstaked.length === 0 ? (
              <Typography sx={{ color: '#ccc' }}>
                No unstaked Floor Sweepers found.
              </Typography>
            ) : (
              <Box sx={{ width: '100%', height: 600, overflow: 'hidden' }}>
                <VirtualGrid
                  columnCount={4}
                  columnWidth={280}
                  height={600}
                  rowCount={Math.ceil(pagedUnstaked.length / 4)}
                  rowHeight={320}
                  width={1120}
                >
                  {({ columnIndex, rowIndex, style }) => {
                    const idx = rowIndex * 4 + columnIndex;
                    const item = pagedUnstaked[idx];

                    if (!item) {
                      // Show a skeleton placeholder while metadata loads
                      return (
                        <Box key={`skeleton-${rowIndex}-${columnIndex}`} style={style} sx={{ p: 1 }}>
                          <Skeleton variant="rectangular" width="100%" height={200} />
                          <Skeleton width="60%" sx={{ mt: 1 }} />
                        </Box>
                      );
                    }

                    const selected = selectedToStake.includes(item.tokenId);
                    return (
                      <Box key={item.tokenId} style={style} sx={{ p: 1 }}>
                        <NFTCheckboxCard
                          nft={item}
                          selected={selected}
                          onSelectChange={handleSelectUnstaked}
                          isStaked={false}
                        />
                      </Box>
                    );
                  }}
                </VirtualGrid>
              </Box>
            )}

            {/* Display staked NFTs with virtualization and skeleton placeholders */}
            {sortedStaked.length === 0 ? (
              <Typography sx={{ color: '#ccc' }}>
                No staked Floor Sweepers found.
              </Typography>
            ) : (
              <Box sx={{ width: '100%', height: 600, overflow: 'hidden' }}>
                <VirtualGrid
                  columnCount={4}
                  columnWidth={280}
                  height={600}
                  rowCount={Math.ceil(pagedStaked.length / 4)}
                  rowHeight={320}
                  width={1120}
                >
                  {({ columnIndex, rowIndex, style }) => {
                    const idx = rowIndex * 4 + columnIndex;
                    const item = pagedStaked[idx];

                    if (!item) {
                      // skeleton while we wait for a card
                      return (
                        <Box key={`skeleton-staked-${rowIndex}-${columnIndex}`} style={style} sx={{ p: 1 }}>
                          <Skeleton variant="rectangular" width="100%" height={200} />
                          <Skeleton width="60%" sx={{ mt: 1 }} />
                        </Box>
                      );
                    }

                    const selected = selectedToUnstake.includes(item.tokenId);
                    return (
                      <Box key={item.tokenId} style={style} sx={{ p: 1 }}>
                        <NFTCheckboxCard
                          nft={item}
                          selected={selected}
                          onSelectChange={handleSelectStaked}
                          isStaked
                          unclaimed={item.unclaimed}
                        />
                      </Box>
                    );
                  }}
                </VirtualGrid>
              </Box>
            )}
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
