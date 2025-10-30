
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto('http://localhost:3000/tracker.html')

        # Wait for the goals to be loaded
        await page.wait_for_selector('#active-goals-list .goal-item')

        # Open the completed goals section
        await page.click('summary:has-text("Completed Goals")')

        # Wait for the completed goals to be visible
        await page.wait_for_selector('#completed-goals-list .goal-item')

        await page.screenshot(path='jules-scratch/verification/verification.png')
        await browser.close()

asyncio.run(main())
