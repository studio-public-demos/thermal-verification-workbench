"""Capture a full-page screenshot of the running demo using Playwright.

Drives the page the way a user would: load sample BOM, calculate, then
screenshot the fully-rendered result. Saves to assets/screenshot.png.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / "assets" / "screenshot.png"
URL = "http://localhost:8080/"


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True,
        )
        page = browser.new_page(viewport={"width": 1440, "height": 1024},
                                device_scale_factor=2)
        page.goto(URL, wait_until="networkidle")
        page.click("#loadSample")
        page.wait_for_timeout(200)
        page.click("#calcBtn")
        page.wait_for_selector("#report .verdict", state="visible")
        page.wait_for_timeout(300)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(OUT), full_page=True)
        browser.close()
    print(f"Saved {OUT} ({OUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
