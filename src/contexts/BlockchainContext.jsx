// src/contexts/BlockchainContext.jsx
import React, { createContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';

// ABIs
import ERC20TokenArtifact from '../abis/ERC20TokenABI.json';
import NFTStakingArtifact from '../abis/NFTStakingABI.json';

export const BlockchainContext = createContext();

const BlockchainProvider = ({ children }) => {
  // --- state ---
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [nftStakingContract, setNftStakingContract] = useState(null);

  // --- env vars ---
  const NFTSTAKING_ADDRESS = process.env.REACT_APP_NFTSTAKING_ADDRESS;

  useEffect(() => {
    const init = async () => {
      if (!window.ethereum) {
        console.error(
          '[BlockchainContext] No Ethereum provider found. Please install MetaMask.'
        );
        return;
      }

      try {
        // Ask user to connect their wallet
        await window.ethereum.request({ method: 'eth_requestAccounts' });

        // set up ethers provider & signer
        const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
        setProvider(web3Provider);

        const web3Signer = web3Provider.getSigner();
        setSigner(web3Signer);

        const userAddr = await web3Signer.getAddress();
        setAccount(userAddr);

        // instantiate only the NFT Staking contract
        if (NFTSTAKING_ADDRESS) {
          const staking = new ethers.Contract(
            NFTSTAKING_ADDRESS,
            NFTStakingArtifact,
            web3Signer
          );
          setNftStakingContract(staking);
        } else {
          console.error(
            '[BlockchainContext] REACT_APP_NFTSTAKING_ADDRESS not set in .env'
          );
        }

        // react to account changes
        window.ethereum.on('accountsChanged', (accounts) => {
          if (accounts.length > 0) {
            setAccount(ethers.utils.getAddress(accounts[0]));
          } else {
            setAccount(null);
          }
        });
      } catch (err) {
        console.error('[BlockchainContext] init error:', err);
      }
    };

    init();

    // cleanup listener
    return () => {
      if (
        window.ethereum &&
        window.ethereum.removeListener
      ) {
        window.ethereum.removeListener('accountsChanged', () => {});
      }
    };
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('MetaMask is not installed. Please install it.');
      return;
    }
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });
      if (accounts.length > 0) {
        setAccount(ethers.utils.getAddress(accounts[0]));
      }
    } catch (err) {
      console.error('[BlockchainContext] connectWallet error:', err);
    }
  };

  return (
    <BlockchainContext.Provider
      value={{
        provider,
        signer,
        account,
        nftStakingContract,
        connectWallet,
      }}
    >
      {children}
    </BlockchainContext.Provider>
  );
};

export default BlockchainProvider;
