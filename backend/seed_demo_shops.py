"""
LOCOMART — Idempotent Demo Shops Seeder (M2)

Seeds the initial 4 approved demo shops and their shopkeeper accounts in PostgreSQL:
1. FreshMart (shop1@locomart.com)
2. Green Valley Groceries (shop2@locomart.com)
3. Sri Lakshmi Stores (shop3@locomart.com)
4. Daily Needs Mart (shop4@locomart.com)

Usage:
    python seed_demo_shops.py
"""

import asyncio
import sys
from database import seed_demo_shops


async def main():
    print("[INFO] Seeding initial 4 approved demo shops and shopkeeper accounts...")
    res = await seed_demo_shops()
    print("[SUCCESS]", res["message"])
    for s in res["shops"]:
        print(f"   * {s} (ACTIVE / APPROVED)")
    print("[DONE] All 4 shops are now real records in public.shops and ready for browsing.")


if __name__ == "__main__":
    asyncio.run(main())
