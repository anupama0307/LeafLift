import { test, expect } from '@playwright/test';

test.describe('LeafLift Real-time Flow', () => {
    const API_URL = 'http://localhost:5001/api';
    let driverPhone: string;
    let riderPhone: string;

    test.beforeAll(async ({ request }) => {
        driverPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
        riderPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
        console.log(`Starting E2E Test Setup with Driver: ${driverPhone}, Rider: ${riderPhone}`);


        // Create Driver
        const driverRes = await request.post(`${API_URL}/signup`, {
            data: {
                role: 'DRIVER',
                phone: driverPhone,
                firstName: 'E2E',
                lastName: 'Driver',
                dob: '1990-01-01',
                gender: 'Male',
                license: 'DL_E2E_01',
                aadhar: '123412341234',
                vehicleMake: 'Tata',
                vehicleModel: 'Nexon',
                vehicleNumber: 'TN 01 E2E 9999'
            }
        });
        expect(driverRes.ok(), 'Driver signup failed').toBeTruthy();

        // Create Rider
        const riderRes = await request.post(`${API_URL}/signup`, {
            data: {
                role: 'RIDER',
                phone: riderPhone,
                firstName: 'E2E',
                lastName: 'Rider',
                dob: '1995-01-01',
                gender: 'Female',
                aadhar: '987698769876'
            }
        });
        expect(riderRes.ok(), 'Rider signup failed').toBeTruthy();
    });

    test('Rider requests ride and Driver accepts', async ({ browser }) => {
        // Set up contexts
        const driverContext = await browser.newContext({
            geolocation: { latitude: 13.0827, longitude: 80.2707 }, // Annanagar
            permissions: ['geolocation']
        });
        const riderContext = await browser.newContext({
            geolocation: { latitude: 13.0827, longitude: 80.2707 },
            permissions: ['geolocation']
        });

        const driverPage = await driverContext.newPage();
        const riderPage = await riderContext.newPage();

        await test.step('Driver Login and Go Online', async () => {
            await driverPage.goto('/');

            // Login
            await driverPage.getByRole('button', { name: "I'm a Driver" }).click();
            await driverPage.getByPlaceholder('Mobile number').fill(driverPhone);
            await driverPage.getByRole('button', { name: 'Continue' }).click();

            // OTP
            const otpInputs = driverPage.locator('input[type="text"]', { hasText: '' });
            // The OTP inputs are empty initially. The selector might match more if not careful.
            // Better to target by index of all text inputs in the OTP step.
            await otpInputs.nth(0).fill('1');
            await otpInputs.nth(1).fill('2');
            await otpInputs.nth(2).fill('3');
            await otpInputs.nth(3).fill('4');
            await driverPage.getByRole('button', { name: 'Verify' }).click();

            await expect(driverPage.getByText('Status: Active')).toBeVisible({ timeout: 15000 });

            // Go Online
            await driverPage.getByText('Go Online').click();
            await expect(driverPage.getByText('Finding Trips...')).toBeVisible();
        });

        await test.step('Rider Login and Request Ride', async () => {
            await riderPage.goto('/');

            // Login
            await riderPage.getByRole('button', { name: "I'm a Rider" }).click();
            await riderPage.getByPlaceholder('Mobile number').fill(riderPhone);
            await riderPage.getByRole('button', { name: 'Continue' }).click();

            // OTP
            const otpInputs = riderPage.locator('input[type="text"]');
            await otpInputs.nth(0).fill('1');
            await otpInputs.nth(1).fill('2');
            await otpInputs.nth(2).fill('3');
            await otpInputs.nth(3).fill('4');
            await riderPage.getByRole('button', { name: 'Verify' }).click();

            // Open Plan Ride
            await riderPage.getByText('Search destination...').click();

            // Fill Pickup (Anna Nagar)
            // Note: "Current Location" might already be filled. We overwrite.
            const pickupInput = riderPage.getByPlaceholder('Current Location');
            await pickupInput.click();
            await pickupInput.fill('Anna Nagar');
            // Wait for suggestions and click first
            await riderPage.locator('button').filter({ hasText: 'Anna Nagar' }).first().click();

            // Fill Destination (T Nagar)
            const dropoffInput = riderPage.getByPlaceholder('Where to?');
            await dropoffInput.click();
            await dropoffInput.fill('T Nagar');
            // Wait for suggestions and click first
            await riderPage.locator('button').filter({ hasText: 'T Nagar' }).first().click();

            // Wait for Route Options
            await expect(riderPage.getByText('Pick your ride')).toBeVisible();

            // Ensure "Solo" is selected (default)
            // Click "Book" button
            await riderPage.getByRole('button', { name: /Book/ }).click();

            // Verify "Finding your ride"
            await expect(riderPage.getByText('Finding your ride')).toBeVisible();
        });

        await test.step('Driver Accepts Ride', async () => {
            // Driver should see the request
            // We might need to refresh manualy if socket not instant? 
            // The dashboard has a refresh button.
            // But let's wait for it first.

            // The request card appears in the list.
            // "Accept Trip" button.
            await expect(driverPage.getByText('Accept Trip')).toBeVisible({ timeout: 20000 });
            await driverPage.getByText('Accept Trip').click();

            // Verify Active Ride Screen
            await expect(driverPage.getByText('ACCEPTED')).toBeVisible();
        });

        await test.step('Rider Sees Accepted Status', async () => {
            await expect(riderPage.getByText('ACCEPTED')).toBeVisible({ timeout: 10000 });
            // Identify Driver details
            await expect(riderPage.getByText('E2E Driver')).toBeVisible();
        });
    });
});
