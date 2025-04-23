#!/usr/bin/env python
import json
import time
from solana.rpc.api import Client
from solders.pubkey import Pubkey
from solders.signature import Signature
import base58

# Treasury wallet address
TREASURY_WALLET = "4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh"

# Initialize Solana client with a reliable endpoint
client = Client("https://api.mainnet-beta.solana.com")

def get_all_signatures(address, limit=1000):
    """Get all transaction signatures for an address"""
    all_signatures = []
    before = None
    
    while True:
        try:
            kwargs = {"limit": 100}
            if before:
                kwargs["before"] = before
                
            response = client.get_signatures_for_address(Pubkey.from_string(address), **kwargs)
            
            if not response.value:
                break
                
            for item in response.value:
                all_signatures.append(item.signature)
                
            if len(response.value) < 100:
                break
                
            before = response.value[-1].signature
            print(f"Found batch of {len(response.value)} signatures, total: {len(all_signatures)}")
            
            if len(all_signatures) >= limit:
                break
                
            # Rate limit
            time.sleep(0.2)
            
        except Exception as e:
            print(f"Error fetching signatures: {e}")
            break
            
    return all_signatures

def get_transaction_details(signature):
    """Get detailed transaction information"""
    try:
        sig_obj = Signature.from_string(signature)
        response = client.get_transaction(sig_obj, max_supported_transaction_version=0)
        return response.value
    except Exception as e:
        print(f"Error fetching transaction {signature}: {e}")
        return None

def analyze_transaction(tx_data, treasury_address):
    """Analyze transaction data for transfers to treasury"""
    if not tx_data or not tx_data.transaction.meta:
        return None
        
    result = {
        "signature": tx_data.transaction.signatures[0],
        "block_time": tx_data.block_time,
        "success": not tx_data.transaction.meta.err,
        "transfers": []
    }
    
    # Extract pre and post balances
    pre_balances = tx_data.transaction.meta.pre_balances
    post_balances = tx_data.transaction.meta.post_balances
    
    # Get account keys
    keys = [str(account_key) for account_key in tx_data.transaction.transaction.message.account_keys]
    
    # Look for balance changes
    for i, (pre, post) in enumerate(zip(pre_balances, post_balances)):
        # Convert from lamports to SOL
        pre_sol = pre / 1_000_000_000
        post_sol = post / 1_000_000_000
        change = post_sol - pre_sol
        
        if abs(change) > 0.000001:  # Filter out very small changes
            result["transfers"].append({
                "account": keys[i],
                "change_sol": change,
                "is_treasury": keys[i] == treasury_address
            })
    
    # Check if treasury was involved
    treasury_involved = any(t["is_treasury"] for t in result["transfers"])
    if not treasury_involved:
        return None
        
    return result

def main():
    print(f"Checking current balance for {TREASURY_WALLET}...")
    balance_resp = client.get_balance(Pubkey.from_string(TREASURY_WALLET))
    balance_sol = balance_resp.value / 1_000_000_000
    print(f"Current balance: {balance_sol} SOL")
    
    print(f"\nFetching transaction signatures for {TREASURY_WALLET}...")
    signatures = get_all_signatures(TREASURY_WALLET)
    print(f"Found {len(signatures)} total transactions")
    
    transactions = []
    total_incoming = 0
    total_outgoing = 0
    
    print("\nAnalyzing transactions...")
    for i, sig in enumerate(signatures[:500]):  # Limit to 500 for performance
        if i % 10 == 0:
            print(f"Processing transaction {i+1}/{min(500, len(signatures))}: {sig[:10]}...")
        
        tx_data = get_transaction_details(sig)
        if tx_data:
            analysis = analyze_transaction(tx_data, TREASURY_WALLET)
            if analysis:
                transactions.append(analysis)
                
                # Calculate amounts for treasury
                for transfer in analysis["transfers"]:
                    if transfer["is_treasury"]:
                        if transfer["change_sol"] > 0:
                            total_incoming += transfer["change_sol"]
                        else:
                            total_outgoing += abs(transfer["change_sol"])
        
        # Rate limit
        time.sleep(0.1)
    
    print("\n=== SUMMARY ===")
    print(f"Total transactions analyzed: {len(transactions)}")
    print(f"Total incoming SOL: {total_incoming}")
    print(f"Total outgoing SOL: {total_outgoing}")
    print(f"Net change: {total_incoming - total_outgoing}")
    
    # Save results to file
    with open("detailed_transactions.json", "w") as f:
        json.dump(transactions, f, indent=2)
    
    print(f"\nDetailed transaction data saved to detailed_transactions.json")
    
    # Show the most recent incoming transactions
    print("\nMost recent incoming transactions:")
    incoming_txs = []
    
    for tx in transactions:
        for transfer in tx["transfers"]:
            if transfer["is_treasury"] and transfer["change_sol"] > 0:
                incoming_txs.append({
                    "signature": tx["signature"],
                    "timestamp": tx["block_time"],
                    "amount": transfer["change_sol"]
                })
    
    # Sort by timestamp (most recent first)
    incoming_txs.sort(key=lambda x: x["timestamp"] if x["timestamp"] else 0, reverse=True)
    
    for i, tx in enumerate(incoming_txs[:10]):
        print(f"{i+1}. {tx['amount']} SOL - Signature: {tx['signature']}")

if __name__ == "__main__":
    main() 