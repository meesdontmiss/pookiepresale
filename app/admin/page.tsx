"use client"

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, AlertCircle, Download, RefreshCw, LogOut } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Dashboard component
export default function AdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [stats, setStats] = useState<any>(null)
  const [contributions, setContributions] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)

  // Check if user is already authenticated
  useEffect(() => {
    const token = localStorage.getItem('adminToken')
    if (token) {
      setIsAuthenticated(true)
      fetchDashboardData()
    }
  }, [])

  // Handle login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        localStorage.setItem('adminToken', data.token)
        setIsAuthenticated(true)
        fetchDashboardData()
      } else {
        setError(data.error || 'Login failed')
      }
    } catch (err) {
      setError('Failed to login. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('adminToken')
    setIsAuthenticated(false)
    setStats(null)
    setContributions([])
  }

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    setRefreshing(true)
    try {
      // Fetch stats
      await fetchStats()
      // Fetch contributions
      await fetchContributions()
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
    } finally {
      setRefreshing(false)
    }
  }

  // Fetch stats
  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('adminToken')
      if (!token) return

      const response = await fetch('/api/admin/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setStats(data.stats)
      } else if (response.status === 401) {
        // Token expired or invalid
        setIsAuthenticated(false)
        localStorage.removeItem('adminToken')
        setError('Session expired. Please login again.')
        } else {
        console.error('Error fetching stats:', data.error)
      }
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }

  // Fetch contributions
  const fetchContributions = async () => {
    try {
      const token = localStorage.getItem('adminToken')
      if (!token) return

      const response = await fetch('/api/admin/contributions', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setContributions(data.data || [])
      } else if (response.status === 401) {
        // Token expired or invalid
        setIsAuthenticated(false)
        localStorage.removeItem('adminToken')
      } else {
        console.error('Error fetching contributions:', data.error)
      }
    } catch (err) {
      console.error('Error fetching contributions:', err)
    }
  }

  // Export data as CSV
  const exportAsCSV = () => {
    if (!contributions.length) return

    // Convert contributions to CSV
    const headers = Object.keys(contributions[0]).join(',')
    const rows = contributions.map(contribution => {
      return Object.values(contribution).map(value => {
        if (typeof value === 'string') return `"${value}"`
        return value
      }).join(',')
    }).join('\n')

    const csv = `${headers}\n${rows}`
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `pookie-presale-data-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Format SOL amount
  const formatSol = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  }

  // Login form
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md mx-4">
          <CardHeader>
            <CardTitle>Admin Login</CardTitle>
            <CardDescription>Enter your password to access the admin dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Admin Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  'Login'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Dashboard
  return (
    <div className="container py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">$POOKIE Presale Dashboard</h1>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchDashboardData} 
            disabled={refreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Raised</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? `${formatSol(stats.totalRaised)} SOL` : '...'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Contributors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? stats.uniqueContributors : '...'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg. Contribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? `${formatSol(stats.averageContribution)} SOL` : '...'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? `${Math.min(Math.round(stats.totalRaised / 7.5), 100)}%` : '...'}
            </div>
            <div className="mt-2 h-2 w-full bg-secondary rounded-full overflow-hidden">
              {stats && (
                <div 
                  className="h-full bg-primary" 
                  style={{ width: `${Math.min(Math.round(stats.totalRaised / 7.5), 100)}%` }} 
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Tabs defaultValue="contributions">
        <TabsList>
          <TabsTrigger value="contributions">Contributions</TabsTrigger>
          <TabsTrigger value="tiers">Tier Breakdown</TabsTrigger>
        </TabsList>
        
        <TabsContent value="contributions" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Presale Contributions</CardTitle>
              <Button variant="outline" size="sm" onClick={exportAsCSV} disabled={!contributions.length}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Date</th>
                      <th className="text-left py-2">Wallet</th>
                      <th className="text-left py-2">Amount</th>
                      <th className="text-left py-2">Tier</th>
                      <th className="text-left py-2">Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contributions.length > 0 ? (
                      contributions.map((contribution, i) => (
                        <tr key={i} className="border-b">
                          <td className="py-2">
                            {new Date(contribution.created_at).toLocaleString()}
                          </td>
                          <td className="py-2 font-mono text-xs">
                            {contribution.wallet_address}
                          </td>
                          <td className="py-2">{contribution.amount} SOL</td>
                          <td className="py-2 capitalize">{contribution.tier || 'public'}</td>
                          <td className="py-2">
                            <a 
                              href={`https://solscan.io/tx/${contribution.transaction_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {contribution.transaction_id.substring(0, 8)}...
                            </a>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted-foreground">
                          {refreshing 
                            ? 'Loading data...' 
                            : 'No contributions found'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="tiers" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Contributions by Tier</CardTitle>
            </CardHeader>
            <CardContent>
              {stats && stats.tiers ? (
                <div className="space-y-4">
                  {Object.entries(stats.tiers).map(([tier, amount]) => (
                    <div key={tier} className="space-y-1">
                      <div className="flex justify-between">
                        <div className="capitalize font-medium">{tier}</div>
                        <div>{formatSol(amount as number)} SOL</div>
                      </div>
                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary" 
                          style={{ width: `${Math.round((amount as number) / stats.totalRaised * 100)}%` }} 
                        />
                      </div>
                      <div className="text-xs text-muted-foreground text-right">
                        {Math.round((amount as number) / stats.totalRaised * 100)}% of total
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  {refreshing ? 'Loading data...' : 'No tier data available'}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 