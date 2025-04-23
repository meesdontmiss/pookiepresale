#!/usr/bin/env python3
import requests
import json
import time

# Wallet address
TREASURY = "4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh"

# Get recent signatures
payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getSignaturesForAddress",
    "params": [TREASURY, {"limit": 50}]
}

print(f"Fetching recent transactions for {TREASURY}...")
response = requests.post(
    "https://api.mainnet-beta.solana.com",
    headers={"Content-Type": "application/json"},
    json=payload
)

signatures = response.json().get("result", [])
print(f"Found {len(signatures)} signatures")

# Get full transaction data for each signature
all_txs = []
for i, sig_data in enumerate(signatures):
    sig = sig_data["signature"]
    print(f"Fetching tx {i+1}/{len(signatures)}: {sig[:10]}...")
    
    tx_payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTransaction",
        "params": [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}]
    }
    
    tx_response = requests.post(
        "https://api.mainnet-beta.solana.com",
        headers={"Content-Type": "application/json"},
        json=tx_payload
    )
    
    tx_data = tx_response.json().get("result")
    if tx_data:
        all_txs.append({
            "signature": sig,
            "data": tx_data
        })
    
    time.sleep(0.2)  # Small delay to avoid rate limits

# Save all transaction data to file
with open("txns.json", "w") as f:
    json.dump(all_txs, f, indent=2)

print(f"Saved full data for {len(all_txs)} transactions to txns.json")

# For quick reference, extract and print basic info about each transaction
print("\nTransaction summary:")
for tx in all_txs:
    sig = tx["signature"]
    data = tx["data"]
    
    # Print balance changes for accounts
    if "meta" in data and "postTokenBalances" in data["meta"]:
        print(f"\nTx: {sig[:10]}...")
        
        # Look for pre/post balance changes
        if "preBalances" in data["meta"] and "postBalances" in data["meta"]:
            account_keys = data["transaction"]["message"]["accountKeys"]
            for i, (pre, post) in enumerate(zip(data["meta"]["preBalances"], data["meta"]["postBalances"])):
                diff = (post - pre) / 1e9
                if diff != 0:
                    account = account_keys[i]
                    account_id = account.get("pubkey", account) if isinstance(account, dict) else account
                    print(f"  Account {account_id}: {diff:+.9f} SOL") 