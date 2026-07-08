"""
Script to add sync tracking fields to all model files.
Run this once to update all models with sync fields.
"""

import os
import re

# Sync tracking fields to add
SYNC_FIELDS = '''
    # Sync tracking fields
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    synced_at: Optional[datetime] = Field(None)
    sync_origin: Optional[str] = Field(default="local")  # "local" or "remote"
    sync_status: Optional[str] = Field(default="pending")  # "synced", "pending", "conflict"'''

# Models directory
MODELS_DIR = os.path.join(os.path.dirname(__file__), '../models')

# Models that need sync fields
MODEL_FILES = [
    'admin_models.py',  # Already has created_at, updated_at
    'ritual_models.py',  # DONE
    'booking_models.py',  # DONE
    'event_models.py',  # DONE
    'gallery_models.py',
    'stock_models.py',
    'role_models.py',
    'committee_models.py',
    'activity_models.py',
    'employee_booking_models.py',
    'gallery_layout_models.py',
    'slideshow_models.py',
    'gallery_home_preview_models.py',
    'featured_event_models.py',
    'events_section_models.py',
    'calendar_models.py',
]

def check_model_has_sync_fields(content):
    """Check if model already has sync tracking fields"""
    return 'sync_origin' in content or 'synced_at' in content

def check_has_datetime_import(content):
    """Check if datetime is already imported"""
    return 'from datetime import datetime' in content or 'import datetime' in content

def check_has_optional_import(content):
    """Check if Optional is imported"""
    return 'from typing import' in content and 'Optional' in content

def add_sync_fields_to_model(filepath):
    """Add sync fields to a model file"""
    print(f"\nProcessing: {filepath}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if check_model_has_sync_fields(content):
        print(f"  ✓ Already has sync fields, skipping")
        return
    
    # Ensure imports
    lines = content.split('\n')
    
    # Add Optional import if needed
    if not check_has_optional_import(content):
        for i, line in enumerate(lines):
            if line.startswith('from typing import'):
                if 'Optional' not in line:
                    lines[i] = line.rstrip(')').rstrip() + ', Optional' + (')\n' if line.endswith(')') else '\n')
                break
        else:
            # Add typing import after pydantic import
            for i, line in enumerate(lines):
                if 'from pydantic import' in line:
                    lines.insert(i+1, 'from typing import Optional')
                    break
    
    # Add datetime import if needed
    if not check_has_datetime_import(content):
        for i, line in enumerate(lines):
            if 'from pydantic import' in line or 'from typing import' in line:
                lines.insert(i+1, 'from datetime import datetime')
                break
    
    content = '\n'.join(lines)
    
    # Find all Base classes and add sync fields
    # Pattern: class SomethingBase(BaseModel): ... end of class
    class_pattern = r'(class \w+Base\(BaseModel\):.*?(?=\n\nclass |\n\n#|\Z))'
    
    def add_fields_to_class(match):
        class_content = match.group(0)
        
        # Skip if already has sync fields
        if 'sync_origin' in class_content:
            return class_content
        
        # Find the last Field definition in the class
        field_pattern = r'(\n    \w+:.*?Field\(.*?\).*?)(?=\n\n|\nclass |\n    @|\Z)'
        matches = list(re.finditer(field_pattern, class_content, re.DOTALL))
        
        if matches:
            last_field = matches[-1]
            # Insert sync fields after the last field
            insert_pos = last_field.end()
            return class_content[:insert_pos] + SYNC_FIELDS + class_content[insert_pos:]
        
        return class_content
    
    updated_content = re.sub(class_pattern, add_fields_to_class, content, flags=re.DOTALL)
    
    if updated_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        print(f"  ✓ Added sync fields")
    else:
        print(f"  ⚠ Could not find where to add fields")

def main():
    print("="*60)
    print("Adding Sync Tracking Fields to Models")
    print("="*60)
    
    for model_file in MODEL_FILES:
        filepath = os.path.join(MODELS_DIR, model_file)
        if os.path.exists(filepath):
            add_sync_fields_to_model(filepath)
        else:
            print(f"\n⚠ File not found: {model_file}")
    
    print("\n" + "="*60)
    print("✓ Complete!")
    print("="*60)

if __name__ == '__main__':
    main()
