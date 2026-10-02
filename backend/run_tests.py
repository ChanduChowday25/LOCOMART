"""
LOCOMART — Test Runner
Executes backend unit and integration tests.
"""

import sys
from test_health import (
    test_health_ok,
    test_health_db_connected,
    test_health_db_unreachable,
)


def run():
    print("==================================================")
    print("LOCOMART Backend Test Suite (Milestone M0)")
    print("==================================================")
    
    tests = [
        ("test_health_ok", test_health_ok),
        ("test_health_db_connected", test_health_db_connected),
        ("test_health_db_unreachable", test_health_db_unreachable),
    ]
    
    passed = 0
    failed = 0
    
    for name, func in tests:
        try:
            print(f"RUNNING: {name} ... ", end="", flush=True)
            func()
            print("PASSED [OK]")
            passed += 1
        except Exception as e:
            print(f"FAILED [ERROR]: {e}")
            failed += 1
            
    print("--------------------------------------------------")
    print(f"Total: {len(tests)}, Passed: {passed}, Failed: {failed}")
    print("==================================================")
    
    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    run()
