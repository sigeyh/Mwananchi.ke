module.exports = (req, res) => {
  res.status(200).json({ 
    message: 'API is working!',
    endpoints: [
      'POST /api/mpesa/stkpush',
      'POST /api/mpesa/callback',
      'POST /api/mpesa/check-status'
    ]
  });
};
