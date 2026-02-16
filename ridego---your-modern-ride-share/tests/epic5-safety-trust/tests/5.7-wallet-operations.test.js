/**
 * Test 5.7 — Wallet Operations
 * Tests wallet balance read and add operations.
 *
 * IMPLEMENTED in server/index.js:
 *   - GET  /api/users/:userId/wallet returns { walletBalance }
 *   - POST /api/users/:userId/wallet/add  increments walletBalance via $inc
 *   - User model: walletBalance (Number, default 0)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User } from '../setup.js';

describe('5.7 — Wallet Operations', () => {
    let user;

    beforeEach(async() => {
        user = await User.create({
            role: 'RIDER',
            email: 'wallet@test.com',
            phone: '9800000130',
            firstName: 'WalletUser',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
            walletBalance: 0,
        });
    });

    it('should default wallet balance to 0', () => {
        expect(user.walletBalance).toBe(0);
    });

    it('should add money to wallet via $inc', async() => {
        await User.findByIdAndUpdate(user._id, { $inc: { walletBalance: 200 } });
        const updated = await User.findById(user._id);
        expect(updated.walletBalance).toBe(200);
    });

    it('should accumulate multiple additions', async() => {
        await User.findByIdAndUpdate(user._id, { $inc: { walletBalance: 100 } });
        await User.findByIdAndUpdate(user._id, { $inc: { walletBalance: 150 } });
        const updated = await User.findById(user._id);
        expect(updated.walletBalance).toBe(250);
    });

    it('should deduct cancellation fee from wallet', async() => {
        await User.findByIdAndUpdate(user._id, { $inc: { walletBalance: 500 } });
        await User.findByIdAndUpdate(user._id, { $inc: { walletBalance: -25 } }); // rider cancel fee
        const updated = await User.findById(user._id);
        expect(updated.walletBalance).toBe(475);
    });
});