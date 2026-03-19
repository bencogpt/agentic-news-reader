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
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    // Use Application Default Credentials — works in App Hosting (firebase-app-hosting-compute SA)
    // and locally when GOOGLE_APPLICATION_CREDENTIALS is set or via `gcloud auth application-default login`.
    app = admin.initializeApp({ projectId });
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
