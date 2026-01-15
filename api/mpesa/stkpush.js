const axios = require('axios');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phone, amount, loanId } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({ error: 'Phone and amount are required' });
    }

    // Format phone: 2547XXXXXXXX
    const formattedPhone = phone.startsWith('254') ? phone : `254${phone.replace(/^0/, '')}`;

    // MPesa API URLs
    const tokenUrl = `${process.env.MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`;
    const stkPushUrl = `${process.env.MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`;

    // 1. Get Access Token
    const auth = Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString('base64');

    const tokenResponse = await axios.get(tokenUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    const accessToken = tokenResponse.data.access_token;

    // 2. Generate Password
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, '')
      .slice(0, -3);
    
    const password = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString('base64');

    // 3. Prepare STK Push Request
    const stkRequest = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: formattedPhone,
      CallBackURL: `${req.headers.origin || 'https://' + req.headers.host}/api/mpesa/callback`,
      AccountReference: 'MWANANCHI',
      TransactionDesc: `Processing Fee - ${loanId || 'MC' + Date.now()}`,
    };

    // 4. Send STK Push
    const stkResponse = await axios.post(stkPushUrl, stkRequest, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // 5. Return Response
    return res.status(200).json({
      success: true,
      message: 'MPesa prompt sent to your phone',
      data: {
        checkoutRequestId: stkResponse.data.CheckoutRequestID,
        merchantRequestId: stkResponse.data.MerchantRequestID,
        responseCode: stkResponse.data.ResponseCode,
        responseDescription: stkResponse.data.ResponseDescription,
        customerMessage: stkResponse.data.CustomerMessage,
      },
    });

  } catch (error) {
    console.error('STK Push Error:', error.response?.data || error.message);
    
    return res.status(500).json({
      error: 'Failed to initiate payment',
      details: error.response?.data || error.message,
    });
  }
};
