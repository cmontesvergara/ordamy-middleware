const axios = require('axios');
async function run() {
    const res = await axios.post('https://jp-db.bigso.co/api/admins/auth-via-email', {
        email: 'camontesvergara@gmail.com',
        password: '@Password21'
    });
    const token = res.data.token;

    // get one order
    try {
        const itemRes = await axios.get('https://jp-db.bigso.co/api/collections/ordenes/records?perPage=1&sort=-created', {
            headers: { Authorization: `Admin ${token}` }
        });
        console.log("Item from ordenes:", JSON.stringify(itemRes.data.items[0], null, 2));
    } catch (e) {
        console.log("Error getting ordenes", e.response?.data || e.message);
    }
    // get one order item
    try {
        const itemRes = await axios.get('https://jp-db.bigso.co/api/collections/ordenes_items/records?perPage=1&sort=-created', {
            headers: { Authorization: `Admin ${token}` }
        });
        console.log("Item from ordenes_items:", JSON.stringify(itemRes.data.items[0], null, 2));
    } catch (e) {
        console.log("Error getting ordenes_items", e.response?.data || e.message);
    }
}
run();