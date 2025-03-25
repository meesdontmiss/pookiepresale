"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { getTotalContributions, getContributorCount } from '@/utils/supabase-client'
import { toast } from '@/components/ui/use-toast'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalAmount: 0,
    contributorCount: 0
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        setIsLoading(true)
        
        // Get total contributions
        const totalResult = await getTotalContributions()
        
        // Get contributor count
        const countResult = await getContributorCount()
        
        setStats({
          totalAmount: totalResult.success ? totalResult.totalAmount : 0,
          contributorCount: countResult.success ? countResult.count : 0
        })
      } catch (error) {
        console.error('Error fetching dashboard stats:', error)
        toast({
          title: 'Error',
          description: 'Failed to load dashboard statistics',
          variant: 'destructive'
        })
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchStats()
  }, [])

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Pookie Presale Dashboard</h1>
        <Button asChild>
          <Link href="/admin">Admin Area</Link>
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Contributions</CardTitle>
            <CardDescription>Amount raised in SOL</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : stats.totalAmount.toFixed(2)} SOL
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Contributors</CardTitle>
            <CardDescription>Unique wallet addresses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : stats.contributorCount}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Contribution</CardTitle>
            <CardDescription>SOL per contributor</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : stats.contributorCount > 0 
                ? (stats.totalAmount / stats.contributorCount).toFixed(2) 
                : '0.00'} SOL
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Presale Progress</CardTitle>
          <CardDescription>
            Track the progress of our presale campaign
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Progress</span>
                <span className="font-medium">
                  {isLoading ? '...' : `${Math.min(100, (stats.totalAmount / 100) * 100).toFixed(1)}%`}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full">
                <div 
                  className="h-2 bg-primary rounded-full" 
                  style={{ 
                    width: `${Math.min(100, (stats.totalAmount / 100) * 100)}%`
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0 SOL</span>
                <span>Target: 100 SOL</span>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href="/">Enter Presale</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
} 