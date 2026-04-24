import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

// TEST CONNECTION - CRITICAL CONSTRAINT
async function testConnection() {
  try {
    // We try to fetch a non-existent doc just to check the connection status
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection successful");
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration: Client is offline.");
      } else if (error.message.includes('insufficient permissions')) {
        // This is actually a good sign for connection! It means we reached the server but was blocked by rules.
        console.log("Firestore reachability confirmed (Rules blocked access as expected).");
      } else {
        console.error("Firestore connection error:", error.message);
      }
    }
  }
}
testConnection();

// ... existing interfaces ...

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'technician' | 'admin';
  techType?: 'water' | 'electricity';
}

export interface Report {
  id: string;
  type: 'water' | 'electricity';
  zone: string;
  avenue?: string;
  quartier?: string;
  urgency: 'urgent' | 'normal';
  status: 'reported' | 'validating' | 'repair' | 'resolved';
  description: string;
  reporterId: string;
  createdAt: any;
  updatedAt: any;
  confirmedCount: number;
  isConfirmed: boolean;
  lat: number;
  lng: number;
}

export interface Comment {
  id: string;
  reportId: string;
  authorId: string;
  authorRole: string;
  text: string;
  createdAt: any;
}
