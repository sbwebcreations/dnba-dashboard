#!/usr/bin/env node

/**
 * Data Warehouse Merge Script
 *
 * Merges uploaded data files with existing source data.
 * - Adds new records that don't already exist
 * - Ignores duplicates (based on unique keys)
 * - Updates lastUpdated timestamps
 *
 * Usage:
 *   npm run merge                    # Process all files in uploads/
 *   npm run merge file1.json         # Process specific file(s)
 *   npm run merge --dry-run          # Preview changes without saving
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as XLSX from 'xlsx'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.join(__dirname, '..')
const DATA_DIR = path.join(ROOT_DIR, 'src', 'data')
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads')

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// Data file configurations with their unique keys
const DATA_CONFIG = {
  dailyPerformance: {
    file: 'dailyPerformance.json',
    arrayKey: 'metrics',
    uniqueKey: (item) => item.date,
    description: 'Daily metrics'
  },
  creativePerformance: {
    file: 'creativePerformance.json',
    arrayKey: 'creatives',
    uniqueKey: (item) => `${item.adName}|${item.adSetName}`,
    description: 'Creative performance'
  },
  adSetPerformance: {
    file: 'adSetPerformance.json',
    arrayKey: 'adSets',
    uniqueKey: (item) => item.adSetName,
    description: 'Ad set performance'
  },
  geoPerformance: {
    file: 'geoPerformance.json',
    arrayKey: 'countries',
    uniqueKey: (item) => item.country,
    description: 'Geographic performance'
  },
  platformPerformance: {
    file: 'platformPerformance.json',
    arrayKey: 'platforms',
    uniqueKey: (item) => `${item.date}|${item.platform}`,
    description: 'Platform performance'
  },
  actualSales: {
    file: 'actualSales.json',
    arrayKey: 'sales',
    uniqueKey: (item) => item.date,
    description: 'Actual sales'
  },
  benchmarks: {
    file: 'benchmarks.json',
    arrayKey: null, // Special case - object, not array
    uniqueKey: null,
    description: 'Benchmarks'
  }
}

// Detect data type from filename
function detectDataType(filename) {
  const lower = filename.toLowerCase()

  if (lower.includes('daily') && !lower.includes('sales')) return 'dailyPerformance'
  if (lower.includes('creative')) return 'creativePerformance'
  if (lower.includes('adset') || lower.includes('ad_set') || lower.includes('ad-set')) return 'adSetPerformance'
  if (lower.includes('geo') || lower.includes('country') || lower.includes('countries')) return 'geoPerformance'
  if (lower.includes('platform')) return 'platformPerformance'
  if (lower.includes('sales') || lower.includes('order') || lower.includes('skiddle')) return 'actualSales'
  if (lower.includes('benchmark')) return 'benchmarks'

  return null
}

// Parse CSV text to array of objects
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  // Handle potential BOM
  let headerLine = lines[0]
  if (headerLine.charCodeAt(0) === 0xFEFF) {
    headerLine = headerLine.slice(1)
  }

  const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''))
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Simple CSV parsing (doesn't handle all edge cases)
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
    const row = {}

    headers.forEach((h, idx) => {
      const val = values[idx] || ''
      // Don't convert date-like strings to numbers
      // Check if it looks like a date (YYYY-MM-DD, DD/MM/YYYY, etc.)
      const looksLikeDate = /^\d{4}-\d{2}-\d{2}$/.test(val) ||
                           /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(val) ||
                           h.toLowerCase().includes('date')
      if (looksLikeDate) {
        row[h] = val
      } else {
        // Try to parse as number
        const num = parseFloat(val)
        // Only use number if entire string was a valid number
        row[h] = (!isNaN(num) && String(num) === val.replace(/^0+/, '') || val === '0') ? num : val
      }
    })

    rows.push(row)
  }

  return rows
}

// Parse Excel file
function parseExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet)
}

// Convert uploaded sales/orders data to actualSales format
function convertToSalesFormat(rows) {
  const salesByDate = {}

  rows.forEach(row => {
    // Try to find date field
    const dateRaw = row.date || row.Date || row.order_date || row.ORDER_DATE ||
                    row['Created at'] || row['Event start date'] || row.event_date
    if (!dateRaw) return

    // Parse date
    let dateStr
    if (typeof dateRaw === 'number') {
      // Excel serial date
      const excelEpoch = new Date(1899, 11, 30)
      const date = new Date(excelEpoch.getTime() + dateRaw * 86400000)
      dateStr = date.toISOString().split('T')[0]
    } else {
      const parsed = new Date(dateRaw)
      if (!isNaN(parsed.getTime())) {
        dateStr = parsed.toISOString().split('T')[0]
      } else {
        // Try DD/MM/YYYY
        const parts = String(dateRaw).split(/[\/\-]/)
        if (parts.length === 3) {
          const [d, m, y] = parts
          dateStr = `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
        } else {
          return
        }
      }
    }

    // Find revenue/tickets
    const revenue = row.revenue || row.Revenue || row.total || row.Total ||
                    row['Order Total'] || row['Face Value'] || 0
    const tickets = row.tickets || row.Tickets || row.quantity || row.Quantity ||
                    row['Number of tickets'] || 1

    if (!salesByDate[dateStr]) {
      salesByDate[dateStr] = { orders: 0, tickets: 0, revenue: 0 }
    }

    salesByDate[dateStr].orders += 1
    salesByDate[dateStr].tickets += tickets
    salesByDate[dateStr].revenue += revenue
  })

  return Object.entries(salesByDate)
    .map(([date, data]) => ({
      date,
      orders: data.orders,
      tickets: data.tickets,
      revenue: Math.round(data.revenue * 100) / 100,
      source: 'Skiddle'
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// Helper to parse Excel date serial number
function parseExcelDate(value) {
  if (!value) return null
  if (typeof value === 'number') {
    // Excel serial date
    const excelEpoch = new Date(1899, 11, 30)
    const date = new Date(excelEpoch.getTime() + value * 86400000)
    return date.toISOString().split('T')[0]
  }
  if (typeof value === 'string') {
    // Try parsing as date string
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0]
    }
  }
  return null
}

// Helper to get numeric value from Meta export field
function getNum(row, ...keys) {
  for (const key of keys) {
    const val = row[key]
    if (val !== undefined && val !== '' && val !== null) {
      const num = parseFloat(val)
      if (!isNaN(num)) return num
    }
  }
  return 0
}

// Check if data looks like a Meta Ads export
function isMetaExport(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false
  const firstRow = rows[0]
  // Meta exports have these characteristic fields
  return firstRow['Day'] !== undefined ||
         firstRow['Amount spent (GBP)'] !== undefined ||
         firstRow['Amount spent (USD)'] !== undefined ||
         (firstRow['Impressions'] !== undefined && firstRow['Ad name'] !== undefined)
}

// Convert Meta Ads daily export to dashboard dailyPerformance format
function convertMetaToDailyFormat(rows) {
  const byDate = {}

  rows.forEach(row => {
    // Get date from various possible fields
    const dateRaw = row['Day'] || row['Date'] || row['Reporting starts']
    const dateStr = parseExcelDate(dateRaw)
    if (!dateStr) return

    if (!byDate[dateStr]) {
      byDate[dateStr] = {
        date: dateStr,
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        landingPageViews: 0,
        addToCart: 0,
        checkoutsInitiated: 0,
        purchases: 0,
        videoPlays25: 0,
        videoPlays75: 0,
        thruPlays: 0,
        _cpaSum: 0,
        _cpaCount: 0,
      }
    }

    const d = byDate[dateStr]
    d.spend += getNum(row, 'Amount spent (GBP)', 'Amount spent (USD)', 'Amount spent', 'Spend')
    d.impressions += getNum(row, 'Impressions')
    d.reach += getNum(row, 'Reach')
    d.clicks += getNum(row, 'Link clicks', 'Clicks', 'Clicks (all)')
    d.landingPageViews += getNum(row, 'Landing page views')
    d.addToCart += getNum(row, 'Adds to cart', 'Add to cart')
    d.checkoutsInitiated += getNum(row, 'Checkouts initiated', 'Initiate checkout')
    d.purchases += getNum(row, 'Purchases', 'Purchase')
    d.videoPlays25 += getNum(row, 'Video plays at 25%')
    d.videoPlays75 += getNum(row, 'Video plays at 75%')
    d.thruPlays += getNum(row, 'ThruPlays', 'Thruplay')

    // Track CPA for averaging
    const cpa = getNum(row, 'Cost per purchase', 'Cost per result')
    if (cpa > 0) {
      d._cpaSum += cpa
      d._cpaCount += 1
    }
  })

  // Calculate derived metrics
  return Object.values(byDate).map(d => {
    const spend = Math.round(d.spend * 100) / 100
    const cpa = d.purchases > 0 ? Math.round((spend / d.purchases) * 100) / 100 : 0
    const ctr = d.impressions > 0 ? Math.round((d.clicks / d.impressions) * 100000) / 1000 : 0
    const cpc = d.clicks > 0 ? Math.round((spend / d.clicks) * 100) / 100 : 0
    const cpm = d.impressions > 0 ? Math.round((spend / d.impressions * 1000) * 100) / 100 : 0

    return {
      date: d.date,
      spend,
      impressions: d.impressions,
      reach: d.reach,
      clicks: d.clicks,
      landingPageViews: d.landingPageViews,
      addToCart: d.addToCart,
      checkoutsInitiated: d.checkoutsInitiated,
      purchases: d.purchases,
      cpa,
      ctr,
      cpc,
      cpm,
      videoPlays25: d.videoPlays25,
      videoPlays75: d.videoPlays75,
      thruPlays: d.thruPlays,
    }
  }).sort((a, b) => a.date.localeCompare(b.date))
}

// Convert Meta Ads ad set export to dashboard adSetPerformance format
function convertMetaToAdSetFormat(rows) {
  const byAdSet = {}

  rows.forEach(row => {
    const adSetName = row['Ad set name'] || row['AdSet Name'] || row['Ad Set']
    if (!adSetName) return

    if (!byAdSet[adSetName]) {
      byAdSet[adSetName] = {
        adSetName,
        spend: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
      }
    }

    const d = byAdSet[adSetName]
    d.spend += getNum(row, 'Amount spent (GBP)', 'Amount spent (USD)', 'Amount spent', 'Spend')
    d.impressions += getNum(row, 'Impressions')
    d.clicks += getNum(row, 'Link clicks', 'Clicks', 'Clicks (all)')
    d.purchases += getNum(row, 'Purchases', 'Purchase')
  })

  return Object.values(byAdSet).map(d => {
    const spend = Math.round(d.spend * 100) / 100
    const cpa = d.purchases > 0 ? Math.round((spend / d.purchases) * 100) / 100 : 0
    const ctr = d.impressions > 0 ? Math.round((d.clicks / d.impressions) * 100000) / 1000 : 0

    // Try to detect temperature and geo from ad set name
    const nameLower = d.adSetName.toLowerCase()
    const temperature = nameLower.includes('warm') ? 'Warm' : nameLower.includes('cold') ? 'Cold' : nameLower.includes('hot') ? 'Hot' : 'Unknown'
    const geo = nameLower.includes('uk |') ? 'UK' : nameLower.includes('eu |') ? 'EU' : nameLower.includes('aus') || nameLower.includes('nz') ? 'Mixed' : nameLower.includes('th |') ? 'TH' : 'Unknown'

    return {
      adSetName: d.adSetName,
      spend,
      impressions: d.impressions,
      clicks: d.clicks,
      purchases: d.purchases,
      cpa,
      ctr,
      temperature,
      geo,
    }
  }).sort((a, b) => b.spend - a.spend) // Sort by spend descending
}

// Convert Meta Ads platform export to dashboard platformPerformance format
function convertMetaToPlatformFormat(rows) {
  const byDatePlatform = {}

  rows.forEach(row => {
    const dateRaw = row['Day'] || row['Date'] || row['Reporting starts']
    const dateStr = parseExcelDate(dateRaw)
    const platform = (row['Publisher platform'] || row['Platform'] || row['Placement'] || '').toLowerCase()

    if (!dateStr || !platform) return

    // Normalize platform names
    let normalizedPlatform = platform
    if (platform.includes('facebook')) normalizedPlatform = 'facebook'
    else if (platform.includes('instagram')) normalizedPlatform = 'instagram'
    else if (platform.includes('messenger')) normalizedPlatform = 'messenger'
    else if (platform.includes('audience')) normalizedPlatform = 'audience_network'

    const key = `${dateStr}|${normalizedPlatform}`

    if (!byDatePlatform[key]) {
      byDatePlatform[key] = {
        date: dateStr,
        platform: normalizedPlatform,
        spend: 0,
        impressions: 0,
        clicks: 0,
        landingPageViews: 0,
        purchases: 0,
      }
    }

    const d = byDatePlatform[key]
    d.spend += getNum(row, 'Amount spent (GBP)', 'Amount spent (USD)', 'Amount spent', 'Spend')
    d.impressions += getNum(row, 'Impressions')
    d.clicks += getNum(row, 'Link clicks', 'Clicks', 'Clicks (all)')
    d.landingPageViews += getNum(row, 'Landing page views')
    d.purchases += getNum(row, 'Purchases', 'Purchase')
  })

  return Object.values(byDatePlatform).map(d => {
    const spend = Math.round(d.spend * 100) / 100
    const cpa = d.purchases > 0 ? Math.round((spend / d.purchases) * 100) / 100 : 0
    const ctr = d.impressions > 0 ? Math.round((d.clicks / d.impressions) * 100000) / 1000 : 0

    return {
      date: d.date,
      platform: d.platform,
      spend,
      impressions: d.impressions,
      clicks: d.clicks,
      landingPageViews: d.landingPageViews,
      purchases: d.purchases,
      cpa,
      ctr,
    }
  }).sort((a, b) => a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform))
}

// Read and parse uploaded file
function readUploadedFile(filepath) {
  const ext = path.extname(filepath).toLowerCase()
  const content = fs.readFileSync(filepath)

  if (ext === '.json') {
    return JSON.parse(content.toString())
  } else if (ext === '.csv') {
    return parseCSV(content.toString())
  } else if (ext === '.xlsx' || ext === '.xls') {
    return parseExcel(content)
  }

  throw new Error(`Unsupported file type: ${ext}`)
}

// Load existing source data
function loadSourceData(dataType) {
  const config = DATA_CONFIG[dataType]
  const filepath = path.join(DATA_DIR, config.file)

  if (!fs.existsSync(filepath)) {
    return null
  }

  return JSON.parse(fs.readFileSync(filepath, 'utf8'))
}

// Merge new data into existing data
function mergeData(existing, newData, dataType) {
  const config = DATA_CONFIG[dataType]
  const today = new Date().toISOString().split('T')[0]

  // Special case for benchmarks - just update/replace
  if (dataType === 'benchmarks') {
    return {
      ...existing,
      ...newData,
      asOf: today
    }
  }

  const arrayKey = config.arrayKey
  const getKey = config.uniqueKey

  // Get existing items
  const existingItems = existing[arrayKey] || []
  const existingKeys = new Set(existingItems.map(getKey))

  // Get new items (handle both array and object with array)
  let newItems = Array.isArray(newData) ? newData : (newData[arrayKey] || newData)

  // Special handling for sales CSV data
  if (dataType === 'actualSales' && Array.isArray(newData) && newData.length > 0 && !newData[0].orders) {
    newItems = convertToSalesFormat(newData)
  }

  // Special handling for Meta Ads exports - transform to dashboard format
  if (Array.isArray(newItems) && newItems.length > 0 && isMetaExport(newItems)) {
    log(`  Detected Meta Ads export format, transforming...`, 'cyan')

    if (dataType === 'dailyPerformance') {
      newItems = convertMetaToDailyFormat(newItems)
      log(`  Aggregated to ${newItems.length} daily records`, 'dim')
    } else if (dataType === 'adSetPerformance') {
      newItems = convertMetaToAdSetFormat(newItems)
      log(`  Aggregated to ${newItems.length} ad sets`, 'dim')
    } else if (dataType === 'platformPerformance') {
      newItems = convertMetaToPlatformFormat(newItems)
      log(`  Aggregated to ${newItems.length} platform-day records`, 'dim')
    }
  }

  if (!Array.isArray(newItems)) {
    log(`  Warning: Could not find array data in uploaded file`, 'yellow')
    return existing
  }

  // Find new records
  const addedItems = []
  const skippedCount = { count: 0 }

  newItems.forEach(item => {
    const key = getKey(item)
    if (!existingKeys.has(key)) {
      addedItems.push(item)
      existingKeys.add(key)
    } else {
      skippedCount.count++
    }
  })

  if (addedItems.length === 0) {
    log(`  No new records to add (${skippedCount.count} duplicates skipped)`, 'dim')
    return null // No changes
  }

  log(`  + ${addedItems.length} new records added`, 'green')
  if (skippedCount.count > 0) {
    log(`  - ${skippedCount.count} duplicates skipped`, 'dim')
  }

  // Merge and sort
  const mergedItems = [...existingItems, ...addedItems]

  // Sort by date if applicable (safely handle missing dates)
  if (mergedItems[0] && mergedItems[0].date) {
    mergedItems.sort((a, b) => {
      const dateA = a.date || ''
      const dateB = b.date || ''
      return dateA.localeCompare(dateB)
    })
  }

  return {
    ...existing,
    lastUpdated: today,
    [arrayKey]: mergedItems
  }
}

// Save merged data
function saveData(data, dataType) {
  const config = DATA_CONFIG[dataType]
  const filepath = path.join(DATA_DIR, config.file)

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2))
  log(`  Saved to ${config.file}`, 'blue')
}

// Process a single uploaded file
function processFile(filepath, dryRun = false) {
  const filename = path.basename(filepath)
  log(`\nProcessing: ${filename}`, 'cyan')

  // Detect data type
  const dataType = detectDataType(filename)
  if (!dataType) {
    log(`  Could not determine data type from filename`, 'yellow')
    log(`  Rename file to include: daily, creative, adset, geo, platform, sales, or benchmark`, 'dim')
    return false
  }

  log(`  Detected type: ${DATA_CONFIG[dataType].description}`, 'dim')

  try {
    // Read uploaded data
    const newData = readUploadedFile(filepath)

    // Load existing data
    const existing = loadSourceData(dataType)
    if (!existing) {
      log(`  Warning: Source file not found, creating new`, 'yellow')
    }

    // Merge
    const merged = mergeData(existing || { description: DATA_CONFIG[dataType].description }, newData, dataType)

    if (!merged) {
      return true // No changes needed
    }

    // Save (unless dry run)
    if (dryRun) {
      log(`  [DRY RUN] Would save to ${DATA_CONFIG[dataType].file}`, 'yellow')
    } else {
      saveData(merged, dataType)

      // Move processed file to processed folder
      const processedDir = path.join(UPLOADS_DIR, 'processed')
      if (!fs.existsSync(processedDir)) {
        fs.mkdirSync(processedDir, { recursive: true })
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const newFilename = `${timestamp}_${filename}`
      fs.renameSync(filepath, path.join(processedDir, newFilename))
      log(`  Moved to uploads/processed/${newFilename}`, 'dim')
    }

    return true
  } catch (error) {
    log(`  Error: ${error.message}`, 'red')
    return false
  }
}

// Main function
function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const files = args.filter(a => !a.startsWith('--'))

  log('\n========================================', 'cyan')
  log('  DNBA Dashboard - Data Merge Tool', 'cyan')
  log('========================================\n', 'cyan')

  if (dryRun) {
    log('[DRY RUN MODE - No changes will be saved]\n', 'yellow')
  }

  let filesToProcess = []

  if (files.length > 0) {
    // Process specific files
    filesToProcess = files.map(f => {
      if (path.isAbsolute(f)) return f
      return path.join(process.cwd(), f)
    })
  } else {
    // Process all files in uploads/
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true })
      log(`Created uploads/ folder`, 'green')
    }

    const uploadedFiles = fs.readdirSync(UPLOADS_DIR)
      .filter(f => {
        const ext = path.extname(f).toLowerCase()
        return ['.json', '.csv', '.xlsx', '.xls'].includes(ext)
      })
      .filter(f => !f.startsWith('.'))

    if (uploadedFiles.length === 0) {
      log('No files found in uploads/ folder\n', 'yellow')
      log('To merge data:', 'dim')
      log('  1. Drop your data files into the uploads/ folder', 'dim')
      log('  2. Run: npm run merge\n', 'dim')
      log('Supported formats: .json, .csv, .xlsx', 'dim')
      log('Name files with: daily, creative, adset, geo, platform, sales, benchmark\n', 'dim')
      return
    }

    filesToProcess = uploadedFiles.map(f => path.join(UPLOADS_DIR, f))
  }

  log(`Found ${filesToProcess.length} file(s) to process`, 'blue')

  let successCount = 0
  let errorCount = 0

  filesToProcess.forEach(filepath => {
    if (processFile(filepath, dryRun)) {
      successCount++
    } else {
      errorCount++
    }
  })

  log('\n----------------------------------------', 'dim')
  log(`Done! ${successCount} succeeded, ${errorCount} failed\n`, successCount > 0 ? 'green' : 'yellow')
}

main()
