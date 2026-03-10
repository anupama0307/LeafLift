import React, { useState } from 'react';

interface PhonePePaymentProps {
    rideId: string;
    amount: number;
    userId: string;
    disabled?: boolean;
    onPaymentSuccess?: () => void;
    onPaymentStarted?: () => void;
}

const PhonePePayment: React.FC<PhonePePaymentProps> = ({ rideId, amount, userId, disabled, onPaymentSuccess, onPaymentStarted }) => {
    const [loading, setLoading] = useState(false);

    const handlePayment = async () => {
        setLoading(true);
        if (onPaymentStarted) onPaymentStarted();

        try {
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

            // 1. Create Payment Request on Backend
            const response = await fetch(`${API_BASE_URL}/api/phonepe/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rideId, amount, userId }),
            });
            const data = await response.json();

            if (data.success && data.data.instrumentResponse.redirectInfo.url) {
                // 2. Redirect User to PhonePe Payment Page
                window.location.href = data.data.instrumentResponse.redirectInfo.url;
            } else {
                throw new Error(data.message || 'Failed to initiate payment');
            }

        } catch (error: any) {
            console.error('PhonePe error:', error);
            alert(`PhonePe Error: ${error.message || 'Something went wrong script.'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handlePayment}
            disabled={loading || disabled}
            className={`w-full h-16 rounded-[24px] font-black text-sm uppercase tracking-[.2em] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3 ${loading || disabled
                ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
                : 'bg-[#5f259f] border-2 border-[#5f259f] text-white hover:bg-white hover:text-[#5f259f]'
                }`}
        >
            {loading ? (
                <>
                    <div className="size-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Connecting...
                </>
            ) : (
                <>
                    <span className="material-icons-outlined">payments</span>
                    Pay ₹{amount} with PhonePe
                </>
            )}
        </button>
    );
};

export default PhonePePayment;
