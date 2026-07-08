import React, { useEffect, useMemo, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import '../../styles/spiritual-calendar.css'
import { addMonths, format, startOfMonth } from 'date-fns'
import api, { get, post } from '@/api/api'
import { toast } from 'sonner'
import { Calendar, Clock, Star, Sun, Moon, ChevronLeft, ChevronRight, Settings, Save, X, Sparkles, Zap, Eye, Plus, Edit2, Trash2 } from 'lucide-react'
import { 
  MALAYALAM_MONTHS, 
  MalayalamMonthRange, 
  getMalayalamDate, 
  formatMalayalamDate,
  validateMalayalamMonthRange,
  getMalayalamMonthName
} from '@/utils/malayalamCalendar'

type CalendarDay = {
  dateISO: string
  year: number
  month: number
  day: number
  weekday: number
  malayalam_year?: number | string | null
  naal?: string | null
  metadata: Record<string, unknown>
  updated_at: string
  updated_by?: string | null
  created_at: string
  version: number
}

type MonthResponse = {
  days: CalendarDay[]
  lastModified: string
}

// Available Naals list (Malayalam with English transliteration for database storage)
const NAALS = ['അശ്വതി (Ashwathi)','ഭരണി (Bharani)','കാർത്തിക (Karthika)','രോഹിണി (Rohini)','മകയിരം (Makayiram)','തിരുവാതിര (Thiruvathira)','പുണർതം (Punartham)','പൂയം (Pooyam)','ആയില്യം (Aayilyam)','മകം (Makam)','പൂരം (Pooram)','ഉത്രം (Uthram)','അത്തം (Atham)','ചിത്തിര (Chithira)','ചോതി (Chothi)','വിശാഖം (Vishakham)','അനിഴം (Anizham)','തൃക്കേട്ട (Thrikketta)','മൂലം (Moolam)','പൂരാടം (Pooradam)','ഉത്രാടം (Uthradam)','തിരുവോണം (Thiruvonam)','അവിട്ടം (Avittam)','ചതയം (Chathayam)','പൂരുരുട്ടാതി (Pooruruttathi)','ഉത്തൃട്ടാതി (Uthruttathi)','രേവതി (Revathi)']

// Helper function to extract Malayalam part from full naal string
const getMalayalamNaal = (fullNaal: string): string => {
  if (!fullNaal) return ''
  const match = fullNaal.match(/^([^\(]+)/)
  return match ? match[1].trim() : fullNaal
}

function useMonthData(year: number, month: number) {
  const [data, setData] = useState<MonthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    get<MonthResponse>(`/v1/calendar/${year}/${month}`)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.response?.data?.detail || e.message)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [year, month])

  const refetch = async () => {
    try {
      setLoading(true)
      const newData = await get<MonthResponse>(`/v1/calendar/${year}/${month}`)
      setData(newData)
      return newData
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message)
      return null
    } finally {
      setLoading(false)
    }
  }

  return { data, loading, error, refetch, setData }
}

export default function CalendarManagement() {
  const today = useMemo(() => new Date(), [])
  const [displayMonth, setDisplayMonth] = useState(startOfMonth(today))
  const year = displayMonth.getFullYear()
  const month = displayMonth.getMonth() + 1
  const { data, loading, error, refetch, setData } = useMonthData(year, month)
  const map = useMemo(() => new Map((data?.days || []).map((d) => [d.dateISO, d])), [data])

  const [rangeStart, setRangeStart] = useState<Date | undefined>(undefined)
  const [rangeEnd, setRangeEnd] = useState<Date | undefined>(undefined)
  const [malYear, setMalYear] = useState<string>('')

  const [editing, setEditing] = useState<CalendarDay | null>(null)
  const [naal, setNaal] = useState<string>('')
  const [saving, setSaving] = useState<boolean>(false)

  // Malayalam Month Management
  const [malayalamMonths, setMalayalamMonths] = useState<MalayalamMonthRange[]>([])
  const [showMalayalamMonthForm, setShowMalayalamMonthForm] = useState(false)
  const [malayalamMonthForm, setMalayalamMonthForm] = useState({
    month: '',
    startDate: '',
    endDate: '',
    year: '' as string | number // Allow both string and number for better input handling
  })
  const [editingMalayalamMonthIndex, setEditingMalayalamMonthIndex] = useState<number | null>(null)

  // Load Malayalam months from localStorage on mount
  useEffect(() => {
    const savedMonths = localStorage.getItem('malayalamMonths')
    if (savedMonths) {
      try {
        setMalayalamMonths(JSON.parse(savedMonths))
      } catch (e) {
        console.error('Failed to load Malayalam months:', e)
      }
    }
  }, [])

  // Save Malayalam months to localStorage whenever they change
  useEffect(() => {
    if (malayalamMonths.length > 0) {
      localStorage.setItem('malayalamMonths', JSON.stringify(malayalamMonths))
    }
  }, [malayalamMonths])

  const handleAddMalayalamMonth = () => {
    const validation = validateMalayalamMonthRange(
      malayalamMonthForm.startDate,
      malayalamMonthForm.endDate
    )

    if (!validation.valid) {
      toast.error(validation.error || 'Invalid date range')
      return
    }

    if (!malayalamMonthForm.month) {
      toast.error('Please select a Malayalam month')
      return
    }

    if (!malayalamMonthForm.year || malayalamMonthForm.year === '') {
      toast.error('Please enter a valid Malayalam year')
      return
    }

    const monthData = MALAYALAM_MONTHS.find(m => m.value === malayalamMonthForm.month)
    if (!monthData) return

    const yearNumber = typeof malayalamMonthForm.year === 'string' 
      ? parseInt(malayalamMonthForm.year, 10) 
      : malayalamMonthForm.year

    if (isNaN(yearNumber) || yearNumber <= 0) {
      toast.error('Please enter a valid Malayalam year')
      return
    }

    const newMonth: MalayalamMonthRange = {
      month: malayalamMonthForm.month,
      monthLabel: monthData.label,
      startDate: malayalamMonthForm.startDate,
      endDate: malayalamMonthForm.endDate,
      year: yearNumber
    }

    if (editingMalayalamMonthIndex !== null) {
      // Update existing month
      const updated = [...malayalamMonths]
      updated[editingMalayalamMonthIndex] = newMonth
      setMalayalamMonths(updated)
      toast.success('Malayalam month updated')
      setEditingMalayalamMonthIndex(null)
    } else {
      // Add new month
      setMalayalamMonths([...malayalamMonths, newMonth])
      toast.success('Malayalam month added')
    }

    // Reset form
    setMalayalamMonthForm({
      month: '',
      startDate: '',
      endDate: '',
      year: ''
    })
    setShowMalayalamMonthForm(false)
  }

  const handleEditMalayalamMonth = (index: number) => {
    const month = malayalamMonths[index]
    setMalayalamMonthForm({
      month: month.month,
      startDate: month.startDate,
      endDate: month.endDate,
      year: month.year
    })
    setEditingMalayalamMonthIndex(index)
    setShowMalayalamMonthForm(true)
  }

  const handleDeleteMalayalamMonth = (index: number) => {
    if (confirm('Are you sure you want to delete this Malayalam month?')) {
      const updated = malayalamMonths.filter((_, i) => i !== index)
      setMalayalamMonths(updated)
      toast.success('Malayalam month deleted')
    }
  }

  const onSelectDay = (d?: Date) => {
    if (!d) return
    // Use local date formatting to avoid timezone shifting which caused previous-day selection
    const key = format(d, 'yyyy-MM-dd')
    const day = map.get(key)
    if (day) {
      setEditing(day)
      setNaal(day.naal || '')
    } else {
      // Not prepopulated yet, create/edit
      setEditing({
        dateISO: key,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
        weekday: d.getDay(),
        malayalam_year: null,
        naal: '',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: null,
        version: 0,
      })
      setNaal('')
    }
  }

  const applyRange = async () => {
    if (!rangeStart || !rangeEnd || !malYear.trim()) {
      toast.error('Select start, end and Malayalam year')
      return
    }
    const start = rangeStart.toISOString().slice(0, 10)
    const end = rangeEnd.toISOString().slice(0, 10)
    try {
      // dry run
      const preview = await post<{ matched: number; dryRun: boolean }, unknown>(
        '/v1/calendar/range/malayalam-year',
        { start_date: start, end_date: end, malayalam_year: malYear, dryRun: true }
      )
      if (!confirm(`This will set Malayalam Year=${malYear} for ${preview.matched} days. Proceed?`)) return
      const res = await post<{ matched: number; dryRun: boolean }, unknown>(
        '/v1/calendar/range/malayalam-year',
        { start_date: start, end_date: end, malayalam_year: malYear, dryRun: false }
      )
      toast.success(`Updated ${res.matched} days`)
      // Refresh current month data to reflect changes
      refetch()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e.message)
    }
  }

  const saveNaal = async () => {
    if (!editing || saving) return
    try {
      setSaving(true)
      const result = await post<CalendarDay>('/v1/calendar/day/naal', { date: editing.dateISO, naal, version: editing.version })
      toast.success('Saved')
      
      // Immediately update the local data state to reflect changes in the calendar
      if (data) {
        const updatedDays = [...data.days]
        const dayIndex = updatedDays.findIndex(day => day.dateISO === editing.dateISO)
        
        if (dayIndex >= 0) {
          // Update existing day
          updatedDays[dayIndex] = { 
            ...updatedDays[dayIndex], 
            naal, 
            version: result?.version || updatedDays[dayIndex].version + 1,
            updated_at: new Date().toISOString()
          }
        } else {
          // Add new day if it doesn't exist
          const updatedEditing = { ...editing, naal, version: result?.version || editing.version + 1 }
          updatedDays.push({
            ...updatedEditing,
            updated_at: new Date().toISOString()
          })
        }
        
        setData({ ...data, days: updatedDays, lastModified: new Date().toISOString() })
      }
      
      // Refresh from server to ensure consistency and update editing state with server data
      const freshData = await refetch()
      if (freshData && editing) {
        const freshDay = freshData.days.find(d => d.dateISO === editing.dateISO)
        if (freshDay) {
          setEditing(freshDay)
          // Keep the current naal value in the UI (don't reset to server value since we just saved it)
        }
      }
      
    } catch (e: any) {
      if (e?.response?.status === 409) {
        // Version conflict - auto-refresh and notify user
        toast.error('Calendar was updated by another user. Refreshing...')
        const freshData = await refetch()
        // Update editing state with fresh data
        if (editing && freshData) {
          const freshDay = freshData.days.find(d => d.dateISO === editing.dateISO)
          if (freshDay) {
            setEditing(freshDay)
            setNaal(freshDay.naal || '')
            toast.info('Data refreshed. Please save again.')
          }
        }
      } else {
        toast.error(e?.response?.data?.detail || e.message)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-orange-900/20 to-amber-900/30 p-3 sm:p-4 lg:p-6 transition-all duration-300">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-orange-500/10 to-amber-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-amber-400/10 to-yellow-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-3/4 left-1/3 w-64 h-64 bg-gradient-to-r from-orange-400/5 to-amber-400/5 rounded-full blur-2xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 space-y-8">
        {/* Header Section */}
        <div className="text-center mb-16 relative">
          <div className="flex items-center justify-center mb-6 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 via-amber-500/20 to-yellow-500/20 rounded-full blur-2xl animate-pulse"></div>
            <div className="relative p-6 bg-gradient-to-br from-orange-500/25 to-amber-500/25 rounded-full border border-orange-400/40 backdrop-blur-sm shadow-2xl shadow-orange-500/20">
              <Calendar className="w-12 h-12 text-amber-300" />
              <div className="absolute inset-0 bg-gradient-to-br from-amber-400/10 to-orange-400/10 rounded-full animate-ping"></div>
            </div>
          </div>
          
          <div className="relative">
            <h1 className="text-6xl md:text-7xl font-bold mb-6 relative">
              <span className="sacred-text">Sacred Calendar</span>
              <div className="absolute -top-2 -right-2">
                <Sparkles className="w-8 h-8 text-amber-400/60 animate-pulse" />
              </div>
            </h1>
            
            <div className="flex items-center justify-center mb-6">
              <div className="h-px bg-gradient-to-r from-transparent via-orange-400/50 to-transparent w-32"></div>
              <Star className="w-6 h-6 text-amber-400 mx-4" />
              <div className="h-px bg-gradient-to-r from-transparent via-orange-400/50 to-transparent w-32"></div>
            </div>
            
            <p className="text-orange-200/90 text-xl max-w-3xl mx-auto leading-relaxed font-light">
              Manage the divine calendar with <span className="text-amber-300 font-medium">celestial precision</span> and <span className="text-orange-300 font-medium">spiritual harmony</span>
            </p>
            
            <div className="mt-8 flex items-center justify-center space-x-8 text-amber-300/70">
              <div className="flex items-center">
                <Sun className="w-5 h-5 mr-2" />
                <span className="text-sm">Solar Calendar</span>
              </div>
              <div className="flex items-center">
                <Moon className="w-5 h-5 mr-2" />
                <span className="text-sm">Lunar Events</span>
              </div>
              <div className="flex items-center">
                <Star className="w-5 h-5 mr-2" />
                <span className="text-sm">Sacred Days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Controls */}
        <div className="calendar-navigation flex flex-col items-center justify-center mb-8 sm:mb-12 space-y-4 mx-auto max-w-6xl">
          {/* Month/Year Dropdowns */}
          <div className="relative w-full max-w-lg mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 via-amber-500/20 to-orange-500/20 rounded-3xl blur-xl"></div>
            <div className="relative flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 bg-black/50 backdrop-blur-md rounded-3xl p-4 sm:p-6 border border-orange-500/40 shadow-2xl shadow-orange-500/25">
              <div className="calendar-nav-dropdowns flex items-center justify-center gap-3 w-full sm:w-auto">
                <select 
                  className="px-4 py-2 bg-white/95 border border-orange-500/40 rounded-xl text-black font-semibold focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-colors cursor-pointer min-w-[140px]"
                  value={displayMonth.getMonth()}
                  onChange={(e) => setDisplayMonth(new Date(displayMonth.getFullYear(), parseInt(e.target.value), 1))}
                >
                  {Array.from({length: 12}, (_, i) => (
                    <option key={i} value={i} className="bg-white text-black">
                      {format(new Date(2000, i, 1), 'MMMM')}
                    </option>
                  ))}
                </select>
                
                <select 
                  className="px-4 py-2 bg-white/95 border border-orange-500/40 rounded-xl text-black font-semibold focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-colors cursor-pointer min-w-[100px]"
                  value={displayMonth.getFullYear()}
                  onChange={(e) => setDisplayMonth(new Date(parseInt(e.target.value), displayMonth.getMonth(), 1))}
                >
                  {Array.from({length: 101}, (_, i) => 2000 + i).map(year => (
                    <option key={year} value={year} className="bg-white text-black">
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="absolute top-1 right-1 hidden sm:block">
                <Sparkles className="w-4 h-4 text-amber-400/60 animate-pulse" />
              </div>
            </div>
          </div>
          
          {/* Navigation Buttons */}
          <div className="flex items-center justify-center gap-4 mx-auto">
            <button 
              className="group p-3 sm:p-4 hover:bg-gradient-to-r hover:from-orange-500/25 hover:to-amber-500/25 rounded-2xl transition-all duration-500 text-amber-300 hover:text-amber-100 hover:scale-110 relative overflow-hidden bg-black/30 backdrop-blur-sm border border-orange-500/30"
              onClick={() => setDisplayMonth(addMonths(displayMonth, -1))}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/10 to-transparent transform -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 relative z-10" />
            </button>
            
            <div className="px-4 sm:px-6 py-2 sm:py-3 bg-black/30 backdrop-blur-sm rounded-xl border border-orange-500/30">
              <span className="text-lg sm:text-xl font-bold sacred-text">
                {format(displayMonth, 'MMM yyyy')}
              </span>
            </div>
            
            <button 
              className="group p-3 sm:p-4 hover:bg-gradient-to-r hover:from-amber-500/25 hover:to-orange-500/25 rounded-2xl transition-all duration-500 text-amber-300 hover:text-amber-100 hover:scale-110 relative overflow-hidden bg-black/30 backdrop-blur-sm border border-orange-500/30"
              onClick={() => setDisplayMonth(addMonths(displayMonth, 1))}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/10 to-transparent transform translate-x-full group-hover:-translate-x-full transition-transform duration-700"></div>
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 relative z-10" />
            </button>
          </div>
        </div>

        {/* Main Calendar Grid */}
        <div className="calendar-main-grid grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 max-w-7xl mx-auto transition-all duration-300">
          <div className="lg:col-span-3 order-2 lg:order-1">
            <div className="bg-black/30 backdrop-blur-sm rounded-3xl p-3 sm:p-6 lg:p-8 border border-orange-500/30 shadow-2xl shadow-orange-500/10 mx-auto calendar-container">
              <DayPicker
                mode="single"
                month={displayMonth}
                onMonthChange={setDisplayMonth}
                onSelect={onSelectDay}
                fromYear={2000}
                toYear={2100}
                showOutsideDays
                className="w-full calendar-spiritual overflow-x-auto"
                styles={{
                  caption: { display: 'none' }, // We'll use our custom header
                  day: { 
                    width: 'clamp(70px, 8vw, 100px)', 
                    height: 'clamp(90px, 10vw, 120px)', 
                    padding: 'clamp(4px, 1vw, 8px)',
                    margin: 'clamp(2px, 0.5vw, 4px)',
                    borderRadius: '16px',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(251, 146, 60, 0.3)',
                    transition: 'all 0.3s ease',
                  },
                  head_cell: { 
                    fontSize: '1.1rem', 
                    padding: '1rem',
                    color: '#fbbf24',
                    fontWeight: '600',
                    textAlign: 'center'
                  },
                  table: { 
                    fontSize: '1.2rem', 
                    width: '100%',
                  },
                  cell: {
                    padding: '2px'
                  }
                }}
                components={{
                  DayContent: (props) => {
                    const key = format(props.date, 'yyyy-MM-dd')
                    const d = map.get(key)
                    const dayNum = props.date.getDate()
                    const naalText = d?.naal ? String(d.naal) : ''
                    const myText = d?.malayalam_year != null && d?.malayalam_year !== '' ? String(d.malayalam_year) : ''
                    const isToday = format(props.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                    
                    // Get Malayalam date for this day
                    const malayalamDate = getMalayalamDate(props.date, malayalamMonths)
                    const malayalamDateText = formatMalayalamDate(malayalamDate)
                    
                    return (
                      <div className={`
                        relative flex flex-col items-start w-full h-full px-1 sm:px-2 lg:px-3 py-1 sm:py-2 lg:py-3 rounded-2xl transition-all duration-500 cursor-pointer group
                        hover:bg-gradient-to-br hover:from-orange-500/25 hover:to-amber-500/25 
                        hover:border-amber-400/60 hover:shadow-xl hover:shadow-orange-500/25 hover:scale-105
                        ${isToday ? 'bg-gradient-to-br from-amber-500/35 to-orange-500/35 border-amber-400/70 glow-amber' : ''}
                        ${naalText || myText ? 'border-orange-400/40' : 'border-orange-500/20'}
                        particles
                      `}>
                        {/* Sacred shimmer effect */}
                        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-amber-400/10 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                        </div>
                        
                        {/* Malayalam Date - Top Right Corner */}
                        {malayalamDateText && (
                          <div className="absolute top-1 right-1 text-[0.5rem] sm:text-[0.6rem] text-amber-300/80 font-medium bg-black/20 px-1 py-0.5 rounded backdrop-blur-sm z-20">
                            {malayalamDateText}
                          </div>
                        )}
                        
                        <div className={`
                          relative z-10 text-sm sm:text-base lg:text-lg font-bold leading-none mb-1 sm:mb-2 sacred-text
                          ${isToday ? 'text-amber-100' : 'text-orange-100'}
                        `}>
                          {dayNum}
                          {isToday && <Sun className="w-3 h-3 sm:w-4 sm:h-4 inline ml-1 text-amber-300 spiritual-loading" />}
                        </div>
                        
                        {(naalText || myText) && (
                          <div className="relative z-10 space-y-0.5 sm:space-y-1 w-full">
                            {naalText && (
                              <div className="naal-badge text-[0.65rem] sm:text-xs text-amber-200/95 leading-snug break-words px-1 sm:px-2 py-1 sm:py-1.5 rounded-lg">
                                <Star className="w-2 h-2 sm:w-3 sm:h-3 inline mr-1 text-amber-300" />
                                <span className="font-medium text-[0.6rem] sm:text-xs">{getMalayalamNaal(naalText)}</span>
                              </div>
                            )}
                            {myText && (
                              <div className="malayalam-year-badge text-[0.65rem] sm:text-xs text-orange-100/90 leading-tight break-words px-1 sm:px-2 py-0.5 sm:py-1 rounded-lg">
                                <Moon className="w-2 h-2 sm:w-3 sm:h-3 inline mr-1 text-orange-300" />
                                <span className="font-medium text-[0.6rem] sm:text-xs">MY: {myText}</span>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Hover indicator */}
                        <div className="absolute top-1 sm:top-2 right-1 sm:right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <Eye className="w-2 h-2 sm:w-3 sm:h-3 text-amber-300" />
                        </div>
                        
                        {/* Special day indicator */}
                        {(naalText && myText) && (
                          <div className="absolute bottom-1 right-1 opacity-60">
                            <Zap className="w-2 h-2 sm:w-3 sm:h-3 text-amber-400" />
                          </div>
                        )}
                      </div>
                    )
                  },
                  Caption: () => null // We handle this in the header
                }}
                footer={
                  <div className="text-center mt-6">
                    {loading && (
                      <div className="flex items-center justify-center text-amber-300">
                        <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                        Loading celestial data...
                      </div>
                    )}
                    {error && (
                      <div className="text-red-400 bg-red-900/20 px-4 py-2 rounded-lg border border-red-500/30">
                        {error}
                      </div>
                    )}
                  </div>
                }
              />
              <div className="mt-6 text-center text-orange-200/70 text-sm bg-orange-900/10 px-6 py-4 rounded-xl border border-orange-500/20">
                <Clock className="w-4 h-4 inline mr-2" />
                Click on any day to edit Naal and view detailed information in the sacred panel
              </div>
            </div>
          </div>
          {/* Sacred Control Panel */}
          <div className="space-y-4 sm:space-y-6 order-1 lg:order-2">
            {/* Malayalam Month Management Panel */}
            <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-purple-500/30 shadow-xl shadow-purple-500/10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg mr-3">
                    <Moon className="w-5 h-5 text-purple-400" />
                  </div>
                  <h2 className="text-xl font-semibold bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                    Malayalam Months
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setShowMalayalamMonthForm(!showMalayalamMonthForm)
                    setEditingMalayalamMonthIndex(null)
                    setMalayalamMonthForm({
                      month: '',
                      startDate: '',
                      endDate: '',
                      year: ''
                    })
                  }}
                  className="p-2 bg-purple-600/20 hover:bg-purple-600/30 rounded-lg transition-colors"
                >
                  {showMalayalamMonthForm ? <X className="w-4 h-4 text-purple-300" /> : <Plus className="w-4 h-4 text-purple-300" />}
                </button>
              </div>

              {showMalayalamMonthForm && (
                <div className="space-y-4 mb-4 bg-purple-900/10 p-4 rounded-xl border border-purple-500/20">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Malayalam Month</label>
                    <select
                      className="w-full px-4 py-3 bg-white/90 border border-purple-500/50 rounded-xl text-black font-medium focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors cursor-pointer"
                      value={malayalamMonthForm.month}
                      onChange={(e) => setMalayalamMonthForm({ ...malayalamMonthForm, month: e.target.value })}
                    >
                      <option value="">Select Month</option>
                      {MALAYALAM_MONTHS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Malayalam Year</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-full px-4 py-3 bg-white/90 border border-purple-500/50 rounded-xl text-black font-medium focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors"
                      value={malayalamMonthForm.year}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow empty string or only digits
                        if (value === '' || /^\d+$/.test(value)) {
                          setMalayalamMonthForm({ ...malayalamMonthForm, year: value })
                        }
                      }}
                      placeholder="e.g., 1200"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Start Date</label>
                    <input
                      type="date"
                      className="w-full px-4 py-3 bg-white/90 border border-purple-500/50 rounded-xl text-black font-medium focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors"
                      value={malayalamMonthForm.startDate}
                      onChange={(e) => setMalayalamMonthForm({ ...malayalamMonthForm, startDate: e.target.value })}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">End Date</label>
                    <input
                      type="date"
                      className="w-full px-4 py-3 bg-white/90 border border-purple-500/50 rounded-xl text-black font-medium focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-colors"
                      value={malayalamMonthForm.endDate}
                      onChange={(e) => setMalayalamMonthForm({ ...malayalamMonthForm, endDate: e.target.value })}
                    />
                  </div>
                  
                  <button
                    onClick={handleAddMalayalamMonth}
                    className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-purple-500/25 flex items-center justify-center"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {editingMalayalamMonthIndex !== null ? 'Update Month' : 'Add Month'}
                  </button>
                </div>
              )}

              {/* List of Malayalam Months */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {malayalamMonths.length === 0 ? (
                  <div className="text-center py-8 text-purple-200/60 text-sm">
                    No Malayalam months configured yet. Click + to add one.
                  </div>
                ) : (
                  malayalamMonths.map((month, index) => (
                    <div
                      key={index}
                      className="bg-purple-900/20 p-3 rounded-lg border border-purple-500/20 hover:border-purple-500/40 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-purple-200 mb-1">
                            {getMalayalamMonthName(month.month)} - {month.year}
                          </div>
                          <div className="text-xs text-purple-300/70">
                            {month.startDate} to {month.endDate}
                          </div>
                        </div>
                        <div className="flex space-x-1">
                          <button
                            onClick={() => handleEditMalayalamMonth(index)}
                            className="p-1.5 bg-purple-600/20 hover:bg-purple-600/30 rounded transition-colors"
                          >
                            <Edit2 className="w-3 h-3 text-purple-300" />
                          </button>
                          <button
                            onClick={() => handleDeleteMalayalamMonth(index)}
                            className="p-1.5 bg-red-600/20 hover:bg-red-600/30 rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-red-300" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Range Assignment Panel */}
            <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-amber-500/30 shadow-xl shadow-amber-500/10">
              <div className="flex items-center mb-6">
                <div className="p-2 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-lg mr-3">
                  <Settings className="w-5 h-5 text-amber-400" />
                </div>
                <h2 className="text-xl font-semibold bg-gradient-to-r from-amber-200 to-orange-200 bg-clip-text text-transparent">
                  Malayalam Year Range
                </h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Start Date</label>
                  <input 
                    type="date" 
                    className="w-full px-4 py-3 bg-white/90 border border-orange-500/50 rounded-xl text-black font-medium focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-colors" 
                    value={rangeStart ? format(rangeStart, 'yyyy-MM-dd') : ''} 
                    onChange={(e) => setRangeStart(e.target.value ? new Date(e.target.value) : undefined)} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">End Date</label>
                  <input 
                    type="date" 
                    className="w-full px-4 py-3 bg-white/90 border border-orange-500/50 rounded-xl text-black font-medium focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-colors" 
                    value={rangeEnd ? format(rangeEnd, 'yyyy-MM-dd') : ''} 
                    onChange={(e) => setRangeEnd(e.target.value ? new Date(e.target.value) : undefined)} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Malayalam Year</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-white/90 border border-orange-500/50 rounded-xl text-black font-medium focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-colors placeholder-gray-500" 
                    value={malYear} 
                    onChange={(e) => setMalYear(e.target.value)}
                    placeholder="e.g., 1200"
                  />
                </div>
                <button 
                  onClick={applyRange} 
                  className="w-full px-4 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold rounded-xl hover:from-amber-700 hover:to-orange-700 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-amber-500/25 flex items-center justify-center"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Apply Sacred Range
                </button>
              </div>
            </div>

            {/* Selected Day Panel */}
            <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-6 border border-orange-500/30 shadow-xl shadow-orange-500/10">
              <div className="flex items-center mb-6">
                <div className="p-2 bg-gradient-to-br from-orange-500/20 to-amber-500/20 rounded-lg mr-3">
                  <Star className="w-5 h-5 text-orange-400" />
                </div>
                <h2 className="text-xl font-semibold bg-gradient-to-r from-orange-200 to-amber-200 bg-clip-text text-transparent">
                  Sacred Day Details
                </h2>
              </div>
              {editing ? (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 p-4 rounded-xl border border-amber-500/20">
                    <div className="text-lg font-semibold text-amber-200 mb-2">{editing.dateISO}</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center text-orange-200/80">
                        <Moon className="w-4 h-4 mr-2 text-amber-400" />
                        Malayalam Year: {String(editing.malayalam_year ?? 'Not set')}
                      </div>
                      <div className="flex items-center text-orange-200/80">
                        <Settings className="w-4 h-4 mr-2 text-orange-400" />
                        Updated by: {editing.updated_by || 'System'}
                      </div>
                      <div className="flex items-center text-orange-200/80">
                        <Clock className="w-4 h-4 mr-2 text-amber-400" />
                        Last update: {editing.updated_at ? new Date(editing.updated_at).toLocaleString() : 'Never'}
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-black mb-3">
                      <Star className="w-4 h-4 inline mr-2" />
                      Sacred Naal
                    </label>
                    <select
                      className="w-full px-4 py-3 bg-white/90 border border-orange-500/50 rounded-xl text-black font-medium focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-colors cursor-pointer"
                      value={naal}
                      onChange={(e) => setNaal(e.target.value)}
                    >
                      <option value="" className="bg-white text-black">None</option>
                      {NAALS.map((n, idx) => (
                        <option key={`naal-${idx}`} value={n} className="bg-white text-black">{getMalayalamNaal(n)}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex space-x-3">
                    <button 
                      className={`flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-green-500/25 flex items-center justify-center ${saving ? 'opacity-70 cursor-not-allowed' : ''}`} 
                      onClick={saveNaal}
                      disabled={saving}
                    >
                      <Save className={`w-4 h-4 mr-2 ${saving ? 'animate-spin' : ''}`} />
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button 
                      className="px-4 py-3 bg-slate-700/50 border border-slate-600/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition-all duration-300 flex items-center justify-center" 
                      onClick={() => setEditing(null)}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gradient-to-br from-orange-500/20 to-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="w-8 h-8 text-amber-400" />
                  </div>
                  <div className="text-orange-200/60">Select a day from the calendar to view and edit its sacred details</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
