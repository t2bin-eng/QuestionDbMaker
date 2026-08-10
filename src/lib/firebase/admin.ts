import "server-only";

import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return projectId && clientEmail && privateKey
    ? cert({ projectId, clientEmail, privateKey })
    : applicationDefault();
}

export function getAdminApp(): App {
  return getApps()[0] ?? initializeApp({
    credential: getCredential(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export const adminServices = {
  auth: () => getAuth(getAdminApp()),
  db: () => getFirestore(getAdminApp()),
};
