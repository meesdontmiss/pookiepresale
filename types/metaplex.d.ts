declare module '@metaplex-foundation/umi' {
  export interface Umi {
    rpc: any;
  }
  export type PublicKey = { toString(): string };
}

declare module '@metaplex-foundation/umi-bundle-defaults' {
  import { Umi } from '@metaplex-foundation/umi';
  export function createUmi(endpoint: string): Umi;
}

declare module '@metaplex-foundation/mpl-token-metadata' {
  import { Umi, PublicKey } from '@metaplex-foundation/umi';
  
  export interface TokenMetadata {
    name: { toString(): string };
    symbol: { toString(): string };
    uri: { toString(): string };
    collection?: {
      key: { toString(): string };
    };
  }

  export function mplTokenMetadata(): {
    install(umi: Umi): void;
  };

  export function fetchMetadata(umi: Umi, mint: PublicKey): Promise<TokenMetadata>;
}

declare module '@metaplex-foundation/umi-rpc-web3js' {
  import { Umi } from '@metaplex-foundation/umi';
  import { Connection } from '@solana/web3.js';
  
  export function createWeb3JsRpc(umi: Umi, connection: Connection): any;
} 