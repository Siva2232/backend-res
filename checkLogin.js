const axios = require('axios');
(async () => {
  try {
    const res = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@example.com',
      password: 'password123'
    });
    console.log('login success', res.data);
  } catch (err) {
    if (err.response) {
      console.log('status', err.response.status);
      console.log('data', err.response.data);
    } else {
      console.error(err);
    }
  }
})();
