"""
Attendance Service

Handles business logic for attendance operations including:
- Overtime calculations
- Attendance validation
- Helper functions for attendance processing
"""

from datetime import datetime, time
from typing import Optional, Tuple


def parse_time(time_str: Optional[str]) -> Optional[time]:
    """
    Parse time string in HH:MM format to time object
    
    Args:
        time_str: Time string in HH:MM format (24-hour)
        
    Returns:
        time object or None if parsing fails
    """
    if not time_str:
        return None
    
    try:
        hour, minute = map(int, time_str.split(':'))
        return time(hour=hour, minute=minute)
    except (ValueError, AttributeError):
        return None


def calculate_overtime_hours(
    check_in_time: Optional[str],
    check_out_time: Optional[str],
    standard_hours: float = 8.0
) -> float:
    """
    Calculate overtime hours based on check-in and check-out times
    
    Args:
        check_in_time: Check-in time in HH:MM format
        check_out_time: Check-out time in HH:MM format
        standard_hours: Standard working hours per day (default: 8.0)
        
    Returns:
        Overtime hours (0.0 if not applicable)
        
    Note: 
        This is a placeholder implementation. The actual calculation
        logic will be provided by the user later.
    """
    # Placeholder - will be implemented with proper logic later
    # For now, return 0.0 unless both times are provided
    if not check_in_time or not check_out_time:
        return 0.0
    
    try:
        check_in = parse_time(check_in_time)
        check_out = parse_time(check_out_time)
        
        if not check_in or not check_out:
            return 0.0
        
        # Calculate total hours worked
        check_in_datetime = datetime.combine(datetime.today(), check_in)
        check_out_datetime = datetime.combine(datetime.today(), check_out)
        
        # Handle overnight shifts
        if check_out_datetime < check_in_datetime:
            check_out_datetime = datetime.combine(
                datetime.today().replace(day=datetime.today().day + 1),
                check_out
            )
        
        hours_worked = (check_out_datetime - check_in_datetime).total_seconds() / 3600
        
        # Calculate overtime (hours beyond standard working hours)
        overtime = max(0, hours_worked - standard_hours)
        
        return round(overtime, 2)
        
    except Exception:
        return 0.0


def validate_time_format(time_str: Optional[str]) -> Tuple[bool, Optional[str]]:
    """
    Validate time string format
    
    Args:
        time_str: Time string to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not time_str:
        return True, None
    
    if not isinstance(time_str, str):
        return False, "Time must be a string"
    
    parts = time_str.split(':')
    if len(parts) != 2:
        return False, "Time must be in HH:MM format"
    
    try:
        hour, minute = map(int, parts)
        
        if not (0 <= hour <= 23):
            return False, "Hour must be between 00 and 23"
        
        if not (0 <= minute <= 59):
            return False, "Minute must be between 00 and 59"
        
        return True, None
        
    except ValueError:
        return False, "Time must contain valid numbers"


def validate_attendance_times(
    check_in_time: Optional[str],
    check_out_time: Optional[str]
) -> Tuple[bool, Optional[str]]:
    """
    Validate check-in and check-out times
    
    Args:
        check_in_time: Check-in time string
        check_out_time: Check-out time string
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    # Validate check-in time
    is_valid, error = validate_time_format(check_in_time)
    if not is_valid:
        return False, f"Invalid check-in time: {error}"
    
    # Validate check-out time
    is_valid, error = validate_time_format(check_out_time)
    if not is_valid:
        return False, f"Invalid check-out time: {error}"
    
    return True, None


def format_time_for_display(time_str: Optional[str]) -> str:
    """
    Format time string for display
    
    Args:
        time_str: Time string in HH:MM format
        
    Returns:
        Formatted time string or empty string
    """
    if not time_str:
        return ""
    
    time_obj = parse_time(time_str)
    if not time_obj:
        return time_str
    
    # Convert to 12-hour format with AM/PM
    hour = time_obj.hour
    minute = time_obj.minute
    
    am_pm = "AM" if hour < 12 else "PM"
    display_hour = hour if hour <= 12 else hour - 12
    if display_hour == 0:
        display_hour = 12
    
    return f"{display_hour:02d}:{minute:02d} {am_pm}"
