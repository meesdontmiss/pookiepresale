// This file re-exports everything from @solana/web3.js but ensures our patch is loaded first

// First, load our connection patch
import './solana-connection-patch';

// Re-export everything from the original module
export * from '@solana/web3.js';
export { createReliableConnection } from './solana-connection-patch'; 