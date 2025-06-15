const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.addEntry = functions.https.onRequest(async (req, res) => {
  // Enable CORS for Shortcuts app
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    const { token, data } = req.body;
    
    // Validate inputs
    if (!token) {
      res.status(400).json({ error: 'Missing shortcut token' });
      return;
    }
    
    if (!data) {
      res.status(400).json({ error: 'Missing data' });
      return;
    }
    
    // Find user by shortcut token
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('shortcutToken', '==', token)
      .limit(1)
      .get();
    
    if (usersSnapshot.empty) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    
    const userId = usersSnapshot.docs[0].id;
    const userData = usersSnapshot.docs[0].data();
    
    console.log(`Adding entry for user: ${userData.email}`);
    
    // Prepare the entry data
    const entryData = {
      title: data.title || 'Untitled',
      summary: data.summary || '',
      content: data.content || '',
      tags: data.tags || [],
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      // Add any other fields from the shortcut
      ...(data.calendar_link && { calendar_link: data.calendar_link }),
      ...(data.address && { address: data.address }),
      ...(data.amazon_search_url && { amazon_search_url: data.amazon_search_url })
    };
    
    // Add entry to user's collection
    const docRef = await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('entries')
      .add(entryData);
    
    console.log(`Entry added with ID: ${docRef.id}`);
    
    res.status(200).json({ 
      success: true, 
      id: docRef.id,
      message: 'Entry added successfully' 
    });
    
  } catch (error) {
    console.error('Error adding entry:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});