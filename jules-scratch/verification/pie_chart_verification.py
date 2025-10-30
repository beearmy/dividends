import asyncio
from playwright.async_api import async_playwright
import os
import signal

async def main():
    # Start the server
    server_process = await asyncio.create_subprocess_exec(
        'node', 'api/index.js',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            # Wait for the server to start
            await asyncio.sleep(5)

            await page.goto('http://localhost:3000/tracker.html')

            # Wait for the pie chart container to be visible
            await page.wait_for_selector('#yield-tracker-container', state='visible')

            # Take a screenshot
            screenshot_path = 'jules-scratch/verification/pie_chart_verification.png'
            await page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

            await browser.close()
    finally:
        # Stop the server
        server_process.terminate()
        await server_process.wait()

if __name__ == '__main__':
    asyncio.run(main())
