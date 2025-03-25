import { type NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"

// Use environment variables for sensitive data
const CORE_TIER_PASSWORD_HASH = process.env.CORE_TIER_PASSWORD_HASH || "9c1ad00a4f3187b5a5611d6b8c0d757d1081cbc3bde4db3d39597768011a4a46" // Default hash is just a placeholder
const SALT = process.env.PASSWORD_SALT || "pookie-salt" // Should be set in environment

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 })
    }

    // Add delay to prevent timing attacks
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200))
    
    // Hash the provided password with salt
    const passwordHash = createHash('sha256').update(password + SALT).digest('hex')
    
    // Compare hash instead of plain text password
    const isValid = passwordHash === CORE_TIER_PASSWORD_HASH

    return NextResponse.json({
      success: isValid,
      message: isValid ? "Password verified successfully" : "Invalid password",
    })
  } catch (error) {
    console.error("Error verifying password:", error)
    return NextResponse.json({ error: "Failed to verify password" }, { status: 500 })
  }
}

