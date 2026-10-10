"""
LOCOMART — Administrative Role Assignment CLI (M1)

Usage:
    python set_role.py <email_or_user_id> <CUSTOMER|SHOPKEEPER|ADMIN>

Example:
    python set_role.py admin@locomart.com ADMIN
"""

import asyncio
import sys
from database import set_user_role, get_user_by_email, get_user_by_id


async def main():
    if len(sys.argv) < 3:
        print("Usage: python set_role.py <email_or_user_id> <CUSTOMER|SHOPKEEPER|ADMIN>")
        sys.exit(1)

    identifier = sys.argv[1].strip()
    role = sys.argv[2].strip().upper()

    if role not in ("CUSTOMER", "SHOPKEEPER", "ADMIN"):
        print(f"Error: Invalid role '{role}'. Allowed: CUSTOMER, SHOPKEEPER, ADMIN")
        sys.exit(1)

    print(f"Assigning role '{role}' to '{identifier}'...")
    res = await set_user_role(identifier, role)
    if res:
        print(f"SUCCESS: User {res.get('email')} ({res.get('id')}) role is now: {res.get('role')}")
    else:
        print(f"ERROR: User '{identifier}' not found in public.users.")
        print("Tip: Make sure the user has registered/logged in at least once so their profile is synchronized.")


if __name__ == "__main__":
    asyncio.run(main())
