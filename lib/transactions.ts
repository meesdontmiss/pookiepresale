// Function to verify a transaction on the server
export async function verifyTransaction(
  signature: string,
  walletAddress: string,
  amount: number,
  tier: string = 'public'
): Promise<boolean> {
  try {
    const response = await fetch('/api/transactions/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signature,
        walletAddress,
        amount,
        tier
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Transaction verification failed');
    }

    return true;
  } catch (error) {
    console.error('Verification error:', error);
    throw error;
  }
} 