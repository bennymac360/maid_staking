// src/components/NeonButton.jsx

import { Button } from '@mui/material';
import { styled, keyframes } from '@mui/system';

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

const NeonButton = styled(Button)(({ theme }) => ({
  position: 'relative',
  overflow: 'hidden',
  
  // Ensure the text color is white
  color: '#fff',
  
  backgroundColor: '#1e1e1e',
  border: '2px solid #aaa',
  borderRadius: '12px',
  transition: 'transform 0.3s ease, box-shadow 0.3s ease',

  // Subtle silver glow
  boxShadow: '0 0 8px 2px rgba(192,192,192,0.2)',

  '&:hover': {
    transform: 'scale(1.02)',
    boxShadow: '0 0 12px 3px rgba(192,192,192,0.4)',
  },

  // The glint effect
  '&:before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: '-25%',
    width: '100%',
    height: '100%',
    background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)',
    animation: `${glint} 4s infinite`,
  },
}));

export default NeonButton;
