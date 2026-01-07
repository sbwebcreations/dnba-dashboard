import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Area, PieChart, Pie, Cell, ReferenceLine,
  AreaChart, FunnelChart, Funnel, LabelList
} from 'recharts'
import { formatCurrency, formatPercent, formatNumber, formatShortDate } from './utils/formatters'
import { getDaysUntilEvent, getPerformanceStatus, getStatusColor } from './utils/calculations'

// Import default data
import defaultDailyData from './data/dailyPerformance.json'
import defaultCreativeData from './data/creativePerformance.json'
import defaultPlatformData from './data/platformPerformance.json'
import defaultAdSetData from './data/adSetPerformance.json'
import defaultGeoData from './data/geoPerformance.json'
import defaultActualSalesData from './data/actualSales.json'
import defaultBenchmarksData from './data/benchmarks.json'

// CAMPAIGN REALITY - Key metrics from actual Skiddle data
const CAMPAIGN_ACTUALS = {
  totalOrders: 834,
  totalTickets: 910,
  totalRevenue: 388174,
  totalSpend: 21754,
  metaPurchases: 341,
  trueCPA: 26.08,
  metaCPA: 63.79,
  roas: 17.84,
  attributionRate: 0.41, // Meta only sees 41% of actual sales
}

// Merge daily performance with estimated actual sales
// Distributes actual sales proportionally based on Meta purchases
function getMergedDailyData() {
  const metrics = dailyData.metrics
  const totalMetaPurchases = metrics.reduce((sum, d) => sum + d.purchases, 0)
  const avgRevenuePerOrder = CAMPAIGN_ACTUALS.totalRevenue / CAMPAIGN_ACTUALS.totalOrders

  return metrics.map(day => {
    // Estimate actual orders based on attribution rate
    // If Meta shows X purchases, actual is approximately X / 0.41
    const estimatedOrders = day.purchases > 0
      ? Math.round(day.purchases / CAMPAIGN_ACTUALS.attributionRate)
      : Math.round((day.spend / CAMPAIGN_ACTUALS.totalSpend) * CAMPAIGN_ACTUALS.totalOrders)

    const estimatedTickets = Math.round(estimatedOrders * 1.09) // ~1.09 tickets per order avg
    const estimatedRevenue = estimatedOrders * avgRevenuePerOrder

    return {
      ...day,
      purchasesMeta: day.purchases,
      ordersActual: estimatedOrders,
      ticketsActual: estimatedTickets,
      revenueActual: estimatedRevenue,
      cpaMeta: day.cpa,
      cpaActual: estimatedOrders > 0 ? day.spend / estimatedOrders : 0,
      roas: day.spend > 0 ? estimatedRevenue / day.spend : 0,
    }
  })
}

const mergedDailyMetrics = getMergedDailyData()

// Color constants
const COLORS = {
  purple: '#8b5cf6',
  pink: '#ec4899',
  blue: '#3b82f6',
  green: '#22c55e',
  amber: '#f59e0b',
  cyan: '#06b6d4',
  red: '#ef4444',
  facebook: '#1877F2',
  instagram: '#E4405F',
}

// ============================================
// WORLD-CLASS FEATURES: Data Upload, Export, Theme, Shortcuts
// ============================================

// Keyboard shortcuts configuration
const KEYBOARD_SHORTCUTS = [
  { key: '?', description: 'Show keyboard shortcuts' },
  { key: '1-8', description: 'Switch tabs (1=Overview, 2=Daily, etc.)' },
  { key: 'e', description: 'Export current view to CSV' },
  { key: 'd', description: 'Toggle dark/light mode' },
  { key: 'u', description: 'Open data upload' },
  { key: 'a', description: 'Open AI Copilot' },
  { key: 's', description: 'Open Executive Summary' },
  { key: 'w', description: 'Open What-If Simulator' },
  { key: 'Esc', description: 'Close modals' },
]

// Export data to CSV
function exportToCSV(data, filename) {
  if (!data || data.length === 0) return

  const headers = Object.keys(data[0])
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h]
        // Handle values with commas or quotes
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return val
      }).join(',')
    )
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

// Data Upload Modal Component
function DataUploadModal({ isOpen, onClose, onDataUpload }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const fileInputRef = useRef(null)

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const processFile = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result)
          resolve({ name: file.name, data, success: true })
        } catch (err) {
          reject({ name: file.name, error: 'Invalid JSON format', success: false })
        }
      }
      reader.onerror = () => reject({ name: file.name, error: 'Failed to read file', success: false })
      reader.readAsText(file)
    })
  }, [])

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    setIsDragging(false)
    setUploadStatus('processing')

    const files = Array.from(e.dataTransfer?.files || e.target?.files || [])
    const jsonFiles = files.filter(f => f.name.endsWith('.json'))

    if (jsonFiles.length === 0) {
      setUploadStatus('error')
      return
    }

    const results = await Promise.allSettled(jsonFiles.map(processFile))
    const processed = results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : { name: jsonFiles[i].name, error: r.reason?.error || 'Unknown error', success: false }
    )

    setUploadedFiles(processed)

    const successful = processed.filter(p => p.success)
    if (successful.length > 0) {
      setUploadStatus('success')
      // Determine data type from filename and upload
      successful.forEach(({ name, data }) => {
        const type = name.toLowerCase().includes('daily') ? 'daily'
          : name.toLowerCase().includes('creative') ? 'creatives'
          : name.toLowerCase().includes('platform') ? 'platforms'
          : name.toLowerCase().includes('adset') || name.toLowerCase().includes('ad_set') ? 'adsets'
          : name.toLowerCase().includes('geo') ? 'geo'
          : name.toLowerCase().includes('sales') ? 'sales'
          : 'unknown'
        onDataUpload(type, data)
      })
    } else {
      setUploadStatus('error')
    }
  }, [processFile, onDataUpload])

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0f1729] rounded-2xl border border-[#1e3a5f] shadow-2xl max-w-lg w-full mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1e3a5f]">
          <h2 className="text-lg font-semibold">Upload Data</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#1a2744] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drop Zone */}
        <div className="p-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleFileSelect}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-[#2d4a6f] hover:border-purple-500/50 hover:bg-[#1a2744]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              multiple
              onChange={handleDrop}
              className="hidden"
            />
            <div className="text-4xl mb-3">📁</div>
            <p className="text-gray-300 mb-2">
              {isDragging ? 'Drop files here...' : 'Drag & drop JSON files here'}
            </p>
            <p className="text-gray-500 text-sm">or click to browse</p>
          </div>

          {/* Upload Status */}
          {uploadStatus && (
            <div className={`mt-4 p-4 rounded-lg ${
              uploadStatus === 'success' ? 'bg-green-900/30 border border-green-700' :
              uploadStatus === 'error' ? 'bg-red-900/30 border border-red-700' :
              'bg-blue-900/30 border border-blue-700'
            }`}>
              {uploadStatus === 'processing' && (
                <div className="flex items-center gap-2 text-blue-400">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing files...
                </div>
              )}
              {uploadStatus === 'success' && (
                <div className="text-green-400">
                  <div className="font-medium mb-2">Files uploaded successfully!</div>
                  {uploadedFiles.filter(f => f.success).map((f, i) => (
                    <div key={i} className="text-sm text-green-300">✓ {f.name}</div>
                  ))}
                </div>
              )}
              {uploadStatus === 'error' && (
                <div className="text-red-400">
                  <div className="font-medium mb-2">Upload failed</div>
                  {uploadedFiles.filter(f => !f.success).map((f, i) => (
                    <div key={i} className="text-sm text-red-300">✗ {f.name}: {f.error}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* File Format Help */}
          <div className="mt-4 p-4 bg-[#1a2744] rounded-lg">
            <h4 className="text-sm font-medium mb-2">Supported file formats:</h4>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>• <code className="text-purple-400">dailyPerformance.json</code> - Daily metrics</li>
              <li>• <code className="text-purple-400">creativePerformance.json</code> - Creative data</li>
              <li>• <code className="text-purple-400">platformPerformance.json</code> - Platform breakdown</li>
              <li>• <code className="text-purple-400">adSetPerformance.json</code> - Ad set data</li>
              <li>• <code className="text-purple-400">geoPerformance.json</code> - Geographic data</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// Keyboard Shortcuts Modal
function KeyboardShortcutsModal({ isOpen, onClose }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0f1729] rounded-2xl border border-[#1e3a5f] shadow-2xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#1e3a5f]">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span>⌨️</span> Keyboard Shortcuts
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#1a2744] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-2">
          {KEYBOARD_SHORTCUTS.map((shortcut, i) => (
            <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[#1a2744]">
              <span className="text-gray-400">{shortcut.description}</span>
              <kbd className="px-2 py-1 bg-[#1a2744] border border-[#2d4a6f] rounded text-sm font-mono">
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Export Button Component
function ExportButton({ data, filename, label = 'Export CSV' }) {
  const handleExport = () => exportToCSV(data, filename)

  return (
    <button
      onClick={handleExport}
      className="btn btn-secondary text-xs"
      title="Export to CSV"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {label}
    </button>
  )
}

// Theme Toggle Component
function ThemeToggle({ isDark, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-lg hover:bg-[#1a2744] transition-colors"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  )
}

// Onboarding Tooltip Component
function OnboardingTooltip({ step, totalSteps, title, description, position = 'bottom', onNext, onSkip, onComplete }) {
  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  }

  return (
    <div className={`absolute ${positionClasses[position]} z-50 w-72 p-4 bg-purple-900 rounded-xl shadow-2xl border border-purple-600`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-purple-300">Step {step} of {totalSteps}</span>
        <button onClick={onSkip} className="text-xs text-purple-300 hover:text-white">Skip tour</button>
      </div>
      <h4 className="font-semibold mb-1">{title}</h4>
      <p className="text-sm text-purple-200 mb-3">{description}</p>
      <div className="flex justify-between">
        <div className="flex gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full ${i + 1 === step ? 'bg-purple-400' : 'bg-purple-700'}`} />
          ))}
        </div>
        <button
          onClick={step === totalSteps ? onComplete : onNext}
          className="btn btn-primary text-xs py-1 px-3"
        >
          {step === totalSteps ? 'Done' : 'Next'}
        </button>
      </div>
      {/* Arrow */}
      <div className={`absolute w-3 h-3 bg-purple-900 border-purple-600 transform rotate-45 ${
        position === 'bottom' ? '-top-1.5 left-6 border-t border-l' :
        position === 'top' ? '-bottom-1.5 left-6 border-b border-r' :
        position === 'left' ? '-right-1.5 top-6 border-t border-r' :
        '-left-1.5 top-6 border-b border-l'
      }`} />
    </div>
  )
}

// ============================================
// REVOLUTIONARY AI-POWERED FEATURES (200% Level)
// ============================================

// AI Copilot - Natural Language Query Interface
function AICopilot({ isOpen, onClose, metrics, creatives, adSets, geoData }) {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState(null)
  const [isThinking, setIsThinking] = useState(false)
  const [history, setHistory] = useState([])

  const processQuery = useCallback((q) => {
    setIsThinking(true)
    const lowerQ = q.toLowerCase()

    // Calculate totals for context
    const totalSpend = metrics.reduce((a, b) => a + b.spend, 0)
    const totalOrders = metrics.reduce((a, b) => a + (b.ordersActual || 0), 0)
    const totalRevenue = metrics.reduce((a, b) => a + (b.revenueActual || 0), 0)
    const trueCPA = totalOrders > 0 ? totalSpend / totalOrders : 0
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    // Find best/worst performers
    const bestCreative = creatives?.sort((a, b) => a.cpa - b.cpa).find(c => c.cpa > 0)
    const worstCreative = creatives?.sort((a, b) => b.cpa - a.cpa).find(c => c.cpa > 0)
    const bestDay = [...metrics].sort((a, b) => (b.ordersActual || 0) - (a.ordersActual || 0))[0]
    const worstDay = [...metrics].filter(d => d.spend > 100).sort((a, b) => (a.ordersActual || 0) - (b.ordersActual || 0))[0]

    setTimeout(() => {
      let answer = ''

      if (lowerQ.includes('cpa') || lowerQ.includes('cost per')) {
        answer = `**Current TRUE CPA: £${trueCPA.toFixed(2)}**\n\nThis is ${trueCPA < 30 ? '🟢 excellent' : trueCPA < 50 ? '🟡 good' : '🔴 needs attention'} - your target is £50.\n\nBased on ${totalOrders} actual Skiddle orders from £${totalSpend.toLocaleString()} spend.`
      } else if (lowerQ.includes('roas') || lowerQ.includes('return')) {
        answer = `**Current ROAS: ${roas.toFixed(2)}x**\n\n🚀 For every £1 spent, you're generating £${roas.toFixed(2)} in revenue.\n\nTotal Revenue: £${totalRevenue.toLocaleString()}\nTotal Spend: £${totalSpend.toLocaleString()}`
      } else if (lowerQ.includes('best') && (lowerQ.includes('creative') || lowerQ.includes('ad'))) {
        answer = bestCreative
          ? `**Best Performing Creative:**\n\n"${bestCreative.adName}"\n\n• CPA: £${bestCreative.cpa.toFixed(2)}\n• Purchases: ${bestCreative.purchases}\n• CTR: ${bestCreative.ctr.toFixed(2)}%\n\n💡 Consider increasing budget on this creative.`
          : 'Unable to determine best creative from current data.'
      } else if (lowerQ.includes('worst') && (lowerQ.includes('creative') || lowerQ.includes('ad'))) {
        answer = worstCreative
          ? `**Worst Performing Creative:**\n\n"${worstCreative.adName}"\n\n• CPA: £${worstCreative.cpa.toFixed(2)}\n• Purchases: ${worstCreative.purchases}\n\n⚠️ Consider pausing or refreshing this creative.`
          : 'Unable to determine worst creative from current data.'
      } else if (lowerQ.includes('best') && lowerQ.includes('day')) {
        answer = bestDay
          ? `**Best Performing Day: ${bestDay.date}**\n\n• Orders: ${bestDay.ordersActual}\n• Revenue: £${(bestDay.revenueActual || 0).toLocaleString()}\n• Spend: £${bestDay.spend.toFixed(2)}\n• CPA: £${(bestDay.cpaActual || 0).toFixed(2)}`
          : 'Unable to determine best day.'
      } else if (lowerQ.includes('should') && lowerQ.includes('spend')) {
        const optimalDaily = (totalSpend / metrics.length) * (trueCPA < 30 ? 1.3 : trueCPA < 50 ? 1.1 : 0.9)
        answer = `**Budget Recommendation:**\n\nBased on your ${trueCPA < 50 ? 'strong' : 'current'} CPA performance:\n\n• Current daily avg: £${(totalSpend / metrics.length).toFixed(2)}\n• Recommended daily: £${optimalDaily.toFixed(2)}\n• Suggested action: ${trueCPA < 30 ? '📈 Scale up 30% - performance is excellent!' : trueCPA < 50 ? '📈 Scale up 10% cautiously' : '⚠️ Optimize before scaling'}`
      } else if (lowerQ.includes('summary') || lowerQ.includes('overview') || lowerQ.includes('how')) {
        answer = `**Campaign Summary:**\n\n📊 **Performance**\n• TRUE CPA: £${trueCPA.toFixed(2)} ${trueCPA < 50 ? '✅' : '⚠️'}\n• ROAS: ${roas.toFixed(2)}x ${roas > 10 ? '🚀' : '📈'}\n• Total Orders: ${totalOrders}\n• Revenue: £${totalRevenue.toLocaleString()}\n\n💡 **Key Insight**\nYour campaign is ${trueCPA < 30 && roas > 15 ? 'performing exceptionally well! Consider scaling budget.' : trueCPA < 50 ? 'healthy. Maintain current strategy.' : 'needs optimization before scaling.'}`
      } else if (lowerQ.includes('predict') || lowerQ.includes('forecast')) {
        const daysLeft = 16 // Days to event
        const avgDailyOrders = totalOrders / metrics.length
        const projectedOrders = Math.round(totalOrders + (avgDailyOrders * daysLeft * 1.2)) // 20% lift expected
        answer = `**Revenue Forecast to Event:**\n\n📅 ${daysLeft} days remaining\n\n• Current Orders: ${totalOrders}\n• Projected Final: ~${projectedOrders} orders\n• Projected Revenue: ~£${(projectedOrders * 465).toLocaleString()}\n\n*Assumes 20% performance lift from urgency messaging*`
      } else {
        answer = `I can help you with:\n\n• "What's my CPA?"\n• "What's my ROAS?"\n• "Best performing creative"\n• "Worst performing ad"\n• "Best day this week"\n• "How much should I spend?"\n• "Give me a summary"\n• "Predict final revenue"\n\nTry asking one of these!`
      }

      setResponse(answer)
      setHistory(prev => [...prev, { query: q, response: answer }])
      setIsThinking(false)
    }, 800)
  }, [metrics, creatives])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (query.trim()) {
      processQuery(query)
      setQuery('')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0f1729] rounded-t-2xl sm:rounded-2xl border border-[#1e3a5f] shadow-2xl w-full sm:max-w-2xl sm:mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1e3a5f]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl">
              🤖
            </div>
            <div>
              <h2 className="font-semibold">AI Copilot</h2>
              <p className="text-xs text-gray-400">Ask anything about your campaign</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#1a2744] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {history.length === 0 && !response && (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">💬</div>
              <p className="text-gray-400 mb-4">Ask me anything about your campaign!</p>
              <div className="flex flex-wrap justify-center gap-2">
                {['What\'s my CPA?', 'Best creative?', 'Give me a summary'].map(q => (
                  <button
                    key={q}
                    onClick={() => { setQuery(q); processQuery(q); }}
                    className="px-3 py-1.5 bg-[#1a2744] rounded-full text-sm text-gray-300 hover:bg-[#243352] transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {history.map((item, i) => (
            <div key={i} className="space-y-3">
              <div className="flex justify-end">
                <div className="bg-purple-600 rounded-2xl rounded-tr-sm px-4 py-2 max-w-[80%]">
                  {item.query}
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-[#1a2744] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%] whitespace-pre-wrap text-sm">
                  {item.response}
                </div>
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex justify-start">
              <div className="bg-[#1a2744] rounded-2xl px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-gray-400 text-sm">Analyzing...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-[#1e3a5f]">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about CPA, ROAS, best ads, forecasts..."
              className="flex-1 bg-[#1a2744] border border-[#2d4a6f] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 transition-colors"
              autoFocus
            />
            <button
              type="submit"
              disabled={!query.trim() || isThinking}
              className="btn btn-primary px-4 disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Executive Summary Generator
function ExecutiveSummary({ metrics, creatives, geoData, onClose }) {
  const summary = useMemo(() => {
    const totalSpend = metrics.reduce((a, b) => a + b.spend, 0)
    const totalOrders = metrics.reduce((a, b) => a + (b.ordersActual || 0), 0)
    const totalRevenue = metrics.reduce((a, b) => a + (b.revenueActual || 0), 0)
    const trueCPA = totalOrders > 0 ? totalSpend / totalOrders : 0
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    const lastWeek = metrics.slice(-7)
    const prevWeek = metrics.slice(-14, -7)
    const lastWeekOrders = lastWeek.reduce((a, b) => a + (b.ordersActual || 0), 0)
    const prevWeekOrders = prevWeek.reduce((a, b) => a + (b.ordersActual || 0), 0)
    const weekOverWeekChange = prevWeekOrders > 0 ? ((lastWeekOrders - prevWeekOrders) / prevWeekOrders * 100) : 0

    const bestCreative = creatives?.sort((a, b) => a.cpa - b.cpa).find(c => c.cpa > 0)
    const topCountry = geoData?.countries?.sort((a, b) => b.purchases - a.purchases)[0]

    return {
      totalSpend,
      totalOrders,
      totalRevenue,
      trueCPA,
      roas,
      weekOverWeekChange,
      bestCreative,
      topCountry,
      healthStatus: trueCPA < 30 ? 'excellent' : trueCPA < 50 ? 'healthy' : 'needs-attention',
      daysToEvent: 16,
    }
  }, [metrics, creatives, geoData])

  const copyToClipboard = () => {
    const text = `DNBA Thailand 2026 - Executive Summary
Generated: ${new Date().toLocaleDateString()}

PERFORMANCE OVERVIEW
• Total Spend: £${summary.totalSpend.toLocaleString()}
• Total Orders: ${summary.totalOrders}
• Revenue: £${summary.totalRevenue.toLocaleString()}
• TRUE CPA: £${summary.trueCPA.toFixed(2)} (Target: £50)
• ROAS: ${summary.roas.toFixed(2)}x

WEEK-OVER-WEEK
• Orders: ${summary.weekOverWeekChange > 0 ? '+' : ''}${summary.weekOverWeekChange.toFixed(1)}%

TOP PERFORMERS
• Best Creative: ${summary.bestCreative?.adName || 'N/A'}
• Top Country: ${summary.topCountry?.countryName || 'N/A'}

STATUS: Campaign is ${summary.healthStatus.toUpperCase()}

DAYS TO EVENT: ${summary.daysToEvent}`

    navigator.clipboard.writeText(text)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0f1729] rounded-2xl border border-[#1e3a5f] shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#1e3a5f] sticky top-0 bg-[#0f1729]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-xl">
              📊
            </div>
            <div>
              <h2 className="font-semibold">Executive Summary</h2>
              <p className="text-xs text-gray-400">Auto-generated campaign briefing</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copyToClipboard} className="btn btn-secondary text-xs">
              📋 Copy
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#1a2744]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Banner */}
          <div className={`p-4 rounded-xl ${
            summary.healthStatus === 'excellent' ? 'bg-green-900/30 border border-green-700' :
            summary.healthStatus === 'healthy' ? 'bg-blue-900/30 border border-blue-700' :
            'bg-red-900/30 border border-red-700'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">
                {summary.healthStatus === 'excellent' ? '🚀' : summary.healthStatus === 'healthy' ? '✅' : '⚠️'}
              </span>
              <div>
                <div className="font-semibold text-lg">
                  Campaign is {summary.healthStatus === 'excellent' ? 'Crushing It!' : summary.healthStatus === 'healthy' ? 'On Track' : 'Needs Attention'}
                </div>
                <div className="text-sm text-gray-400">
                  {summary.daysToEvent} days until event | £{summary.trueCPA.toFixed(2)} CPA vs £50 target
                </div>
              </div>
            </div>
          </div>

          {/* Key Metrics */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3">KEY METRICS</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#1a2744] rounded-xl p-4">
                <div className="text-gray-400 text-xs mb-1">TRUE CPA</div>
                <div className="text-2xl font-bold text-green-400">£{summary.trueCPA.toFixed(2)}</div>
              </div>
              <div className="bg-[#1a2744] rounded-xl p-4">
                <div className="text-gray-400 text-xs mb-1">ROAS</div>
                <div className="text-2xl font-bold text-purple-400">{summary.roas.toFixed(2)}x</div>
              </div>
              <div className="bg-[#1a2744] rounded-xl p-4">
                <div className="text-gray-400 text-xs mb-1">Total Orders</div>
                <div className="text-2xl font-bold">{summary.totalOrders}</div>
              </div>
              <div className="bg-[#1a2744] rounded-xl p-4">
                <div className="text-gray-400 text-xs mb-1">Revenue</div>
                <div className="text-2xl font-bold">£{(summary.totalRevenue / 1000).toFixed(0)}k</div>
              </div>
            </div>
          </div>

          {/* Week over Week */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3">TREND</h3>
            <div className="flex items-center gap-4 p-4 bg-[#1a2744] rounded-xl">
              <div className={`text-3xl ${summary.weekOverWeekChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {summary.weekOverWeekChange >= 0 ? '📈' : '📉'}
              </div>
              <div>
                <div className="font-semibold">
                  {summary.weekOverWeekChange >= 0 ? '+' : ''}{summary.weekOverWeekChange.toFixed(1)}% Week-over-Week
                </div>
                <div className="text-sm text-gray-400">Order volume compared to previous 7 days</div>
              </div>
            </div>
          </div>

          {/* Top Performers */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3">TOP PERFORMERS</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {summary.bestCreative && (
                <div className="p-4 bg-[#1a2744] rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <span>🎨</span>
                    <span className="text-sm text-gray-400">Best Creative</span>
                  </div>
                  <div className="font-medium truncate">{summary.bestCreative.adName}</div>
                  <div className="text-sm text-green-400">£{summary.bestCreative.cpa.toFixed(2)} CPA</div>
                </div>
              )}
              {summary.topCountry && (
                <div className="p-4 bg-[#1a2744] rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <span>🌍</span>
                    <span className="text-sm text-gray-400">Top Country</span>
                  </div>
                  <div className="font-medium">{summary.topCountry.countryName}</div>
                  <div className="text-sm text-blue-400">{summary.topCountry.purchases} purchases</div>
                </div>
              )}
            </div>
          </div>

          {/* Recommendations */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3">AI RECOMMENDATIONS</h3>
            <div className="space-y-2">
              {summary.trueCPA < 30 && (
                <div className="flex items-start gap-3 p-3 bg-green-900/20 rounded-lg">
                  <span>💰</span>
                  <div>
                    <div className="font-medium">Scale Budget</div>
                    <div className="text-sm text-gray-400">CPA is 47% below target. Consider increasing daily budget by 20-30%.</div>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3 p-3 bg-purple-900/20 rounded-lg">
                <span>⏰</span>
                <div>
                  <div className="font-medium">Add Urgency Messaging</div>
                  <div className="text-sm text-gray-400">With {summary.daysToEvent} days left, countdown timers could boost CVR by 15-25%.</div>
                </div>
              </div>
              {summary.bestCreative && (
                <div className="flex items-start gap-3 p-3 bg-blue-900/20 rounded-lg">
                  <span>🎯</span>
                  <div>
                    <div className="font-medium">Double Down on Winner</div>
                    <div className="text-sm text-gray-400">Allocate more budget to "{summary.bestCreative.adName.substring(0, 30)}..."</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// What-If Scenario Simulator
function WhatIfSimulator({ metrics, onClose }) {
  const [budgetChange, setBudgetChange] = useState(0)
  const [cpaChange, setCpaChange] = useState(0)

  const currentTotals = useMemo(() => {
    const totalSpend = metrics.reduce((a, b) => a + b.spend, 0)
    const totalOrders = metrics.reduce((a, b) => a + (b.ordersActual || 0), 0)
    const totalRevenue = metrics.reduce((a, b) => a + (b.revenueActual || 0), 0)
    return { totalSpend, totalOrders, totalRevenue, cpa: totalOrders > 0 ? totalSpend / totalOrders : 0 }
  }, [metrics])

  const projectedTotals = useMemo(() => {
    const newSpend = currentTotals.totalSpend * (1 + budgetChange / 100)
    const newCPA = currentTotals.cpa * (1 + cpaChange / 100)
    const newOrders = newCPA > 0 ? newSpend / newCPA : 0
    const avgRevPerOrder = currentTotals.totalOrders > 0 ? currentTotals.totalRevenue / currentTotals.totalOrders : 465
    const newRevenue = newOrders * avgRevPerOrder
    const newROAS = newSpend > 0 ? newRevenue / newSpend : 0

    return { spend: newSpend, orders: Math.round(newOrders), revenue: newRevenue, cpa: newCPA, roas: newROAS }
  }, [currentTotals, budgetChange, cpaChange])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0f1729] rounded-2xl border border-[#1e3a5f] shadow-2xl max-w-xl w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#1e3a5f]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-xl">
              🔮
            </div>
            <div>
              <h2 className="font-semibold">What-If Simulator</h2>
              <p className="text-xs text-gray-400">Model different scenarios</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#1a2744]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Sliders */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-400">Budget Change</span>
                <span className={`font-semibold ${budgetChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {budgetChange >= 0 ? '+' : ''}{budgetChange}%
                </span>
              </div>
              <input
                type="range"
                min="-50"
                max="100"
                value={budgetChange}
                onChange={(e) => setBudgetChange(Number(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-400">CPA Change (efficiency)</span>
                <span className={`font-semibold ${cpaChange <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {cpaChange >= 0 ? '+' : ''}{cpaChange}%
                </span>
              </div>
              <input
                type="range"
                min="-30"
                max="50"
                value={cpaChange}
                onChange={(e) => setCpaChange(Number(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>
          </div>

          {/* Results Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-[#1a2744] rounded-xl">
              <div className="text-xs text-gray-400 mb-2">CURRENT</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Spend</span>
                  <span>£{currentTotals.totalSpend.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Orders</span>
                  <span>{currentTotals.totalOrders}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Revenue</span>
                  <span>£{currentTotals.totalRevenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">CPA</span>
                  <span>£{currentTotals.cpa.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-purple-900/30 rounded-xl border border-purple-700">
              <div className="text-xs text-purple-400 mb-2">PROJECTED</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Spend</span>
                  <span className="text-purple-300">£{Math.round(projectedTotals.spend).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Orders</span>
                  <span className={projectedTotals.orders > currentTotals.totalOrders ? 'text-green-400' : 'text-red-400'}>
                    {projectedTotals.orders}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Revenue</span>
                  <span className="text-purple-300">£{Math.round(projectedTotals.revenue).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">CPA</span>
                  <span className={projectedTotals.cpa < currentTotals.cpa ? 'text-green-400' : 'text-red-400'}>
                    £{projectedTotals.cpa.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Impact Summary */}
          <div className={`p-4 rounded-xl ${
            projectedTotals.orders > currentTotals.totalOrders ? 'bg-green-900/20 border border-green-700' : 'bg-amber-900/20 border border-amber-700'
          }`}>
            <div className="font-medium mb-1">
              {projectedTotals.orders > currentTotals.totalOrders ? '📈 Positive Impact' : '⚠️ Consider Carefully'}
            </div>
            <div className="text-sm text-gray-400">
              {projectedTotals.orders > currentTotals.totalOrders
                ? `+${projectedTotals.orders - currentTotals.totalOrders} additional orders, +£${Math.round(projectedTotals.revenue - currentTotals.totalRevenue).toLocaleString()} revenue`
                : `${projectedTotals.orders - currentTotals.totalOrders} fewer orders. Efficiency gains needed.`
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Anomaly Detector - Explains WHY metrics changed
function AnomalyDetector({ metrics }) {
  const anomalies = useMemo(() => {
    const detected = []
    const last7Days = metrics.slice(-7)
    const prev7Days = metrics.slice(-14, -7)

    if (last7Days.length < 7 || prev7Days.length < 7) return detected

    // Calculate averages
    const last7Spend = last7Days.reduce((a, b) => a + b.spend, 0) / 7
    const prev7Spend = prev7Days.reduce((a, b) => a + b.spend, 0) / 7
    const last7Orders = last7Days.reduce((a, b) => a + (b.ordersActual || 0), 0)
    const prev7Orders = prev7Days.reduce((a, b) => a + (b.ordersActual || 0), 0)

    const spendChange = ((last7Spend - prev7Spend) / prev7Spend * 100)
    const orderChange = prev7Orders > 0 ? ((last7Orders - prev7Orders) / prev7Orders * 100) : 0

    // Detect anomalies
    if (Math.abs(spendChange) > 20) {
      detected.push({
        type: spendChange > 0 ? 'spend-spike' : 'spend-drop',
        severity: Math.abs(spendChange) > 40 ? 'high' : 'medium',
        metric: 'Daily Spend',
        change: spendChange,
        cause: spendChange > 0
          ? 'Budget was increased or campaigns were scaled'
          : 'Budget caps hit or campaigns paused',
        recommendation: spendChange > 0
          ? 'Monitor CPA closely for next 48 hours'
          : 'Review campaign status and budget settings'
      })
    }

    if (Math.abs(orderChange) > 25) {
      detected.push({
        type: orderChange > 0 ? 'orders-spike' : 'orders-drop',
        severity: Math.abs(orderChange) > 50 ? 'high' : 'medium',
        metric: 'Weekly Orders',
        change: orderChange,
        cause: orderChange > 0
          ? 'Successful campaign optimizations or seasonal demand'
          : 'Possible ad fatigue, audience saturation, or tracking issues',
        recommendation: orderChange > 0
          ? 'Identify which creatives drove the spike and scale them'
          : 'Check for creative fatigue, refresh ads, and verify pixel'
      })
    }

    // Check for CPA anomalies
    const last7CPA = last7Days.reduce((a, b) => a + (b.cpaActual || 0), 0) / 7
    const prev7CPA = prev7Days.reduce((a, b) => a + (b.cpaActual || 0), 0) / 7
    const cpaChange = prev7CPA > 0 ? ((last7CPA - prev7CPA) / prev7CPA * 100) : 0

    if (Math.abs(cpaChange) > 15) {
      detected.push({
        type: cpaChange > 0 ? 'cpa-increase' : 'cpa-decrease',
        severity: Math.abs(cpaChange) > 30 ? 'high' : 'medium',
        metric: 'Average CPA',
        change: cpaChange,
        cause: cpaChange > 0
          ? 'Increased competition, audience fatigue, or poor-performing creatives'
          : 'Optimization improvements or better-performing audiences',
        recommendation: cpaChange > 0
          ? 'Pause low performers, test new creatives, refine targeting'
          : 'Document what changed and replicate across campaigns'
      })
    }

    return detected
  }, [metrics])

  if (anomalies.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
        <span className="animate-pulse">🔍</span> Anomaly Detective
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {anomalies.map((anomaly, i) => (
          <div key={i} className={`p-4 rounded-xl border ${
            anomaly.severity === 'high' ? 'bg-red-900/20 border-red-700' : 'bg-amber-900/20 border-amber-700'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={anomaly.change > 0 ? 'text-green-400' : 'text-red-400'}>
                {anomaly.change > 0 ? '📈' : '📉'}
              </span>
              <span className="font-medium">{anomaly.metric}</span>
              <span className={`text-sm ${anomaly.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {anomaly.change > 0 ? '+' : ''}{anomaly.change.toFixed(1)}%
              </span>
            </div>
            <div className="text-sm text-gray-400 mb-2">
              <strong>Why:</strong> {anomaly.cause}
            </div>
            <div className="text-sm text-blue-400">
              <strong>Action:</strong> {anomaly.recommendation}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Date range presets
const DATE_PRESETS = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'yesterday', label: 'Yesterday', days: 1 },
  { id: '4days', label: '4 Days', days: 4 },
  { id: '7days', label: '7 Days', days: 7 },
  { id: '2weeks', label: '2 Weeks', days: 14 },
  { id: '1month', label: '1 Month', days: 30 },
  { id: '2months', label: '2 Months', days: 60 },
  { id: '3months', label: '3 Months', days: 90 },
  { id: '4months', label: '4 Months', days: 120 },
  { id: 'max', label: 'Maximum', days: -1 },
]

// Get date range based on preset
function getDateRange(presetId, customStart, customEnd) {
  const today = new Date('2026-01-06') // Using the data's last date as "today"

  if (presetId === 'custom' && customStart && customEnd) {
    return { start: new Date(customStart), end: new Date(customEnd) }
  }

  const preset = DATE_PRESETS.find(p => p.id === presetId)
  if (!preset) return { start: null, end: today }

  if (preset.days === -1) {
    return { start: null, end: today } // Maximum - no start limit
  }

  if (preset.days === 0) {
    return { start: today, end: today }
  }

  if (preset.days === 1) {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    return { start: yesterday, end: yesterday }
  }

  const start = new Date(today)
  start.setDate(start.getDate() - preset.days + 1)
  return { start, end: today }
}

// Filter metrics by date range
function filterByDateRange(metrics, startDate, endDate) {
  return metrics.filter(m => {
    const date = new Date(m.date)
    if (startDate && date < startDate) return false
    if (endDate && date > endDate) return false
    return true
  })
}

// Date Filter Component
function DateFilter({ selectedPreset, onPresetChange, customStart, customEnd, onCustomStartChange, onCustomEndChange, showCustom, onToggleCustom }) {
  return (
    <div className="bg-[#0f1729] rounded-xl p-4 border border-[#1e3a5f] mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-400 text-sm mr-2">Date Range:</span>

        {/* Preset Buttons */}
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => onPresetChange(preset.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                selectedPreset === preset.id && !showCustom
                  ? 'bg-purple-600 text-white'
                  : 'bg-[#1a2744] text-gray-400 hover:bg-[#243352]'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={onToggleCustom}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              showCustom
                ? 'bg-purple-600 text-white'
                : 'bg-[#1a2744] text-gray-400 hover:bg-[#243352]'
            }`}
          >
            Custom
          </button>
        </div>
      </div>

      {/* Custom Date Range Inputs */}
      {showCustom && (
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-[#1e3a5f]">
          <div className="flex items-center gap-2">
            <label className="text-gray-400 text-xs">From:</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => onCustomStartChange(e.target.value)}
              className="bg-[#1a2744] border border-[#2d4a6f] rounded px-2 py-1 text-sm text-white"
              max="2026-01-06"
              min="2025-09-17"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-gray-400 text-xs">To:</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => onCustomEndChange(e.target.value)}
              className="bg-[#1a2744] border border-[#2d4a6f] rounded px-2 py-1 text-sm text-white"
              max="2026-01-06"
              min="2025-09-17"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// KPI Card Component - World-Class Polish
function KPICard({ label, value, subValue, trend, status }) {
  const statusColor = status ? getStatusColor(status) : null;
  const statusClass = status === 'success' ? 'kpi-success' : status === 'warning' ? 'kpi-warning' : status === 'danger' ? 'kpi-danger' : '';
  return (
    <div className={`card kpi-card p-4 ${statusClass}`}>
      <div className="text-caption text-gray-400 mb-1">{label}</div>
      <div className="text-h2 font-bold number-transition tabular-nums" style={statusColor ? { color: statusColor } : {}}>{value}</div>
      {subValue && <div className="text-micro text-gray-500 mt-1">{subValue}</div>}
      {trend && (
        <div className={`text-caption mt-1 flex items-center gap-1 ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
          <span className="text-xs">{trend > 0 ? '▲' : '▼'}</span>
          <span>{Math.abs(trend)}%</span>
        </div>
      )}
    </div>
  )
}

// Chart Card Component - World-Class Polish
function ChartCard({ title, children, className = '' }) {
  return (
    <div className={`card p-5 ${className}`}>
      <h3 className="text-body font-semibold mb-4 text-gray-200">{title}</h3>
      <div className="chart-container">
        {children}
      </div>
    </div>
  )
}

// Insight Box Component
function InsightBox({ type, children }) {
  const colors = {
    success: 'bg-green-900/30 border-green-700 text-green-400',
    warning: 'bg-yellow-900/30 border-yellow-700 text-yellow-400',
    danger: 'bg-red-900/30 border-red-700 text-red-400',
    info: 'bg-blue-900/30 border-blue-700 text-blue-400',
  }
  return (
    <div className={`mt-3 p-3 rounded-lg border text-xs ${colors[type]}`}>
      {children}
    </div>
  )
}

// ============================================
// WORLD-CLASS ANALYTICS COMPONENTS
// Based on Tableau, Power BI, Google Analytics, Meta Ads Manager best practices
// ============================================

// Enhanced KPI Card with Sparkline, Variance, and RAG Status (Industry Standard)
function EnhancedKPICard({
  label,
  value,
  previousValue,
  target,
  format = 'number',
  trend = 'up-good', // 'up-good' or 'down-good' (for CPA)
  sparklineData = [],
  icon,
  size = 'normal' // 'hero' or 'normal'
}) {
  const variance = previousValue ? ((value - previousValue) / previousValue * 100) : 0
  const targetVariance = target ? ((value - target) / target * 100) : null

  // Determine status based on trend direction and variance
  let status = 'neutral'
  if (target) {
    if (trend === 'up-good') {
      status = value >= target ? 'success' : value >= target * 0.9 ? 'warning' : 'danger'
    } else {
      status = value <= target ? 'success' : value <= target * 1.1 ? 'warning' : 'danger'
    }
  } else if (previousValue) {
    if (trend === 'up-good') {
      status = variance >= 0 ? 'success' : variance >= -10 ? 'warning' : 'danger'
    } else {
      status = variance <= 0 ? 'success' : variance <= 10 ? 'warning' : 'danger'
    }
  }

  const statusConfig = {
    success: { bg: 'from-green-900/40 to-green-800/20', border: 'border-green-600', text: 'text-green-400', icon: '✓' },
    warning: { bg: 'from-yellow-900/40 to-yellow-800/20', border: 'border-yellow-600', text: 'text-yellow-400', icon: '!' },
    danger: { bg: 'from-red-900/40 to-red-800/20', border: 'border-red-600', text: 'text-red-400', icon: '✗' },
    neutral: { bg: 'from-gray-900/40 to-gray-800/20', border: 'border-gray-600', text: 'text-gray-400', icon: '–' },
  }

  const config = statusConfig[status]
  const isHero = size === 'hero'

  const formatValue = (v) => {
    if (format === 'currency') return formatCurrency(v)
    if (format === 'percent') return formatPercent(v)
    if (format === 'multiplier') return `${v.toFixed(2)}x`
    return formatNumber(v)
  }

  return (
    <div className={`bg-gradient-to-br ${config.bg} rounded-xl ${isHero ? 'p-6' : 'p-4'} border-2 ${config.border} relative overflow-hidden`}>
      {/* Status indicator with icon for accessibility */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <span className={`text-xs font-bold ${config.text}`}>{config.icon}</span>
        <div className={`w-2 h-2 rounded-full ${status === 'success' ? 'bg-green-500' : status === 'warning' ? 'bg-yellow-500' : status === 'danger' ? 'bg-red-500' : 'bg-gray-500'}`}></div>
      </div>

      {/* Label */}
      <div className={`${config.text} ${isHero ? 'text-sm' : 'text-xs'} font-semibold mb-1 flex items-center gap-2`}>
        {icon && <span>{icon}</span>}
        {label}
      </div>

      {/* Main Value (BAN - Big Ass Number) */}
      <div className={`${isHero ? 'text-4xl' : 'text-2xl'} font-bold ${config.text} mb-2`}>
        {formatValue(value)}
      </div>

      {/* Variance from previous period */}
      {previousValue !== undefined && (
        <div className={`text-xs flex items-center gap-1 ${variance >= 0 ? (trend === 'up-good' ? 'text-green-400' : 'text-red-400') : (trend === 'up-good' ? 'text-red-400' : 'text-green-400')}`}>
          <span>{variance >= 0 ? '▲' : '▼'}</span>
          <span>{Math.abs(variance).toFixed(1)}% vs prior</span>
        </div>
      )}

      {/* Target comparison */}
      {target !== undefined && (
        <div className="text-xs text-gray-400 mt-1">
          Target: {formatValue(target)}
          {targetVariance !== null && (
            <span className={`ml-2 ${targetVariance >= 0 ? (trend === 'up-good' ? 'text-green-400' : 'text-red-400') : (trend === 'up-good' ? 'text-red-400' : 'text-green-400')}`}>
              ({targetVariance >= 0 ? '+' : ''}{targetVariance.toFixed(0)}%)
            </span>
          )}
        </div>
      )}

      {/* Mini Sparkline */}
      {sparklineData.length > 0 && (
        <div className="mt-3 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData}>
              <Area
                type="monotone"
                dataKey="value"
                stroke={status === 'success' ? '#22c55e' : status === 'warning' ? '#f59e0b' : status === 'danger' ? '#ef4444' : '#9ca3af'}
                fill={status === 'success' ? '#22c55e' : status === 'warning' ? '#f59e0b' : status === 'danger' ? '#ef4444' : '#9ca3af'}
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// Alert Panel Component (Datadog/Mixpanel style)
function AlertPanel({ alerts }) {
  if (!alerts || alerts.length === 0) return null

  const severityConfig = {
    critical: { bg: 'bg-red-900/40', border: 'border-red-600', icon: '🔴', text: 'text-red-400' },
    warning: { bg: 'bg-yellow-900/40', border: 'border-yellow-600', icon: '🟡', text: 'text-yellow-400' },
    info: { bg: 'bg-blue-900/40', border: 'border-blue-600', icon: '🔵', text: 'text-blue-400' },
  }

  return (
    <div className="mb-6 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-red-400 animate-pulse">●</span>
        <span className="text-sm font-semibold text-gray-300">Active Alerts ({alerts.length})</span>
      </div>
      {alerts.slice(0, 3).map((alert, i) => {
        const config = severityConfig[alert.severity] || severityConfig.info
        return (
          <div key={i} className={`${config.bg} border ${config.border} rounded-lg p-3 flex items-start justify-between`}>
            <div className="flex items-start gap-3">
              <span className="text-lg">{config.icon}</span>
              <div>
                <div className={`font-medium text-sm ${config.text}`}>{alert.title}</div>
                <div className="text-xs text-gray-400 mt-0.5">{alert.message}</div>
              </div>
            </div>
            {alert.action && (
              <button className={`text-xs px-3 py-1 rounded ${config.bg} border ${config.border} ${config.text} hover:opacity-80`}>
                {alert.action}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Bullet Chart Component (Tableau/Power BI style for targets)
function BulletChart({ value, target, max, label, format = 'currency' }) {
  const percentage = (value / max) * 100
  const targetPercentage = (target / max) * 100
  const isOnTarget = format === 'currency' ? value <= target : value >= target

  const formatVal = (v) => {
    if (format === 'currency') return formatCurrency(v)
    if (format === 'multiplier') return `${v.toFixed(1)}x`
    return v.toFixed(0)
  }

  return (
    <div className="bg-[#0f1729] rounded-lg p-4 border border-[#1e3a5f]">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-gray-400">{label}</span>
        <span className={`text-sm font-bold ${isOnTarget ? 'text-green-400' : 'text-red-400'}`}>
          {formatVal(value)}
        </span>
      </div>
      <div className="relative h-6 bg-gray-800 rounded overflow-hidden">
        {/* Background zones */}
        <div className="absolute inset-0 flex">
          <div className="bg-green-900/30 h-full" style={{ width: `${targetPercentage}%` }}></div>
          <div className="bg-yellow-900/30 h-full" style={{ width: `${Math.min(20, 100 - targetPercentage)}%` }}></div>
          <div className="bg-red-900/30 h-full flex-1"></div>
        </div>
        {/* Value bar */}
        <div
          className={`absolute top-1 bottom-1 left-0 rounded ${isOnTarget ? 'bg-green-500' : 'bg-red-500'}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        ></div>
        {/* Target marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white"
          style={{ left: `${targetPercentage}%` }}
        ></div>
      </div>
      <div className="flex justify-between mt-1 text-xs text-gray-500">
        <span>0</span>
        <span>Target: {formatVal(target)}</span>
        <span>{formatVal(max)}</span>
      </div>
    </div>
  )
}

// Performance Comparison Card (Side-by-side like Meta Ads Manager)
function ComparisonCard({ title, itemA, itemB, metrics }) {
  return (
    <div className="bg-[#0f1729] rounded-xl p-5 border border-[#1e3a5f]">
      <h3 className="text-sm font-semibold mb-4 text-gray-200">{title}</h3>
      <div className="grid grid-cols-2 gap-4">
        {/* Item A */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full" style={{ background: itemA.color }}></div>
            <span className="font-semibold text-sm">{itemA.name}</span>
            {itemA.isWinner && <span className="text-green-400 text-xs">👑 Winner</span>}
          </div>
          {metrics.map((metric, i) => (
            <div key={i} className="py-2 border-t border-[#1e3a5f]">
              <div className="text-xs text-gray-400">{metric.label}</div>
              <div className={`text-lg font-bold ${metric.aIsBetter ? 'text-green-400' : 'text-gray-300'}`}>
                {metric.formatA(itemA[metric.key])}
              </div>
            </div>
          ))}
        </div>
        {/* Item B */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full" style={{ background: itemB.color }}></div>
            <span className="font-semibold text-sm">{itemB.name}</span>
            {itemB.isWinner && <span className="text-green-400 text-xs">👑 Winner</span>}
          </div>
          {metrics.map((metric, i) => (
            <div key={i} className="py-2 border-t border-[#1e3a5f]">
              <div className="text-xs text-gray-400">{metric.label}</div>
              <div className={`text-lg font-bold ${metric.bIsBetter ? 'text-green-400' : 'text-gray-300'}`}>
                {metric.formatB(itemB[metric.key])}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Funnel Stage Component (Google Analytics style)
function FunnelStage({ stage, index, total, previousValue, isBottleneck }) {
  const dropOff = previousValue ? ((previousValue - stage.value) / previousValue * 100) : 0
  const conversionFromTop = total > 0 ? (stage.value / total * 100) : 0

  return (
    <div className={`relative ${isBottleneck ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-[#030712] rounded-lg' : ''}`}>
      <div className="flex items-center gap-4">
        {/* Funnel visual */}
        <div
          className="h-14 rounded-lg flex items-center justify-center transition-all relative overflow-hidden"
          style={{
            width: `${Math.max(20, conversionFromTop)}%`,
            background: `linear-gradient(135deg, ${stage.color}40, ${stage.color}20)`,
            borderLeft: `4px solid ${stage.color}`
          }}
        >
          <span className="text-white font-medium text-sm z-10">{stage.name}</span>
        </div>
        {/* Stats */}
        <div className="flex-1">
          <div className="flex items-center gap-4">
            <span className="text-xl font-bold">{formatNumber(stage.value)}</span>
            <span className="text-gray-400 text-sm">{conversionFromTop.toFixed(2)}%</span>
            {index > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded ${dropOff > 50 ? 'bg-red-900/50 text-red-400' : dropOff > 30 ? 'bg-yellow-900/50 text-yellow-400' : 'bg-green-900/50 text-green-400'}`}>
                ↓ {dropOff.toFixed(1)}% drop
              </span>
            )}
            {isBottleneck && (
              <span className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-400 animate-pulse">
                ⚠️ Bottleneck
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Connector arrow */}
      {index < 5 && (
        <div className="ml-8 my-1 text-gray-600 text-xs">↓</div>
      )}
    </div>
  )
}

// Creative Performance Row with Fatigue Indicator
function CreativeRow({ creative, rank, maxSpend }) {
  const spendPercent = (creative.spend / maxSpend) * 100
  const isFatigued = creative.frequency > 3.5 || (creative.ctr < 0.5 && creative.impressions > 50000)
  const performanceScore = creative.purchases > 0 ? (creative.ctr * 10) + (1 / creative.cpa * 100) : creative.ctr * 10

  return (
    <tr className={`border-b border-[#1e3a5f]/50 hover:bg-[#1a2744] ${isFatigued ? 'bg-red-900/10' : ''}`}>
      <td className="py-3 px-3">
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-sm w-6">#{rank}</span>
          <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center text-xs">
            {creative.type === 'Video' ? '🎬' : '🖼️'}
          </div>
          <div>
            <div className="text-sm font-medium max-w-xs truncate">{creative.adName}</div>
            <div className="text-xs text-gray-500">{creative.adSetName?.slice(0, 30)}...</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-3">
        <div className="w-24">
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full"
              style={{ width: `${spendPercent}%` }}
            ></div>
          </div>
          <div className="text-xs text-gray-400 mt-1">{formatCurrency(creative.spend)}</div>
        </div>
      </td>
      <td className="py-3 px-3 text-right">
        <span className={creative.cpa <= 50 ? 'text-green-400' : creative.cpa <= 80 ? 'text-yellow-400' : 'text-red-400'}>
          {creative.cpa > 0 ? formatCurrency(creative.cpa) : '–'}
        </span>
      </td>
      <td className="py-3 px-3 text-right">{creative.purchases}</td>
      <td className="py-3 px-3 text-right">{formatPercent(creative.ctr)}</td>
      <td className="py-3 px-3">
        {isFatigued ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-900/50 text-red-400">
            <span className="animate-pulse">●</span> Fatigued
          </span>
        ) : creative.purchases > 5 ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-900/50 text-green-400">
            ✓ Performing
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-900/50 text-gray-400">
            — Testing
          </span>
        )}
      </td>
    </tr>
  )
}

// Recommendation Card (Actionable Insights)
function RecommendationCard({ type, title, description, impact, action }) {
  const config = {
    opportunity: { icon: '💡', bg: 'bg-green-900/20', border: 'border-green-700', text: 'text-green-400' },
    warning: { icon: '⚠️', bg: 'bg-yellow-900/20', border: 'border-yellow-700', text: 'text-yellow-400' },
    critical: { icon: '🚨', bg: 'bg-red-900/20', border: 'border-red-700', text: 'text-red-400' },
    info: { icon: 'ℹ️', bg: 'bg-blue-900/20', border: 'border-blue-700', text: 'text-blue-400' },
  }
  const c = config[type] || config.info

  return (
    <div className={`${c.bg} border ${c.border} rounded-lg p-4`}>
      <div className="flex items-start gap-3">
        <span className="text-xl">{c.icon}</span>
        <div className="flex-1">
          <div className={`font-semibold text-sm ${c.text}`}>{title}</div>
          <div className="text-xs text-gray-400 mt-1">{description}</div>
          {impact && (
            <div className="text-xs text-gray-500 mt-2">
              Potential impact: <span className={c.text}>{impact}</span>
            </div>
          )}
        </div>
        {action && (
          <button className={`text-xs px-3 py-1.5 rounded ${c.bg} border ${c.border} ${c.text} hover:opacity-80 whitespace-nowrap`}>
            {action}
          </button>
        )}
      </div>
    </div>
  )
}

// Overview View - World-Class Analytics Dashboard
function OverviewView({ filteredMetrics, geoCountries, dateLabel }) {
  const daysToEvent = getDaysUntilEvent();

  // Calculate totals from filtered metrics (now includes actual sales data)
  const calculatedTotals = useMemo(() => {
    const totalSpend = filteredMetrics.reduce((a, b) => a + b.spend, 0)
    const totalPurchasesMeta = filteredMetrics.reduce((a, b) => a + (b.purchasesMeta || b.purchases || 0), 0)
    const totalOrdersActual = filteredMetrics.reduce((a, b) => a + (b.ordersActual || 0), 0)
    const totalTicketsActual = filteredMetrics.reduce((a, b) => a + (b.ticketsActual || 0), 0)
    const totalRevenueActual = filteredMetrics.reduce((a, b) => a + (b.revenueActual || 0), 0)
    const totalImpressions = filteredMetrics.reduce((a, b) => a + b.impressions, 0)
    const totalClicks = filteredMetrics.reduce((a, b) => a + b.clicks, 0)

    const metaCPA = totalPurchasesMeta > 0 ? totalSpend / totalPurchasesMeta : 0
    const trueCPA = totalOrdersActual > 0 ? totalSpend / totalOrdersActual : 0
    const roas = totalSpend > 0 ? totalRevenueActual / totalSpend : 0
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
    const attributionGap = totalOrdersActual > 0 ? ((totalOrdersActual - totalPurchasesMeta) / totalOrdersActual * 100) : 0

    return {
      totalSpend,
      totalPurchasesMeta,
      totalOrdersActual,
      totalTicketsActual,
      totalRevenueActual,
      metaCPA,
      trueCPA,
      roas,
      avgCTR,
      totalImpressions,
      totalClicks,
      attributionGap,
      targetCPA: 50
    }
  }, [filteredMetrics])

  // Generate sparkline data for KPIs
  const sparklineData = useMemo(() => {
    const recent = filteredMetrics.slice(-14)
    return {
      cpa: recent.map(d => ({ value: d.cpaActual || 0 })),
      roas: recent.map(d => ({ value: d.roas || 0 })),
      spend: recent.map(d => ({ value: d.spend })),
      orders: recent.map(d => ({ value: d.ordersActual || 0 })),
    }
  }, [filteredMetrics])

  // Calculate previous period for variance (shift by same number of days)
  const { previousTotals } = useMemo(() => {
    const periodLength = filteredMetrics.length
    const allMetrics = mergedDailyMetrics
    const currentEndIdx = allMetrics.findIndex(m => m.date === filteredMetrics[filteredMetrics.length - 1]?.date)
    const previousStartIdx = Math.max(0, currentEndIdx - periodLength * 2 + 1)
    const previousEndIdx = currentEndIdx - periodLength
    const previousMetrics = previousEndIdx >= 0 ? allMetrics.slice(previousStartIdx, previousEndIdx + 1) : []

    if (previousMetrics.length === 0) return { previousTotals: null }

    const prevSpend = previousMetrics.reduce((a, b) => a + b.spend, 0)
    const prevOrders = previousMetrics.reduce((a, b) => a + (b.ordersActual || 0), 0)
    const prevRevenue = previousMetrics.reduce((a, b) => a + (b.revenueActual || 0), 0)
    const prevCPA = prevOrders > 0 ? prevSpend / prevOrders : 0
    const prevROAS = prevSpend > 0 ? prevRevenue / prevSpend : 0

    return { previousTotals: { spend: prevSpend, orders: prevOrders, revenue: prevRevenue, cpa: prevCPA, roas: prevROAS } }
  }, [filteredMetrics])

  // Generate dynamic alerts based on data
  const alerts = useMemo(() => {
    const alertList = []

    if (calculatedTotals.trueCPA > 50) {
      alertList.push({
        severity: 'warning',
        title: 'CPA Above Target',
        message: `Current CPA is ${formatCurrency(calculatedTotals.trueCPA)}, target is £50`,
        action: 'Review Ads'
      })
    }

    if (daysToEvent <= 20) {
      alertList.push({
        severity: 'warning',
        title: 'Event Approaching',
        message: `Only ${daysToEvent} days until the event. Consider scaling successful campaigns.`,
        action: 'Scale Up'
      })
    }

    if (calculatedTotals.roas >= 15) {
      alertList.push({
        severity: 'info',
        title: 'Excellent ROAS Performance',
        message: `Campaign achieving ${calculatedTotals.roas.toFixed(1)}x ROAS - consider budget increase`,
        action: 'Increase Budget'
      })
    }

    if (calculatedTotals.attributionGap > 50) {
      alertList.push({
        severity: 'info',
        title: 'High Attribution Gap',
        message: `Meta only sees ${(100 - calculatedTotals.attributionGap).toFixed(0)}% of conversions`,
        action: 'View Details'
      })
    }

    return alertList
  }, [calculatedTotals, daysToEvent])

  // Generate recommendations
  const recommendations = useMemo(() => {
    const recs = []

    if (calculatedTotals.roas >= 10) {
      recs.push({
        type: 'opportunity',
        title: 'Scale Top Performers',
        description: 'With 17.84x ROAS, consider increasing budget on best-performing ad sets',
        impact: '+20-30% more conversions',
        action: 'Review Ad Sets'
      })
    }

    if (calculatedTotals.trueCPA < 30) {
      recs.push({
        type: 'opportunity',
        title: 'Expand Geographic Targeting',
        description: 'Strong CPA performance suggests room to test new markets',
        impact: 'Broader reach',
        action: 'View Geography'
      })
    }

    if (daysToEvent <= 30) {
      recs.push({
        type: 'warning',
        title: 'Urgency Messaging',
        description: 'Add countdown timers and scarcity messaging to creatives',
        impact: '+15-25% CVR',
        action: 'View Creatives'
      })
    }

    return recs
  }, [calculatedTotals, daysToEvent])

  // Calculate spend vs revenue for filtered period (using merged data)
  const spendVsRevenueData = useMemo(() => {
    return filteredMetrics
      .filter(d => d.spend > 0)
      .map(d => ({
        date: formatShortDate(d.date),
        spend: d.spend,
        revenue: d.revenueActual || 0
      }))
  }, [filteredMetrics])

  // Platform split estimation (proportional to overall campaign)
  const fbShare = benchmarksData.platformBenchmarks.facebook.spendShare
  const igShare = benchmarksData.platformBenchmarks.instagram.spendShare
  const platformSummary = [
    { name: 'Facebook', spend: calculatedTotals.totalSpend * fbShare, color: COLORS.facebook },
    { name: 'Instagram', spend: calculatedTotals.totalSpend * igShare, color: COLORS.instagram },
  ]

  const topCountries = geoCountries.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Alert Panel - Datadog/Mixpanel Style */}
      <AlertPanel alerts={alerts} />

      {/* Hero KPIs - Enhanced with Sparklines and Variance (Z-Pattern Layout) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <EnhancedKPICard
          label="TRUE CPA"
          value={calculatedTotals.trueCPA}
          previousValue={previousTotals?.cpa}
          target={50}
          format="currency"
          trend="down-good"
          sparklineData={sparklineData.cpa}
          size="hero"
          icon="🎯"
        />
        <EnhancedKPICard
          label="ROAS"
          value={calculatedTotals.roas}
          previousValue={previousTotals?.roas}
          target={10}
          format="multiplier"
          trend="up-good"
          sparklineData={sparklineData.roas}
          size="hero"
          icon="📈"
        />
        <EnhancedKPICard
          label="Total Revenue"
          value={calculatedTotals.totalRevenueActual}
          previousValue={previousTotals?.revenue}
          format="currency"
          trend="up-good"
          sparklineData={sparklineData.orders.map(d => ({ value: d.value * 465 }))}
          size="hero"
          icon="💰"
        />
        <EnhancedKPICard
          label="Actual Orders"
          value={calculatedTotals.totalOrdersActual}
          previousValue={previousTotals?.orders}
          format="number"
          trend="up-good"
          sparklineData={sparklineData.orders}
          size="hero"
          icon="🛒"
        />
      </div>

      {/* Bullet Charts - Target Comparison (Tableau/Power BI Style) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BulletChart
          label="CPA vs Target"
          value={calculatedTotals.trueCPA}
          target={50}
          max={100}
          format="currency"
        />
        <BulletChart
          label="ROAS vs Target"
          value={calculatedTotals.roas}
          target={10}
          max={25}
          format="multiplier"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard label="Total Spend" value={formatCurrency(calculatedTotals.totalSpend)} subValue={dateLabel} />
        <KPICard label="Tickets Sold" value={calculatedTotals.totalTicketsActual} subValue={`from ${calculatedTotals.totalOrdersActual} orders`} />
        <KPICard label="Meta CPA" value={formatCurrency(calculatedTotals.metaCPA)} subValue={`${calculatedTotals.totalPurchasesMeta} attributed`} />
        <KPICard label="Avg CTR" value={formatPercent(calculatedTotals.avgCTR)} />
        <KPICard label="Attribution Gap" value={`+${calculatedTotals.attributionGap.toFixed(0)}%`} subValue="vs Meta" status="warning" />
        <KPICard label="Days to Event" value={daysToEvent} status={daysToEvent < 20 ? 'warning' : 'success'} />
      </div>

      {/* Full-Width Charts */}
      <ChartCard title="Spend vs Revenue">
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={spendVsRevenueData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} />
            <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
            <Tooltip
              contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }}
              formatter={(v) => [`£${v.toLocaleString()}`, '']}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="spend" name="Ad Spend" fill={COLORS.red} radius={[4, 4, 0, 0]} />
            <Bar dataKey="revenue" name="Revenue (Est.)" fill={COLORS.green} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <InsightBox type="success">
          Campaign ROAS: {calculatedTotals.roas.toFixed(2)}x | Total Revenue: {formatCurrency(calculatedTotals.totalRevenueActual)} from {formatCurrency(calculatedTotals.totalSpend)} spend
        </InsightBox>
      </ChartCard>

      <ChartCard title="CPA Trend - Meta vs TRUE">
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={filteredMetrics.filter(d => d.purchasesMeta > 0 || d.ordersActual > 0)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickFormatter={formatShortDate} />
            <YAxis yAxisId="left" stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} domain={[0, 'auto']} />
            <YAxis yAxisId="right" orientation="right" stroke="#9CA3AF" fontSize={12} />
            <Tooltip
              contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }}
              labelFormatter={formatShortDate}
              formatter={(value, name) => {
                if (name.includes('CPA')) return [`£${value.toFixed(2)}`, name]
                return [value, name]
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <ReferenceLine yAxisId="left" y={50} stroke={COLORS.green} strokeDasharray="5 5" label={{ value: 'Target £50', fill: '#22c55e', fontSize: 10 }} />
            <Bar yAxisId="right" dataKey="ordersActual" name="Actual Orders" fill={COLORS.blue} opacity={0.4} radius={[4, 4, 0, 0]} />
            <Line yAxisId="left" type="monotone" dataKey="cpaMeta" name="Meta CPA" stroke={COLORS.purple} strokeWidth={2} dot={false} connectNulls />
            <Line yAxisId="left" type="monotone" dataKey="cpaActual" name="TRUE CPA" stroke={COLORS.green} strokeWidth={3} dot={{ r: 3 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-6 mt-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-8 h-1 bg-purple-500 rounded"></div>
            <span className="text-gray-400">Meta CPA (what Meta reports)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-1 bg-green-500 rounded"></div>
            <span className="text-gray-400">TRUE CPA (actual performance)</span>
          </div>
        </div>
      </ChartCard>

      {/* Full Width Chart */}
      <ChartCard title="Daily Performance Timeline">
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={filteredMetrics}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickFormatter={formatShortDate} />
            <YAxis yAxisId="left" stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
            <YAxis yAxisId="right" orientation="right" stroke="#9CA3AF" fontSize={12} />
            <Tooltip
              contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }}
              labelFormatter={formatShortDate}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Area yAxisId="left" type="monotone" dataKey="spend" name="Spend (£)" fill={COLORS.purple} fillOpacity={0.3} stroke={COLORS.purple} strokeWidth={2} />
            <Bar yAxisId="right" dataKey="purchases" name="Purchases" fill={COLORS.green} radius={[4, 4, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Platform Split (Est.)">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={platformSummary}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={5}
                dataKey="spend"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {platformSummary.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={v => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: COLORS.facebook }}></div>
              <span className="text-gray-400">FB: {formatCurrency(platformSummary[0].spend)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: COLORS.instagram }}></div>
              <span className="text-gray-400">IG: {formatCurrency(platformSummary[1].spend)}</span>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Top Countries by CPA">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topCountries} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis type="number" stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
              <YAxis type="category" dataKey="countryName" stroke="#9CA3AF" fontSize={11} width={80} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
              <ReferenceLine x={50} stroke={COLORS.green} strokeDasharray="5 5" />
              <Bar dataKey="cpa" name="CPA" radius={[0, 4, 4, 0]}>
                {topCountries.map((entry, index) => (
                  <Cell key={index} fill={entry.cpa <= 65 ? COLORS.green : entry.cpa <= 100 ? COLORS.amber : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Actionable Recommendations - AI-Powered Insights */}
      {recommendations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <span>💡</span> Actionable Recommendations
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendations.map((rec, i) => (
              <RecommendationCard key={i} {...rec} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Daily Trends View
function DailyTrendsView({ filteredMetrics, dateLabel }) {
  // Calculate summary stats (now includes actual sales data)
  const summaryStats = useMemo(() => {
    const totalSpend = filteredMetrics.reduce((a, b) => a + b.spend, 0)
    const totalPurchasesMeta = filteredMetrics.reduce((a, b) => a + (b.purchasesMeta || b.purchases || 0), 0)
    const totalOrdersActual = filteredMetrics.reduce((a, b) => a + (b.ordersActual || 0), 0)
    const totalTicketsActual = filteredMetrics.reduce((a, b) => a + (b.ticketsActual || 0), 0)
    const totalRevenueActual = filteredMetrics.reduce((a, b) => a + (b.revenueActual || 0), 0)
    const totalImpressions = filteredMetrics.reduce((a, b) => a + b.impressions, 0)
    const totalClicks = filteredMetrics.reduce((a, b) => a + b.clicks, 0)
    const trueCPA = totalOrdersActual > 0 ? totalSpend / totalOrdersActual : 0
    const roas = totalSpend > 0 ? totalRevenueActual / totalSpend : 0
    return { totalSpend, totalPurchasesMeta, totalOrdersActual, totalTicketsActual, totalRevenueActual, totalImpressions, totalClicks, trueCPA, roas }
  }, [filteredMetrics])

  return (
    <div className="space-y-6">
      {/* Hero KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-900/40 to-green-800/20 rounded-xl p-4 border-2 border-green-600">
          <div className="text-green-400 text-xs font-semibold mb-1">TRUE CPA</div>
          <div className="text-3xl font-bold text-green-400">{summaryStats.trueCPA > 0 ? formatCurrency(summaryStats.trueCPA) : '-'}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 rounded-xl p-4 border-2 border-purple-600">
          <div className="text-purple-400 text-xs font-semibold mb-1">ROAS</div>
          <div className="text-3xl font-bold text-purple-400">{summaryStats.roas.toFixed(2)}x</div>
        </div>
        <KPICard label="Total Spend" value={formatCurrency(summaryStats.totalSpend)} subValue={dateLabel} />
        <KPICard label="Revenue" value={formatCurrency(summaryStats.totalRevenueActual)} />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard label="Actual Orders" value={summaryStats.totalOrdersActual} />
        <KPICard label="Tickets Sold" value={summaryStats.totalTicketsActual} />
        <KPICard label="Meta Purchases" value={summaryStats.totalPurchasesMeta} subValue="(attributed)" />
        <KPICard label="Impressions" value={formatNumber(summaryStats.totalImpressions)} />
        <KPICard label="Clicks" value={formatNumber(summaryStats.totalClicks)} />
        <KPICard label="CTR" value={formatPercent(summaryStats.totalImpressions > 0 ? (summaryStats.totalClicks / summaryStats.totalImpressions) * 100 : 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Daily Spend">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={filteredMetrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickFormatter={formatShortDate} />
              <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} labelFormatter={formatShortDate} />
              <Area type="monotone" dataKey="spend" stroke={COLORS.purple} fill={COLORS.purple} fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Daily Purchases">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={filteredMetrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickFormatter={formatShortDate} />
              <YAxis stroke="#9CA3AF" fontSize={12} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} labelFormatter={formatShortDate} />
              <Bar dataKey="purchases" fill={COLORS.green} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Impressions & CTR Over Time">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={filteredMetrics}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickFormatter={formatShortDate} />
            <YAxis yAxisId="left" stroke="#9CA3AF" fontSize={12} tickFormatter={formatNumber} />
            <YAxis yAxisId="right" orientation="right" stroke="#9CA3AF" fontSize={12} tickFormatter={v => `${v}%`} />
            <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} labelFormatter={formatShortDate} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar yAxisId="left" dataKey="impressions" name="Impressions" fill={COLORS.blue} opacity={0.7} radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="ctr" name="CTR %" stroke={COLORS.amber} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Data Table */}
      <ChartCard title="Daily Breakdown (with Actual Sales)">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0f1729]">
              <tr className="text-gray-400 text-left border-b border-[#1e3a5f]">
                <th className="py-2 px-2">Date</th>
                <th className="py-2 px-2 text-right">Spend</th>
                <th className="py-2 px-2 text-right">Impr</th>
                <th className="py-2 px-2 text-right">Clicks</th>
                <th className="py-2 px-2 text-right">CTR</th>
                <th className="py-2 px-2 text-right text-gray-500">Meta</th>
                <th className="py-2 px-2 text-right text-green-400">Orders</th>
                <th className="py-2 px-2 text-right text-green-400">Tickets</th>
                <th className="py-2 px-2 text-right text-purple-400">Revenue</th>
                <th className="py-2 px-2 text-right text-green-400">True CPA</th>
                <th className="py-2 px-2 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {[...filteredMetrics].reverse().map((day, i) => (
                <tr key={i} className="border-b border-[#1e3a5f]/50 hover:bg-[#1a2744]">
                  <td className="py-2 px-2">{formatShortDate(day.date)}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(day.spend)}</td>
                  <td className="py-2 px-2 text-right">{formatNumber(day.impressions)}</td>
                  <td className="py-2 px-2 text-right">{formatNumber(day.clicks)}</td>
                  <td className="py-2 px-2 text-right">{formatPercent(day.ctr)}</td>
                  <td className="py-2 px-2 text-right text-gray-500">{day.purchasesMeta || day.purchases || 0}</td>
                  <td className="py-2 px-2 text-right text-green-400 font-medium">{day.ordersActual || 0}</td>
                  <td className="py-2 px-2 text-right text-green-400">{day.ticketsActual || 0}</td>
                  <td className="py-2 px-2 text-right text-purple-400">{day.revenueActual > 0 ? formatCurrency(day.revenueActual) : '-'}</td>
                  <td className="py-2 px-2 text-right" style={{ color: getStatusColor(getPerformanceStatus(day.cpaActual || 0)) }}>
                    {day.cpaActual > 0 ? formatCurrency(day.cpaActual) : '-'}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {day.roas > 0 ? `${day.roas.toFixed(1)}x` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  )
}

// Creatives View (with date filter proportional estimation) - World-Class with Fatigue Indicators
function CreativesView({ creatives, spendRatio, dateLabel }) {
  // Apply proportional estimation based on selected date range
  const scaledCreatives = useMemo(() => {
    return creatives.map(c => ({
      ...c,
      spend: c.spend * spendRatio,
      impressions: Math.round(c.impressions * spendRatio),
      clicks: Math.round(c.clicks * spendRatio),
      purchases: Math.round(c.purchases * spendRatio),
      // CPA stays the same ratio as it's spend/purchases
    }))
  }, [creatives, spendRatio])

  const sortedBySpend = [...scaledCreatives].sort((a, b) => b.spend - a.spend).slice(0, 20);
  const sortedByCPA = [...scaledCreatives].filter(c => c.purchases > 0).sort((a, b) => a.cpa - b.cpa).slice(0, 10);
  const sortedByPurchases = [...scaledCreatives].sort((a, b) => b.purchases - a.purchases).slice(0, 10);
  const maxSpend = Math.max(...sortedBySpend.map(c => c.spend))

  // Identify fatigued creatives (high frequency or low CTR with high impressions)
  const fatiguedCreatives = useMemo(() => {
    return scaledCreatives.filter(c =>
      c.frequency > 3.5 || (c.ctr < 0.5 && c.impressions > 50000)
    )
  }, [scaledCreatives])

  // Top performers (purchases > 5 and good CPA)
  const topPerformers = useMemo(() => {
    return scaledCreatives.filter(c => c.purchases > 5 && c.cpa > 0 && c.cpa <= 50)
  }, [scaledCreatives])

  const isFiltered = spendRatio < 0.99

  return (
    <div className="space-y-6">
      {/* Date Range Indicator */}
      <div className="text-center text-gray-400 text-sm mb-2">
        Showing data for: <span className="text-purple-400 font-medium">{dateLabel}</span>
        {isFiltered && <span className="text-yellow-400 ml-2">(proportional estimate)</span>}
      </div>

      {/* Creative Health Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard label="Total Creatives" value={scaledCreatives.length} />
        <KPICard label="Top Performers" value={topPerformers.length} status="success" subValue="CPA < £50" />
        <div className="bg-[#0f1729] rounded-xl p-4 border border-red-700/50">
          <div className="text-red-400 text-xs mb-1 flex items-center gap-1">
            <span className="animate-pulse">●</span> Fatigued
          </div>
          <div className="text-2xl font-bold text-red-400">{fatiguedCreatives.length}</div>
          <div className="text-xs text-gray-500">Need refresh</div>
        </div>
        <KPICard label="Best CPA" value={formatCurrency(Math.min(...scaledCreatives.filter(c => c.cpa > 0).map(c => c.cpa)))} status="success" />
        <KPICard label="Est. Purchases" value={scaledCreatives.reduce((a, b) => a + b.purchases, 0)} subValue={isFiltered ? 'estimated' : ''} />
      </div>

      {/* Fatigue Alert */}
      {fatiguedCreatives.length > 0 && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-400 animate-pulse">●</span>
            <span className="font-semibold text-red-400">Creative Fatigue Detected</span>
          </div>
          <p className="text-sm text-gray-400 mb-3">
            {fatiguedCreatives.length} creative(s) showing signs of fatigue (high frequency or declining CTR). Consider refreshing these ads.
          </p>
          <div className="flex flex-wrap gap-2">
            {fatiguedCreatives.slice(0, 3).map((c, i) => (
              <span key={i} className="px-2 py-1 bg-red-900/30 rounded text-xs text-red-300 truncate max-w-xs">
                {c.adName}
              </span>
            ))}
            {fatiguedCreatives.length > 3 && (
              <span className="px-2 py-1 bg-red-900/30 rounded text-xs text-red-300">
                +{fatiguedCreatives.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Top 10 by Purchases">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sortedByPurchases} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis type="number" stroke="#9CA3AF" fontSize={12} />
              <YAxis type="category" dataKey="adName" stroke="#9CA3AF" fontSize={10} width={120} tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
              <Bar dataKey="purchases" name="Purchases" fill={COLORS.green} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top 10 by CPA (Best Performers)">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sortedByCPA} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis type="number" stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
              <YAxis type="category" dataKey="adName" stroke="#9CA3AF" fontSize={10} width={120} tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
              <ReferenceLine x={50} stroke={COLORS.green} strokeDasharray="5 5" />
              <Bar dataKey="cpa" name="CPA" radius={[0, 4, 4, 0]}>
                {sortedByCPA.map((entry, index) => (
                  <Cell key={index} fill={entry.cpa <= 50 ? COLORS.green : entry.cpa <= 100 ? COLORS.amber : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Creatives Table with Fatigue Indicators */}
      <ChartCard title="Creative Performance (Top 20 by Spend)">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0f1729] z-10">
              <tr className="text-gray-400 text-left border-b border-[#1e3a5f]">
                <th className="py-3 px-3">Creative</th>
                <th className="py-3 px-3">Spend</th>
                <th className="py-3 px-3 text-right">CPA</th>
                <th className="py-3 px-3 text-right">Purchases</th>
                <th className="py-3 px-3 text-right">CTR</th>
                <th className="py-3 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedBySpend.map((creative, i) => (
                <CreativeRow
                  key={i}
                  creative={creative}
                  rank={i + 1}
                  maxSpend={maxSpend}
                />
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Creative Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topPerformers.length > 0 && (
          <RecommendationCard
            type="opportunity"
            title="Scale Top Performers"
            description={`${topPerformers.length} creative(s) have CPA under £50 with strong volume. Consider increasing budget.`}
            impact="+20-40% more conversions"
            action="Review Top Performers"
          />
        )}
        {fatiguedCreatives.length > 0 && (
          <RecommendationCard
            type="critical"
            title="Refresh Fatigued Creatives"
            description={`${fatiguedCreatives.length} creative(s) showing fatigue. Create new variations to maintain performance.`}
            impact="Prevent performance decline"
            action="Create New Variants"
          />
        )}
      </div>
    </div>
  )
}

// Platforms View (now with date filtering) - World-Class Platform Comparison
function PlatformsView({ platformData, dateLabel }) {
  // Aggregate platform data from filtered daily records
  const platformTotals = useMemo(() => {
    const totals = {}
    platformData.forEach(d => {
      const p = d.platform.toLowerCase()
      if (!totals[p]) {
        totals[p] = { spend: 0, impressions: 0, clicks: 0, purchases: 0, name: d.platform }
      }
      totals[p].spend += d.spend || 0
      totals[p].impressions += d.impressions || 0
      totals[p].clicks += d.clicks || 0
      totals[p].purchases += d.purchases || 0
    })
    // Calculate derived metrics
    Object.values(totals).forEach(p => {
      p.cpa = p.purchases > 0 ? p.spend / p.purchases : 0
      p.ctr = p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0
    })
    return totals
  }, [platformData])

  const fb = platformTotals.facebook || { spend: 0, purchases: 0, cpa: 0, impressions: 0, clicks: 0, ctr: 0 }
  const ig = platformTotals.instagram || { spend: 0, purchases: 0, cpa: 0, impressions: 0, clicks: 0, ctr: 0 }
  const totalSpend = fb.spend + ig.spend
  const fbShare = totalSpend > 0 ? fb.spend / totalSpend : 0
  const igShare = totalSpend > 0 ? ig.spend / totalSpend : 0

  // Determine winners for each metric
  const fbIsCPAWinner = fb.cpa > 0 && (ig.cpa === 0 || fb.cpa < ig.cpa)
  const igIsCPAWinner = ig.cpa > 0 && (fb.cpa === 0 || ig.cpa < fb.cpa)
  const fbIsCTRWinner = fb.ctr > ig.ctr
  const fbIsVolumeWinner = fb.purchases > ig.purchases

  const cpaComparison = [
    { name: 'Facebook', cpa: fb.cpa, color: COLORS.facebook },
    { name: 'Instagram', cpa: ig.cpa, color: COLORS.instagram },
  ];

  const efficiencyDiff = ig.cpa > 0 ? ((ig.cpa - fb.cpa) / ig.cpa * 100).toFixed(0) : 0;

  return (
    <div className="space-y-6">
      {/* Date Range Indicator */}
      <div className="text-center text-gray-400 text-sm mb-2">
        Showing data for: <span className="text-purple-400 font-medium">{dateLabel}</span>
      </div>

      {/* Platform Summary Cards with Winner Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`bg-[#0f1729] rounded-xl p-5 border-2 relative ${fbIsCPAWinner ? 'ring-2 ring-green-500/50' : ''}`} style={{ borderColor: COLORS.facebook }}>
          {fbIsCPAWinner && (
            <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
              <span>👑</span> Best CPA
            </div>
          )}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-4 h-4 rounded-full" style={{ background: COLORS.facebook }}></div>
            <span className="font-semibold">Facebook</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Spend:</span>
              <span>{formatCurrency(fb.spend)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Purchases:</span>
              <span className="flex items-center gap-1">
                {fb.purchases}
                {fbIsVolumeWinner && <span className="text-green-400 text-xs">🏆</span>}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">CPA:</span>
              <span className={`flex items-center gap-1 ${fb.cpa <= 50 ? "text-green-400" : fb.cpa <= 80 ? "text-amber-400" : "text-red-400"}`}>
                {fb.cpa > 0 ? formatCurrency(fb.cpa) : '-'}
                {fbIsCPAWinner && fb.cpa > 0 && <span className="text-xs">✓</span>}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">CTR:</span>
              <span className="flex items-center gap-1">
                {formatPercent(fb.ctr)}
                {fbIsCTRWinner && <span className="text-green-400 text-xs">🏆</span>}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-gray-400">Share:</span><span>{(fbShare * 100).toFixed(0)}%</span></div>
          </div>
        </div>

        <div className={`bg-[#0f1729] rounded-xl p-5 border-2 relative ${igIsCPAWinner ? 'ring-2 ring-green-500/50' : ''}`} style={{ borderColor: COLORS.instagram }}>
          {igIsCPAWinner && (
            <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
              <span>👑</span> Best CPA
            </div>
          )}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-4 h-4 rounded-full" style={{ background: COLORS.instagram }}></div>
            <span className="font-semibold">Instagram</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Spend:</span>
              <span>{formatCurrency(ig.spend)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Purchases:</span>
              <span className="flex items-center gap-1">
                {ig.purchases}
                {!fbIsVolumeWinner && ig.purchases > 0 && <span className="text-green-400 text-xs">🏆</span>}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">CPA:</span>
              <span className={`flex items-center gap-1 ${ig.cpa <= 50 ? "text-green-400" : ig.cpa <= 80 ? "text-amber-400" : "text-red-400"}`}>
                {ig.cpa > 0 ? formatCurrency(ig.cpa) : '-'}
                {igIsCPAWinner && ig.cpa > 0 && <span className="text-xs">✓</span>}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">CTR:</span>
              <span className="flex items-center gap-1">
                {formatPercent(ig.ctr)}
                {!fbIsCTRWinner && ig.ctr > 0 && <span className="text-green-400 text-xs">🏆</span>}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-gray-400">Share:</span><span>{(igShare * 100).toFixed(0)}%</span></div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#0f1729] to-[#1a2744] rounded-xl p-5 border border-[#1e3a5f]">
          <div className="font-semibold mb-3 flex items-center gap-2">
            <span>📊</span> Head-to-Head
          </div>
          <div className="space-y-3">
            <div className="bg-[#0f1729]/50 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-1">CPA Winner</div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-green-400">
                  {fbIsCPAWinner ? 'Facebook' : igIsCPAWinner ? 'Instagram' : 'Tied'}
                </span>
                <span className="text-sm text-gray-400">
                  by {formatCurrency(Math.abs(fb.cpa - ig.cpa))}
                </span>
              </div>
            </div>
            <div className="bg-[#0f1729]/50 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-1">Volume Winner</div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-blue-400">
                  {fbIsVolumeWinner ? 'Facebook' : 'Instagram'}
                </span>
                <span className="text-sm text-gray-400">
                  by {Math.abs(fb.purchases - ig.purchases)} sales
                </span>
              </div>
            </div>
          </div>
          {fb.cpa > 0 && ig.cpa > 0 && (
            <InsightBox type={fbIsCPAWinner ? "success" : "info"}>
              {fb.cpa < ig.cpa
                ? `Facebook delivers ${efficiencyDiff}% better CPA - consider shifting budget`
                : `Instagram delivers ${Math.abs(Number(efficiencyDiff))}% better CPA - consider shifting budget`}
            </InsightBox>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Spend Distribution">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Facebook', value: fb.spend, color: COLORS.facebook },
                  { name: 'Instagram', value: ig.spend, color: COLORS.instagram }
                ].filter(d => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                <Cell fill={COLORS.facebook} />
                <Cell fill={COLORS.instagram} />
              </Pie>
              <Tooltip formatter={v => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="CPA Comparison">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={cpaComparison.filter(d => d.cpa > 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
              <ReferenceLine y={50} stroke={COLORS.green} strokeDasharray="5 5" />
              <Bar dataKey="cpa" name="CPA" radius={[4, 4, 0, 0]}>
                {cpaComparison.filter(d => d.cpa > 0).map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {fb.cpa > 0 && ig.cpa > 0 && (
            <InsightBox type="success">
              Target CPA: £50 | FB: {fb.cpa <= 50 ? 'On Target' : 'Above Target'} | IG: {ig.cpa <= 50 ? 'On Target' : 'Above Target'}
            </InsightBox>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

// Geography View (with date filter proportional estimation)
function GeographyView({ countries, spendRatio, dateLabel }) {
  // Apply proportional estimation based on selected date range
  const scaledCountries = useMemo(() => {
    return countries.map(c => ({
      ...c,
      spend: c.spend * spendRatio,
      impressions: Math.round(c.impressions * spendRatio),
      clicks: Math.round(c.clicks * spendRatio),
      purchases: Math.round(c.purchases * spendRatio),
      // CPA stays the same ratio
    }))
  }, [countries, spendRatio])

  const isFiltered = spendRatio < 0.99
  const sortedByCPA = [...scaledCountries].filter(c => c.cpa > 0).sort((a, b) => a.cpa - b.cpa);
  const sortedBySpend = [...scaledCountries].sort((a, b) => b.spend - a.spend);
  const topPerformers = sortedByCPA.filter(c => c.cpa <= 70);
  const underperformers = sortedByCPA.filter(c => c.cpa > 120);

  return (
    <div className="space-y-6">
      {/* Date Range Indicator */}
      <div className="text-center text-gray-400 text-sm mb-2">
        Showing data for: <span className="text-purple-400 font-medium">{dateLabel}</span>
        {isFiltered && <span className="text-yellow-400 ml-2">(proportional estimate)</span>}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Countries" value={scaledCountries.length} />
        <KPICard label="Best CPA" value={`${scaledCountries[0]?.flag || ''} ${formatCurrency(Math.min(...scaledCountries.filter(c => c.cpa > 0).map(c => c.cpa)))}`} status="success" />
        <KPICard label="Top Performers" value={topPerformers.length} subValue="CPA < £70" />
        <KPICard label="Underperformers" value={underperformers.length} subValue="CPA > £120" status="warning" />
      </div>

      <ChartCard title="CPA by Country">
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={sortedByCPA}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="countryName" stroke="#9CA3AF" fontSize={10} angle={-45} textAnchor="end" height={80} />
            <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
            <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
            <ReferenceLine y={50} stroke={COLORS.green} strokeDasharray="5 5" label={{ value: 'Target', fill: COLORS.green, fontSize: 10 }} />
            <Bar dataKey="cpa" name="CPA" radius={[4, 4, 0, 0]}>
              {sortedByCPA.map((entry, index) => (
                <Cell key={index} fill={entry.cpa <= 65 ? COLORS.green : entry.cpa <= 100 ? COLORS.amber : COLORS.red} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Top Performers (CPA < £70)">
          <div className="space-y-3">
            {topPerformers.map((country, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-green-900/20 rounded-lg border border-green-700/50">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{country.flag}</span>
                  <div>
                    <div className="font-medium">{country.countryName}</div>
                    <div className="text-xs text-gray-400">{country.purchases} purchases</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-semibold">{formatCurrency(country.cpa)}</div>
                  <div className="text-xs text-gray-400">{formatCurrency(country.spend)} spent</div>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Underperformers (CPA > £120)">
          <div className="space-y-3">
            {underperformers.map((country, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-red-900/20 rounded-lg border border-red-700/50">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{country.flag}</span>
                  <div>
                    <div className="font-medium">{country.countryName}</div>
                    <div className="text-xs text-gray-400">{country.purchases} purchases</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-red-400 font-semibold">{formatCurrency(country.cpa)}</div>
                  <div className="text-xs text-gray-400">{formatCurrency(country.spend)} spent</div>
                </div>
              </div>
            ))}
          </div>
          <InsightBox type="warning">
            Consider reducing spend in countries with CPA &gt; £100
          </InsightBox>
        </ChartCard>
      </div>

      {/* Full Table */}
      <ChartCard title="All Countries">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0f1729]">
              <tr className="text-gray-400 text-left border-b border-[#1e3a5f]">
                <th className="py-2 px-3">Country</th>
                <th className="py-2 px-3 text-right">Spend</th>
                <th className="py-2 px-3 text-right">Impressions</th>
                <th className="py-2 px-3 text-right">Clicks</th>
                <th className="py-2 px-3 text-right">CTR</th>
                <th className="py-2 px-3 text-right">Purchases</th>
                <th className="py-2 px-3 text-right">CPA</th>
              </tr>
            </thead>
            <tbody>
              {sortedBySpend.map((country, i) => (
                <tr key={i} className="border-b border-[#1e3a5f]/50 hover:bg-[#1a2744]">
                  <td className="py-2 px-3"><span className="mr-2">{country.flag}</span>{country.countryName}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(country.spend)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(country.impressions)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(country.clicks)}</td>
                  <td className="py-2 px-3 text-right">{formatPercent(country.ctr)}</td>
                  <td className="py-2 px-3 text-right">{country.purchases}</td>
                  <td className="py-2 px-3 text-right" style={{ color: getStatusColor(getPerformanceStatus(country.cpa)) }}>
                    {country.cpa > 0 ? formatCurrency(country.cpa) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  )
}

// Attribution View (now uses merged data with estimated actual sales)
function AttributionView({ filteredMetrics, dateLabel }) {
  // Calculate totals from merged data
  const totals = useMemo(() => {
    const totalMetaPurchases = filteredMetrics.reduce((a, b) => a + (b.purchasesMeta || b.purchases || 0), 0)
    const totalActualOrders = filteredMetrics.reduce((a, b) => a + (b.ordersActual || 0), 0)
    const totalSpend = filteredMetrics.reduce((a, b) => a + b.spend, 0)
    const totalRevenue = filteredMetrics.reduce((a, b) => a + (b.revenueActual || 0), 0)
    const attributionGap = totalActualOrders > 0 ? ((totalActualOrders - totalMetaPurchases) / totalActualOrders * 100) : 0
    const metaCPA = totalMetaPurchases > 0 ? totalSpend / totalMetaPurchases : 0
    const trueCPA = totalActualOrders > 0 ? totalSpend / totalActualOrders : 0
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    return { totalMetaPurchases, totalActualOrders, totalSpend, totalRevenue, attributionGap, metaCPA, trueCPA, roas }
  }, [filteredMetrics])

  // Prepare chart data from merged metrics
  const combinedData = useMemo(() => {
    return filteredMetrics
      .filter(d => (d.purchasesMeta || d.purchases || 0) > 0 || (d.ordersActual || 0) > 0)
      .map(d => ({
        date: formatShortDate(d.date),
        metaPurchases: d.purchasesMeta || d.purchases || 0,
        actualOrders: d.ordersActual || 0,
        metaSpend: d.spend,
        actualRevenue: d.revenueActual || 0,
      }))
  }, [filteredMetrics])

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold text-gray-200">Meta Attribution vs Actual Sales</h2>
        <p className="text-gray-400 text-sm">Comparing Meta pixel data with actual ticket sales ({dateLabel})</p>
      </div>

      {/* Hero KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-900/40 to-green-800/20 rounded-xl p-5 border-2 border-green-600 text-center">
          <div className="text-green-400 text-xs font-semibold mb-1">TRUE CPA</div>
          <div className="text-4xl font-bold text-green-400">{totals.trueCPA > 0 ? formatCurrency(totals.trueCPA) : '-'}</div>
          <div className="text-gray-400 text-xs mt-1">{totals.totalActualOrders} actual orders</div>
        </div>
        <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 rounded-xl p-5 border-2 border-purple-600 text-center">
          <div className="text-purple-400 text-xs font-semibold mb-1">ROAS</div>
          <div className="text-4xl font-bold text-purple-400">{totals.roas.toFixed(2)}x</div>
          <div className="text-gray-400 text-xs mt-1">{formatCurrency(totals.totalRevenue)}</div>
        </div>
        <div className="bg-[#0f1729] rounded-xl p-5 border border-gray-700 text-center">
          <div className="text-gray-400 text-xs mb-1">Meta CPA</div>
          <div className="text-2xl font-bold text-gray-400">{totals.metaCPA > 0 ? formatCurrency(totals.metaCPA) : '-'}</div>
          <div className="text-gray-500 text-xs mt-1">{totals.totalMetaPurchases} attributed</div>
        </div>
        <div className="bg-[#0f1729] rounded-xl p-5 border border-yellow-700/50 text-center">
          <div className="text-yellow-400 text-xs mb-1">Attribution Gap</div>
          <div className="text-2xl font-bold text-yellow-400">+{totals.attributionGap.toFixed(0)}%</div>
          <div className="text-gray-500 text-xs mt-1">Meta sees {(100 - totals.attributionGap).toFixed(0)}%</div>
        </div>
      </div>

      {/* Full Width Chart */}
      <ChartCard title="Meta Purchases vs Actual Orders Over Time">
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={combinedData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} />
            <YAxis stroke="#9CA3AF" fontSize={12} />
            <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="metaPurchases" name="Meta Attributed" fill={COLORS.purple} radius={[4, 4, 0, 0]} />
            <Bar dataKey="actualOrders" name="Actual Orders" fill={COLORS.green} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <InsightBox type="success">
          The campaign is significantly outperforming what Meta reports! True CPA is {formatCurrency(totals.trueCPA)} vs Meta's {formatCurrency(totals.metaCPA)}
        </InsightBox>
      </ChartCard>

      {/* CPA Comparison Visual */}
      <ChartCard title="CPA Breakdown">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-6 bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-xl border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">What Meta Shows</div>
            <div className="text-4xl font-bold text-gray-400 mb-1">{formatCurrency(totals.metaCPA)}</div>
            <div className="text-sm text-gray-500">Based on {totals.totalMetaPurchases} attributed purchases</div>
            <div className="mt-3 text-red-400 text-xs">Looks concerning...</div>
          </div>
          <div className="text-center p-6 bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-xl border-2 border-green-600">
            <div className="text-green-400 text-sm mb-2 font-semibold">TRUE Performance</div>
            <div className="text-4xl font-bold text-green-400 mb-1">{formatCurrency(totals.trueCPA)}</div>
            <div className="text-sm text-gray-400">Based on {totals.totalActualOrders} actual orders</div>
            <div className="mt-3 text-green-400 text-xs font-semibold">Campaign is crushing it!</div>
          </div>
          <div className="text-center p-6 bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-xl border border-purple-600">
            <div className="text-purple-400 text-sm mb-2">Return on Ad Spend</div>
            <div className="text-4xl font-bold text-purple-400 mb-1">{totals.roas.toFixed(2)}x</div>
            <div className="text-sm text-gray-400">{formatCurrency(totals.totalRevenue)} from {formatCurrency(totals.totalSpend)}</div>
            <div className="mt-3 text-purple-400 text-xs">Excellent returns!</div>
          </div>
        </div>
      </ChartCard>

      <ChartCard title="Attribution Gap Analysis">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-semibold mb-3">Possible Causes</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-yellow-400">!</span>
                <span>iOS 14+ privacy restrictions limiting pixel tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400">!</span>
                <span>Cross-device conversions not being attributed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400">!</span>
                <span>Ad blockers preventing pixel fires</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400">!</span>
                <span>View-through conversions beyond attribution window</span>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-3">Recommendations</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-green-400">+</span>
                <span>Implement Conversions API for server-side tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">+</span>
                <span>Use UTM parameters for backup tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">+</span>
                <span>Consider true CPA for budget decisions</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">+</span>
                <span>Review 28-day click attribution settings</span>
              </li>
            </ul>
          </div>
        </div>
      </ChartCard>
    </div>
  )
}

// Funnel View - World-Class Funnel with Bottleneck Detection
function FunnelView({ filteredMetrics, dateLabel }) {
  const totals = useMemo(() => ({
    impressions: filteredMetrics.reduce((a, b) => a + b.impressions, 0),
    clicks: filteredMetrics.reduce((a, b) => a + b.clicks, 0),
    lpv: filteredMetrics.reduce((a, b) => a + b.landingPageViews, 0),
    atc: filteredMetrics.reduce((a, b) => a + b.addToCart, 0),
    checkout: filteredMetrics.reduce((a, b) => a + b.checkoutsInitiated, 0),
    purchases: filteredMetrics.reduce((a, b) => a + b.purchases, 0),
  }), [filteredMetrics])

  const funnelStages = [
    { name: 'Impressions', value: totals.impressions, color: COLORS.purple },
    { name: 'Clicks', value: totals.clicks, color: COLORS.blue },
    { name: 'Landing Page Views', value: totals.lpv, color: COLORS.cyan },
    { name: 'Add to Cart', value: totals.atc, color: COLORS.amber },
    { name: 'Checkout Initiated', value: totals.checkout, color: COLORS.pink },
    { name: 'Purchases', value: totals.purchases, color: COLORS.green },
  ];

  // Calculate drop-off rates to identify bottleneck
  const dropOffs = useMemo(() => {
    const drops = []
    for (let i = 1; i < funnelStages.length; i++) {
      const prev = funnelStages[i - 1].value
      const curr = funnelStages[i].value
      const dropRate = prev > 0 ? ((prev - curr) / prev * 100) : 0
      drops.push({
        from: funnelStages[i - 1].name,
        to: funnelStages[i].name,
        dropRate,
        conversionRate: prev > 0 ? (curr / prev * 100) : 0
      })
    }
    return drops
  }, [funnelStages])

  // Find the bottleneck (excluding first stage which always has highest drop)
  const bottleneckIndex = useMemo(() => {
    let maxDrop = 0
    let idx = -1
    // Start from index 1 to skip Impressions→Clicks (expected to be high)
    for (let i = 1; i < dropOffs.length; i++) {
      if (dropOffs[i].dropRate > maxDrop) {
        maxDrop = dropOffs[i].dropRate
        idx = i + 1 // +1 because bottleneck is on the target stage
      }
    }
    return idx
  }, [dropOffs])

  const stages = totals.impressions > 0 ? [
    { from: 'Impressions', to: 'Clicks', rate: (totals.clicks / totals.impressions * 100).toFixed(2) },
    { from: 'Clicks', to: 'LPV', rate: totals.clicks > 0 ? (totals.lpv / totals.clicks * 100).toFixed(1) : '0' },
    { from: 'LPV', to: 'Add to Cart', rate: totals.lpv > 0 ? (totals.atc / totals.lpv * 100).toFixed(1) : '0' },
    { from: 'Add to Cart', to: 'Checkout', rate: totals.atc > 0 ? (totals.checkout / totals.atc * 100).toFixed(1) : '0' },
    { from: 'Checkout', to: 'Purchase', rate: totals.checkout > 0 ? (totals.purchases / totals.checkout * 100).toFixed(1) : '0' },
  ] : [];

  // Overall funnel efficiency
  const overallConversion = totals.impressions > 0 ? (totals.purchases / totals.impressions * 100) : 0

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold text-gray-200">Conversion Funnel Analysis</h2>
        <p className="text-gray-400 text-sm">Google Analytics style funnel with bottleneck detection ({dateLabel})</p>
      </div>

      {/* Funnel Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0f1729] rounded-xl p-4 border border-[#1e3a5f]">
          <div className="text-gray-400 text-xs mb-1">Overall Conversion</div>
          <div className="text-2xl font-bold text-green-400">{overallConversion.toFixed(3)}%</div>
          <div className="text-xs text-gray-500">{formatNumber(totals.purchases)} / {formatNumber(totals.impressions)}</div>
        </div>
        <div className="bg-[#0f1729] rounded-xl p-4 border border-[#1e3a5f]">
          <div className="text-gray-400 text-xs mb-1">Click-Through Rate</div>
          <div className="text-2xl font-bold text-blue-400">{formatPercent(totals.impressions > 0 ? totals.clicks / totals.impressions * 100 : 0)}</div>
        </div>
        <div className="bg-[#0f1729] rounded-xl p-4 border border-[#1e3a5f]">
          <div className="text-gray-400 text-xs mb-1">Cart Conversion</div>
          <div className="text-2xl font-bold text-amber-400">{formatPercent(totals.lpv > 0 ? totals.atc / totals.lpv * 100 : 0)}</div>
        </div>
        <div className="bg-[#0f1729] rounded-xl p-4 border border-red-700/50">
          <div className="text-red-400 text-xs mb-1 flex items-center gap-1"><span>⚠️</span> Bottleneck</div>
          <div className="text-lg font-bold text-red-400">{bottleneckIndex >= 0 ? funnelStages[bottleneckIndex]?.name : 'None'}</div>
          <div className="text-xs text-gray-500">{bottleneckIndex >= 0 ? `${dropOffs[bottleneckIndex - 1]?.dropRate.toFixed(1)}% drop-off` : ''}</div>
        </div>
      </div>

      {/* Enhanced Visual Funnel with Bottleneck Highlighting */}
      <ChartCard title="Funnel Visualization with Drop-off Analysis">
        <div className="py-4 space-y-1">
          {funnelStages.map((stage, i) => (
            <FunnelStage
              key={i}
              stage={stage}
              index={i}
              total={funnelStages[0].value}
              previousValue={i > 0 ? funnelStages[i - 1].value : null}
              isBottleneck={i === bottleneckIndex}
            />
          ))}
        </div>
      </ChartCard>

      {/* Conversion Rates */}
      {stages.length > 0 && (
        <ChartCard title="Stage-by-Stage Conversion Rates">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {stages.map((stage, i) => {
              const isBadStage = parseFloat(stage.rate) < 20 && i > 0 // Skip CTR for "bad" classification
              return (
                <div key={i} className={`text-center p-4 rounded-lg ${isBadStage ? 'bg-red-900/30 border border-red-700' : 'bg-[#1a2744]'}`}>
                  <div className="text-xs text-gray-400 mb-1">{stage.from} → {stage.to}</div>
                  <div className="text-2xl font-bold" style={{ color: parseFloat(stage.rate) > 50 ? COLORS.green : parseFloat(stage.rate) > 20 ? COLORS.amber : COLORS.red }}>
                    {stage.rate}%
                  </div>
                  {isBadStage && <div className="text-xs text-red-400 mt-1">Needs attention</div>}
                </div>
              )
            })}
          </div>
        </ChartCard>
      )}

      {/* Actionable Recommendations */}
      <ChartCard title="Optimization Recommendations">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {totals.lpv > 0 && totals.atc / totals.lpv < 0.15 && (
            <RecommendationCard
              type="critical"
              title="Improve Landing Page → Cart"
              description="Only {rate}% of visitors add to cart. Focus on landing page optimization."
              impact="+50-100% more add-to-carts"
              action="Optimize LP"
            />
          )}
          {totals.atc > 0 && totals.checkout / totals.atc < 0.5 && (
            <RecommendationCard
              type="warning"
              title="Reduce Cart Abandonment"
              description="Many users abandon after adding to cart. Consider exit-intent popups."
              impact="+20-30% more checkouts"
              action="Add Retargeting"
            />
          )}
          {totals.checkout > 0 && totals.purchases / totals.checkout < 0.7 && (
            <RecommendationCard
              type="warning"
              title="Simplify Checkout Flow"
              description="Checkout completion rate is below 70%. Review the checkout process for friction."
              impact="+15-25% more purchases"
              action="Review Checkout"
            />
          )}
          <RecommendationCard
            type="opportunity"
            title="Add Countdown Timer"
            description="With the event approaching, urgency messaging can boost conversions significantly."
            impact="+10-20% conversion lift"
            action="Implement"
          />
        </div>
      </ChartCard>

      {/* Drop-off Analysis */}
      <ChartCard title="Detailed Drop-off Analysis">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left border-b border-[#1e3a5f]">
                <th className="py-2 px-3">Stage Transition</th>
                <th className="py-2 px-3 text-right">Conversion Rate</th>
                <th className="py-2 px-3 text-right">Drop-off Rate</th>
                <th className="py-2 px-3 text-right">Users Lost</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {dropOffs.map((drop, i) => (
                <tr key={i} className={`border-b border-[#1e3a5f]/50 ${i + 1 === bottleneckIndex ? 'bg-red-900/20' : ''}`}>
                  <td className="py-2 px-3">{drop.from} → {drop.to}</td>
                  <td className="py-2 px-3 text-right">
                    <span className={drop.conversionRate >= 50 ? 'text-green-400' : drop.conversionRate >= 20 ? 'text-amber-400' : 'text-red-400'}>
                      {drop.conversionRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className={drop.dropRate <= 50 ? 'text-green-400' : drop.dropRate <= 80 ? 'text-amber-400' : 'text-red-400'}>
                      {drop.dropRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-gray-400">
                    {formatNumber(funnelStages[i].value - funnelStages[i + 1].value)}
                  </td>
                  <td className="py-2 px-3">
                    {i + 1 === bottleneckIndex ? (
                      <span className="px-2 py-0.5 rounded text-xs bg-red-900/50 text-red-400 animate-pulse">Bottleneck</span>
                    ) : drop.dropRate <= 50 ? (
                      <span className="px-2 py-0.5 rounded text-xs bg-green-900/50 text-green-400">Healthy</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs bg-yellow-900/50 text-yellow-400">Monitor</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  )
}

// Ad Sets View (with date filter proportional estimation)
function AdSetsView({ adSets, spendRatio, dateLabel }) {
  // Apply proportional estimation based on selected date range
  const scaledAdSets = useMemo(() => {
    return adSets.map(s => ({
      ...s,
      spend: s.spend * spendRatio,
      impressions: Math.round(s.impressions * spendRatio),
      clicks: Math.round(s.clicks * spendRatio),
      purchases: Math.round(s.purchases * spendRatio),
      // CPA stays the same ratio
    }))
  }, [adSets, spendRatio])

  const isFiltered = spendRatio < 0.99
  const sortedBySpend = [...scaledAdSets].sort((a, b) => b.spend - a.spend);
  const sortedByCPA = [...scaledAdSets].filter(s => s.cpa > 0).sort((a, b) => a.cpa - b.cpa);

  const temperatureData = [
    { name: 'Hot', value: scaledAdSets.filter(s => s.temperature === 'Hot').reduce((a, b) => a + b.spend, 0), color: COLORS.red },
    { name: 'Warm', value: scaledAdSets.filter(s => s.temperature === 'Warm').reduce((a, b) => a + b.spend, 0), color: COLORS.amber },
    { name: 'Cold', value: scaledAdSets.filter(s => s.temperature === 'Cold').reduce((a, b) => a + b.spend, 0), color: COLORS.blue },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Date Range Indicator */}
      <div className="text-center text-gray-400 text-sm mb-2">
        Showing data for: <span className="text-purple-400 font-medium">{dateLabel}</span>
        {isFiltered && <span className="text-yellow-400 ml-2">(proportional estimate)</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Ad Sets" value={scaledAdSets.length} />
        <KPICard label="With Purchases" value={scaledAdSets.filter(s => s.purchases > 0).length} />
        <KPICard label="Best CPA" value={formatCurrency(Math.min(...scaledAdSets.filter(s => s.cpa > 0).map(s => s.cpa)))} status="success" />
        <KPICard label="Est. Purchases" value={scaledAdSets.reduce((a, b) => a + b.purchases, 0)} subValue={isFiltered ? 'estimated' : ''} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Spend by Audience Temperature">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={temperatureData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {temperatureData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={v => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top Ad Sets by CPA">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={sortedByCPA.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis type="number" stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
              <YAxis type="category" dataKey="adSetName" stroke="#9CA3AF" fontSize={9} width={140} tick={{ fontSize: 8 }} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
              <ReferenceLine x={50} stroke={COLORS.green} strokeDasharray="5 5" />
              <Bar dataKey="cpa" name="CPA" radius={[0, 4, 4, 0]}>
                {sortedByCPA.slice(0, 8).map((entry, index) => (
                  <Cell key={index} fill={entry.cpa <= 50 ? COLORS.green : entry.cpa <= 100 ? COLORS.amber : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="All Ad Sets">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0f1729]">
              <tr className="text-gray-400 text-left border-b border-[#1e3a5f]">
                <th className="py-2 px-3">Ad Set</th>
                <th className="py-2 px-3">Temp</th>
                <th className="py-2 px-3">Geo</th>
                <th className="py-2 px-3 text-right">Spend</th>
                <th className="py-2 px-3 text-right">Clicks</th>
                <th className="py-2 px-3 text-right">CTR</th>
                <th className="py-2 px-3 text-right">Purchases</th>
                <th className="py-2 px-3 text-right">CPA</th>
              </tr>
            </thead>
            <tbody>
              {sortedBySpend.map((adSet, i) => (
                <tr key={i} className="border-b border-[#1e3a5f]/50 hover:bg-[#1a2744]">
                  <td className="py-2 px-3 max-w-xs truncate">{adSet.adSetName}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      adSet.temperature === 'Hot' ? 'bg-red-900/50 text-red-300' :
                      adSet.temperature === 'Warm' ? 'bg-amber-900/50 text-amber-300' :
                      'bg-blue-900/50 text-blue-300'
                    }`}>
                      {adSet.temperature}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-gray-400">{adSet.geo}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(adSet.spend)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(adSet.clicks)}</td>
                  <td className="py-2 px-3 text-right">{formatPercent(adSet.ctr)}</td>
                  <td className="py-2 px-3 text-right">{adSet.purchases}</td>
                  <td className="py-2 px-3 text-right" style={{ color: getStatusColor(getPerformanceStatus(adSet.cpa)) }}>
                    {adSet.cpa > 0 ? formatCurrency(adSet.cpa) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  )
}

// Main App Component
function App() {
  const [activeTab, setActiveTab] = useState('overview')
  const [datePreset, setDatePreset] = useState('7days')
  const [showCustomDate, setShowCustomDate] = useState(false)
  const [customStart, setCustomStart] = useState('2025-12-30')
  const [customEnd, setCustomEnd] = useState('2026-01-06')

  // World-class feature states
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    // Check if user has seen onboarding
    return !localStorage.getItem('dnba-onboarding-complete')
  })
  const [onboardingStep, setOnboardingStep] = useState(1)

  // AI-Powered Feature States
  const [showAICopilot, setShowAICopilot] = useState(false)
  const [showExecutiveSummary, setShowExecutiveSummary] = useState(false)
  const [showWhatIfSimulator, setShowWhatIfSimulator] = useState(false)

  // Custom data state (allows uploaded data to override defaults)
  const [customData, setCustomData] = useState({
    daily: null,
    creatives: null,
    platforms: null,
    adsets: null,
    geo: null,
    sales: null,
  })

  // Use custom data if uploaded, otherwise use defaults
  const dailyData = customData.daily || defaultDailyData
  const creativeData = customData.creatives || defaultCreativeData
  const platformData = customData.platforms || defaultPlatformData
  const adSetData = customData.adsets || defaultAdSetData
  const geoData = customData.geo || defaultGeoData

  // Handle data upload
  const handleDataUpload = useCallback((type, data) => {
    setCustomData(prev => ({ ...prev, [type]: data }))
  }, [])

  // Reset to default data
  const handleResetData = useCallback(() => {
    setCustomData({
      daily: null,
      creatives: null,
      platforms: null,
      adsets: null,
      geo: null,
      sales: null,
    })
  }, [])

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      switch (e.key) {
        case '?':
          e.preventDefault()
          setShowShortcutsModal(true)
          break
        case 'Escape':
          setShowShortcutsModal(false)
          setShowUploadModal(false)
          setShowAICopilot(false)
          setShowExecutiveSummary(false)
          setShowWhatIfSimulator(false)
          break
        case 'a':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            setShowAICopilot(true)
          }
          break
        case 's':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            setShowExecutiveSummary(true)
          }
          break
        case 'w':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            setShowWhatIfSimulator(true)
          }
          break
        case 'd':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            setIsDarkMode(prev => !prev)
          }
          break
        case 'u':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            setShowUploadModal(true)
          }
          break
        case 'e':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            // Export current tab data
            handleExportCurrentTab()
          }
          break
        case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            const tabIndex = parseInt(e.key) - 1
            const tabs = ['overview', 'daily', 'creatives', 'adsets', 'platforms', 'geo', 'attribution', 'funnel']
            if (tabs[tabIndex]) setActiveTab(tabs[tabIndex])
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Export current tab data
  const handleExportCurrentTab = useCallback(() => {
    const exportMap = {
      overview: { data: mergedDailyMetrics, filename: 'overview_metrics' },
      daily: { data: mergedDailyMetrics, filename: 'daily_metrics' },
      creatives: { data: creativeData.creatives, filename: 'creative_performance' },
      adsets: { data: adSetData.adSets, filename: 'adset_performance' },
      platforms: { data: platformData.platforms, filename: 'platform_performance' },
      geo: { data: geoData.countries, filename: 'geo_performance' },
      attribution: { data: mergedDailyMetrics, filename: 'attribution_data' },
      funnel: { data: mergedDailyMetrics, filename: 'funnel_data' },
    }
    const { data, filename } = exportMap[activeTab] || {}
    if (data) exportToCSV(data, filename)
  }, [activeTab, creativeData, adSetData, platformData, geoData])

  // Onboarding handlers
  const handleNextOnboarding = useCallback(() => {
    setOnboardingStep(prev => prev + 1)
  }, [])

  const handleCompleteOnboarding = useCallback(() => {
    setShowOnboarding(false)
    localStorage.setItem('dnba-onboarding-complete', 'true')
  }, [])

  const handleSkipOnboarding = useCallback(() => {
    setShowOnboarding(false)
    localStorage.setItem('dnba-onboarding-complete', 'true')
  }, [])

  const daysToEvent = getDaysUntilEvent();

  // Calculate filtered metrics based on date selection (using merged data with actual sales)
  const { filteredMetrics, dateLabel, dateRange } = useMemo(() => {
    const range = showCustomDate
      ? getDateRange('custom', customStart, customEnd)
      : getDateRange(datePreset)

    const filtered = filterByDateRange(mergedDailyMetrics, range.start, range.end)

    // Generate label
    let label = ''
    if (showCustomDate && customStart && customEnd) {
      label = `${formatShortDate(customStart)} - ${formatShortDate(customEnd)}`
    } else {
      const preset = DATE_PRESETS.find(p => p.id === datePreset)
      label = preset?.label || ''
    }

    return { filteredMetrics: filtered, dateLabel: label, dateRange: range }
  }, [datePreset, showCustomDate, customStart, customEnd])

  // Filter platform data by date range
  const filteredPlatformData = useMemo(() => {
    return filterByDateRange(platformData.platforms, dateRange.start, dateRange.end)
  }, [dateRange])

  // Calculate spend ratio for proportional estimation (for tabs without daily data)
  const spendRatio = useMemo(() => {
    const totalCampaignSpend = mergedDailyMetrics.reduce((a, b) => a + b.spend, 0)
    const filteredSpend = filteredMetrics.reduce((a, b) => a + b.spend, 0)
    return totalCampaignSpend > 0 ? filteredSpend / totalCampaignSpend : 1
  }, [filteredMetrics])

  const tabs = [
    { id: 'overview', label: 'Overview', hasDateFilter: true },
    { id: 'daily', label: 'Daily Trends', hasDateFilter: true },
    { id: 'creatives', label: 'Creatives', hasDateFilter: true },
    { id: 'adsets', label: 'Ad Sets', hasDateFilter: true },
    { id: 'platforms', label: 'Platforms', hasDateFilter: true },
    { id: 'geo', label: 'Geography', hasDateFilter: true },
    { id: 'attribution', label: 'Attribution', hasDateFilter: true },
    { id: 'funnel', label: 'Funnel', hasDateFilter: true },
  ]

  const currentTab = tabs.find(t => t.id === activeTab)

  // Check if using custom data
  const hasCustomData = Object.values(customData).some(v => v !== null)

  return (
    <div className={`min-h-screen text-white ${isDarkMode ? 'bg-[#030712]' : 'bg-gray-100 text-gray-900'}`}>
      {/* Header - World-Class Polish */}
      <header className="sticky top-0 z-40 glass border-b border-white/5">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-1">
              <h1 className="text-h1 gradient-text tracking-tight">DNBA Thailand 2026</h1>
              <p className="text-caption text-gray-400 flex items-center gap-2">
                Campaign Analytics Dashboard
                {hasCustomData && (
                  <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 text-xs rounded-full">
                    Custom Data Loaded
                  </span>
                )}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Upload Button */}
              <button
                onClick={() => setShowUploadModal(true)}
                className="p-2 rounded-lg hover:bg-[#1a2744] transition-colors relative"
                title="Upload data (U)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </button>

              {/* Export Button */}
              <button
                onClick={handleExportCurrentTab}
                className="p-2 rounded-lg hover:bg-[#1a2744] transition-colors"
                title="Export to CSV (E)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>

              {/* Theme Toggle */}
              <ThemeToggle isDark={isDarkMode} onToggle={() => setIsDarkMode(!isDarkMode)} />

              {/* AI Features Separator */}
              <div className="w-px h-6 bg-[#1e3a5f] mx-1" />

              {/* AI Copilot Button */}
              <button
                onClick={() => setShowAICopilot(true)}
                className="p-2 rounded-lg hover:bg-[#1a2744] transition-colors group relative"
                title="AI Copilot (A)"
              >
                <svg className="w-5 h-5 text-purple-400 group-hover:text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </button>

              {/* Executive Summary Button */}
              <button
                onClick={() => setShowExecutiveSummary(true)}
                className="p-2 rounded-lg hover:bg-[#1a2744] transition-colors group"
                title="Executive Summary (S)"
              >
                <svg className="w-5 h-5 text-green-400 group-hover:text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>

              {/* What-If Simulator Button */}
              <button
                onClick={() => setShowWhatIfSimulator(true)}
                className="p-2 rounded-lg hover:bg-[#1a2744] transition-colors group"
                title="What-If Simulator (W)"
              >
                <svg className="w-5 h-5 text-blue-400 group-hover:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>

              {/* Keyboard Shortcuts */}
              <button
                onClick={() => setShowShortcutsModal(true)}
                className="p-2 rounded-lg hover:bg-[#1a2744] transition-colors"
                title="Keyboard shortcuts (?)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>

              {/* Days to Event */}
              <div className="kpi-card kpi-warning px-4 py-2 rounded-xl ml-2 hidden sm:block">
                <div className="text-2xl font-bold text-orange-500 tabular-nums">{daysToEvent}</div>
                <div className="text-micro text-gray-400">Days to Event</div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs - With Focus States */}
          <nav className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" role="tablist">
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`tab whitespace-nowrap ${activeTab === tab.id ? 'active' : ''}`}
                title={`${tab.label} (${index + 1})`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1440px] mx-auto px-4 py-6">
        {/* Date Filter - only show for tabs that support it */}
        {currentTab?.hasDateFilter && (
          <DateFilter
            selectedPreset={datePreset}
            onPresetChange={(id) => {
              setDatePreset(id)
              setShowCustomDate(false)
            }}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            showCustom={showCustomDate}
            onToggleCustom={() => setShowCustomDate(!showCustomDate)}
          />
        )}

        {activeTab === 'overview' && (
          <>
            <OverviewView
              filteredMetrics={filteredMetrics}
              geoCountries={geoData.countries}
              dateLabel={dateLabel}
            />
            {/* AI-Powered Anomaly Detection */}
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mt-6">
              <AnomalyDetector
                metrics={filteredMetrics}
                creatives={creativeData.creatives}
              />
            </div>
          </>
        )}
        {activeTab === 'daily' && (
          <DailyTrendsView
            filteredMetrics={filteredMetrics}
            dateLabel={dateLabel}
          />
        )}
        {activeTab === 'creatives' && (
          <CreativesView
            creatives={creativeData.creatives}
            spendRatio={spendRatio}
            dateLabel={dateLabel}
          />
        )}
        {activeTab === 'adsets' && (
          <AdSetsView
            adSets={adSetData.adSets}
            spendRatio={spendRatio}
            dateLabel={dateLabel}
          />
        )}
        {activeTab === 'platforms' && (
          <PlatformsView
            platformData={filteredPlatformData}
            dateLabel={dateLabel}
          />
        )}
        {activeTab === 'geo' && (
          <GeographyView
            countries={geoData.countries}
            spendRatio={spendRatio}
            dateLabel={dateLabel}
          />
        )}
        {activeTab === 'attribution' && (
          <AttributionView
            filteredMetrics={filteredMetrics}
            dateLabel={dateLabel}
          />
        )}
        {activeTab === 'funnel' && (
          <FunnelView
            filteredMetrics={filteredMetrics}
            dateLabel={dateLabel}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-500 text-xs border-t border-[#1e3a5f]">
        <p>Data as of January 6, 2026 | Event: Jan 23-26, 2026 | Cafe del Mar, Phuket</p>
        <p className="mt-1">
          Meta purchases may differ from actual Skiddle sales |
          Press <kbd className="px-1 py-0.5 bg-[#1a2744] rounded text-xs mx-1">?</kbd> for keyboard shortcuts
        </p>
        {hasCustomData && (
          <button
            onClick={handleResetData}
            className="mt-2 text-purple-400 hover:text-purple-300 underline"
          >
            Reset to default data
          </button>
        )}
      </footer>

      {/* Modals */}
      <DataUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onDataUpload={handleDataUpload}
      />

      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* AI-Powered Feature Modals */}
      <AICopilot
        isOpen={showAICopilot}
        onClose={() => setShowAICopilot(false)}
        metrics={mergedDailyMetrics}
        creatives={creativeData.creatives}
      />

      <ExecutiveSummary
        isOpen={showExecutiveSummary}
        onClose={() => setShowExecutiveSummary(false)}
        metrics={mergedDailyMetrics}
        totals={filteredTotals}
      />

      <WhatIfSimulator
        isOpen={showWhatIfSimulator}
        onClose={() => setShowWhatIfSimulator(false)}
      />

      {/* Onboarding Overlay */}
      {showOnboarding && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div className="pointer-events-auto">
            {onboardingStep === 1 && (
              <div className="fixed top-24 left-1/2 -translate-x-1/2">
                <OnboardingTooltip
                  step={1}
                  totalSteps={4}
                  title="Welcome to DNBA Analytics"
                  description="This dashboard shows your campaign performance with TRUE CPA and ROAS based on actual Skiddle sales data."
                  position="bottom"
                  onNext={handleNextOnboarding}
                  onSkip={handleSkipOnboarding}
                  onComplete={handleCompleteOnboarding}
                />
              </div>
            )}
            {onboardingStep === 2 && (
              <div className="fixed top-24 right-20">
                <OnboardingTooltip
                  step={2}
                  totalSteps={4}
                  title="Upload Your Own Data"
                  description="Click the upload icon to drag & drop your own JSON data files and instantly update the dashboard."
                  position="bottom"
                  onNext={handleNextOnboarding}
                  onSkip={handleSkipOnboarding}
                  onComplete={handleCompleteOnboarding}
                />
              </div>
            )}
            {onboardingStep === 3 && (
              <div className="fixed top-24 right-10">
                <OnboardingTooltip
                  step={3}
                  totalSteps={4}
                  title="Export & Shortcuts"
                  description="Export any view to CSV, toggle dark/light mode, and use keyboard shortcuts for power-user navigation."
                  position="bottom"
                  onNext={handleNextOnboarding}
                  onSkip={handleSkipOnboarding}
                  onComplete={handleCompleteOnboarding}
                />
              </div>
            )}
            {onboardingStep === 4 && (
              <div className="fixed top-36 left-1/2 -translate-x-1/2">
                <OnboardingTooltip
                  step={4}
                  totalSteps={4}
                  title="Explore the Tabs"
                  description="Use number keys 1-8 to quickly switch between tabs. Press ? anytime to see all keyboard shortcuts."
                  position="bottom"
                  onNext={handleNextOnboarding}
                  onSkip={handleSkipOnboarding}
                  onComplete={handleCompleteOnboarding}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
