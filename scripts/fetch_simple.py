#!/usr/bin/env python3
import requests
import json
import time

RPC_URL = "https://api.mainnet-beta.solana.com"
HEADERS = {"Content-Type": "application/json"}
TREASURY = "4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh"
AMOUNTS = [0.25, 0.5, 1.0, 2.0]

# One simple RPC call to get signatures
def get_all_signatures():
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSignaturesForAddress",
        "params": [TREASURY, {"limit": 100}]
    }
    try:
        r = requests.post(RPC_URL, headers=HEADERS, json=payload)
        return r.json().get('result', [])
    except Exception as e:
        print(f"Error: {e}")
        return []

# Get transaction details
def get_tx(sig):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTransaction",
        "params": [sig, "jsonParsed"]
    }
    try:
        r = requests.post(RPC_URL, headers=HEADERS, json=payload)
        return r.json().get('result')
    except:
        return None

# Main
sigs = get_all_signatures()
print(f"Found {len(sigs)} recent signatures")

contributions = []
total = 0

for i, sig_data in enumerate(sigs):
    sig = sig_data["signature"]
    print(f"Processing {i+1}/{len(sigs)}: {sig[:8]}...")
    
    # Get transaction
    tx = get_tx(sig)
    if not tx: continue
    
    # Look for transfers
    for inst in tx["transaction"]["message"]["instructions"]:
        parsed = inst.get("parsed", {})
        if parsed.get("type") == "transfer":
            info = parsed.get("info", {})
            if info.get("destination") == TREASURY:
                lamports = int(info.get("lamports", 0))
                sol_amount = lamports / 1e9
                
                if sol_amount in AMOUNTS:
                    sender = info.get("source")
                    print(f"✓ Found: {sol_amount} SOL from {sender}")
                    
                    contributions.append({
                        "sender": sender,
                        "amount": sol_amount,
                        "signature": sig
                    })
                    
                    total += sol_amount
    
    # Small delay
    time.sleep(0.1)

# Print summary
print(f"\nTotal found: {total} SOL")
print(f"Contributions: {len(contributions)}")

# Output to file
with open("contributions_simple.json", "w") as f:
    json.dump({
        "total": total,
        "count": len(contributions),
        "contributions": contributions
    }, f, indent=2)

print("Results saved to contributions_simple.json") 