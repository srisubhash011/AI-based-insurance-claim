import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCwfVr9IZXksOzFKwnqOICUCX3YMXmqtRc",
  authDomain: "vigilanceai-claims.firebaseapp.com",
  projectId: "vigilanceai-claims",
  storageBucket: "vigilanceai-claims.firebasestorage.app",
  messagingSenderId: "72192942929",
  appId: "1:72192942929:web:261b5821adebf3eef92970"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);
export const db = getFirestore(app);
