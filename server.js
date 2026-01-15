const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// MPesa Configuration
const MPESA_CONFIG = {
  shortcode: process.env.MPESA_SHORTCODE || '174379',
  passkey: process.env.MPESA_PASSKEY,
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  callbackUrl: process.env.CALLBACK_URL || 'https://your-domain.com/api/mpesa/callback'
};

// 1. Generate MPesa Access Token
async function getMpesaToken() {
  try {
    const auth = Buffer.from(`${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`).toString('base64');
    
    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${auth}`
        }
      }
    );
    
    return response.data.access_token;
  } catch (error) {
    console.error('Token Error:', error.response?.data || error.message);
    throw error;
  }
}

// 2. Generate Password for STK Push
function generatePassword(shortcode, passkey) {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  return { password, timestamp };
}

// 3. STK Push Endpoint
app.post('/api/mpesa/stkpush', async (req, res) => {
  try {
    const { phone, amount, loanId } = req.body;
    
    if (!phone || !amount) {
      return res.status(400).json({ error: 'Phone and amount are required' });
    }

    // Format phone: 2547XXXXXXXX
    const formattedPhone = phone.startsWith('254') ? phone : `254${phone.replace(/^0/, '')}`;
    
    // Get access token
    const token = await getMpesaToken();
    
    // Generate password
    const { password, timestamp } = generatePassword(MPESA_CONFIG.shortcode, MPESA_CONFIG.passkey);
    
    // STK Push Request
    const stkRequest = {
      BusinessShortCode: MPESA_CONFIG.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: MPESA_CONFIG.shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: MPESA_CONFIG.callbackUrl,
      AccountReference: 'MWANANCHI',
      TransactionDesc: `Loan Processing Fee - ${loanId || 'MC' + Date.now()}`
    };

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      stkRequest,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Save to database (simplified)
    const transaction = {
      CheckoutRequestID: response.data.CheckoutRequestID,
      MerchantRequestID: response.data.MerchantRequestID,
      phone: formattedPhone,
      amount: amount,
      status: 'pending',
      timestamp: new Date()
    };
    
    // TODO: Save to database
    
    res.json({
      success: true,
      message: 'MPesa prompt sent to your phone',
      checkoutRequestId: response.data.CheckoutRequestID,
      merchantRequestId: response.data.MerchantRequestID
    });
    
  } catch (error) {
    console.error('STK Push Error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to initiate payment',
      details: error.response?.data || error.message 
    });
  }
});

// 4. Callback Endpoint (MPesa will call this)
app.post('/api/mpesa/callback', (req, res) => {
  const callbackData = req.body;
  
  console.log('MPesa Callback Received:', JSON.stringify(callbackData, null, 2));
  
  // Extract payment result
  const resultCode = callbackData.Body.stkCallback.ResultCode;
  const resultDesc = callbackData.Body.stkCallback.ResultDesc;
  const checkoutId = callbackData.Body.stkCallback.CheckoutRequestID;
  
  if (resultCode === 0) {
    // Payment successful
    const items = callbackData.Body.stkCallback.CallbackMetadata.Item;
    const amount = items.find(item => item.Name === 'Amount')?.Value;
    const mpesaReceipt = items.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
    const phone = items.find(item => item.Name === 'PhoneNumber')?.Value;
    const date = items.find(item => item.Name === 'TransactionDate')?.Value;
    
    // TODO: Update database - mark payment as completed
    console.log('Payment Successful:', { mpesaReceipt, amount, phone, date });
    
    // TODO: Notify frontend via WebSocket or update database status
  } else {
    // Payment failed
    console.log('Payment Failed:', { resultCode, resultDesc, checkoutId });
    
    // TODO: Update database - mark payment as failed
  }
  
  // Always acknowledge receipt
  res.json({
    ResultCode: 0,
    ResultDesc: "Success"
  });
});

// 5. Check Payment Status
app.post('/api/mpesa/check-status', async (req, res) => {
  try {
    const { checkoutRequestId } = req.body;
    
    const token = await getMpesaToken();
    
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
      {
        BusinessShortCode: MPESA_CONFIG.shortcode,
        Password: generatePassword(MPESA_CONFIG.shortcode, MPESA_CONFIG.passkey).password,
        Timestamp: generatePassword(MPESA_CONFIG.shortcode, MPESA_CONFIG.passkey).timestamp,
        CheckoutRequestID: checkoutRequestId
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json(response.data);
    
  } catch (error) {
    console.error('Status Check Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
