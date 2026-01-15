module.exports = async (req, res) => {
  // Set headers for MPesa
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('MPesa Callback Received:', JSON.stringify(req.body, null, 2));

    const callbackData = req.body;
    
    // Extract data from callback
    if (callbackData.Body?.stkCallback) {
      const resultCode = callbackData.Body.stkCallback.ResultCode;
      const resultDesc = callbackData.Body.stkCallback.ResultDesc;
      const checkoutId = callbackData.Body.stkCallback.CheckoutRequestID;
      const merchantRequestId = callbackData.Body.stkCallback.MerchantRequestID;

      if (resultCode === 0) {
        // Payment successful
        const items = callbackData.Body.stkCallback.CallbackMetadata?.Item || [];
        
        const amount = items.find(item => item.Name === 'Amount')?.Value;
        const mpesaReceipt = items.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
        const phone = items.find(item => item.Name === 'PhoneNumber')?.Value;
        const transactionDate = items.find(item => item.Name === 'TransactionDate')?.Value;

        console.log('✅ Payment Successful:', {
          mpesaReceipt,
          amount,
          phone,
          transactionDate,
          checkoutId,
          merchantRequestId,
        });

        // TODO: Save to database or update your system
        // You can use Vercel KV, MongoDB Atlas, or Supabase

      } else {
        // Payment failed
        console.log('❌ Payment Failed:', {
          resultCode,
          resultDesc,
          checkoutId,
          merchantRequestId,
        });
      }

      // Always respond with success to MPesa
      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: 'Success',
      });
    }

    // Invalid callback format
    return res.status(400).json({
      ResultCode: 1,
      ResultDesc: 'Invalid callback format',
    });

  } catch (error) {
    console.error('Callback Error:', error);
    
    // Still respond to MPesa
    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: 'Success',
    });
  }
};
