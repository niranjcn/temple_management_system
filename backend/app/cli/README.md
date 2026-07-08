# CLI Tools

This directory contains command-line interface tools for managing the Temple Management System.

## Available Tools

### Database Sync CLI (`sync_cli.py`)

Comprehensive CLI for managing database synchronization between local and remote MongoDB instances.

See [Database Sync Quick Start Guide](../../DATABASE_SYNC_QUICKSTART.md) for usage examples.

## Running CLI Tools

All CLI tools should be run from the `backend` directory:

```bash
cd backend
python -m app.cli.TOOL_NAME [arguments]
```

### Examples

```bash
# Sync CLI
python -m app.cli.sync_cli status
python -m app.cli.sync_cli sync
python -m app.cli.sync_cli conflicts

# Get help
python -m app.cli.sync_cli --help
```

## Adding New CLI Tools

1. Create new file in `app/cli/` directory (e.g., `my_tool_cli.py`)
2. Import required modules
3. Implement CLI class with command methods
4. Add `main()` function with argparse
5. Make it executable: `if __name__ == "__main__": asyncio.run(main())`

### Template

```python
"""
My Tool CLI
Description of what this tool does.
"""

import asyncio
import argparse

class MyToolCLI:
    def __init__(self):
        pass
    
    async def cmd_action(self):
        """Perform action"""
        print("Action performed")

async def main():
    parser = argparse.ArgumentParser(description="My Tool CLI")
    subparsers = parser.add_subparsers(dest="command")
    
    subparsers.add_parser("action", help="Perform action")
    
    args = parser.parse_args()
    cli = MyToolCLI()
    
    if args.command == "action":
        await cli.cmd_action()

if __name__ == "__main__":
    asyncio.run(main())
```

## Requirements

- Python 3.8+
- All dependencies from `requirements.txt`
- Access to `.env` configuration
- MongoDB connection (local and/or remote)
