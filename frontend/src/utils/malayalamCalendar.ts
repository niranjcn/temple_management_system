// Malayalam Calendar Utilities

export const MALAYALAM_MONTHS = [
  { value: "chingam", label: "ചിങ്ങം (Chingam)", order: 1 },
  { value: "kanni", label: "കന്നി (Kanni)", order: 2 },
  { value: "thulam", label: "തുലാം (Thulam)", order: 3 },
  { value: "vrischikam", label: "വൃശ്ചികം (Vrischikam)", order: 4 },
  { value: "dhanu", label: "ധനു (Dhanu)", order: 5 },
  { value: "makaram", label: "മകരം (Makaram)", order: 6 },
  { value: "kumbham", label: "കംഭം (Kumbham)", order: 7 },
  { value: "meenam", label: "മീനം (Meenam)", order: 8 },
  { value: "medam", label: "മേടം (Medam)", order: 9 },
  { value: "edavam", label: "ഇടവം (Edavam)", order: 10 },
  { value: "mithunam", label: "മിഥുനം (Midhunam)", order: 11 },
  { value: "karkidakam", label: "കർക്കിടകം (Karkidakam)", order: 12 }
];

export interface MalayalamMonthRange {
  month: string;
  monthLabel: string;
  startDate: string; // ISO format YYYY-MM-DD
  endDate: string;   // ISO format YYYY-MM-DD
  year: number;      // Malayalam year
}

/**
 * Get Malayalam month name (Malayalam text only)
 */
export const getMalayalamMonthName = (monthValue: string): string => {
  const month = MALAYALAM_MONTHS.find(m => m.value === monthValue);
  if (!month) return '';
  
  // Extract Malayalam text from label (before parentheses)
  const match = month.label.match(/^([^\(]+)/);
  return match ? match[1].trim() : month.label;
};

/**
 * Calculate Malayalam date for a given Gregorian date
 */
export const getMalayalamDate = (
  gregorianDate: Date,
  monthRanges: MalayalamMonthRange[]
): { month: string; day: number; year: number } | null => {
  // Use local date string to avoid timezone issues
  const year = gregorianDate.getFullYear();
  const month = String(gregorianDate.getMonth() + 1).padStart(2, '0');
  const day = String(gregorianDate.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  // Find which Malayalam month this date falls in
  for (const range of monthRanges) {
    if (dateStr >= range.startDate && dateStr <= range.endDate) {
      // Calculate day number within the Malayalam month
      // Parse dates carefully to avoid timezone issues
      const [startYear, startMonth, startDay] = range.startDate.split('-').map(Number);
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const currentDate = new Date(year, gregorianDate.getMonth(), gregorianDate.getDate());
      
      const daysDiff = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const malayalamDay = daysDiff + 1; // 1-indexed (day 1 is the start date)
      
      return {
        month: range.month,
        day: malayalamDay,
        year: range.year
      };
    }
  }
  
  return null;
};

/**
 * Format Malayalam date for display
 */
export const formatMalayalamDate = (
  malayalamDate: { month: string; day: number; year: number } | null
): string => {
  if (!malayalamDate) return '';
  
  const monthName = getMalayalamMonthName(malayalamDate.month);
  return `${monthName} ${malayalamDate.day}`;
};

/**
 * Get the Malayalam month range that contains a specific date
 */
export const getMalayalamMonthRange = (
  date: Date,
  monthRanges: MalayalamMonthRange[]
): MalayalamMonthRange | null => {
  const dateStr = date.toISOString().split('T')[0];
  return monthRanges.find(range => 
    dateStr >= range.startDate && dateStr <= range.endDate
  ) || null;
};

/**
 * Validate Malayalam month range
 */
export const validateMalayalamMonthRange = (
  startDate: string,
  endDate: string
): { valid: boolean; error?: string } => {
  if (!startDate || !endDate) {
    return { valid: false, error: 'Both start and end dates are required' };
  }
  
  if (startDate >= endDate) {
    return { valid: false, error: 'End date must be after start date' };
  }
  
  // Malayalam months are typically 29-31 days
  const start = new Date(startDate);
  const end = new Date(endDate);
  const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  if (daysDiff < 28 || daysDiff > 32) {
    return { valid: false, error: 'Malayalam month should be between 28-32 days' };
  }
  
  return { valid: true };
};
