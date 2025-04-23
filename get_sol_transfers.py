#!/usr/bin/env python
import json
import time
import requests
from datetime import datetime

# Define constants
TREASURY_WALLET = "4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh"
# Solana RPC endpoints - rotating between multiple providers to avoid rate limits
RPC_URLS = [
    "https://solana-mainnet.core.chainstack.com/469f92be2bf990aaeef35e0fef1a5e85/",
    "https://api.mainnet-beta.solana.com",
    "https://rpc.ankr.com/solana",
    "https://solana.api.onfinality.io/public"
]
MAX_TRANSACTIONS_TO_PROCESS = 500  # Increased to ensure we catch all transactions
LAMPORTS_PER_SOL = 1_000_000_000

def format_timestamp(timestamp_sec):
    """Convert Unix timestamp to human-readable format."""
    return datetime.fromtimestamp(timestamp_sec).strftime('%Y-%m-%d %H:%M:%S')

def rpc_request(method, params, attempt=0):
    """Make a request to the Solana RPC API with fallback to multiple providers"""
    headers = {
        "Content-Type": "application/json"
    }
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params
    }
    
    # Try different RPC endpoints in case of failure
    url_index = attempt % len(RPC_URLS)
    url = RPC_URLS[url_index]
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        result = response.json()
        
        # Check for errors
        if "error" in result:
            print(f"Error from RPC ({url}): {result['error']}")
            if attempt < len(RPC_URLS) - 1:
                print(f"Retrying with alternative RPC endpoint...")
                time.sleep(1)
                return rpc_request(method, params, attempt + 1)
            else:
                print("All RPC endpoints failed")
                return None
                
        return result
    except Exception as e:
        print(f"Exception calling RPC ({url}): {e}")
        if attempt < len(RPC_URLS) - 1:
            print(f"Retrying with alternative RPC endpoint...")
            time.sleep(1)
            return rpc_request(method, params, attempt + 1)
        else:
            print("All RPC endpoints failed")
            return None

def get_solana_balance():
    """Get the current balance of the treasury wallet"""
    response = rpc_request("getBalance", [TREASURY_WALLET])
    if response and "result" in response and "value" in response["result"]:
        balance_lamports = response["result"]["value"]
        return balance_lamports / LAMPORTS_PER_SOL  # Convert lamports to SOL
    return 0

def get_all_signatures():
    """Get all transaction signatures for the treasury wallet using pagination"""
    all_signatures = []
    before = None
    
    while True:
        params = [TREASURY_WALLET]
        if before:
            params.append({"before": before, "limit": 100})
        else:
            params.append({"limit": 100})
            
        response = rpc_request("getSignaturesForAddress", params)
        
        if not response or "result" not in response or not response["result"]:
            break
            
        batch = response["result"]
        all_signatures.extend(batch)
        
        print(f"Fetched batch of {len(batch)} signatures, total: {len(all_signatures)}")
        
        if len(batch) < 100:  # No more signatures to fetch
            break
            
        # Get the last signature for pagination
        before = batch[-1]["signature"]
        time.sleep(0.5)  # Increased delay to avoid rate limiting
    
    return all_signatures

def get_transaction_details(signature):
    """Get detailed transaction data"""
    params = [signature, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}]
    response = rpc_request("getTransaction", params)
    
    if response and "result" in response:
        return response["result"]
    return None

def extract_sol_transfers(tx_data, treasury_address):
    """Extract SOL transfer information from transaction data"""
    if not tx_data or "meta" not in tx_data or not tx_data["meta"]:
        return None
        
    # Get pre and post balances
    pre_balances = tx_data["meta"]["preBalances"]
    post_balances = tx_data["meta"]["postBalances"]
    
    # Get account keys
    account_keys = tx_data["transaction"]["message"]["accountKeys"]
    
    # Find treasury index
    treasury_index = None
    for i, key in enumerate(account_keys):
        if isinstance(key, dict) and key.get("pubkey") == treasury_address:
            treasury_index = i
            break
        elif key == treasury_address:
            treasury_index = i
            break
    
    if treasury_index is None:
        return None
        
    # Calculate balance change
    if treasury_index < len(pre_balances) and treasury_index < len(post_balances):
        pre_balance = pre_balances[treasury_index] / LAMPORTS_PER_SOL
        post_balance = post_balances[treasury_index] / LAMPORTS_PER_SOL
        balance_change = post_balance - pre_balance
        
        # Only report if there's a meaningful change
        if abs(balance_change) > 0.000001:  # Filter out dust
            # Find sender (for incoming transfers) or recipient (for outgoing transfers)
            counterparty = None
            if balance_change > 0:  # Incoming transfer
                for i, (pre, post) in enumerate(zip(pre_balances, post_balances)):
                    if i != treasury_index:
                        change = (post - pre) / LAMPORTS_PER_SOL
                        if change < 0 and abs(change + tx_data["meta"]["fee"] / LAMPORTS_PER_SOL) >= abs(balance_change):
                            sender_key = account_keys[i]
                            if isinstance(sender_key, dict):
                                counterparty = sender_key.get("pubkey")
                            else:
                                counterparty = sender_key
                            break
            else:  # Outgoing transfer
                for i, (pre, post) in enumerate(zip(pre_balances, post_balances)):
                    if i != treasury_index:
                        change = (post - pre) / LAMPORTS_PER_SOL
                        if change > 0 and abs(change) >= abs(balance_change):
                            recipient_key = account_keys[i]
                            if isinstance(recipient_key, dict):
                                counterparty = recipient_key.get("pubkey")
                            else:
                                counterparty = recipient_key
                            break
            
            # Get block time
            block_time = tx_data.get("blockTime", 0)
            
            # Check for System Program transfer instruction
            is_system_transfer = False
            description = ""
            
            if "logMessages" in tx_data["meta"]:
                log_messages = tx_data["meta"]["logMessages"]
                for log in log_messages:
                    if "Program 11111111111111111111111111111111 invoke" in log:
                        is_system_transfer = True
                    
            # Check instruction data to get more detail
            if "instructions" in tx_data["transaction"]["message"]:
                for instr in tx_data["transaction"]["message"]["instructions"]:
                    if "parsed" in instr and instr.get("program") == "system" and instr["parsed"].get("type") == "transfer":
                        transfer_info = instr["parsed"].get("info", {})
                        source = transfer_info.get("source")
                        destination = transfer_info.get("destination")
                        amount = transfer_info.get("lamports", 0) / LAMPORTS_PER_SOL
                        
                        # Build a description of the transfer
                        if source == treasury_address:
                            description = f"Transfer {amount} SOL to {destination}"
                        elif destination == treasury_address:
                            description = f"Receive {amount} SOL from {source}"
            
            return {
                "timestamp": block_time,
                "formatted_time": format_timestamp(block_time),
                "signature": tx_data["transaction"]["signatures"][0],
                "balance_change": balance_change,
                "counterparty": counterparty if counterparty else "Unknown",
                "is_system_transfer": is_system_transfer,
                "description": description
            }
    
    return None

def main():
    print(f"Fetching data for treasury wallet: {TREASURY_WALLET}\n")
    
    # Get current balance
    current_balance = get_solana_balance()
    print(f"Current balance: {current_balance} SOL\n")
    
    # Get all transaction signatures
    print("Fetching transaction signatures...")
    signatures = get_all_signatures()
    
    if not signatures:
        print("No transaction signatures found.")
        return
        
    print(f"Found {len(signatures)} transaction signatures\n")
    
    # Process the transactions to find SOL transfers
    print("Processing transactions to find SOL transfers...")
    sol_transfers = []
    processed = 0
    
    for sig_data in signatures[:MAX_TRANSACTIONS_TO_PROCESS]:
        signature = sig_data["signature"]
        print(f"Processing transaction {processed+1}/{min(len(signatures), MAX_TRANSACTIONS_TO_PROCESS)}: {signature[:10]}...")
        
        tx_data = get_transaction_details(signature)
        if not tx_data:
            continue
            
        transfer_info = extract_sol_transfers(tx_data, TREASURY_WALLET)
        if transfer_info:
            sol_transfers.append(transfer_info)
            print(f"  Found SOL transfer: {transfer_info['formatted_time']} - {transfer_info['balance_change']:+.9f} SOL")
            
        processed += 1
        time.sleep(0.2)  # Rate limiting
    
    # Sort by timestamp (newest first)
    sol_transfers.sort(key=lambda x: x["timestamp"], reverse=True)
    
    # Calculate total incoming and outgoing
    total_in = sum(t["balance_change"] for t in sol_transfers if t["balance_change"] > 0)
    total_out = sum(abs(t["balance_change"]) for t in sol_transfers if t["balance_change"] < 0)
    
    print(f"\nFound {len(sol_transfers)} SOL transfers")
    print(f"Total incoming: {total_in} SOL")
    print(f"Total outgoing: {total_out} SOL")
    print(f"Net change: {total_in - total_out} SOL")
    
    # Save to file
    with open("sol_transfers.json", "w") as f:
        json.dump(sol_transfers, f, indent=2)
    
    print(f"\nSaved {len(sol_transfers)} SOL transfers to sol_transfers.json")
    
    # Print the most recent transactions
    print("\n10 Most Recent SOL Transfers:")
    for i, tx in enumerate(sol_transfers[:10]):
        counterparty = tx.get("counterparty", "Unknown")
        sign = "+" if tx["balance_change"] > 0 else ""
        print(f"{i+1}. {tx['formatted_time']} - {sign}{tx['balance_change']:.9f} SOL")
        if tx["balance_change"] > 0:
            print(f"   From: {counterparty}")
        else:
            print(f"   To: {counterparty}")
        print(f"   Signature: {tx['signature'][:24]}...")

if __name__ == "__main__":
    main() 