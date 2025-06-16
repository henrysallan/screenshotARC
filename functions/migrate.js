// File: functions/migrate.js

const admin = require('firebase-admin');

// --- INITIALIZATION ---
// Initialize the Firebase Admin SDK using the private key
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- MIGRATION LOGIC ---
async function migrateData() {
  console.log('Starting data migration...');
  console.log('This may take a few moments...');

  try {
    const usersSnapshot = await db.collection('users').get();
    let totalUpdated = 0;

    // Loop through all users
    for (const userDoc of usersSnapshot.docs) {
      console.log(`\nProcessing user: ${userDoc.id}`);
      const entriesRef = userDoc.ref.collection('entries');
      const entriesSnapshot = await entriesRef.get();

      if (entriesSnapshot.empty) {
        console.log(`  -> User has no entries. Skipping.`);
        continue;
      }

      const batch = db.batch();
      let updatesInBatch = 0;

      // Loop through each entry for the user
      for (const entryDoc of entriesSnapshot.docs) {
        const entryData = entryDoc.data();
        let needsUpdate = false;
        const updates = {};

        // 1. Check and fix the timestamp
        if (entryData.timestamp && typeof entryData.timestamp === 'string') {
          const newTimestamp = admin.firestore.Timestamp.fromDate(new Date(entryData.timestamp));
          if (!isNaN(newTimestamp.toDate())) { // Check if the date is valid
            updates.timestamp = newTimestamp;
            needsUpdate = true;
          }
        }

        // 2. Check and fix the tags
        if (entryData.tags && typeof entryData.tags === 'string') {
          try {
            // This handles formats like "['tag1','tag2']" or "'tag1','tag2'"
            const cleanedString = entryData.tags.replace(/[\[\]']/g, '');
            updates.tags = cleanedString.split(',').map(tag => tag.trim()).filter(Boolean);
            needsUpdate = true;
          } catch (e) {
             console.log(`  -> Could not parse tags for entry ${entryDoc.id}: ${entryData.tags}`);
          }
        }

        if (needsUpdate) {
          batch.update(entryDoc.ref, updates);
          updatesInBatch++;
        }
      }

      // Commit the batch of updates for the current user
      if (updatesInBatch > 0) {
        await batch.commit();
        console.log(`  -> Successfully updated ${updatesInBatch} entries for this user.`);
        totalUpdated += updatesInBatch;
      } else {
        console.log(`  -> No entries needed updates for this user.`);
      }
    }

    console.log(`\n-----------------------------------------`);
    console.log(`Migration complete. Total entries updated: ${totalUpdated}.`);
    console.log(`-----------------------------------------`);
    return;

  } catch (error) {
    console.error('\nFATAL ERROR during migration:', error);
    process.exit(1); // Exit the script with an error code
  }
}

// --- RUN THE SCRIPT ---
migrateData();