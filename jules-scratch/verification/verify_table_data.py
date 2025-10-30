
import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        try:
            # Navigate to the tracker page
            await page.goto('http://localhost:3000/tracker.html')

            # Wait for the table body to be populated
            await page.wait_for_selector('#table-body tr')

            # Check for specific data in the table to confirm it's loaded
            first_row_first_cell = page.locator('#table-body tr:first-child td:nth-child(2) span')
            await expect(first_row_first_cell).to_have_text('£35.85')

            # Take a screenshot to verify the changes
            await page.screenshot(path='jules-scratch/verification/table_data_verification.png')

            print("Table data verification successful!")

        except Exception as e:
            print(f"An error occurred: {e}")

        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
