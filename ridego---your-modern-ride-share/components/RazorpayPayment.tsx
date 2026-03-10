import React, { useState, useEffect } from 'react';

interface RazorpayPaymentProps {
    rideId: string;
    amount: number;
    disabled?: boolean;
    onPaymentSuccess?: () => void;
    onPaymentStarted?: () => void;
}

declare global {
    interface Window {
        Razorpay: any;
    }
}

const RazorpayPayment: React.FC<RazorpayPaymentProps> = ({ rideId, amount, disabled, onPaymentSuccess, onPaymentStarted }) => {
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Load Razorpay script
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);
        return () => {
            document.body.removeChild(script);
        };
    }, []);

    const handlePayment = async () => {
        setLoading(true);
        if (onPaymentStarted) onPaymentStarted();

        try {
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

            // 1. Create Order on Backend
            const orderResponse = await fetch(`${API_BASE_URL}/api/create-razorpay-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rideId, amount }),
            });
            const orderData = await orderResponse.json();

            if (!orderData.id) {
                throw new Error('Failed to create order');
            }

            // 2. Open Razorpay Checkout Modal
            const options = {
                key: import.meta.env.VITE_RAZORPAY_KEY_ID, // Enter the Key ID generated from the Dashboard
                amount: orderData.amount,
                currency: orderData.currency,
                name: "LeafLift",
                description: "Ride Payment",
                order_id: orderData.id,
                handler: async function (response: any) {
                    // 3. Verify Payment on Backend
                    const verifyResponse = await fetch(`${API_BASE_URL}/api/verify-razorpay-payment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            rideId: rideId
                        }),
                    });
                    const verifyData = await verifyResponse.json();

                    if (verifyData.status === 'SUCCESS') {
                        alert('Payment successful!');
                        if (onPaymentSuccess) onPaymentSuccess();
                    } else {
                        alert('Payment verification failed.');
                    }
                },
                prefill: {
                    name: "",
                    email: "",
                    contact: ""
                },
                theme: {
                    color: "#22c55e" // green-500
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.open();

        } catch (error) {
            console.error('Razorpay error:', error);
            alert('Something went wrong with Razorpay.');
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
                : 'bg-[#22c55e] border-2 border-[#22c55e] text-white hover:bg-white hover:text-[#22c55e]'
                }`}
        >
            {loading ? (
                <>
                    <div className="size-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                </>
            ) : (
                <>
                    <span className="material-icons-outlined">payments</span>
                    Pay ₹{amount} with Razorpay
                </>
            )}
        </button>
    );
};

export default RazorpayPayment;
