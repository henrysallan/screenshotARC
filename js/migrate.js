// migrate.js - Run this once to migrate existing entries to your user account
// This should be run in the browser console after logging in

async function migrateExistingEntries() {
    const auth = firebase.auth();
    const db = firebase.firestore();
    
    // Make sure user is logged in
    const currentUser = auth.currentUser;
    if (!currentUser) {
        console.error('You must be logged in to run migration');
        return;
    }
    
    console.log('Starting migration for user:', currentUser.email);
    
    try {
        // Get all existing entries from old structure
        const oldEntries = await db.collection('entries').get();
        console.log(`Found ${oldEntries.size} entries to migrate`);
        
        if (oldEntries.empty) {
            console.log('No entries to migrate');
            return;
        }
        
        // Batch write for efficiency
        let batch = db.batch();
        let count = 0;
        
        oldEntries.forEach(doc => {
            const newRef = db.collection('users')
                            .doc(currentUser.uid)
                            .collection('entries')
                            .doc(doc.id);
            
            batch.set(newRef, doc.data());
            count++;
            
            // Firestore has a limit of 500 operations per batch
            if (count % 500 === 0) {
                batch.commit();
                batch = db.batch();
            }
        });
        
        // Commit any remaining operations
        if (count % 500 !== 0) {
            await batch.commit();
        }
        
        console.log(`Successfully migrated ${count} entries`);
        console.log('You can now delete the old entries collection manually in Firebase Console');
        
        // Reload the page to show migrated data
        setTimeout(() => {
            window.location.reload();
        }, 2000);
        
    } catch (error) {
        console.error('Migration error:', error);
    }
}

// Run the migration
migrateExistingEntries();
