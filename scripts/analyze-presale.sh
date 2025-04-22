#!/bin/bash

# Presale Analysis Script
# This script runs the TypeScript analysis of the presale contributions

echo "🚀 POOKIE Presale Analysis"
echo "================================================"
echo "This script will analyze all presale contributions and generate a report."
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "⚠️  Warning: .env.local file not found. Make sure your Supabase credentials are set."
  echo "Create a .env.local file with:"
  echo "  NEXT_PUBLIC_SUPABASE_URL=your_supabase_url"
  echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key"
  echo ""
  read -p "Do you want to continue anyway? (y/n): " continue_without_env
  if [ "$continue_without_env" != "y" ]; then
    echo "Exiting."
    exit 1
  fi
fi

# Check if TypeScript is installed
if ! command -v npx &> /dev/null; then
  echo "❌ Error: npx is not installed. Please install Node.js and npm first."
  exit 1
fi

# Create reports directory if it doesn't exist
mkdir -p reports

echo "📊 Running analysis..."
npx ts-node scripts/analyze-contributions.ts

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Analysis completed successfully!"
  echo "Check the reports directory for the detailed reports."
  
  # Find the most recent report file
  RECENT_REPORT=$(ls -t reports/presale-summary-*.md 2>/dev/null | head -1)
  
  if [ -n "$RECENT_REPORT" ]; then
    echo ""
    echo "Would you like to view the report now? (y/n): "
    read view_report
    
    if [ "$view_report" = "y" ]; then
      # Try to use a markdown viewer if available, otherwise use cat
      if command -v bat &> /dev/null; then
        bat "$RECENT_REPORT"
      elif command -v mdcat &> /dev/null; then
        mdcat "$RECENT_REPORT"
      else
        cat "$RECENT_REPORT"
      fi
    fi
  fi
else
  echo "❌ Analysis failed. Check the error messages above."
  exit 1
fi 