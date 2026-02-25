// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

import { getAuth } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCzrmkY_ZdJ_PST_okCP-vLym0n35VnDM8",
  authDomain: "asistencia-app-3fd51.firebaseapp.com",
  projectId: "asistencia-app-3fd51",
  storageBucket: "asistencia-app-3fd51.firebasestorage.app",
  messagingSenderId: "262465635876",
  appId: "1:262465635876:web:4745e7da99ac07b372bab1",
  measurementId: "G-8LFVKWEY8D"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);