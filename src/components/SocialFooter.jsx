// src/components/SocialFooter.jsx
import React from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import TwitterIcon from '@mui/icons-material/Twitter';

const SocialFooter = () => {
  const socialLinks = [
    {
      icon: <TwitterIcon />,
      url: 'https://twitter.com/nexapia_',
      label: 'Twitter',
    },
  ];

  return (
    <Box
      sx={{
        // Let the parent handle the full browser width; just use 100% here
        width: '100%',
        backgroundColor: '#000000',
        // Adjust vertical/horizontal padding as you like
        py: 1,
        px: 2,
        display: 'flex',
        flexDirection: { xs: 'row', sm: 'row' },
        alignItems: 'center',
        justifyContent: { xs: 'center', sm: 'space-between' },
        textAlign: 'center',
      }}
    >
      {/* Social Icons */}
      <Box sx={{ mb: { xs: 1, sm: 0 } }}>
        {socialLinks.map((social, index) => (
          <IconButton
            key={index}
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              color: '#00bfff',
              '&:hover': { color: '#009acd' },
            }}
            aria-label={social.label}
          >
            {social.icon}
          </IconButton>
        ))}
      </Box>

      {/* Footer Text */}
      <Typography
        variant="body2"
        sx={{
          color: '#00bfff',
          margin: '0 auto',
        }}
      >
        © {new Date().getFullYear()} Nexapia Ltd.
      </Typography>
    </Box>
  );
};

export default SocialFooter;
