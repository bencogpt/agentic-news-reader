import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';

const globalForFirebase = globalThis as unknown as {
  _firebaseAdminDb: Firestore | undefined;
};

function getDb(): Firestore {
  if (globalForFirebase._firebaseAdminDb) {
    return globalForFirebase._firebaseAdminDb;
  }

  let app: admin.app.App;

  if (admin.apps.length > 0) {
    app = admin.apps[0]!;
  } else {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    // In Firebase App Hosting, use Application Default Credentials (ADC).
    // Fall back to explicit service account only when all three vars are present (local dev).
    if (clientEmail && privateKey) {
      app = admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        projectId,
      });
    } else {
      // ADC — works automatically in App Hosting via firebase-app-hosting-compute SA
      app = admin.initializeApp({ projectId });
    }
  }

  const firestore = app.firestore();
  firestore.settings({ ignoreUndefinedProperties: true });
  globalForFirebase._firebaseAdminDb = firestore;
  return firestore;
}

// Lazy proxy — Firebase is NOT initialized at import time.
// Initialization happens on first property access at runtime.
export const db = new Proxy({} as Firestore, {
  get(_target, prop: string | symbol) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export { admin };
