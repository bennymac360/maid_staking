import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Avatar
} from '@mui/material';
import { styled, keyframes } from '@mui/system';
import { Link } from 'react-router-dom';

// Icons
import MenuIcon from '@mui/icons-material/Menu';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';

// Components
import ConnectWallet from './ConnectWallet';

// Example Logo/GIF (update the path to wherever your GIF is located)
import FlareLogo from '../assets/logo192.gif';

// -- Glint animation keyframes --
const glint = keyframes`
  0% {
    transform: translateX(-100%);
  }
  50% {
    transform: translateX(100%);
  }
  100% {
    transform: translateX(200%);
  }
`;

// -- Styled navbar container with glint effect --
const NeonNavBar = styled(Box)(({ theme }) => ({
  width: '100%',
  position: 'sticky',
  top: 0,
  zIndex: 9999,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  color: '#fff',
  backgroundColor: '#1e1e1e',
  boxShadow: '0 0 8px 2px rgba(192,192,192,0.2)',
  border: 'none',
  paddingLeft: theme.spacing(2),
  paddingRight: theme.spacing(2),
  paddingTop: theme.spacing(1),
  paddingBottom: theme.spacing(1),
  '&:hover': {
    // intentionally blank to disable pop effect
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: '-25%',
    width: '100%',
    height: '100%',
    background:
      'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)',
    animation: `${glint} 4s infinite`,
  },
}));

export default function Navbar() {
  const [anchorEl, setAnchorEl] = useState(null);

  // Track if the screen is small (< 1000px wide)
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 1000);

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 1000);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleDisconnectWallet = () => {
    // TODO: Replace alert with real disconnect logic
    alert('Disconnected Wallet');
    handleMenuClose();
  };

  return (
    <NeonNavBar>
      {/* Left side: Logo + Title */}
      <Box sx={{ 
          display: 'flex', 
          alignItems: 'center',
          py: 0,
          px: 1, }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar
              src={FlareLogo}
              alt="App Logo"
              sx={{
                width: { xs: 30, sm: 40, md: 50 },
                height: { xs: 30, sm: 40, md: 50 },
              }}
            />
            <Typography
              variant="h5"
              sx={{
                color: '#00bfff',
                fontSize: { xs: '1rem', sm: '1.5rem', md: '2rem' },
                fontFamily: 'anton, sans-serif',
              }}
            >
               Floor Sweepers Staking
            </Typography>
          </Box>
        </Link>
      </Box>

      {/* Center: Navigation Icons (shown on small/medium screens, hidden on large) */}
      <Box
        sx={{
          display: { xs: 'flex', md: 'flex', lg: 'none' },
          alignItems: 'center',
          justifyContent: 'center',
          gap: { xs: 2, sm: 3 },
          ml: 2,
          mr: 2,
          flex: 1,
        }}
      >
        <IconButton
          onClick={() => window.history.back()}
          sx={{ color: 'rgba(255,255,255,0.8)' }}
        >
          <ArrowBackIosIcon sx={{ fontSize: { xs: '1.2rem', sm: '1.3rem' } }} />
        </IconButton>

        <IconButton
          onClick={() => window.location.reload()}
          sx={{ color: 'rgba(255,255,255,0.8)' }}
        >
          <RefreshIcon sx={{ fontSize: { xs: '1.2rem', sm: '1.3rem' } }} />
        </IconButton>

        <IconButton
          onClick={() => window.history.forward()}
          sx={{ color: 'rgba(255,255,255,0.8)' }}
        >
          <ArrowForwardIosIcon sx={{ fontSize: { xs: '1.2rem', sm: '1.3rem' } }} />
        </IconButton>
      </Box>

      {/* Right side: Hamburger Menu + Wallet */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mr: 2 }} >
        {/* Hamburger Menu */}
        <IconButton onClick={handleMenuOpen} sx={{ color: '#00bfff' }}>
          <MenuIcon sx={{ width: 30, height: 30 }} />
        </IconButton>

        {/* Menu Dropdown */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          PaperProps={{
            sx: {
              bgcolor: '#1e1e1e',
              width: { xs: '60%', sm: '200px' },
            },
          }}
        >
          <MenuItem
            onClick={() => {
              window.open('https://fp-outline.gitbook.io/flareporium', '_blank');
              handleMenuClose();
            }}
            sx={{ color: '#fff' }}
          >
            White Paper
          </MenuItem>
          <MenuItem
            onClick={() => {
              window.open('https://nexapia.xyz', '_blank');
              handleMenuClose();
            }}
            sx={{ color: '#fff' }}
          >
            Nexapia
          </MenuItem>
          
          {/* Additional wallet menu items */}
          <MenuItem onClick={handleDisconnectWallet} sx={{ color: '#fff' }}>
            Disconnect Wallet
          </MenuItem>
        </Menu>

        {/* Wallet Display: Hide for screens < 1000px */}
        {!isSmallScreen && (
          <Stack direction="row" alignItems="center" spacing={1}>
            <AccountBalanceWalletIcon sx={{ color: '#fff' }} />
            <ConnectWallet/>
          </Stack>
        )}
      </Stack>
    </NeonNavBar>
  );
}
