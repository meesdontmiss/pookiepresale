"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/utils/supabase-client'
import { toast } from '@/components/ui/use-toast'

interface Contributor {
  wallet_address: string
  total_contributed: number
  token_allocation?: number
  distribution_status?: string
}

export default function ContributorManagement() {
  const [contributors, setContributors] = useState<Contributor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tokenSupply, setTokenSupply] = useState(10000000)
  const [searchQuery, setSearchQuery] = useState('')
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('csv')
  
  // Fetch contributors
  useEffect(() => {
    fetchContributors()
  }, [])
  
  const fetchContributors = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('distribution_records')
        .select('*')
        .order('total_contributed', { ascending: false })
      
      if (error) throw error
      
      setContributors(data || [])
    } catch (error) {
      console.error('Error fetching contributors:', error)
      toast({
        title: 'Error',
        description: 'Failed to load contributors',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }
  
  // Calculate token allocations
  const calculateAllocations = async () => {
    try {
      if (!tokenSupply || tokenSupply <= 0) {
        toast({
          title: 'Invalid Token Supply',
          description: 'Please enter a valid token supply',
          variant: 'destructive'
        })
        return
      }
      
      const { data, error } = await supabase.rpc('calculate_token_allocations', {
        token_supply: tokenSupply,
        min_contribution: 0
      })
      
      if (error) throw error
      
      toast({
        title: 'Allocations Calculated',
        description: 'Token allocations have been calculated successfully.'
      })
      
      // Refresh the contributor list
      fetchContributors()
      
    } catch (error) {
      console.error('Error calculating allocations:', error)
      toast({
        title: 'Calculation Failed',
        description: 'Failed to calculate token allocations',
        variant: 'destructive'
      })
    }
  }
  
  // Create airdrop batch
  const createAirdropBatch = async () => {
    try {
      const batchName = `Airdrop Batch ${new Date().toISOString().split('T')[0]}`
      
      const { data: batchId, error: batchError } = await supabase.rpc('create_airdrop_batch', {
        p_batch_name: batchName
      })
      
      if (batchError) throw batchError
      
      // Populate the batch with recipients
      const { data: recipientCount, error: recipientError } = await supabase.rpc('populate_airdrop_batch', {
        p_batch_id: batchId,
        p_min_tokens: 0
      })
      
      if (recipientError) throw recipientError
      
      toast({
        title: 'Airdrop Batch Created',
        description: `Created batch with ${recipientCount} recipients.`
      })
      
    } catch (error) {
      console.error('Error creating airdrop batch:', error)
      toast({
        title: 'Batch Creation Failed',
        description: 'Failed to create airdrop batch',
        variant: 'destructive'
      })
    }
  }
  
  // Export airdrop list
  const exportAirdropList = () => {
    try {
      // Validate admin session is still active
      const authStatus = sessionStorage.getItem('pookie_admin_auth');
      const expiryTime = sessionStorage.getItem('pookie_admin_auth_expiry');
      
      if (authStatus !== 'true' || !expiryTime || Date.now() >= parseInt(expiryTime)) {
        toast({
          title: 'Session Expired',
          description: 'Your admin session has expired. Please log in again.',
          variant: 'destructive'
        });
        // Force refresh to show login screen
        window.location.reload();
        return;
      }
      
      const contributorsWithAllocation = contributors.filter(c => c.token_allocation && c.token_allocation > 0);
      
      if (contributorsWithAllocation.length === 0) {
        toast({
          title: 'No allocations found',
          description: 'Calculate token allocations first.',
          variant: 'destructive'
        });
        return;
      }

      // Confirm export action - data protection measure
      if (!window.confirm(`You are about to export sensitive data containing ${contributorsWithAllocation.length} wallet addresses. Continue?`)) {
        return;
      }
      
      let content: string;
      let filename: string;
      
      if (exportFormat === 'csv') {
        // Generate CSV
        const headers = 'wallet_address,token_allocation\n';
        const rows = contributorsWithAllocation.map(c => 
          `${c.wallet_address},${c.token_allocation}`
        ).join('\n');
        
        content = headers + rows;
        filename = `pookie_airdrop_list_${Date.now()}.csv`;
      } else {
        // Generate JSON
        const data = contributorsWithAllocation.map(c => ({
          wallet_address: c.wallet_address,
          token_allocation: c.token_allocation
        }));
        
        content = JSON.stringify(data, null, 2);
        filename = `pookie_airdrop_list_${Date.now()}.json`;
      }
      
      // Create download link with content sanitization
      const sanitizedContent = content.replace(/[^\w\s,.:"{}\[\]\\/-]/g, '');
      const blob = new Blob([sanitizedContent], { type: exportFormat === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      link.href = url;
      link.download = filename;
      link.click();
      
      URL.revokeObjectURL(url);
      
      // Log the export action for audit purposes
      console.log(`Admin exported ${contributorsWithAllocation.length} records at ${new Date().toISOString()}`);
      
      toast({
        title: 'Export Successful',
        description: `Exported ${contributorsWithAllocation.length} contributor records.`
      });
      
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export Failed',
        description: 'Failed to export airdrop list',
        variant: 'destructive'
      });
    }
  };
  
  // Filter contributors based on search query
  const filteredContributors = contributors.filter(contributor => 
    contributor.wallet_address.toLowerCase().includes(searchQuery.toLowerCase())
  )
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Contributor Management</CardTitle>
          <CardDescription>Manage contributors and prepare for token distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="contributors">
            <TabsList>
              <TabsTrigger value="contributors">Contributors</TabsTrigger>
              <TabsTrigger value="distribution">Distribution</TabsTrigger>
            </TabsList>
            
            <TabsContent value="contributors" className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search by wallet address"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
                <Button onClick={fetchContributors}>Refresh</Button>
              </div>
              
              <Table>
                <TableCaption>
                  {isLoading ? 'Loading contributors...' : `Total of ${contributors.length} contributors`}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet Address</TableHead>
                    <TableHead className="text-right">Total Contributed (SOL)</TableHead>
                    <TableHead className="text-right">Token Allocation</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center">Loading...</TableCell>
                    </TableRow>
                  ) : filteredContributors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center">
                        {searchQuery ? 'No matching contributors found' : 'No contributors yet'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredContributors.map((contributor) => (
                      <TableRow key={contributor.wallet_address}>
                        <TableCell className="font-mono text-xs">
                          {contributor.wallet_address}
                        </TableCell>
                        <TableCell className="text-right">
                          {contributor.total_contributed.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-right">
                          {contributor.token_allocation 
                            ? contributor.token_allocation.toLocaleString(undefined, { maximumFractionDigits: 0 }) 
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {contributor.distribution_status || 'Pending'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
            
            <TabsContent value="distribution" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Token Allocation</CardTitle>
                  <CardDescription>
                    Calculate token allocations for contributors proportionally to their contributions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2 items-end">
                    <div className="space-y-2">
                      <label htmlFor="tokenSupply" className="text-sm font-medium">
                        Total Token Supply
                      </label>
                      <Input
                        id="tokenSupply"
                        type="number"
                        value={tokenSupply}
                        onChange={(e) => setTokenSupply(Number(e.target.value))}
                        className="max-w-sm"
                      />
                    </div>
                    <Button onClick={calculateAllocations}>Calculate Allocations</Button>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Airdrop Preparation</CardTitle>
                  <CardDescription>
                    Prepare and export data for token airdrop
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Button onClick={createAirdropBatch}>
                      Create Airdrop Batch
                    </Button>
                    
                    <div className="flex items-center gap-2 ml-4">
                      <span className="text-sm">Export Format:</span>
                      <select 
                        value={exportFormat}
                        onChange={(e) => setExportFormat(e.target.value as 'csv' | 'json')}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        <option value="csv">CSV</option>
                        <option value="json">JSON</option>
                      </select>
                      <Button onClick={exportAirdropList}>
                        Export Airdrop List
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
} 