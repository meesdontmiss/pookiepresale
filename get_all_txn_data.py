#!/usr/bin/env python
import json
import time
from solana.rpc.api import Client
from solders.pubkey import Pubkey
from solders.signature import Signature

# Treasury wallet address
TREASURY_WALLET = "4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh"

# Initialize Solana client with a reliable endpoint - using default client initialization
client = Client("https://api.mainnet-beta.solana.com")

def get_signatures(address, limit=1000, before=None, until=None):
    """Get transaction signatures for an address"""
    try:
        response = client.get_signatures_for_address(
            Pubkey.from_string(address), 
            limit=limit,
            before=before,
            until=until
        )
        return response.value
    except Exception as e:
        print(f"Error fetching signatures: {e}")
        return []

def get_transaction(signature):
    """Get detailed transaction information"""
    try:
        sig_obj = Signature.from_string(signature)
        response = client.get_transaction(sig_obj, max_supported_transaction_version=0)
        return response.value
    except Exception as e:
        print(f"Error fetching transaction {signature}: {e}")
        return None

def main():
    # Fetch current balance
    balance_resp = client.get_balance(Pubkey.from_string(TREASURY_WALLET))
    balance_sol = balance_resp.value / 1_000_000_000
    print(f"Current balance: {balance_sol} SOL")
    
    # Get as many transactions as possible
    print(f"Fetching transaction signatures for {TREASURY_WALLET}...")
    all_signatures = []
    
    # First batch
    sig_batch = get_signatures(TREASURY_WALLET, limit=1000)
    all_signatures.extend(sig_batch)
    
    # If we got a full batch, there might be more
    while sig_batch and len(sig_batch) == 1000:
        last_sig = sig_batch[-1].signature
        print(f"Found {len(all_signatures)} signatures so far, fetching more before {last_sig}...")
        sig_batch = get_signatures(TREASURY_WALLET, limit=1000, before=last_sig)
        all_signatures.extend(sig_batch)
    
    print(f"Found a total of {len(all_signatures)} transactions")
    
    # Save all signatures
    with open("all_signatures.json", "w") as f:
        signatures_list = [{"signature": sig.signature, "slot": sig.slot, "block_time": sig.block_time} 
                          for sig in all_signatures]
        json.dump(signatures_list, f, indent=2)
    
    # Get transaction data for recent transactions (limit to 100 to avoid timeouts)
    recent_signatures = all_signatures[:100] 
    all_transactions = []
    
    for i, sig_data in enumerate(recent_signatures):
        print(f"Fetching transaction {i+1}/{len(recent_signatures)}: {sig_data.signature}")
        tx_data = get_transaction(sig_data.signature)
        
        if tx_data:
            # Store the complete transaction data without parsing
            all_transactions.append({
                "signature": sig_data.signature,
                "block_time": sig_data.block_time,
                "full_data": tx_data.to_json()
            })
        
        # Rate limit
        time.sleep(0.2)
    
    # Save raw transaction data to file
    with open("all_raw_txs.json", "w") as f:
        json.dump(all_transactions, f, indent=2)
    
    print(f"\nSaved {len(all_transactions)} raw transactions to all_raw_txs.json")

if __name__ == "__main__":
    main() 