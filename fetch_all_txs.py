#!/usr/bin/env python
import json
import time
from solana.rpc.api import Client
from solders.pubkey import Pubkey
from solders.signature import Signature

# Treasury wallet address
TREASURY_WALLET = "4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh"

# Initialize Solana client with a reliable endpoint
client = Client("https://api.mainnet-beta.solana.com")

def get_signatures(address, limit=100):
    """Get transaction signatures for an address"""
    try:
        response = client.get_signatures_for_address(Pubkey.from_string(address), limit=limit)
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
    print(f"Checking current balance for {TREASURY_WALLET}...")
    balance_resp = client.get_balance(Pubkey.from_string(TREASURY_WALLET))
    balance_sol = balance_resp.value / 1_000_000_000
    print(f"Current balance: {balance_sol} SOL")
    
    print(f"\nFetching transaction signatures for {TREASURY_WALLET}...")
    signatures_data = get_signatures(TREASURY_WALLET, limit=50)  # Get the most recent 50 transactions
    
    if not signatures_data:
        print("No transactions found")
        return
        
    print(f"Found {len(signatures_data)} transactions")
    
    # Save raw signatures response
    with open("raw_signatures.json", "w") as f:
        signatures_list = [{"signature": sig.signature, "slot": sig.slot, "block_time": sig.block_time} 
                          for sig in signatures_data]
        json.dump(signatures_list, f, indent=2)
    
    # Get full transaction data for each signature
    all_transactions = []
    
    for i, sig_data in enumerate(signatures_data):
        print(f"Fetching transaction {i+1}/{len(signatures_data)}: {sig_data.signature}")
        tx_data = get_transaction(sig_data.signature)
        
        if tx_data:
            # Convert to serializable format
            tx_json = {
                "signature": sig_data.signature,
                "block_time": sig_data.block_time,
                "slot": sig_data.slot,
                "transaction": {
                    "signatures": [str(sig) for sig in tx_data.transaction.signatures],
                    "message": {
                        "account_keys": [str(key) for key in tx_data.transaction.transaction.message.account_keys],
                        "recent_blockhash": str(tx_data.transaction.transaction.message.recent_blockhash)
                    }
                },
                "meta": {
                    "fee": tx_data.transaction.meta.fee,
                    "pre_balances": tx_data.transaction.meta.pre_balances,
                    "post_balances": tx_data.transaction.meta.post_balances,
                    "status": "success" if not tx_data.transaction.meta.err else "error"
                }
            }
            
            all_transactions.append(tx_json)
        
        # Rate limit
        time.sleep(0.2)
    
    # Save all transaction data to file
    with open("all_incoming_txs.json", "w") as f:
        json.dump(all_transactions, f, indent=2)
    
    print(f"\nSaved all transaction data to all_incoming_txs.json")
    
    # Show a simple summary of transactions
    print("\nTransaction summary:")
    for i, tx in enumerate(all_transactions):
        # Try to figure out if this was a SOL transfer to the treasury
        tx_date = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(tx["block_time"])) if tx["block_time"] else "Unknown"
        account_keys = tx["transaction"]["message"]["account_keys"]
        pre_balances = tx["meta"]["pre_balances"]
        post_balances = tx["meta"]["post_balances"]
        
        # Find treasury index in account_keys
        treasury_idx = None
        for idx, key in enumerate(account_keys):
            if key == TREASURY_WALLET:
                treasury_idx = idx
                break
        
        if treasury_idx is not None:
            pre_sol = pre_balances[treasury_idx] / 1_000_000_000
            post_sol = post_balances[treasury_idx] / 1_000_000_000
            change = post_sol - pre_sol
            
            print(f"{i+1}. [{tx_date}] {change:+.5f} SOL - {tx['signature'][:10]}...")

if __name__ == "__main__":
    main() 