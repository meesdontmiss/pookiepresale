#!/usr/bin/env python3
import requests
import json
import time

RPC_URL = "https://api.mainnet-beta.solana.com"
HEADERS = {"Content-Type": "application/json"}
TREASURY = "4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh"

# Get all signatures for the address (no limit, we want everything)
def get_signatures():
    all_sigs = []
    before = None
    
    # Get multiple batches
    for i in range(20):  # Try 20 batches (2000 transactions)
        params = {"limit": 100}
        if before:
            params["before"] = before
            
        payload = {
            "jsonrpc": "2.0", 
            "id": 1,
            "method": "getSignaturesForAddress",
            "params": [TREASURY, params]
        }
        
        try:
            res = requests.post(RPC_URL, headers=HEADERS, json=payload)
            batch = res.json().get("result", [])
            
            if not batch:
                print("No more transactions found")
                break  # No more transactions
                
            all_sigs.extend(batch)
            before = batch[-1]["signature"]  # For pagination
            print(f"Found batch {i+1} of {len(batch)} signatures, total: {len(all_sigs)}")
            time.sleep(0.5)  # Reduced delay
            
        except Exception as e:
            print(f"Error getting signatures: {e}")
            time.sleep(1)
            
    return all_sigs

# Process transactions directly from account balance changes
def find_incoming_transactions(signatures):
    incoming_txs = []
    
    for i, sig_data in enumerate(signatures):
        sig = sig_data["signature"]
        print(f"Processing {i+1}/{len(signatures)}: {sig[:10]}...")
        
        # Get raw transaction data
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTransaction",
            "params": [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}]
        }
        
        try:
            tx_res = requests.post(RPC_URL, headers=HEADERS, json=payload)
            tx = tx_res.json().get("result")
            
            if not tx or not tx.get("meta"):
                continue
                
            # Find treasury index in account keys
            treasury_index = None
            for idx, key in enumerate(tx["transaction"]["message"]["accountKeys"]):
                if isinstance(key, dict) and key.get("pubkey") == TREASURY:
                    treasury_index = idx
                    break
                elif isinstance(key, str) and key == TREASURY:
                    treasury_index = idx
                    break
            
            if treasury_index is None:
                continue
                
            # Check balance change
            pre_balance = tx["meta"]["preBalances"][treasury_index]
            post_balance = tx["meta"]["postBalances"][treasury_index]
            sol_change = (post_balance - pre_balance) / 1e9
            
            # If balance increased, record the transaction
            if sol_change > 0:
                # Get sender
                sender = None
                for inst in tx["transaction"]["message"]["instructions"]:
                    if inst.get("parsed", {}).get("type") == "transfer":
                        info = inst.get("parsed", {}).get("info", {})
                        if info.get("destination") == TREASURY:
                            sender = info.get("source")
                            break
                
                if not sender:
                    # Fallback sender identification (could be the first account key)
                    sender = tx["transaction"]["message"]["accountKeys"][0] 
                    if isinstance(sender, dict):
                        sender = sender.get("pubkey", "unknown")
                
                timestamp = sig_data.get("blockTime", 0)
                time_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(timestamp)) if timestamp else "unknown"
                
                incoming_tx = {
                    "sender": sender,
                    "amount": sol_change,
                    "time": time_str,
                    "timestamp": timestamp,
                    "signature": sig
                }
                
                incoming_txs.append(incoming_tx)
                print(f"✓ Found incoming: {sol_change} SOL from {sender}")
                
            time.sleep(0.2)  # Brief delay between RPC calls
            
        except Exception as e:
            print(f"Error processing transaction: {e}")
            time.sleep(1)  # Longer delay after errors
            
    return incoming_txs

# Main execution
if __name__ == "__main__":
    print("Fetching signatures for treasury wallet...")
    signatures = get_signatures()
    
    print(f"\nFound {len(signatures)} total transactions")
    print("Finding all incoming transactions...\n")
    
    incoming = find_incoming_transactions(signatures)
    total_sol = sum(tx["amount"] for tx in incoming)
    
    # Sort by amount
    incoming.sort(key=lambda x: x["amount"], reverse=True)
    
    # Output results
    result = {
        "total_sol": total_sol,
        "transaction_count": len(incoming),
        "transactions": incoming
    }
    
    # Save to file
    with open("all_incoming_txs.json", "w") as f:
        json.dump(result, f, indent=2)
        
    # Print summary
    print("\n=== SUMMARY ===")
    print(f"Total incoming SOL: {total_sol}")
    print(f"Number of incoming transactions: {len(incoming)}")
    
    # Group by amount
    amount_groups = {}
    for tx in incoming:
        amount = tx["amount"]
        key = f"{amount}"
        if key not in amount_groups:
            amount_groups[key] = []
        amount_groups[key].append(tx)
    
    print("\nTransactions by amount:")
    for amount, txs in sorted(amount_groups.items(), key=lambda x: float(x[0]), reverse=True):
        print(f"  {amount} SOL: {len(txs)} transaction(s)")
        
    print("\nDetails saved to all_incoming_txs.json") 