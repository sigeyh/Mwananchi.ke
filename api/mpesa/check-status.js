const axios = require('axios');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { checkoutRequestId } = req.body;

    if (!checkoutRequestId) {
      return res.status(400).json({ error: 'checkoutRequestId is required' });
    }

    // Get Access Token
    const tokenUrl = `${process.env.MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`;
    const auth = Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString('base64');

    const tokenResponse = await axios.get(tokenUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });

    const accessToken = tokenResponse.data.access_token;

    // Generate Password
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, '')
      .slice(0, -3);
    
    const password = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString('base64');

    // Query STK Push Status
    const queryResponse = await axios.post(
      `${process.env.MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return res.status(200).json(queryResponse.data);

  } catch (error) {
    console.error('Status Check Error:', error.response?.data || error.message);
    
    return res.status(500).json({
      error: 'Failed to check payment status',
      details: error.response?.data || error.message,
    });
  }
};
