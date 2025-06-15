// auth.js - Authentication Logic for Prism

// Firebase configuration (same as main app)
const firebaseConfig = {
    apiKey: "AIzaSyAYPMUjJDf5cInkMY40erfhq6_Idwi2AHs",
    authDomain: "prism-8158b.firebaseapp.com",
    projectId: "prism-8158b",
    storageBucket: "prism-8158b.firebasestorage.app",
    messagingSenderId: "720887543116",
    appId: "1:720887543116:web:e577efa6e8cd9abe9bcbe9",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Set persistence to LOCAL (stays logged in)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// Generate secure random token
function generateSecureToken(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
        token += chars[randomValues[i] % chars.length];
    }
    return token;
}

// Create new user document
async function createNewUser(user) {
    const shortcutToken = generateSecureToken();
    
    try {
        await db.collection('users').doc(user.uid).set({
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            shortcutToken: shortcutToken,
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('New user created with token:', shortcutToken);
        return true;
    } catch (error) {
        console.error('Error creating user document:', error);
        return false;
    }
}

// Update last login
async function updateLastLogin(userId) {
    try {
        await db.collection('users').doc(userId).update({
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error updating last login:', error);
    }
}

// Google Sign In
async function signInWithGoogle() {
    const button = document.getElementById('googleSignInBtn');
    const errorDiv = document.getElementById('errorMessage');
    
    // Add loading state
    button.classList.add('loading');
    errorDiv.classList.remove('show');
    
    const provider = new firebase.auth.GoogleAuthProvider();
    
    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        console.log('User signed in:', user.email);
        
        // Check if user document exists
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            console.log('Creating new user document...');
            const created = await createNewUser(user);
            if (!created) {
                throw new Error('Failed to create user profile');
            }
        } else {
            // Update last login for existing user
            await updateLastLogin(user.uid);
        }
        
        // Redirect to main app
        window.location.href = '/app.html';
        
    } catch (error) {
        console.error('Sign in error:', error);
        
        // Show error message
        let errorMessage = 'Sign in failed. Please try again.';
        
        if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'Sign in cancelled.';
        } else if (error.code === 'auth/network-request-failed') {
            errorMessage = 'Network error. Please check your connection.';
        }
        
        errorDiv.textContent = errorMessage;
        errorDiv.classList.add('show');
        
        // Remove loading state
        button.classList.remove('loading');
    }
}

// Check if already logged in
auth.onAuthStateChanged((user) => {
    if (user) {
        // User is already signed in, redirect to main app
        console.log('User already authenticated, redirecting...');
        window.location.href = '/';
    }
});

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    googleSignInBtn.addEventListener('click', signInWithGoogle);
});
