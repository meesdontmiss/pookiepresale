#!/usr/bin/env python3
import requests
import json
import time
from datetime import datetime

# RPC endpoint (free public)
RPC_URL = "https://api.mainnet-beta.solana.com"
HEADERS = {"Content-Type": "application/json"}

# Contribution parameters
VALID_AMOUNTS = [0.25, 0.5, 1.0, 2.0]
TREASURY_WALLET = "4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh"
TARGET_TOTAL = 24.25  # Target total SOL

# Get signatures for the treasury wallet with pagination
def get_signatures(address, limit=50, before=None):
    params = {"limit": limit}
    if before:
        params["before"] = before
        
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSignaturesForAddress",
        "params": [address, params]
    }
    
    try:
        response = requests.post(RPC_URL, headers=HEADERS, json=payload, timeout=10)
        return response.json().get("result", [])
    except Exception as e:
        print(f"Error fetching signatures: {e}")
        return []

# Get parsed transaction data for a signature
def get_transaction(sig):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTransaction",
        "params": [sig, "jsonParsed"]
    }
    
    try:
        response = requests.post(RPC_URL, headers=HEADERS, json=payload, timeout=10)
        return response.json().get("result")
    except Exception as e:
        print(f"Error fetching transaction {sig}: {e}")
        return None

# Process a single transaction to find contributions
def process_transaction(tx_data, sig, blockTime=None):
    if not tx_data or not tx_data.get("meta"):
        return None
    
    # Quick pre-check: See if treasury account had a positive balance change
    if "postBalances" not in tx_data["meta"] or "preBalances" not in tx_data["meta"]:
        return None
    
    # Find the index of the treasury wallet in account keys
    treasury_index = None
    for i, account in enumerate(tx_data["transaction"]["message"]["accountKeys"]):
        if account.get("pubkey") == TREASURY_WALLET:
            treasury_index = i
            break
    
    if treasury_index is None:
        return None
    
    # Check if transaction increased treasury balance
    if (treasury_index < len(tx_data["meta"]["postBalances"]) and 
        treasury_index < len(tx_data["meta"]["preBalances"])):
        post_balance = tx_data["meta"]["postBalances"][treasury_index]
        pre_balance = tx_data["meta"]["preBalances"][treasury_index]
        
        if post_balance <= pre_balance:
            return None  # Not a deposit
    
    # Look through instructions for specific transfer
    for inst in tx_data["transaction"]["message"]["instructions"]:
        parsed = inst.get("parsed") or {}
        if parsed.get("type") == "transfer":
            info = parsed.get("info", {})
            if info.get("destination") == TREASURY_WALLET:
                lamports = int(info.get("lamports", 0))
                sol_amount = lamports / 1e9
                
                if sol_amount in VALID_AMOUNTS:
                    time_str = "Unknown"
                    if blockTime:
                        time_str = datetime.fromtimestamp(blockTime).strftime('%Y-%m-%d %H:%M:%S')
                    
                    return {
                        "sender": info.get("source"),
                        "amount": sol_amount,
                        "timestamp": blockTime,
                        "time": time_str,
                        "signature": sig
                    }
    
    return None

# Main
if __name__ == "__main__":
    all_contributions = []
    total_sol = 0
    before_signature = None
    batch_count = 0
    max_batches = 20  # Increased limit
    processed_count = 0
    
    while total_sol < TARGET_TOTAL and batch_count < max_batches:
        batch_count += 1
        print(f"Fetching batch {batch_count}...")
        
        # Get next batch of signatures
        signatures_data = get_signatures(TREASURY_WALLET, limit=50, before=before_signature)
        if not signatures_data:
            print("No more signatures found. Moving to next batch.")
            time.sleep(1)  # Wait before trying again
            continue
        
        print(f"Processing {len(signatures_data)} signatures...")
        
        # Update for next pagination
        if signatures_data:
            before_signature = signatures_data[-1]["signature"]
        
        for entry in signatures_data:
            processed_count += 1
            sig = entry["signature"]
            block_time = entry.get("blockTime", 0)
            
            # Add a small delay to avoid rate limits
            time.sleep(0.2)
            
            # Process transaction
            print(f"Processing tx {processed_count}: {sig[:10]}...")
            tx = get_transaction(sig)
            
            contribution = process_transaction(tx, sig, block_time)
            if contribution:
                all_contributions.append(contribution)
                total_sol += contribution["amount"]
                print(f"✅ Found: {contribution['amount']} SOL from {contribution['sender']}")
                print(f"Current total: {total_sol} SOL of {TARGET_TOTAL} target")
                
                # Break early if we've reached the target
                if total_sol >= TARGET_TOTAL:
                    break
        
        print(f"Completed batch {batch_count}. Current total: {total_sol} SOL")
        
    # Sort contributions by timestamp
    all_contributions.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    
    result = {
        "total_sol": total_sol,
        "contribution_count": len(all_contributions),
        "contributions": all_contributions
    }
    
    # Save to file
    with open("contributions_full.json", "w") as f:
        json.dump(result, f, indent=2)
    
    # Print summary
    print("\n=== SUMMARY ===")
    print(f"Total SOL: {total_sol}")
    print(f"Contribution count: {len(all_contributions)}")
    print("Contributions by amount:")
    amount_summary = {}
    for c in all_contributions:
        amount = c["amount"]
        amount_summary[amount] = amount_summary.get(amount, 0) + 1
    for amount, count in sorted(amount_summary.items()):
        print(f"  {amount} SOL: {count} contributions")
    print("\nDetails saved to contributions_full.json") 