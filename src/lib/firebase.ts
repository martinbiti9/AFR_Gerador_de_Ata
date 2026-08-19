import { initializeApp } from "firebase/app";
import { getFirestore, setLogLevel, doc, getDocFromServer } from "firebase/firestore";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// Mute internal SDK transport level idle logs
setLogLevel('silent');

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "ai-studio-495e4a2f-bc01-4197-9d3d-8b17577710a2");
export const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Aviso ao definir persistência do Firebase Auth:", err);
});

// Validate connection to Firestore as required by Firebase skill
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration (client offline).");
    }
  }
}
testConnection();

